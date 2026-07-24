'use client'
import { useState, useRef, useMemo, useEffect } from 'react'
import { getRuntimeTableMetadata, importTableData, executeQuery } from '@/lib/queryEngine'
import * as XLSX from 'xlsx'

const DATA_TYPES = ['STRING', 'INT', 'NUMBER', 'BOOLEAN', 'DATE']
const SUPPORTED_EXTS = ['.csv', '.tsv', '.json', '.db', '.sqlite', '.txt', '.xlsx', '.xls', '.sql']
const SUPPORTED_LABEL = 'CSV, TSV, JSON, SQL, Excel (.xlsx/.xls), SQLite (.db)'

function sanitizeName(name = '') {
  return String(name).replace(/\.[^.]+$/, '').toLowerCase().replace(/[^a-z0-9_]/g, '_')
}

function stripNumericFormatting(raw) {
  // Remove thousand-separator commas, currency symbols, and handle accounting parentheses
  let s = String(raw).trim()
  if (/^\(.*\)$/.test(s)) s = '-' + s.slice(1, -1)   // (1,234.56) → -1234.56
  s = s.replace(/[$€£¥₩,\s]/g, '')
  return s
}

function inferType(values = []) {
  const nonEmpty = values.filter(v => v !== null && v !== undefined && String(v).trim() !== '' && String(v).trim() !== '-' && String(v).trim() !== '–')
  if (nonEmpty.length === 0) return 'STRING'

  // If JS already gave us numbers (XLSX raw:true), use their type directly
  const allJsNumbers = nonEmpty.every(v => typeof v === 'number')
  if (allJsNumbers) {
    const allInt = nonEmpty.every(v => Number.isInteger(v))
    return allInt ? 'INT' : 'NUMBER'
  }

  const strVals = nonEmpty.map(v => stripNumericFormatting(String(v)))
  const isInt = strVals.every(v => /^-?\d+$/.test(v))
  if (isInt) return 'INT'

  const isNumber = strVals.every(v => /^-?\d+(\.\d+)?$/.test(v))
  if (isNumber) return 'NUMBER'

  const isBool = nonEmpty.every(v => /^(true|false|1|0|yes|no)$/i.test(String(v).trim()))
  if (isBool) return 'BOOLEAN'

  // Strict date-shape detection (rejects bare numbers so numeric codes/years stay
  // numeric) with 80% tolerance so a few stray "#NUM!"/blank cells don't demote a
  // genuine date column to STRING.
  const dateHits = nonEmpty.filter(looksLikeDateValue).length
  if (dateHits / nonEmpty.length >= 0.8) return 'DATE'

  return 'STRING'
}

// Recognises the date string formats the warehouse data actually uses.
// Kept in sync with looksLikeDateString() in lib/queryEngine.js.
function looksLikeDateValue(value) {
  const s = String(value).trim()
  if (!s) return false
  if (/^\d{4}[-/]\d{1,2}[-/]\d{1,2}(?:[ T]\d{1,2}:\d{2}(?::\d{2})?)?$/.test(s)) return true
  if (/^\d{1,2}[/-]\d{1,2}[/-]\d{2}(?:\d{2})?$/.test(s)) return true
  if (/^\d{1,2}[-/ ][A-Za-z]{3,9}[-/ ]\d{2}(?:\d{2})?$/.test(s)) return true
  return false
}

function normalizeRows(rows = []) {
  return rows.map((row) => {
    const normalized = {}
    for (const [key, value] of Object.entries(row || {})) {
      normalized[String(key)] = (value === undefined) ? null : value
    }
    return normalized
  })
}

function toPreviewFromRows(rows = []) {
  if (!Array.isArray(rows) || rows.length === 0) return null
  const headers = Object.keys(rows[0])
  const normalizedRows = normalizeRows(rows)
  return { headers, rows: normalizedRows, totalRows: normalizedRows.length }
}

function parseJson(text) {
  try {
    let data = JSON.parse(text)
    if (!Array.isArray(data)) {
      const arr = Object.values(data).find(v => Array.isArray(v))
      if (arr) data = arr
      else return null
    }
    return toPreviewFromRows(data)
  } catch {
    return null
  }
}

function formatDateMDYY(value) {
  const dt = new Date(value)
  if (Number.isNaN(dt.getTime())) return String(value)
  const mm = dt.getMonth() + 1
  const dd = dt.getDate()
  const yyyy = dt.getFullYear()
  return `${mm}/${dd}/${yyyy}`
}

function parseExcelSerialDate(raw) {
  const asNumber = Number(raw)
  if (!Number.isFinite(asNumber)) return null
  if (asNumber <= 0) return null
  const excelEpochUtc = Date.UTC(1899, 11, 30)
  const millis = Math.round(asNumber * 24 * 60 * 60 * 1000)
  const date = new Date(excelEpochUtc + millis)
  if (Number.isNaN(date.getTime())) return null
  return date
}

function parseDateInput(raw) {
  const excelDate = parseExcelSerialDate(raw)
  if (excelDate) return excelDate
  const parsed = new Date(raw)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed
}

function mapValueByType(value, type, mode = 'import') {
  // Already null/undefined
  if (value === null || value === undefined) return mode === 'preview' ? '' : null

  // Already a JS number (from XLSX raw:true)
  if (typeof value === 'number') {
    if (type === 'INT') return Math.trunc(value)
    if (type === 'NUMBER') return value
    if (type === 'BOOLEAN') return Boolean(value)
    if (type === 'DATE') {
      const parsed = parseDateInput(String(value))
      if (!parsed) return mode === 'preview' ? String(value) : null
      return formatDateMDYY(parsed)
    }
    return String(value)
  }

  const raw = String(value).trim()
  // Treat empty string, dash-only, or 'n/a' as null
  if (raw === '' || raw === '-' || raw === '–' || raw === '—' || /^n\/?a$/i.test(raw)) {
    return mode === 'preview' ? '' : null
  }

  if (type === 'INT') {
    const cleaned = stripNumericFormatting(raw)
    const parsed = parseInt(cleaned, 10)
    if (Number.isNaN(parsed)) return mode === 'preview' ? raw : null
    return parsed
  }
  if (type === 'NUMBER') {
    const cleaned = stripNumericFormatting(raw)
    const parsed = parseFloat(cleaned)
    if (Number.isNaN(parsed)) return mode === 'preview' ? raw : null
    return parsed
  }
  if (type === 'BOOLEAN') {
    if (/^(true|1|yes)$/i.test(raw)) return true
    if (/^(false|0|no)$/i.test(raw)) return false
    return mode === 'preview' ? raw : null
  }
  if (type === 'DATE') {
    const parsed = parseDateInput(raw)
    if (!parsed) return mode === 'preview' ? raw : null
    return formatDateMDYY(parsed)
  }
  return raw
}

function safeSqliteIdent(name = '') {
  return String(name).replace(/"/g, '""')
}

function normalizeHeaderNames(headers = []) {
  const renameMap = {}
  const used = new Set()
  for (const raw of headers) {
    const source = String(raw ?? '')
    const base = source.trim() || source
    let candidate = base
    let suffix = 2
    while (used.has(candidate.toLowerCase())) {
      candidate = `${base}_${suffix}`
      suffix += 1
    }
    used.add(candidate.toLowerCase())
    renameMap[source] = candidate
  }
  return renameMap
}

async function loadSqliteTables(file) {
  const initSqlJs = (await import('sql.js')).default
  const SQL = await initSqlJs({ locateFile: (f) => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3/${f}` })
  const buf = await file.arrayBuffer()
  const db = new SQL.Database(new Uint8Array(buf))

  const tableResult = db.exec(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`)
  const tableNames = tableResult?.[0]?.values?.map(v => String(v[0])) || []
  if (tableNames.length === 0) throw new Error('No readable tables found in SQLite file.')

  return { sqlDb: db, tableNames }
}

function readSqliteTable(sqlDb, tableName) {
  const query = `SELECT * FROM "${safeSqliteIdent(tableName)}"`
  const result = sqlDb.exec(query)
  if (!result?.[0]) return []
  const { columns, values } = result[0]
  const headerMap = normalizeHeaderNames(columns)
  return values.map((vals) => {
    const row = {}
    columns.forEach((column, idx) => {
      row[headerMap[String(column)]] = vals[idx]
    })
    return row
  })
}

export default function LoadDataModal({ onClose, onLoaded }) {
  const [step, setStep] = useState(1)
  const [file, setFile] = useState(null)
  const [fileExt, setFileExt] = useState('')
  const [preview, setPreview] = useState(null)
  const [columnConfig, setColumnConfig] = useState([])
  const [columnMappingSearch, setColumnMappingSearch] = useState('')
  const [targetTable, setTargetTable] = useState('')
  const [targetDatabase, setTargetDatabase] = useState('')
  const [loading, setLoading] = useState(false)
  const [fileParsing, setFileParsing] = useState(false)
  const [loadingPercent, setLoadingPercent] = useState(0)
  const [loadingMessage, setLoadingMessage] = useState('Preparing import…')
  const [loadingProcessedRows, setLoadingProcessedRows] = useState(0)
  const [loadingTotalRows, setLoadingTotalRows] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState('')
  const [sqlText, setSqlText] = useState('')
  const [sqlDb, setSqlDb] = useState(null)
  const [sqliteTables, setSqliteTables] = useState([])
  const [selectedSqliteTable, setSelectedSqliteTable] = useState('')
  const [excelWorkbook, setExcelWorkbook] = useState(null)
  const [excelSheets, setExcelSheets] = useState([])
  const [selectedExcelSheet, setSelectedExcelSheet] = useState('')
  const inputRef = useRef(null)

  const availableDatabases = Object.keys(getRuntimeTableMetadata())
  const showLoadingOverlay = loading || fileParsing

  const requestClose = () => {
    const hasUnsavedWork = step !== 3 && (Boolean(file) || Boolean(preview) || loading || fileParsing)
    if (hasUnsavedWork) {
      const shouldClose = window.confirm('Closing now will discard this import session and unsaved mapping changes. Do you want to close?')
      if (!shouldClose) return
    }
    onClose && onClose()
  }

  const beginFileParsing = (message) => {
    setFileParsing(true)
    setLoadingPercent(0)
    setLoadingMessage(message || 'Preparing file…')
    setLoadingProcessedRows(0)
    setLoadingTotalRows(0)
  }

  const finishFileParsing = async (finalMessage) => {
    setLoadingPercent(100)
    if (finalMessage) setLoadingMessage(finalMessage)
    await new Promise((resolve) => setTimeout(resolve, 120))
    setFileParsing(false)
  }

  const readFileAsArrayBufferWithProgress = (sourceFile, progressMessage) => new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onprogress = (event) => {
      if (!event.lengthComputable) return
      setLoadingMessage(progressMessage || 'Reading file…')
      setLoadingPercent((event.loaded / event.total) * 100)
    }
    reader.onerror = () => reject(reader.error || new Error('Failed to read file.'))
    reader.onload = () => resolve(reader.result)
    reader.readAsArrayBuffer(sourceFile)
  })

  const readFileAsTextWithProgress = (sourceFile, progressMessage) => new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onprogress = (event) => {
      if (!event.lengthComputable) return
      setLoadingMessage(progressMessage || 'Reading file…')
      setLoadingPercent((event.loaded / event.total) * 100)
    }
    reader.onerror = () => reject(reader.error || new Error('Failed to read file.'))
    reader.onload = () => resolve(reader.result)
    reader.readAsText(sourceFile)
  })

  const applyColumnInference = (rows) => {
    if (!rows || rows.length === 0) {
      setColumnConfig([])
      return
    }
    const headers = Object.keys(rows[0])
    const config = headers.map((name) => ({
      name,
      type: inferType(rows.map(r => r[name])),
    }))
    setColumnConfig(config)
  }

  const parseSpreadsheetContent = (raw, ext) => {
    const workbook = ext === '.xlsx' || ext === '.xls'
      ? XLSX.read(raw, { type: 'array', cellDates: false })
      : XLSX.read(raw, { type: 'string', raw: false })

    const firstSheetName = workbook.SheetNames[0]
    const worksheet = workbook.Sheets[firstSheetName]
    const rows = XLSX.utils.sheet_to_json(worksheet, { defval: null, raw: true })
    return toPreviewFromRows(rows)
  }

  const refreshExcelPreview = (workbook, sheetName) => {
    if (!workbook || !sheetName) return
    const worksheet = workbook.Sheets[sheetName]
    if (!worksheet) return
    const rows = XLSX.utils.sheet_to_json(worksheet, { defval: null, raw: true })
    const data = toPreviewFromRows(rows)
    setPreview(data)
    applyColumnInference(data?.rows || [])
  }

  const refreshSqlitePreview = (tableName) => {
    if (!sqlDb || !tableName) return
    const rows = normalizeRows(readSqliteTable(sqlDb, tableName))
    const data = toPreviewFromRows(rows)
    setPreview(data)
    applyColumnInference(data?.rows || [])
  }

  const handleFile = async (f) => {
    if (!f) return
    const ext = f.name.substring(f.name.lastIndexOf('.')).toLowerCase()
    if (!SUPPORTED_EXTS.includes(ext)) {
      setError(`Unsupported file type. Please use: ${SUPPORTED_LABEL}`)
      return
    }

    setFile(f)
    setFileExt(ext)
    setError('')
    setSqlText('')
    setSqlDb(null)
    setSqliteTables([])
    setSelectedSqliteTable('')
    setExcelWorkbook(null)
    setExcelSheets([])
    setSelectedExcelSheet('')

    const suggested = sanitizeName(f.name)
    setTargetTable(suggested)

    beginFileParsing(
      ext === '.xlsx' || ext === '.xls'
        ? 'Reading Excel workbook…'
        : ext === '.db' || ext === '.sqlite'
          ? 'Opening SQLite file…'
          : 'Parsing file…'
    )

    try {
      if (ext === '.sql') {
        const script = await readFileAsTextWithProgress(f, 'Reading SQL file…')
        setSqlText(script)
        const statementCount = script.split(';').map(s => s.trim()).filter(Boolean).length
        const scriptPreview = {
          headers: ['script', 'statements'],
          rows: [{ script: f.name, statements: statementCount }],
          totalRows: statementCount,
          isSql: true,
        }
        setPreview(scriptPreview)
        setColumnConfig([])
        setStep(2)
        await finishFileParsing('SQL file ready.')
        return
      }

      if (ext === '.db' || ext === '.sqlite') {
        const sqliteBuffer = await readFileAsArrayBufferWithProgress(f, 'Reading SQLite file…')
        setLoadingMessage('Processing SQLite tables…')
        const sqliteInfo = await loadSqliteTables(new File([sqliteBuffer], f.name, { type: f.type || 'application/octet-stream' }))
        setSqlDb(sqliteInfo.sqlDb)
        setSqliteTables(sqliteInfo.tableNames)
        const firstTable = sqliteInfo.tableNames[0]
        setSelectedSqliteTable(firstTable)
        setTargetTable(sanitizeName(firstTable))
        const rows = normalizeRows(readSqliteTable(sqliteInfo.sqlDb, firstTable))
        const data = toPreviewFromRows(rows)
        setPreview(data)
        applyColumnInference(data?.rows || [])
        setStep(2)
        await finishFileParsing('SQLite table preview ready.')
        return
      }

      if (ext === '.json') {
        const text = await readFileAsTextWithProgress(f, 'Reading JSON file…')
        const data = parseJson(text)
        if (!data) throw new Error('Could not parse JSON file as array records.')
        setPreview(data)
        applyColumnInference(data.rows)
        setStep(2)
        await finishFileParsing('JSON preview ready.')
        return
      }

      if (ext === '.xlsx' || ext === '.xls') {
        const arrayBuffer = await readFileAsArrayBufferWithProgress(f, 'Reading Excel workbook…')
        setLoadingMessage('Processing workbook sheets…')
        const workbook = XLSX.read(arrayBuffer, { type: 'array', cellDates: false })
        const sheets = workbook.SheetNames || []
        if (sheets.length === 0) throw new Error('No sheets found in workbook.')
        setExcelWorkbook(workbook)
        setExcelSheets(sheets)
        setSelectedExcelSheet(sheets[0])
        refreshExcelPreview(workbook, sheets[0])
        setStep(2)
        await finishFileParsing('Excel preview ready.')
        return
      }

      const text = await readFileAsTextWithProgress(f, 'Reading file…')
      const data = parseSpreadsheetContent(text, ext)
      if (!data) throw new Error('Could not parse delimited file.')
      setPreview(data)
      applyColumnInference(data.rows)
      setStep(2)
      await finishFileParsing('Preview ready.')
    } catch (err) {
      setFileParsing(false)
      setError(err?.message || 'Failed to parse selected file.')
    }
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setDragging(false)
    const f = e.dataTransfer.files[0]
    if (!f) return
    handleFile(f)
  }

  const handleTypeChange = (columnName, type) => {
    setColumnConfig(prev => prev.map(c => c.name === columnName ? { ...c, type } : c))
  }

  const columnTypeMap = useMemo(() => {
    const map = {}
    for (const c of columnConfig) map[c.name] = c.type
    return map
  }, [columnConfig])

  const filteredColumnConfig = useMemo(() => {
    const query = columnMappingSearch.trim().toLowerCase()
    if (!query) return columnConfig
    return columnConfig.filter(col => String(col.name || '').toLowerCase().includes(query))
  }, [columnConfig, columnMappingSearch])

  const mappedPreviewRows = useMemo(() => {
    if (!preview?.rows || preview?.isSql) return preview?.rows || []
    return preview.rows.map((row) => {
      const next = {}
      for (const header of preview.headers || []) {
        const type = columnTypeMap[header] || 'STRING'
        next[header] = mapValueByType(row[header], type, 'preview')
      }
      return next
    })
  }, [preview, columnTypeMap])

  const formattedLoadingPercent = `${Math.min(100, Math.max(0, Number(loadingPercent || 0))).toFixed(2)}%`

  const handleLoad = async () => {
    setLoading(true)
    setLoadingPercent(5)
    setLoadingMessage(preview?.isSql ? 'Running SQL script…' : 'Preparing import…')
    setLoadingProcessedRows(0)
    setLoadingTotalRows(preview?.rows?.length || 0)
    setError('')

    try {
      if (preview?.isSql) {
        const result = await executeQuery(sqlText, { limitEnabled: false })
        if (!result.success) throw new Error(result.error || 'Failed to run SQL script.')
        setLoadingPercent(100)
        setLoadingMessage('SQL script completed.')
        onLoaded && onLoaded()
        setStep(3)
        return
      }

      if (!targetTable.trim()) throw new Error('Target table name is required.')
      if (!targetDatabase.trim()) throw new Error('Please select a target database first.')
      if (!preview || !preview.rows || preview.rows.length === 0) throw new Error('No preview rows to import.')

      const typeMap = {}
      for (const c of columnConfig) typeMap[c.name] = c.type

      const typedRows = preview.rows.map((row) => {
        const next = {}
        for (const header of preview.headers) {
          const type = typeMap[header] || 'STRING'
          next[header] = mapValueByType(row[header], type, 'import')
        }
        return next
      })

      await importTableData({
        databaseName: targetDatabase,
        tableName: targetTable,
        rows: typedRows,
        columnTypes: typeMap,
        onProgress: (progress) => {
          const totalRows = Number(progress?.totalRows || typedRows.length || 0)
          const processedRows = Math.min(Number(progress?.processedRows || 0), totalRows || Number(progress?.processedRows || 0))
          const percent = Math.max(0, Math.min(100, Number(progress?.percent || 0)))

          if (totalRows > 0) setLoadingTotalRows(totalRows)
          setLoadingProcessedRows(processedRows)
          if (Number.isFinite(percent)) setLoadingPercent(percent)
          if (progress?.message) setLoadingMessage(String(progress.message))
        },
      })

      setLoadingPercent(100)
      setLoadingMessage('Import completed successfully.')

      onLoaded && onLoaded()
      setStep(3)
    } catch (err) {
      setError(err?.message || 'Failed to load data.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000 }} onClick={requestClose}>
      <div style={{ position: 'relative', background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 12, width: 560, maxHeight: '80vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 80px rgba(0,0,0,0.6)' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>↑ Load Data</span>
          <div style={{ flex: 1 }} />
          <button onClick={requestClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 18 }}>×</button>
        </div>

        <div style={{ flex: 1, overflow: 'auto', padding: 24 }}>
          {step === 1 && (
            <div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>
                Upload `.sql`, `.xlsx`, `.csv`, `.db`, `.json`, `.tsv` (also `.xls`, `.sqlite`, `.txt`) to preview and load into the warehouse.
              </div>
              <div
                onDragOver={e => { e.preventDefault(); setDragging(true) }}
                onDragLeave={() => setDragging(false)}
                onDrop={handleDrop}
                onClick={() => inputRef.current?.click()}
                style={{ border: `2px dashed ${dragging ? 'var(--accent-blue)' : 'var(--border)'}`, borderRadius: 8, padding: '40px 20px', textAlign: 'center', cursor: 'pointer', transition: 'border-color 0.2s', background: dragging ? 'rgba(31,111,235,0.05)' : 'transparent' }}>
                <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'center' }}><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7h5l2 2h11v10a2 2 0 0 1-2 2H3z"/><path d="M3 7V5a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2"/></svg></div>
                <div style={{ fontSize: 13, color: 'var(--text-primary)', marginBottom: 4 }}>Drop a file here or click to browse</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Supports {SUPPORTED_LABEL} — up to 50 MB</div>
                <input ref={inputRef} type="file" accept=".sql,.xlsx,.xls,.csv,.tsv,.json,.db,.sqlite,.txt" style={{ display: 'none' }} onChange={e => handleFile(e.target.files[0])} />
              </div>
            </div>
          )}

          {step === 2 && preview && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                <span style={{ fontSize: 12, color: 'var(--text-primary)', fontWeight: 600 }}>{file?.name}</span>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>— {preview.totalRows} rows, {preview.headers?.length || 0} columns</span>
                <button onClick={() => { setStep(1); setPreview(null) }} style={{ marginLeft: 'auto', background: 'none', border: '1px solid var(--border)', borderRadius: 3, color: 'var(--text-muted)', cursor: 'pointer', fontSize: 11, padding: '2px 8px', fontFamily: 'inherit' }}>← Change file</button>
              </div>

              {(fileExt === '.db' || fileExt === '.sqlite') && sqliteTables.length > 0 && (
                <div style={{ marginBottom: 14 }}>
                  <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>SQLite table</label>
                  <select
                    value={selectedSqliteTable}
                    onChange={e => {
                      const nextTable = e.target.value
                      setSelectedSqliteTable(nextTable)
                      setTargetTable(sanitizeName(nextTable))
                      refreshSqlitePreview(nextTable)
                    }}
                    style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 4, padding: '6px 10px', fontSize: 12, color: 'var(--text-primary)', outline: 'none', width: '100%', boxSizing: 'border-box' }}>
                    {sqliteTables.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              )}

              {(fileExt === '.xlsx' || fileExt === '.xls') && excelSheets.length > 0 && (
                <div style={{ marginBottom: 14 }}>
                  <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Excel sheet</label>
                  <select
                    value={selectedExcelSheet}
                    onChange={e => {
                      const nextSheet = e.target.value
                      setSelectedExcelSheet(nextSheet)
                      refreshExcelPreview(excelWorkbook, nextSheet)
                    }}
                    style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 4, padding: '6px 10px', fontSize: 12, color: 'var(--text-primary)', outline: 'none', width: '100%', boxSizing: 'border-box' }}>
                    {excelSheets.map(sheet => <option key={sheet} value={sheet}>{sheet}</option>)}
                  </select>
                </div>
              )}

              <div style={{ marginBottom: 14 }}>
                {!preview?.isSql && availableDatabases.length === 0 && (
                  <div style={{ fontSize: 11, color: '#f85149', marginBottom: 10 }}>
                    No database found. Run `CREATE DATABASE your_db;` first, then reopen Load Data.
                  </div>
                )}

                {!preview?.isSql && (
                  <>
                    <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Target database</label>
                    <select
                      value={targetDatabase}
                      onChange={e => setTargetDatabase(e.target.value)}
                      style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 4, padding: '6px 10px', fontSize: 12, color: 'var(--text-primary)', outline: 'none', width: '100%', boxSizing: 'border-box', marginBottom: 10 }}>
                      <option value="">Select database…</option>
                      {availableDatabases.map(dbName => <option key={dbName} value={dbName}>{dbName}</option>)}
                    </select>

                    <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Target table name</label>
                    <input value={targetTable} onChange={e => setTargetTable(e.target.value)}
                      style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 4, padding: '6px 10px', fontSize: 12, color: 'var(--text-primary)', outline: 'none', width: '100%', boxSizing: 'border-box' }} />
                  </>
                )}

                {preview?.isSql && (
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                    SQL mode will execute this script directly in the local SQL runtime.
                  </div>
                )}
              </div>

              {error && <div style={{ fontSize: 11, color: '#f85149', marginBottom: 10 }}>{error}</div>}

              {!preview?.isSql && columnConfig.length > 0 && (
                <>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>Column mapping</div>
                  <input
                    value={columnMappingSearch}
                    onChange={e => setColumnMappingSearch(e.target.value)}
                    placeholder="Search column mapping…"
                    style={{
                      background: 'var(--bg-tertiary)',
                      border: '1px solid var(--border)',
                      borderRadius: 4,
                      padding: '6px 10px',
                      fontSize: 11,
                      color: 'var(--text-primary)',
                      outline: 'none',
                      width: '100%',
                      boxSizing: 'border-box',
                      marginBottom: 8,
                    }}
                  />
                  <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 4, marginBottom: 12, maxHeight: 180 }}>
                    <table style={{ borderCollapse: 'collapse', fontSize: 11, width: '100%' }}>
                      <thead>
                        <tr>
                          <th style={{ padding: '5px 10px', background: 'var(--bg-secondary)', color: 'var(--text-secondary)', borderBottom: '1px solid var(--border)', textAlign: 'left', fontSize: 10, fontWeight: 700 }}>Column</th>
                          <th style={{ padding: '5px 10px', background: 'var(--bg-secondary)', color: 'var(--text-secondary)', borderBottom: '1px solid var(--border)', textAlign: 'left', fontSize: 10, fontWeight: 700 }}>Data Type</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredColumnConfig.map((col) => (
                          <tr key={col.name}>
                            <td style={{ padding: '5px 10px', borderBottom: '1px solid var(--border-light)', color: 'var(--text-primary)' }}>{col.name}</td>
                            <td style={{ padding: '5px 10px', borderBottom: '1px solid var(--border-light)' }}>
                              <select
                                value={col.type}
                                onChange={e => handleTypeChange(col.name, e.target.value)}
                                style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 4, padding: '4px 8px', fontSize: 11, color: 'var(--text-primary)', outline: 'none', minWidth: 110 }}>
                                {DATA_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                              </select>
                            </td>
                          </tr>
                        ))}
                        {filteredColumnConfig.length === 0 && (
                          <tr>
                            <td colSpan={2} style={{ padding: '10px', color: 'var(--text-muted)', fontSize: 11 }}>
                              No columns match "{columnMappingSearch}".
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </>
              )}

              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>Preview (first {Math.min(10, mappedPreviewRows.length)} rows):</div>
              <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 4, maxHeight: 220 }}>
                <table style={{ borderCollapse: 'collapse', fontSize: 11, width: '100%' }}>
                  <thead>
                    <tr>{preview.headers.map(h => <th key={h} style={{ padding: '5px 10px', background: 'var(--bg-secondary)', color: 'var(--text-secondary)', borderBottom: '1px solid var(--border)', textAlign: 'left', whiteSpace: 'nowrap', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', position: 'sticky', top: 0 }}>{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {mappedPreviewRows.slice(0, 10).map((row, i) => (
                      <tr key={i}>{preview.headers.map(h => <td key={h} style={{ padding: '4px 10px', borderBottom: '1px solid var(--border-light)', color: 'var(--text-primary)', whiteSpace: 'nowrap', maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis' }}>{row[h]}</td>)}</tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {step === 3 && (
            <div style={{ textAlign: 'center', padding: '30px 0' }}>
              <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'center' }}><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#3fb950" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg></div>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>Data loaded successfully!</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                {preview?.isSql
                  ? 'SQL script executed successfully.'
                  : <><span>Table </span><code style={{ background: 'var(--bg-tertiary)', padding: '1px 6px', borderRadius: 3, fontFamily: 'monospace' }}>{targetDatabase}.{targetTable}</code><span> has been created with {preview?.rows?.length || 0} imported rows.</span></>}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>Refresh the sidebar to see the new table.</div>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', padding: '12px 20px', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
          {step === 3 ? (
            <button onClick={requestClose} className="btn-primary" style={{ padding: '6px 20px', fontSize: 12 }}>Done</button>
          ) : step === 2 ? (
            <>
              <button onClick={requestClose} style={{ padding: '6px 16px', fontSize: 12, cursor: 'pointer', borderRadius: 5, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', fontFamily: 'inherit' }}>Cancel</button>
              <button onClick={handleLoad} disabled={loading || fileParsing || (!preview?.isSql && !targetTable.trim())} className="btn-primary" style={{ padding: '6px 20px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 5 }}>
                {loading ? <><span style={{ display: 'inline-block', animation: 'rcr-spin 1s linear infinite' }}>⟳</span> {formattedLoadingPercent} Loading…</> : (preview?.isSql ? '▶ Run SQL Script' : '↑ Load Table')}
              </button>
            </>
          ) : (
            <button onClick={requestClose} style={{ padding: '6px 16px', fontSize: 12, cursor: 'pointer', borderRadius: 5, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', fontFamily: 'inherit' }}>Cancel</button>
          )}
        </div>

        {showLoadingOverlay && (
          <div style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(10, 14, 25, 0.76)',
            backdropFilter: 'blur(2px)',
            borderRadius: 12,
            zIndex: 20,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
            textAlign: 'center',
          }}>
            <div style={{
              width: 172,
              height: 172,
              position: 'relative',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 16,
            }}>
              <iframe
                src="https://lottie.host/embed/881baa46-e3df-4b63-93eb-a27ea3251ed5/c8lYLhUGAL.lottie"
                title="Loading animation"
                style={{
                  width: '172px',
                  height: '172px',
                  border: 'none',
                  borderRadius: '50%',
                  pointerEvents: 'none',
                  filter: 'drop-shadow(0 0 18px rgba(79,195,247,0.22))',
                }}
                allowFullScreen
              />
              <div style={{
                position: 'absolute',
                inset: 0,
                pointerEvents: 'none',
              }} />
            </div>

            <div style={{
              color: '#d8f3ff',
              fontWeight: 800,
              fontSize: 21,
              fontVariantNumeric: 'tabular-nums',
              letterSpacing: '0.02em',
              marginBottom: 8,
              textShadow: '0 0 18px rgba(79,195,247,0.18)',
            }}>
              {formattedLoadingPercent}
            </div>

            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 5 }}>
              {fileParsing ? 'Preparing Data Preview' : 'Importing Data'}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 10 }}>
              {loadingMessage}
            </div>
            {loadingTotalRows > 0 && (
              <div style={{ fontSize: 11, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                {loadingProcessedRows.toLocaleString()} / {loadingTotalRows.toLocaleString()} rows processed
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
