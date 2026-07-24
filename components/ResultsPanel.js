'use client'

import { useState, useRef, useEffect, useMemo, useCallback, useDeferredValue } from 'react'
import dynamic from 'next/dynamic'
const ChartView = dynamic(() => import('./ChartView'), { ssr: false })

// Lazy-load xlsx only in browser (it's heavy)
let _xlsxPromise = null
function getXlsx() {
  if (!_xlsxPromise) _xlsxPromise = import('xlsx').catch(() => null)
  return _xlsxPromise
}

const NULL_BADGE = () => <span style={{ fontSize: 10, color: '#6e7681', background: 'rgba(110,118,129,0.15)', padding: '1px 5px', borderRadius: 3, fontStyle: 'italic' }}>NULL</span>

// Wrap every occurrence of `term` (case-insensitive) in a <mark>. Returns the
// plain string when there's no term or no match, so non-search renders are cheap.
// `activeOccurrenceIndex` (0-based, within this cell) gets a distinct color and
// `activeRef` attached so the caller can scroll it into view.
function highlightText(text, term, activeOccurrenceIndex = -1, activeRef) {
  const str = String(text)
  if (!term) return str
  const t = String(term).toLowerCase()
  if (!t) return str
  const lower = str.toLowerCase()
  if (!lower.includes(t)) return str
  const parts = []
  let from = 0
  let idx
  let occurrence = 0
  while ((idx = lower.indexOf(t, from)) !== -1) {
    if (idx > from) parts.push(str.slice(from, idx))
    const isActive = occurrence === activeOccurrenceIndex
    parts.push(
      <mark key={idx} ref={isActive ? activeRef : undefined} style={isActive
        ? { background: '#ff8c00', color: '#1a1e2a', padding: 0, borderRadius: 2, boxShadow: '0 0 0 1px #ffb84d' }
        : { background: '#ffd23f', color: '#1a1e2a', padding: 0, borderRadius: 2 }}>
        {str.slice(idx, idx + t.length)}
      </mark>
    )
    from = idx + t.length
    occurrence += 1
  }
  if (from < str.length) parts.push(str.slice(from))
  return parts
}

// Count case-insensitive occurrences of `term` in `text` (mirrors highlightText's matching).
function countOccurrences(text, term) {
  if (!term) return 0
  const t = String(term).toLowerCase()
  if (!t) return 0
  const str = String(text).toLowerCase()
  let count = 0
  let from = 0
  let idx
  while ((idx = str.indexOf(t, from)) !== -1) {
    count += 1
    from = idx + t.length
  }
  return count
}

function formatValue(val, columnType = '', highlight = '', activeOccurrenceIndex = -1, activeRef) {
  if (val === null || val === undefined) return <NULL_BADGE />
  const normalizedType = String(columnType || '').toUpperCase()
  const hl = (s) => highlightText(s, highlight, activeOccurrenceIndex, activeRef)

  const booleanDisplay = (input) => {
    if (input === null || input === undefined) return null
    if (typeof input === 'boolean') return input ? 'Y' : 'N'
    if (typeof input === 'number') return input === 0 ? 'N' : 'Y'
    const text = String(input).trim().toUpperCase()
    if (['1', 'Y', 'YES', 'TRUE', 'T'].includes(text)) return 'Y'
    if (['0', 'N', 'NO', 'FALSE', 'F'].includes(text)) return 'N'
    return null
  }

  if (normalizedType === 'BOOLEAN' || typeof val === 'boolean') {
    const yn = booleanDisplay(val)
    if (yn) return <span style={{ color: yn === 'Y' ? '#3fb950' : '#f85149' }}>{yn}</span>
  }

  if (typeof val === 'number') {
    if (normalizedType === 'INT') return <span style={{ color: '#79c0ff' }}>{hl(String(val))}</span>
    const formatted = Number.isFinite(val)
      ? new Intl.NumberFormat('en-US', { maximumFractionDigits: 20 }).format(val)
      : String(val)
    return <span style={{ color: '#79c0ff' }}>{hl(formatted)}</span>
  }
  if (normalizedType === 'DATE' || (typeof val === 'string' && (/^\d{4}-\d{2}-\d{2}/.test(val) || /^\d{1,2}[\/-]\d{1,2}[\/-]\d{4}$/.test(val)))) {
    return <span style={{ color: '#ffa657' }}>{hl(String(val))}</span>
  }
  return <span>{hl(String(val))}</span>
}

function exportData(columns, rows, format, selectedRows) {
  const data = selectedRows.size > 0 ? rows.filter((_, i) => selectedRows.has(i)) : rows
  if (format === 'csv') {
    const header = columns.join(',')
    const body = data.map(row => columns.map(c => {
      const v = row[c]; if (v === null || v === undefined) return ''
      const s = String(v); return (s.includes(',') || s.includes('"')) ? `"${s.replace(/"/g, '""')}"` : s
    }).join(',')).join('\n')
    download(header + '\n' + body, 'query_result.csv', 'text/csv')
  } else if (format === 'json') {
    download(JSON.stringify(data, null, 2), 'query_result.json', 'application/json')
  } else if (format === 'tsv') {
    const text = [columns.join('\t'), ...data.map(r => columns.map(c => r[c] ?? '').join('\t'))].join('\n')
    navigator.clipboard.writeText(text).catch(() => {})
    return 'copied'
  } else if (format === 'tsv_headers') {
    const text = [columns.join('\t'), ...data.map(r => columns.map(c => r[c] ?? '').join('\t'))].join('\n')
    navigator.clipboard.writeText(text).catch(() => {})
    return 'copied'
  } else if (format === 'tsv_no_headers') {
    const text = data.map(r => columns.map(c => r[c] ?? '').join('\t')).join('\n')
    navigator.clipboard.writeText(text).catch(() => {})
    return 'copied'
  }
}

function download(content, filename, type) {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

function parseDateForExcel(value) {
  if (value === null || value === undefined || value === '') return null
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value

  if (typeof value === 'number' && Number.isFinite(value)) {
    const ms = Date.UTC(1899, 11, 30) + Math.floor(value) * 86400000
    const d = new Date(ms)
    return Number.isNaN(d.getTime()) ? null : d
  }

  const raw = String(value).trim()
  if (!raw) return null

  const slash = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (slash) {
    const d = new Date(Date.UTC(Number(slash[3]), Number(slash[1]) - 1, Number(slash[2])))
    return Number.isNaN(d.getTime()) ? null : d
  }

  const dashDMY = raw.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/)
  if (dashDMY) {
    const d = new Date(Date.UTC(Number(dashDMY[3]), Number(dashDMY[1]) - 1, Number(dashDMY[2])))
    return Number.isNaN(d.getTime()) ? null : d
  }

  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ].*)?$/)
  if (iso) {
    const d = new Date(Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])))
    return Number.isNaN(d.getTime()) ? null : d
  }

  const fallback = new Date(raw)
  return Number.isNaN(fallback.getTime()) ? null : fallback
}

function toBooleanYN(value) {
  if (value === null || value === undefined || value === '') return ''
  if (typeof value === 'boolean') return value ? 'Y' : 'N'
  if (typeof value === 'number') return value === 0 ? 'N' : 'Y'
  const text = String(value).trim().toUpperCase()
  if (['1', 'Y', 'YES', 'TRUE', 'T'].includes(text)) return 'Y'
  if (['0', 'N', 'NO', 'FALSE', 'F'].includes(text)) return 'N'
  return String(value)
}

async function exportToExcel(columns, rows, selectedRows, columnTypes = {}, sheetName = 'Results') {
  const XLSX = await getXlsx()
  if (!XLSX) { alert('Excel export library could not be loaded.'); return }

  const data = selectedRows.size > 0 ? rows.filter((_, i) => selectedRows.has(i)) : rows

  // Build array-of-arrays: header row first
  const header = columns
  const body = data.map(row =>
    columns.map(c => {
      const v = row[c]
      if (v === null || v === undefined) return ''
      const t = String(columnTypes[c] || '').toUpperCase()

      if (t === 'BOOLEAN') return toBooleanYN(v)

      if (t === 'DATE') {
        const d = parseDateForExcel(v)
        return d || String(v)
      }

      if (typeof v === 'number') return v
      return String(v)
    })
  )

  const wsData = [header, ...body]
  const ws = XLSX.utils.aoa_to_sheet(wsData)

  // Auto column widths (cap at 60 chars)
  const colWidths = columns.map((col, ci) => {
    const headerLen = String(col).length
    const maxDataLen = data.reduce((max, row) => {
      const v = row[col]
      const len = (v === null || v === undefined) ? 0 : String(v).length
      return Math.max(max, len)
    }, 0)
    return { wch: Math.min(60, Math.max(headerLen, maxDataLen) + 2) }
  })
  ws['!cols'] = colWidths

  // Bold + background for header row
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1')
  for (let ci = range.s.c; ci <= range.e.c; ci++) {
    const cellRef = XLSX.utils.encode_cell({ r: 0, c: ci })
    if (!ws[cellRef]) continue
    ws[cellRef].s = {
      font: { bold: true, color: { rgb: 'FFFFFF' } },
      fill: { fgColor: { rgb: '1F6FEB' } },
      alignment: { horizontal: 'center' },
    }
  }

  // Column data format rules
  for (let r = 1; r <= range.e.r; r++) {
    for (let c = range.s.c; c <= range.e.c; c++) {
      const colName = columns[c]
      const t = String((columnTypes && columnTypes[colName]) || '').toUpperCase()
      const cellRef = XLSX.utils.encode_cell({ r, c })
      const cell = ws[cellRef]
      if (!cell) continue

      if (t === 'INT' && typeof cell.v === 'number') {
        cell.z = '0'
        continue
      }

      if (t === 'NUMBER' && typeof cell.v === 'number') {
        cell.z = '#,##0.############'
        continue
      }

      if (t === 'DATE') {
        const d = parseDateForExcel(cell.v)
        if (d) {
          cell.v = d
          cell.t = 'd'
          cell.z = 'm/dd/yyyy'
        }
        continue
      }

      if (t === 'BOOLEAN') {
        cell.v = toBooleanYN(cell.v)
        cell.t = 's'
      }
    }
  }

  const wb = XLSX.utils.book_new()
  const safeName = String(sheetName).replace(/[\\\/?*\[\]:]/g, '_').slice(0, 31) || 'Results'
  XLSX.utils.book_append_sheet(wb, ws, safeName)

  const fileName = `query_result_${new Date().toISOString().slice(0,10)}.xlsx`
  XLSX.writeFile(wb, fileName)
}

function ResultTable({ columns, rows, rowStartIndex = 0, columnTypes = {}, selectedRows, selectedColumns, onSelectRow, onSelectAll, onHeaderSelect, highlightTerm = '', activeMatch = null, onActiveMatchRef }) {
  const allSelected = rows.length > 0 && rows.every((_, i) => selectedRows.has(rowStartIndex + i))
  const someSelected = !allSelected && rows.some((_, i) => selectedRows.has(rowStartIndex + i))

  return (
    <table className="result-table" style={{ borderCollapse: 'collapse', width: '100%' }}>
      <thead>
        <tr>
          <th style={{ width: 34, textAlign: 'center', padding: '5px 8px', background: '#1a1e2a', position: 'sticky', top: 0, zIndex: 2 }}>
            <input type="checkbox" checked={allSelected} ref={el => { if (el) el.indeterminate = someSelected }} onChange={e => onSelectAll(e.target.checked)}
              style={{ cursor: 'pointer', accentColor: '#1f6feb' }} />
          </th>
          <th style={{ background: '#1a1e2a', color: '#6e7681', minWidth: 40, textAlign: 'center', fontSize: 10, fontWeight: 600, position: 'sticky', top: 0, zIndex: 2 }}>#</th>
          {columns.map((col, colIndex) => (
            <th
              key={col}
              onClick={(e) => onHeaderSelect && onHeaderSelect(col, colIndex, e.shiftKey)}
              style={{
                background: selectedColumns.has(col) ? 'rgba(31,111,235,0.25)' : '#1a1e2a',
                position: 'sticky',
                top: 0,
                zIndex: 2,
                cursor: 'pointer',
              }}
              title="Click to select column, Shift+Click for range"
            >
              {col}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => {
          const absoluteIndex = rowStartIndex + i
          const selected = selectedRows.has(absoluteIndex)
          return (
            <tr key={i} style={{ background: selected ? 'rgba(31,111,235,0.12)' : undefined }}>
              <td style={{ textAlign: 'center', padding: '4px 8px' }}>
                <input type="checkbox" checked={selected} onChange={e => onSelectRow(absoluteIndex, e.target.checked)} style={{ cursor: 'pointer', accentColor: '#1f6feb' }} />
              </td>
              <td style={{ color: '#6e7681', textAlign: 'center', fontSize: 11 }}>{absoluteIndex + 1}</td>
              {columns.map((col, colIndex) => {
                const isActiveCell = activeMatch && activeMatch.rowIndex === absoluteIndex && activeMatch.col === col
                return (
                  <td key={col} style={{ background: selectedColumns.has(col) ? 'rgba(31,111,235,0.12)' : undefined }}>
                    {formatValue(row[col], columnTypes[col], highlightTerm, isActiveCell ? activeMatch.occurrenceIndex : -1, isActiveCell ? onActiveMatchRef : undefined)}
                  </td>
                )
              })}
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

export default function ResultsPanel({
  resultSets = [],
  isRunning,
  executionInfo,
  messages = [],
  sourceSql = '',
  onChartSaved,
  queryTabs = [],
  activeQueryTabId = null,
  onSelectQueryTab,
  onCloseQueryTab,
  onRenameQueryTab,
  onReorderQueryTabs,
}) {
  const [activeResultIdx, setActiveResultIdx] = useState(0)
  const [activeTab, setActiveTab] = useState('results') // 'results' | 'messages'
  const [showChart, setShowChart] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)
  const [showExportMenu, setShowExportMenu] = useState(false)
  const [selectedRows, setSelectedRows] = useState(new Set())
  const [selectedColumns, setSelectedColumns] = useState(new Set())
  const [lastSelectedColumn, setLastSelectedColumn] = useState(null)
  const [columnSearch, setColumnSearch] = useState('')
  const [searchMode, setSearchMode] = useState('header') // 'header' | 'data'
  const [dataSearch, setDataSearch] = useState('')
  const [rowsPerPage, setRowsPerPage] = useState(200)
  const [page, setPage] = useState(1)
  const [notification, setNotification] = useState(null)
  const exportRef = useRef(null)
  const [renamingRTabId, setRenamingRTabId] = useState(null)
  const [renameRTabVal, setRenameRTabVal] = useState('')
  const [dragOverRTabId, setDragOverRTabId] = useState(null)
  const dragRTabRef = useRef(null)

  const commitRTabRename = (tabId) => {
    if (onRenameQueryTab) onRenameQueryTab(tabId, renameRTabVal.trim() || queryTabs.find(t => t.id === tabId)?.label || tabId)
    setRenamingRTabId(null)
  }
  const handleRTabDragStart = (e, tabId) => {
    dragRTabRef.current = tabId
    e.dataTransfer.effectAllowed = 'move'
  }
  const handleRTabDragOver = (e, tabId) => {
    e.preventDefault()
    if (dragRTabRef.current !== null && dragRTabRef.current !== tabId) setDragOverRTabId(tabId)
  }
  const handleRTabDrop = (e, targetTabId) => {
    e.preventDefault()
    const fromId = dragRTabRef.current
    dragRTabRef.current = null
    setDragOverRTabId(null)
    if (!fromId || fromId === targetTabId || !onReorderQueryTabs) return
    const fromIdx = queryTabs.findIndex(t => t.id === fromId)
    const toIdx = queryTabs.findIndex(t => t.id === targetTabId)
    if (fromIdx === -1 || toIdx === -1) return
    const next = [...queryTabs]
    const [moved] = next.splice(fromIdx, 1)
    next.splice(toIdx, 0, moved)
    onReorderQueryTabs(next)
  }
  const handleRTabDragEnd = () => {
    dragRTabRef.current = null
    setDragOverRTabId(null)
  }

  const activeResult = resultSets[activeResultIdx] || null

  // Reset selection when result changes
  useEffect(() => {
    setSelectedRows(new Set())
    setSelectedColumns(new Set())
    setLastSelectedColumn(null)
    setShowChart(false)
    setColumnSearch('')
    setPage(1)
  }, [activeResultIdx, resultSets.length])

  // Reset inner result-set tab when switching query history tab
  useEffect(() => { setActiveResultIdx(0); setPage(1) }, [activeQueryTabId])

  // Close export menu on outside click
  useEffect(() => {
    if (!showExportMenu) return
    const handler = (e) => { if (exportRef.current && !exportRef.current.contains(e.target)) setShowExportMenu(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showExportMenu])

  const totalRows = activeResult?.rows || []

  // Deferred copy of the data-search term: keeps the input responsive while the
  // (potentially heavy) filter + re-render lag behind. This is what makes
  // deleting characters feel fast — React can interrupt the stale filter pass.
  const deferredDataSearch = useDeferredValue(dataSearch)

  // apply data search filter when searchMode === 'data'
  const rowsAfterDataFilter = useMemo(() => {
    if (searchMode !== 'data' || !deferredDataSearch.trim()) return totalRows
    const q = String(deferredDataSearch).toLowerCase()
    return totalRows.filter(r => {
      for (const c of activeResult.columns || []) {
        const v = r[c]
        if (v === null || v === undefined) continue
        if (String(v).toLowerCase().includes(q)) return true
      }
      return false
    })
  }, [searchMode, deferredDataSearch, totalRows, activeResult])

  // Term to highlight inside cells — only in data-search mode.
  const highlightTerm = searchMode === 'data' ? deferredDataSearch.trim() : ''

  // Flat list of every individual match (cell + occurrence) for data search, in
  // row/column order — powers the "N of M" counter and next/prev navigation.
  const searchMatches = useMemo(() => {
    if (searchMode !== 'data' || !highlightTerm || !activeResult) return []
    const cols = activeResult.columns || []
    const list = []
    rowsAfterDataFilter.forEach((row, rowIndex) => {
      for (const col of cols) {
        const v = row[col]
        if (v === null || v === undefined) continue
        const occ = countOccurrences(v, highlightTerm)
        for (let k = 0; k < occ; k += 1) list.push({ rowIndex, col, occurrenceIndex: k })
      }
    })
    return list
  }, [searchMode, highlightTerm, rowsAfterDataFilter, activeResult])

  const [activeMatchIndex, setActiveMatchIndex] = useState(0)
  const activeMatchElRef = useRef(null)
  const setActiveMatchEl = useCallback((el) => { activeMatchElRef.current = el }, [])

  // Reset to the first match whenever the search term changes.
  useEffect(() => { setActiveMatchIndex(0) }, [highlightTerm, searchMode])
  useEffect(() => { if (activeMatchIndex >= searchMatches.length) setActiveMatchIndex(0) }, [searchMatches.length])

  const activeMatch = searchMode === 'data' ? (searchMatches[activeMatchIndex] || null) : null

  // Jump to whichever page holds the active match.
  useEffect(() => {
    if (!activeMatch) return
    const targetPage = Math.floor(activeMatch.rowIndex / rowsPerPage) + 1
    setPage(p => (p === targetPage ? p : targetPage))
  }, [activeMatch, rowsPerPage])

  // Scroll the active match into view once it's rendered on the current page.
  // `inline: 'center'` matters here: with many columns the table scrolls
  // horizontally, and a match in a column off to the side would otherwise stay
  // out of view — easy to mistake for "search only checks one column".
  useEffect(() => {
    activeMatchElRef.current?.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' })
  }, [activeMatch, page])

  const goToMatch = (delta) => {
    if (searchMatches.length === 0) return
    setActiveMatchIndex(i => (i + delta + searchMatches.length) % searchMatches.length)
  }

  const totalRowCount = rowsAfterDataFilter.length
  const totalPages = Math.max(1, Math.ceil(totalRowCount / rowsPerPage))

  useEffect(() => {
    if (page > totalPages) setPage(totalPages)
  }, [page, totalPages])

  const pageStartIndex = useMemo(() => (page - 1) * rowsPerPage, [page, rowsPerPage])
  const pageEndIndex = useMemo(() => Math.min(pageStartIndex + rowsPerPage, totalRowCount), [pageStartIndex, rowsPerPage, totalRowCount])
  const visibleRows = useMemo(() => rowsAfterDataFilter.slice(pageStartIndex, pageEndIndex), [rowsAfterDataFilter, pageStartIndex, pageEndIndex])

  const handleSelectRow = (i, checked) => {
    setSelectedRows(prev => { const s = new Set(prev); checked ? s.add(i) : s.delete(i); return s })
  }
  const handleSelectAll = (checked) => {
    setSelectedRows(prev => {
      const next = new Set(prev)
      for (let i = pageStartIndex; i < pageEndIndex; i += 1) {
        if (checked) next.add(i)
        else next.delete(i)
      }
      return next
    })
  }

  const filteredColumns = useMemo(() => {
    const cols = activeResult?.columns || []
    if (searchMode !== 'header') return cols
    const q = columnSearch.trim().toLowerCase()
    if (!q) return cols
    return cols.filter((col) => String(col || '').toLowerCase().includes(q))
  }, [activeResult, columnSearch, searchMode])

  const handleSelectColumn = (columnName, columnIndex, isShift) => {
    if (!filteredColumns.length) return

    if (isShift && lastSelectedColumn !== null) {
      const start = Math.min(lastSelectedColumn, columnIndex)
      const end = Math.max(lastSelectedColumn, columnIndex)
      const next = new Set()
      for (let i = start; i <= end; i += 1) {
        if (filteredColumns[i]) next.add(filteredColumns[i])
      }
      setSelectedColumns(next)
      return
    }

    setSelectedColumns(new Set([columnName]))
    setLastSelectedColumn(columnIndex)
  }

  const handleExport = (format) => {
    setShowExportMenu(false)
    if (!activeResult) return
    const r = exportData(activeResult.columns, activeResult.rows, format, selectedRows)
    if (r === 'copied') showMsg('Copied to clipboard!')
  }

  const showMsg = (text) => { setNotification(text); setTimeout(() => setNotification(null), 2000) }

  return (
    <div style={fullscreen
      ? { display: 'flex', flexDirection: 'column', position: 'fixed', inset: 0, zIndex: 3000, background: 'var(--bg-primary)', overflow: 'hidden' }
      : { display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg-primary)', overflow: 'hidden', position: 'relative' }}>
      {/* Tab row */}
      <div style={{ display: 'flex', alignItems: 'center', background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)', flexShrink: 0, gap: 0 }}>
        {/* Results / Messages tabs */}
        {['results', 'messages'].map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)} style={{
            padding: '7px 14px', fontSize: 12, background: 'transparent', border: 'none',
            borderBottom: activeTab === tab ? '2px solid var(--accent-blue)' : '2px solid transparent',
            color: activeTab === tab ? 'var(--text-primary)' : 'var(--text-secondary)',
            cursor: 'pointer', fontWeight: activeTab === tab ? 600 : 400, transition: 'color 0.15s',
          }}>
            {tab === 'results' ? 'Result' : 'Messages'}
          </button>
        ))}

        {/* Query history tabs (shown in existing result chip row) */}
        {activeTab === 'results' && queryTabs.length > 0 && (
          <div style={{ display: 'flex', marginLeft: 8, gap: 2, flex: 1, minWidth: 0, overflowX: 'auto', overflowY: 'hidden', scrollbarWidth: 'thin', scrollbarColor: 'rgba(110,118,129,0.3) transparent' }}>
            {queryTabs.map((tab) => {
              const totalRows = (tab.resultSets || []).reduce((acc, rs) => acc + (rs?.rows?.length || 0), 0)
              const isActive = activeQueryTabId === tab.id
              const isDragTarget = dragOverRTabId === tab.id
              return (
                <button key={tab.id}
                  draggable
                  onDragStart={e => handleRTabDragStart(e, tab.id)}
                  onDragOver={e => handleRTabDragOver(e, tab.id)}
                  onDrop={e => handleRTabDrop(e, tab.id)}
                  onDragEnd={handleRTabDragEnd}
                  onClick={() => { if (renamingRTabId !== tab.id) onSelectQueryTab && onSelectQueryTab(tab.id) }}
                  style={{
                    padding: '5px 10px', fontSize: 11, background: isActive ? 'rgba(31,111,235,0.15)' : 'transparent',
                    border: 'none', borderRadius: '4px 4px 0 0',
                    color: isActive ? 'var(--accent-blue-light)' : 'var(--text-secondary)',
                    cursor: 'pointer', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 5,
                    borderBottom: isActive ? '2px solid var(--accent-blue)' : '2px solid transparent',
                    boxShadow: isDragTarget ? '-2px 0 0 #4fc3f7' : 'none',
                  }} title={new Date(tab.timestamp).toLocaleString()}>
                  <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor" opacity="0.7" style={{ flexShrink: 0 }}>
                    <path d="M0 2a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V2zm3 1v2h2V3H3zm4 0v2h2V3H7zm4 0v2h2V3h-2zm-8 4v2h2V7H3zm4 0v2h2V7H7zm4 0v2h2V7h-2zm-8 4v2h2v-2H3zm4 0v2h2v-2H7zm4 0v2h2v-2h-2z"/>
                  </svg>
                  {renamingRTabId === tab.id ? (
                    <input autoFocus value={renameRTabVal}
                      onChange={e => setRenameRTabVal(e.target.value)}
                      onBlur={() => commitRTabRename(tab.id)}
                      onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') commitRTabRename(tab.id) }}
                      onClick={e => e.stopPropagation()}
                      style={{ background: 'none', border: 'none', borderBottom: '1px solid #4fc3f7', color: 'var(--text-primary)', fontSize: 11, outline: 'none', width: 80, padding: '0 2px' }} />
                  ) : (
                    <span onDoubleClick={e => { e.stopPropagation(); setRenamingRTabId(tab.id); setRenameRTabVal(tab.label) }} title="Double-click to rename">{tab.label}</span>
                  )}
                  <span style={{ background: isActive ? 'var(--accent-blue)' : '#2d3748', color: 'white', borderRadius: 10, padding: '0 5px', fontSize: 10, flexShrink: 0 }}>
                    {totalRows}
                  </span>
                  <span
                    onClick={(e) => { e.stopPropagation(); onCloseQueryTab && onCloseQueryTab(tab.id) }}
                    style={{ marginLeft: 2, fontSize: 13, lineHeight: 1, opacity: 0.8, flexShrink: 0 }}
                    aria-label="Close result tab"
                    role="button"
                  >
                    ×
                  </span>
                </button>
              )
            })}
          </div>
        )}

        {/* Result set sub-tabs */}
        {activeTab === 'results' && queryTabs.length === 0 && resultSets.length > 0 && (
          <div style={{ display: 'flex', marginLeft: 8, gap: 2, flex: 1, minWidth: 0, overflowX: 'auto', overflowY: 'hidden', scrollbarWidth: 'thin', scrollbarColor: 'rgba(110,118,129,0.3) transparent' }}>
            {resultSets.map((rs, i) => (
              <button key={i} onClick={() => setActiveResultIdx(i)} style={{
                padding: '5px 12px', fontSize: 11, background: activeResultIdx === i ? 'rgba(31,111,235,0.15)' : 'transparent',
                border: 'none', borderRadius: '4px 4px 0 0',
                color: activeResultIdx === i ? 'var(--accent-blue-light)' : 'var(--text-secondary)',
                cursor: 'pointer', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 5,
                borderBottom: activeResultIdx === i ? '2px solid var(--accent-blue)' : '2px solid transparent',
              }}>
                <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor" opacity="0.7">
                  <path d="M0 2a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V2zm3 1v2h2V3H3zm4 0v2h2V3H7zm4 0v2h2V3h-2zm-8 4v2h2V7H3zm4 0v2h2V7H7zm4 0v2h2V7h-2zm-8 4v2h2v-2H3zm4 0v2h2v-2H7zm4 0v2h2v-2h-2z"/>
                </svg>
                Result {i + 1}
                <span style={{ background: activeResultIdx === i ? 'var(--accent-blue)' : '#2d3748', color: 'white', borderRadius: 10, padding: '0 5px', fontSize: 10 }}>
                  {rs.rows.length}
                </span>
              </button>
            ))}
          </div>
        )}

        <div style={{ flex: 1 }} />

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 6, padding: '0 10px', alignItems: 'center' }}>
          {activeResult && (
            <>
              {/* Chart toggle */}
              <button
                onClick={() => setShowChart(s => !s)}
                style={{
                  padding: '3px 10px', fontSize: 11, background: showChart ? 'rgba(31,111,235,0.15)' : 'transparent',
                  border: `1px solid ${showChart ? 'var(--accent-blue)' : 'var(--border)'}`,
                  borderRadius: 4, color: showChart ? 'var(--accent-blue-light)' : 'var(--text-secondary)',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5
                }}
              >
                <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M0 0h1v15h15v1H0V0zm14.817 3.113a.5.5 0 0 1 .07.704l-4.5 5.5a.5.5 0 0 1-.74.037L7.06 6.767l-3.656 5.027a.5.5 0 0 1-.808-.588l4-5.5a.5.5 0 0 1 .758-.06l2.609 2.61 4.15-5.073a.5.5 0 0 1 .704-.07z"/>
                </svg>
                Chart
              </button>

              {/* Fullscreen toggle */}
              <button
                onClick={() => setFullscreen(f => !f)}
                title={fullscreen ? 'Exit full screen' : 'Full screen'}
                style={{
                  padding: '3px 7px', fontSize: 11, background: 'transparent',
                  border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text-secondary)',
                  cursor: 'pointer', display: 'flex', alignItems: 'center'
                }}
              >
                {fullscreen
                  ? <svg viewBox="0 0 16 16" width="13" height="13" fill="currentColor"><path d="M5.5 0v5.5H0v1h6.5V0zm5 0v1H16V0zm0 6.5V16h1V6.5zm-11 0H0v1h4.5v4.5h1V6.5z"/></svg>
                  : <svg viewBox="0 0 16 16" width="13" height="13" fill="currentColor"><path d="M1.5 1h4v1h-3v3h-1zm9 0h4v4h-1v-3h-3zm-9 9h1v3h3v1h-4zm10 3h3v-3h1v4h-4z"/></svg>}
              </button>

              {/* Export dropdown */}
              <div ref={exportRef} style={{ position: 'relative' }}>
                <button
                  onClick={() => setShowExportMenu(s => !s)}
                  style={{
                    padding: '3px 10px', fontSize: 11, background: 'transparent',
                    border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text-secondary)',
                    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4
                  }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <polyline points="7 10 12 15 17 10"/>
                    <line x1="12" y1="15" x2="12" y2="3"/>
                  </svg>
                  Export
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="6 9 12 15 18 9"/>
                  </svg>
                </button>
                {showExportMenu && (
                  <div style={{
                    position: 'absolute', top: '100%', right: 0, marginTop: 3,
                    background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 6,
                    boxShadow: '0 8px 24px rgba(0,0,0,0.5)', zIndex: 200, minWidth: 190, overflow: 'hidden'
                  }}>
                    <div style={{ padding: '6px 0' }}>
                      <ExportItem icon={<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="2" width="6" height="4" rx="1"/><path d="M9 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2h-3"/><line x1="9" y1="12" x2="15" y2="12"/><line x1="9" y1="16" x2="13" y2="16"/></svg>} label="Copy rows" onClick={() => handleExport('tsv_no_headers')} />
                      <ExportItem icon={<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="2" width="6" height="4" rx="1"/><path d="M9 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2h-3"/><line x1="9" y1="12" x2="15" y2="12"/><line x1="9" y1="16" x2="15" y2="16"/></svg>} label="Copy rows with headers" onClick={() => handleExport('tsv_headers')} />
                      {selectedRows.size > 0 && (
                        <>
                          <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
                          <div style={{ padding: '4px 12px', fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Export selected rows ({selectedRows.size})</div>
                          <ExportItem icon={null} label="→ JSON" onClick={() => handleExport('json')} indent />
                          <ExportItem icon={null} label="→ CSV" onClick={() => handleExport('csv')} indent />
                        </>
                      )}
                      <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
                      <ExportItem
                        icon={
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#3fb950" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="3" y="3" width="18" height="18" rx="2"/>
                            <path d="M3 9h18M9 21V9"/>
                          </svg>
                        }
                        label="Download as Excel (.xlsx)"
                        onClick={() => {
                          setShowExportMenu(false)
                          if (!activeResult) return
                          exportToExcel(activeResult.columns, activeResult.rows, selectedRows, activeResult.columnTypes || {})
                            .catch(e => console.error('Excel export failed:', e))
                        }}
                      />
                      {selectedRows.size > 0 && (
                        <ExportItem
                          icon={
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#3fb950" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <rect x="3" y="3" width="18" height="18" rx="2"/>
                              <path d="M3 9h18M9 21V9"/>
                            </svg>
                          }
                          label={`→ Excel (${selectedRows.size} selected rows)`}
                          onClick={() => {
                            setShowExportMenu(false)
                            if (!activeResult) return
                            exportToExcel(activeResult.columns, activeResult.rows, selectedRows, activeResult.columnTypes || {})
                              .catch(e => console.error('Excel export failed:', e))
                          }}
                          indent
                        />
                      )}
                      <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
                      <ExportItem icon={<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>} label="Download as CSV" onClick={() => handleExport('csv')} />
                      <ExportItem icon={<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>} label="Download as JSON" onClick={() => handleExport('json')} />
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Execution info bar */}
      {executionInfo && (
        <div style={{ padding: '3px 12px', background: 'var(--bg-tertiary)', borderBottom: '1px solid var(--border)', fontSize: 11, color: 'var(--text-muted)', display: 'flex', flexWrap: 'wrap', rowGap: 4, gap: 14, flexShrink: 0, alignItems: 'center' }}>
          <span style={{ color: executionInfo.success ? '#3fb950' : '#f85149' }}>
            {executionInfo.success ? '✓' : '✗'} {executionInfo.message}
          </span>
          <span>Duration: <strong style={{ color: '#79c0ff' }}>{executionInfo.duration}ms</strong></span>
          {resultSets.length > 0 && <span>Result sets: <strong style={{ color: '#79c0ff' }}>{resultSets.length}</strong></span>}
          {activeTab === 'results' && activeResult && (
            <>
              <span style={{ marginLeft: 'auto' }}>Rows: <strong>{totalRowCount === 0 ? 0 : pageStartIndex + 1}</strong>-<strong>{pageEndIndex}</strong> of <strong>{totalRowCount}</strong></span>
              <label>Rows/page</label>
              <select value={rowsPerPage} onChange={(e) => { setRowsPerPage(Number(e.target.value) || 200); setPage(1) }} style={{ background: 'var(--bg-primary)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 4, padding: '2px 6px', fontSize: 11 }}>
                <option value={100}>100</option>
                <option value={200}>200</option>
                <option value={500}>500</option>
                <option value={1000}>1000</option>
              </select>
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} style={{ padding: '2px 6px', fontSize: 11, cursor: page <= 1 ? 'not-allowed' : 'pointer' }}>◀</button>
              <span>Page {page} / {totalPages}</span>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages} style={{ padding: '2px 6px', fontSize: 11, cursor: page >= totalPages ? 'not-allowed' : 'pointer' }}>▶</button>
              <select value={searchMode} onChange={(e) => { setSearchMode(e.target.value); setPage(1) }} style={{ marginRight: 8, padding: '2px 6px', borderRadius: 4, border: '1px solid var(--border)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: 11 }}>
                <option value="header">Header</option>
                <option value="data">Data</option>
              </select>

              {searchMode === 'header' ? (
                <input
                  value={columnSearch}
                  onChange={(e) => { setColumnSearch(e.target.value); setPage(1) }}
                  placeholder="Search columns…"
                  style={{
                    background: 'var(--bg-primary)',
                    border: '1px solid var(--border)',
                    borderRadius: 4,
                    padding: '2px 8px',
                    fontSize: 11,
                    color: 'var(--text-primary)',
                    outline: 'none',
                    width: 170,
                  }}
                />
              ) : (
                <>
                  <input
                    value={dataSearch}
                    onChange={(e) => { setDataSearch(e.target.value); setPage(1) }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') { e.preventDefault(); goToMatch(e.shiftKey ? -1 : 1) }
                    }}
                    placeholder="Search data across rows..."
                    style={{
                      background: 'var(--bg-primary)',
                      border: '1px solid var(--border)',
                      borderRadius: 4,
                      padding: '2px 8px',
                      fontSize: 11,
                      color: 'var(--text-primary)',
                      outline: 'none',
                      width: 240,
                    }}
                  />
                  {highlightTerm && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                        {searchMatches.length > 0 ? `${activeMatchIndex + 1} of ${searchMatches.length}` : 'No matches'}
                      </span>
                      <button onClick={() => goToMatch(-1)} disabled={searchMatches.length === 0}
                        title="Previous match (Shift+Enter)"
                        style={{ padding: '2px 6px', fontSize: 11, cursor: searchMatches.length === 0 ? 'not-allowed' : 'pointer', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text-secondary)' }}>◀</button>
                      <button onClick={() => goToMatch(1)} disabled={searchMatches.length === 0}
                        title="Next match (Enter)"
                        style={{ padding: '2px 6px', fontSize: 11, cursor: searchMatches.length === 0 ? 'not-allowed' : 'pointer', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text-secondary)' }}>▶</button>
                    </span>
                  )}
                </>
              )}
            </>
          )}
        </div>
      )}

      {/* Content */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {activeTab === 'results' && (
          <>
            {isRunning && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 10, color: 'var(--text-secondary)' }}>
                <span className="animate-pulse-dot" style={{ width: 8, height: 8, background: '#1f6feb', borderRadius: '50%', display: 'inline-block' }} />
                <span>Executing query...</span>
              </div>
            )}
            {!isRunning && resultSets.length === 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 8, color: 'var(--text-muted)' }}>
                <svg width="32" height="32" viewBox="0 0 16 16" fill="currentColor" opacity="0.3">
                  <path d="M0 0h1v15h15v1H0V0zm14.817 3.113a.5.5 0 0 1 .07.704l-4.5 5.5a.5.5 0 0 1-.74.037L7.06 6.767l-3.656 5.027a.5.5 0 0 1-.808-.588l4-5.5a.5.5 0 0 1 .758-.06l2.609 2.61 4.15-5.073a.5.5 0 0 1 .704-.07z"/>
                </svg>
                <span style={{ fontSize: 13 }}>Run a query to see results</span>
                <span style={{ fontSize: 11 }}>Press <kbd style={{ background: '#2d3748', padding: '2px 6px', borderRadius: 3, fontSize: 11, color: '#d4d4d4' }}>Ctrl+Enter</kbd> or click Run</span>
              </div>
            )}
            {!isRunning && activeResult && (
              showChart ? (
                <div style={{ flex: 1, overflow: 'hidden' }}>
                  <ChartView
                    data={{ columns: activeResult.columns, rows: activeResult.rows.slice(0, 5000) }}
                    sourceSql={sourceSql}
                    onSaveChart={() => { showMsg('Chart saved to Charts panel!'); onChartSaved && onChartSaved() }}
                  />
                </div>
              ) : (
                <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                  <div style={{ flex: 1, overflow: 'auto' }}>
                  <ResultTable
                    columns={filteredColumns}
                    rows={visibleRows}
                    rowStartIndex={pageStartIndex}
                    columnTypes={activeResult.columnTypes || {}}
                    selectedRows={selectedRows}
                    selectedColumns={selectedColumns}
                    onSelectRow={handleSelectRow}
                    onSelectAll={handleSelectAll}
                    onHeaderSelect={handleSelectColumn}
                    highlightTerm={highlightTerm}
                    activeMatch={activeMatch}
                    onActiveMatchRef={setActiveMatchEl}
                  />
                  </div>
                </div>
              )
            )}
          </>
        )}

        {activeTab === 'messages' && (
          <div style={{ flex: 1, overflow: 'auto', padding: 12, fontFamily: 'monospace', fontSize: 12 }}>
            {messages.length === 0 ? (
              <div style={{ color: 'var(--text-muted)', textAlign: 'center', paddingTop: 40 }}>No messages</div>
            ) : messages.map((msg, i) => (
              <div key={i} style={{
                padding: '6px 10px', marginBottom: 4, borderRadius: 4,
                background: msg.type === 'error' ? 'rgba(248,81,73,0.1)' : msg.type === 'success' ? 'rgba(63,185,80,0.1)' : msg.type === 'warning' ? 'rgba(255,165,0,0.1)' : 'rgba(255,255,255,0.03)',
                borderLeft: `3px solid ${msg.type === 'error' ? '#f85149' : msg.type === 'success' ? '#3fb950' : msg.type === 'warning' ? '#ffa500' : '#6e7681'}`,
                color: msg.type === 'error' ? '#f85149' : msg.type === 'success' ? '#3fb950' : msg.type === 'warning' ? '#ffa500' : '#d4d4d4',
              }}>
                <span style={{ color: '#6e7681', marginRight: 8 }}>{msg.ts || msg.time || ''}</span>{msg.text}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Bottom status bar */}
      <div style={{ padding: '3px 12px', background: 'var(--bg-secondary)', borderTop: '1px solid var(--border)', fontSize: 11, color: 'var(--text-muted)', flexShrink: 0, display: 'flex', justifyContent: 'space-between' }}>
        <span>
          {selectedRows.size > 0 && <span style={{ color: '#1f6feb', marginRight: 12 }}>{selectedRows.size} row{selectedRows.size !== 1 ? 's' : ''} selected</span>}
          {selectedColumns.size > 0 && <span style={{ color: '#79c0ff', marginRight: 12 }}>{selectedColumns.size} column{selectedColumns.size !== 1 ? 's' : ''} selected</span>}
          {activeResult ? `Total rows: ${activeResult.rows.length}` : 'No results'}
        </span>
        {executionInfo && <span>Elapsed time: <strong>{executionInfo.duration}ms</strong></span>}
      </div>

      {/* Notification */}
      {notification && (
        <div style={{ position: 'absolute', bottom: 40, right: 12, background: '#1a3a2a', border: '1px solid #3fb950', borderRadius: 5, padding: '6px 12px', fontSize: 11, color: '#3fb950', zIndex: 100 }}>
          {notification}
        </div>
      )}
    </div>
  )
}

function ExportItem({ icon, label, onClick, indent }) {
  return (
    <div onClick={onClick} style={{
      padding: `5px ${indent ? 24 : 12}px`, cursor: 'pointer', fontSize: 12, color: 'var(--text-primary)',
      display: 'flex', alignItems: 'center', gap: 7, transition: 'background 0.1s'
    }}
      onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
    >
      {icon && <span style={{ display: 'flex', alignItems: 'center', color: 'var(--text-muted)', flexShrink: 0 }}>{icon}</span>}
      {label}
    </div>
  )
}
