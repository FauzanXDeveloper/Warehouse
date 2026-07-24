/**
 * queryEngine.js — powered by sql.js (SQLite WebAssembly)
 * Real SQLite in the browser. No AlaSQL.
 */

// ── Per-database SQLite instances ─────────────────────────────────────────────
const DB_INSTANCES = new Map()
let ACTIVE_DATABASE = ''

// ── Server-side databases (large files — never loaded into browser WASM) ──────
// Queries are routed to /api/query instead of sql.js
const SERVER_SIDE_DBS = new Set()

// ── Metadata registries ───────────────────────────────────────────────────────
const KNOWN_DATABASES = new Set()
const DB_TABLE_COLUMN_CASE  = {}
const DB_TABLE_COLUMN_TYPES = {}
const DB_TABLE_NAME_CASE    = {}
const DB_TABLE_SCHEMA       = {}
const DB_CREDENTIALS        = {}
const DB_CONNECTION_STATE   = {}

// ── sql.js bootstrap ──────────────────────────────────────────────────────────
let _sqlJsPromise = null

function getSqlJs() {
  if (_sqlJsPromise) return _sqlJsPromise
  _sqlJsPromise = (async () => {
    const mod = await import('sql.js')
    const initSqlJs = typeof mod.default === 'function' ? mod.default : mod
    return initSqlJs({
      locateFile: (f) => {
        if (f === 'sql-wasm-browser.wasm' || f === 'sql-wasm.wasm') return '/sql-wasm.wasm'
        return f
      },
    })
  })()
  return _sqlJsPromise
}

async function ensureRuntimeInitialized() {
  await getSqlJs()
}

// ── Registry helpers ──────────────────────────────────────────────────────────

function ensureTableRegistries(dbName) {
  if (!DB_TABLE_COLUMN_CASE[dbName])  DB_TABLE_COLUMN_CASE[dbName]  = {}
  if (!DB_TABLE_COLUMN_TYPES[dbName]) DB_TABLE_COLUMN_TYPES[dbName] = {}
  if (!DB_TABLE_NAME_CASE[dbName])    DB_TABLE_NAME_CASE[dbName]    = {}
  if (!DB_TABLE_SCHEMA[dbName])       DB_TABLE_SCHEMA[dbName]       = {}
}

function registerKnownDatabase(dbName) {
  if (!dbName) return
  const n = String(dbName).toLowerCase()
  KNOWN_DATABASES.add(n)
  ensureTableRegistries(n)
  if (!ACTIVE_DATABASE) ACTIVE_DATABASE = n
}

function databaseExists(dbName = '') {
  return KNOWN_DATABASES.has(String(dbName).toLowerCase())
}

function removeKnownDatabase(dbName) {
  const n = String(dbName || '').toLowerCase()
  KNOWN_DATABASES.delete(n)
  SERVER_SIDE_DBS.delete(n)
  DB_INSTANCES.delete(n)
  delete DB_TABLE_COLUMN_CASE[n]
  delete DB_TABLE_COLUMN_TYPES[n]
  delete DB_TABLE_NAME_CASE[n]
  delete DB_TABLE_SCHEMA[n]
  delete DB_CREDENTIALS[n]
  delete DB_CONNECTION_STATE[n]
  if (ACTIVE_DATABASE === n) ACTIVE_DATABASE = [...KNOWN_DATABASES][0] || ''
}

function isServerSideDatabase(dbName) {
  return SERVER_SIDE_DBS.has(String(dbName || '').toLowerCase())
}

function markServerSideDatabase(dbName) {
  const n = String(dbName || '').toLowerCase()
  SERVER_SIDE_DBS.add(n)
  registerKnownDatabase(n)
}

function getDbInstance(dbName) {
  return DB_INSTANCES.get(String(dbName).toLowerCase()) || null
}

function dropRuntimeDbInstance(dbName) {
  const n = String(dbName || '').toLowerCase()
  const existing = DB_INSTANCES.get(n)
  if (!existing) return
  try { existing.close() } catch {}
  DB_INSTANCES.delete(n)
}

async function getOrCreateDbInstance(dbName) {
  const SQL = await getSqlJs()
  const n = String(dbName).toLowerCase()
  if (!DB_INSTANCES.has(n)) {
    const db = new SQL.Database()
    registerBrowserFunctions(db)
    DB_INSTANCES.set(n, db)
    registerKnownDatabase(n)
  }
  return DB_INSTANCES.get(n)
}

// ── SQL value helpers ─────────────────────────────────────────────────────────

function escapeIdentifier(id = '') {
  return '"' + String(id).replace(/"/g, '""') + '"'
}

function escapeLiteral(value) {
  if (value === null || value === undefined) return 'NULL'
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'NULL'
  if (typeof value === 'boolean') return value ? '1' : '0'
  return "'" + String(value).replace(/'/g, "''") + "'"
}

function normalizeSqlType(type) {
  const t = String(type || '').trim().toUpperCase()
  if (!t) return 'TEXT'
  if (t.includes('INT'))  return 'INTEGER'
  if (t.includes('NUM') || t.includes('DEC') || t.includes('FLOAT') || t.includes('DOUBLE') || t.includes('REAL')) return 'REAL'
  if (t.includes('BOOL')) return 'BOOLEAN'
  if (t.includes('DATE') && !t.includes('TIME')) return 'DATE'
  if (t.includes('TIME')) return 'DATETIME'
  if (t.includes('CHAR') || t.includes('TEXT') || t.includes('STRING') || t.includes('VARCHAR')) return 'TEXT'
  const base = t.split('(')[0]
  if (['INTEGER','REAL','TEXT','BLOB','NUMERIC','BOOLEAN','DATE','DATETIME'].includes(base)) return base
  return 'TEXT'
}

function uiType(sqliteType) {
  const t = String(sqliteType || '').toUpperCase()
  if (t === 'INTEGER') return 'INT'
  if (t === 'REAL' || t === 'NUMERIC') return 'NUMBER'
  if (t === 'BOOLEAN') return 'BOOLEAN'
  if (t === 'DATE' || t === 'DATETIME' || t === 'TIME' || t === 'TIMESTAMP') return 'DATE'
  return 'STRING'
}

// Samples up to TYPE_SAMPLE_SIZE non-empty values from a column and returns the
// dominant kind. Uses an 80% tolerance so that a handful of stray values
// (e.g. Excel "#NUM!" errors in a date column) don't demote the whole column.
const TYPE_SAMPLE_SIZE = 200

function sampleColumnKind(rows, col) {
  let seen = 0, dates = 0, ints = 0, reals = 0, bools = 0
  for (let i = 0; i < rows.length && seen < TYPE_SAMPLE_SIZE; i += 1) {
    const v = rows[i] && rows[i][col]
    if (v === null || v === undefined || v === '') continue
    seen += 1
    if (typeof v === 'boolean') { bools += 1; continue }
    if (typeof v === 'number') { Number.isInteger(v) ? (ints += 1) : (reals += 1); continue }
    const s = String(v).trim()
    if (looksLikeDateString(s)) { dates += 1; continue }
    const numStr = s.replace(/,/g, '')
    if (/^[-+]?\d+$/.test(numStr)) { ints += 1; continue }
    if (/^[-+]?(?:\d*\.\d+|\d+\.\d*)$/.test(numStr)) { reals += 1; continue }
    // anything else counts as text (tracked implicitly via `seen`)
  }
  if (seen === 0) return 'TEXT'
  const ratio = (n) => n / seen
  if (ratio(dates) >= 0.8) return 'DATE'
  if (ratio(bools) >= 0.8) return 'BOOLEAN'
  if (ratio(ints + reals) >= 0.8) return reals > 0 ? 'REAL' : 'INTEGER'
  return 'TEXT'
}

function inferSqlType(rows, col) {
  const kind = sampleColumnKind(rows, col)
  return kind === 'BOOLEAN' ? 'INTEGER' : kind
}

function formatDateMddyyyy(dateValue) {
  const d = _parseBrowserDate(dateValue)
  if (!d) return null
  const month = d.getUTCMonth() + 1
  const day = String(d.getUTCDate()).padStart(2, '0')
  const year = d.getUTCFullYear()
  return `${month}/${day}/${year}`
}

function coerceValueByType(value, targetType) {
  if (value === null || value === undefined) return null
  const normalized = normalizeSqlType(targetType)

  if (normalized === 'INTEGER') {
    const text = String(value).replace(/,/g, '')
    const next = parseInt(text, 10)
    return Number.isFinite(next) ? next : null
  }

  if (normalized === 'REAL') {
    const text = String(value).replace(/,/g, '')
    const next = parseFloat(text)
    return Number.isFinite(next) ? next : null
  }

  if (normalized === 'BOOLEAN') {
    if (typeof value === 'boolean') return value ? 1 : 0
    if (typeof value === 'number') return Number.isFinite(value) ? (value === 0 ? 0 : 1) : null
    const text = String(value).trim().toUpperCase()
    if (['1', 'Y', 'YES', 'TRUE', 'T'].includes(text)) return 1
    if (['0', 'N', 'NO', 'FALSE', 'F'].includes(text)) return 0
    return null
  }

  if (normalized === 'DATE' || normalized === 'DATETIME') {
    return formatDateMddyyyy(value)
  }

  if (normalized === 'TEXT') return String(value)
  return value
}

function normalizeHeaderName(name) {
  return String(name ?? '').trim()
}

// ── Shared date detection / parsing helpers ───────────────────────────────────
const MONTH_ABBR = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 }

// Recognises the date string formats the warehouse data actually uses.
// Deliberately REJECTS bare numbers (e.g. dossier codes like 595482) so numeric
// identifier columns are never mistaken for dates.
function looksLikeDateString(value) {
  if (typeof value !== 'string') return false
  const raw = value.trim()
  if (!raw) return false
  // ISO YYYY-MM-DD or YYYY/MM/DD, optional time component
  if (/^\d{4}[-/]\d{1,2}[-/]\d{1,2}(?:[ T]\d{1,2}:\d{2}(?::\d{2})?)?$/.test(raw)) return true
  // M/D/YYYY, D-M-YYYY, M/D/YY  (2- or 4-digit year, needs separators → not a plain number)
  if (/^\d{1,2}[/-]\d{1,2}[/-]\d{2}(?:\d{2})?$/.test(raw)) return true
  // DD-MON-YYYY / DD MON YYYY (Oracle style, e.g. 09-NOV-2006)
  if (/^\d{1,2}[-/ ][A-Za-z]{3,9}[-/ ]\d{2}(?:\d{2})?$/.test(raw)) return true
  return false
}

// Parses a value string against an explicit Oracle-style format mask
// (tokens: YYYY, YY, MONTH, MON, MM, DD). Returns a Date (UTC) or null.
function _parseDateWithFormat(value, fmt) {
  const F = String(fmt).toUpperCase()
  let idx = 0
  let pattern = '^'
  const order = []
  while (idx < F.length) {
    const m = F.slice(idx).match(/^(YYYY|YY|MONTH|MON|MM|DD)/)
    if (m) {
      const t = m[1]
      order.push(t)
      if (t === 'YYYY') pattern += '(\\d{4})'
      else if (t === 'YY') pattern += '(\\d{2})'
      else if (t === 'MM' || t === 'DD') pattern += '(\\d{1,2})'
      else pattern += '([A-Za-z]{3,9})'
      idx += t.length
    } else {
      pattern += F[idx].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      idx += 1
    }
  }
  pattern += '$'
  const mm = String(value).trim().match(new RegExp(pattern, 'i'))
  if (!mm) return null
  let year = null, month = null, day = null
  order.forEach((t, i) => {
    const g = mm[i + 1]
    if (t === 'YYYY') year = Number(g)
    else if (t === 'YY') { year = Number(g); year += year < 70 ? 2000 : 1900 }
    else if (t === 'MM') month = Number(g)
    else if (t === 'DD') day = Number(g)
    else month = MONTH_ABBR[g.slice(0, 3).toLowerCase()] || null
  })
  if (!year || !month || !day) return null
  const d = new Date(Date.UTC(year, month - 1, day))
  return Number.isNaN(d.getTime()) ? null : d
}

// ── Browser-side custom SQL functions (sql.js) ────────────────────────────────
function _parseBrowserDate(value) {
  if (value === null || value === undefined) return null
  if (typeof value === 'number' && Number.isFinite(value)) {
    const ms = Date.UTC(1899, 11, 30) + Math.floor(value) * 86400000
    const d = new Date(ms)
    return Number.isNaN(d.getTime()) ? null : d
  }
  const raw = String(value).trim()
  if (!raw) return null

  // M/D/YYYY or MM/DD/YYYY — parse as UTC FIRST to avoid local-timezone drift
  const slash = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (slash) {
    const d = new Date(Date.UTC(Number(slash[3]), Number(slash[1]) - 1, Number(slash[2])))
    return Number.isNaN(d.getTime()) ? null : d
  }

  // D-M-YYYY
  const dashDMY = raw.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/)
  if (dashDMY) {
    const d = new Date(Date.UTC(Number(dashDMY[3]), Number(dashDMY[1]) - 1, Number(dashDMY[2])))
    return Number.isNaN(d.getTime()) ? null : d
  }

  // ISO YYYY-MM-DD or YYYY/MM/DD (date-only or with time) — parse as UTC explicitly
  const iso = raw.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[T ].*)?$/)
  if (iso) {
    const d = new Date(Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])))
    return Number.isNaN(d.getTime()) ? null : d
  }

  // DD-MON-YYYY / DD MON YYYY / DD/MON/YYYY (Oracle style, e.g. 09-NOV-2006)
  const mon = raw.match(/^(\d{1,2})[-/ ]([A-Za-z]{3,9})[-/ ](\d{2,4})$/)
  if (mon) {
    const m = MONTH_ABBR[mon[2].slice(0, 3).toLowerCase()]
    if (m) {
      let yr = Number(mon[3]); if (yr < 100) yr += yr < 70 ? 2000 : 1900
      const d = new Date(Date.UTC(yr, m - 1, Number(mon[1])))
      return Number.isNaN(d.getTime()) ? null : d
    }
  }

  // M/D/YY or M-D-YY (2-digit year) — treat month first, consistent with M/D/YYYY
  const shortY = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2})$/)
  if (shortY) {
    const yr = Number(shortY[3]) + (Number(shortY[3]) < 70 ? 2000 : 1900)
    const d = new Date(Date.UTC(yr, Number(shortY[1]) - 1, Number(shortY[2])))
    return Number.isNaN(d.getTime()) ? null : d
  }

  // Fallback generic parse
  const d = new Date(raw)
  return Number.isNaN(d.getTime()) ? null : d
}

function registerBrowserFunctions(db) {
  if (!db || typeof db.create_function !== 'function') return
  const cf = (name, fn) => { try { db.create_function(name, fn) } catch {} }

  // Date extraction
  cf('MONTH',      function(v) { const d = _parseBrowserDate(v); return d ? d.getUTCMonth() + 1 : null })
  cf('YEAR',       function(v) { const d = _parseBrowserDate(v); return d ? d.getUTCFullYear() : null })
  cf('DAY',        function(v) { const d = _parseBrowserDate(v); return d ? d.getUTCDate() : null })
  cf('DAYOFMONTH', function(v) { const d = _parseBrowserDate(v); return d ? d.getUTCDate() : null })
  cf('HOUR',       function(v) { const d = _parseBrowserDate(v); return d ? d.getUTCHours() : null })
  cf('MINUTE',     function(v) { const d = _parseBrowserDate(v); return d ? d.getUTCMinutes() : null })
  cf('SECOND',     function(v) { const d = _parseBrowserDate(v); return d ? d.getUTCSeconds() : null })
  cf('QUARTER',    function(v) { const d = _parseBrowserDate(v); return d ? Math.ceil((d.getUTCMonth() + 1) / 3) : null })
  cf('DAYOFWEEK',  function(v) { const d = _parseBrowserDate(v); return d ? d.getUTCDay() + 1 : null })
  cf('WEEKDAY',    function(v) { const d = _parseBrowserDate(v); return d ? (d.getUTCDay() + 6) % 7 : null })
  cf('DAYOFYEAR',  function(v) {
    const d = _parseBrowserDate(v)
    if (!d) return null
    return Math.floor((d - new Date(Date.UTC(d.getUTCFullYear(), 0, 1))) / 86400000) + 1
  })
  cf('WEEK',       function(v) {
    const d = _parseBrowserDate(v)
    if (!d) return null
    const s = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
    return Math.ceil(((d - s) / 86400000 + s.getUTCDay() + 1) / 7)
  })
  cf('WEEKOFYEAR', function(v) {
    const d = _parseBrowserDate(v)
    if (!d) return null
    const s = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
    return Math.ceil(((d - s) / 86400000 + s.getUTCDay() + 1) / 7)
  })

  // Current date/time (no args)
  cf('GETDATE',     function() { return new Date().toISOString().slice(0, 19).replace('T', ' ') })
  cf('GETUTCDATE',  function() { return new Date().toISOString().slice(0, 19).replace('T', ' ') })
  cf('SYSDATETIME', function() { return new Date().toISOString().slice(0, 19).replace('T', ' ') })
  cf('SYSDATE',     function() { return new Date().toISOString().slice(0, 19).replace('T', ' ') })
  cf('NOW',         function() { return new Date().toISOString().slice(0, 19).replace('T', ' ') })
  cf('CURDATE',     function() { return new Date().toISOString().slice(0, 10) })
  cf('CURTIME',     function() { return new Date().toISOString().slice(11, 19) })
  cf('TODAY',       function() { return new Date().toISOString().slice(0, 10) })

  // Date arithmetic
  cf('DATEDIFF', function() {
    const args = Array.from(arguments)
    if (args.length >= 3) {
      const unit = String(args[0] || 'day').toLowerCase().replace(/s$/, '')
      const d1 = _parseBrowserDate(args[1]), d2 = _parseBrowserDate(args[2])
      if (!d1 || !d2) return null
      const ms = d2 - d1
      if (unit === 'day'  || unit === 'dd' || unit === 'd')  return Math.trunc(ms / 86400000)
      if (unit === 'week' || unit === 'wk' || unit === 'ww') return Math.trunc(ms / 604800000)
      if (unit === 'hour' || unit === 'hh')                  return Math.trunc(ms / 3600000)
      if (unit === 'minute'|| unit === 'mi'|| unit === 'n')  return Math.trunc(ms / 60000)
      if (unit === 'second'|| unit === 'ss'|| unit === 's')  return Math.trunc(ms / 1000)
      if (unit === 'month' || unit === 'mm'|| unit === 'm')
        return (d2.getUTCFullYear() - d1.getUTCFullYear()) * 12 + d2.getUTCMonth() - d1.getUTCMonth()
      if (unit === 'year'  || unit === 'yy'|| unit === 'yyyy')
        return d2.getUTCFullYear() - d1.getUTCFullYear()
      return Math.trunc(ms / 86400000)
    }
    const d1 = _parseBrowserDate(args[0]), d2 = _parseBrowserDate(args[1])
    if (!d1 || !d2) return null
    return Math.trunc((d1 - d2) / 86400000)
  })
  cf('DATEADD', function(unit, n, dateVal) {
    const d = _parseBrowserDate(dateVal)
    if (!d) return null
    const num = Number(n) || 0
    const u = String(unit || 'day').toLowerCase().replace(/s$/, '')
    if (u === 'day'  || u === 'dd' || u === 'd')  d.setUTCDate(d.getUTCDate() + num)
    else if (u === 'week'|| u === 'wk'||u === 'ww') d.setUTCDate(d.getUTCDate() + num * 7)
    else if (u === 'month'||u === 'mm'||u === 'm')  d.setUTCMonth(d.getUTCMonth() + num)
    else if (u === 'year'||u === 'yy'||u === 'yyyy') d.setUTCFullYear(d.getUTCFullYear() + num)
    else if (u === 'hour'||u === 'hh')               d.setUTCHours(d.getUTCHours() + num)
    else if (u === 'minute'||u === 'mi'||u === 'n')  d.setUTCMinutes(d.getUTCMinutes() + num)
    else if (u === 'second'||u === 'ss'||u === 's')  d.setUTCSeconds(d.getUTCSeconds() + num)
    return d.toISOString().slice(0, 19).replace('T', ' ')
  })
  cf('DATE_ADD', function(dateVal, nDays) {
    const d = _parseBrowserDate(dateVal); if (!d) return null
    d.setUTCDate(d.getUTCDate() + (Number(nDays) || 0))
    return d.toISOString().slice(0, 10)
  })
  cf('DATE_SUB', function(dateVal, nDays) {
    const d = _parseBrowserDate(dateVal); if (!d) return null
    d.setUTCDate(d.getUTCDate() - (Number(nDays) || 0))
    return d.toISOString().slice(0, 10)
  })
  cf('DATE_DIFF', function(d1Val, d2Val) {
    const d1 = _parseBrowserDate(d1Val), d2 = _parseBrowserDate(d2Val)
    if (!d1 || !d2) return null
    return Math.trunc((d1 - d2) / 86400000)
  })
  cf('EOMONTH', function(dateVal, offset) {
    const d = _parseBrowserDate(dateVal); if (!d) return null
    const mo = d.getUTCMonth() + 1 + (Number(offset) || 0)
    return new Date(Date.UTC(d.getUTCFullYear(), mo, 0)).toISOString().slice(0, 10)
  })
  cf('DATE_FORMAT', function(dateVal, fmt) {
    const d = _parseBrowserDate(dateVal); if (!d) return null
    return String(fmt || '')
      .replace(/%Y/g, d.getUTCFullYear())
      .replace(/%y/g, String(d.getUTCFullYear()).slice(-2))
      .replace(/%m/g, String(d.getUTCMonth() + 1).padStart(2, '0'))
      .replace(/%d/g, String(d.getUTCDate()).padStart(2, '0'))
      .replace(/%H/g, String(d.getUTCHours()).padStart(2, '0'))
      .replace(/%i/g, String(d.getUTCMinutes()).padStart(2, '0'))
      .replace(/%s/g, String(d.getUTCSeconds()).padStart(2, '0'))
  })
  cf('TO_DATE', function(v, fmt) {
    if (v === null || v === undefined) return null
    if (fmt) {
      const parsed = _parseDateWithFormat(String(v), String(fmt))
      if (parsed) return parsed.toISOString().slice(0, 10)
    }
    const d = _parseBrowserDate(v); return d ? d.toISOString().slice(0, 10) : null
  })
  cf('ADD_MONTHS', function(dateVal, n) {
    const d = _parseBrowserDate(dateVal); if (!d) return null
    d.setUTCMonth(d.getUTCMonth() + (Number(n) || 0))
    return d.toISOString().slice(0, 10)
  })
  cf('LAST_DAY', function(dateVal) {
    const d = _parseBrowserDate(dateVal); if (!d) return null
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).toISOString().slice(0, 10)
  })
  cf('MONTHNAME', function(dateVal) {
    const d = _parseBrowserDate(dateVal); if (!d) return null
    return ['January','February','March','April','May','June','July','August','September','October','November','December'][d.getUTCMonth()]
  })
  cf('DAYNAME', function(dateVal) {
    const d = _parseBrowserDate(dateVal); if (!d) return null
    return ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][d.getUTCDay()]
  })

  // String functions
  cf('LEN', function(s) { return s === null || s === undefined ? null : String(s).length })
  cf('LEFT', function(s, n) {
    if (s === null) return null
    return String(s).slice(0, Math.max(0, Number(n) || 0))
  })
  cf('RIGHT', function(s, n) {
    if (s === null) return null
    const len = Math.max(0, Number(n) || 0)
    return len === 0 ? '' : String(s).slice(-len)
  })
  cf('CHARINDEX', function() {
    const args = Array.from(arguments)
    const needle = args[0], haystack = args[1], startPos = args[2]
    if (needle === null || haystack === null) return 0
    const h = String(haystack), n = String(needle)
    const from = startPos !== undefined ? Math.max(0, Number(startPos) - 1) : 0
    const idx = h.indexOf(n, from)
    return idx === -1 ? 0 : idx + 1
  })
  cf('LOCATE', function() {
    const args = Array.from(arguments)
    const needle = args[0], haystack = args[1], startPos = args[2]
    if (needle === null || haystack === null) return 0
    const h = String(haystack), n = String(needle)
    const from = startPos !== undefined ? Math.max(0, Number(startPos) - 1) : 0
    const idx = h.indexOf(n, from)
    return idx === -1 ? 0 : idx + 1
  })
  cf('ISNULL', function(expr, alt) { return (expr === null || expr === undefined) ? alt : expr })
  cf('NVL',    function(expr, alt) { return (expr === null || expr === undefined) ? alt : expr })
  cf('NVL2',   function(expr, notNull, isNull) { return (expr === null || expr === undefined) ? isNull : notNull })
  cf('LPAD', function(s, len, pad) {
    if (s === null) return null
    const str = String(s), l = Math.max(0, Number(len) || 0)
    const p = (pad !== null && pad !== undefined) ? String(pad) : ' '
    if (!p || str.length >= l) return str.slice(0, l)
    return (p.repeat(Math.ceil((l - str.length) / p.length)) + str).slice(-l)
  })
  cf('RPAD', function(s, len, pad) {
    if (s === null) return null
    const str = String(s), l = Math.max(0, Number(len) || 0)
    const p = (pad !== null && pad !== undefined) ? String(pad) : ' '
    if (!p || str.length >= l) return str.slice(0, l)
    return (str + p.repeat(Math.ceil((l - str.length) / p.length))).slice(0, l)
  })
  cf('SPACE',   function(n) { return ' '.repeat(Math.max(0, Number(n) || 0)) })
  cf('REPEAT',  function(s, n) { return s === null ? null : String(s).repeat(Math.max(0, Number(n) || 0)) })
  cf('STR',     function(n) { return n === null ? null : String(Number(n) || 0) })
  cf('REVERSE', function(s) { return s === null ? null : String(s).split('').reverse().join('') })
  cf('ASCII',   function(s) { return s === null || String(s).length === 0 ? null : String(s).charCodeAt(0) })
  cf('UNICODE', function(s) { return s === null || String(s).length === 0 ? null : String(s).charCodeAt(0) })
  cf('CHR',     function(n) { return n === null ? null : String.fromCharCode(Number(n)) })
  cf('NCHAR',   function(n) { return n === null ? null : String.fromCharCode(Number(n)) })
  cf('INITCAP', function(s) {
    if (s === null) return null
    return String(s).replace(/\b\w/g, c => c.toUpperCase()).replace(/\B\w/g, c => c.toLowerCase())
  })
  cf('PROPER', function(s) {
    if (s === null) return null
    return String(s).replace(/\b\w/g, c => c.toUpperCase()).replace(/\B\w/g, c => c.toLowerCase())
  })
  cf('STUFF', function(s, start, length, repl) {
    if (s === null) return null
    const str = String(s), st = (Number(start) || 1) - 1, l = Math.max(0, Number(length) || 0)
    return str.slice(0, st) + (repl === null || repl === undefined ? '' : String(repl)) + str.slice(st + l)
  })
  cf('TRANSLATE', function(s, fromStr, toStr) {
    if (s === null) return null
    let result = String(s)
    const f = String(fromStr || ''), t = String(toStr || '')
    for (let i = 0; i < f.length; i++) result = result.split(f[i]).join(i < t.length ? t[i] : '')
    return result
  })
  cf('CONCAT', function() {
    return Array.from(arguments).map(a => a === null || a === undefined ? '' : String(a)).join('')
  })
  cf('CONCAT_WS', function() {
    const args = Array.from(arguments)
    const sep = args[0]
    return args.slice(1).filter(a => a !== null && a !== undefined).map(String).join(String(sep ?? ''))
  })
  cf('IIF',    function(cond, t, f) { return cond ? t : f })
  cf('CHOOSE', function() {
    const args = Array.from(arguments)
    const i = Number(args[0]) - 1
    return (i >= 0 && i < args.length - 1) ? args[i + 1] : null
  })
  cf('DECODE', function() {
    const args = Array.from(arguments)
    const expr = args[0]
    for (let i = 1; i < args.length - 1; i += 2) {
      if (expr == args[i] || (expr === null && args[i] === null)) return args[i + 1]
    }
    return args.length % 2 === 0 ? args[args.length - 1] : null
  })

  // Numeric / formatting
  cf('FORMAT', function(value, fmt) {
    if (value === null) return null
    const n = Number(value)
    if (!Number.isFinite(n) || !fmt) return String(value)
    const f = String(fmt)
    const numM = f.match(/^[Nn](\d+)$/)
    if (numM) return n.toLocaleString('en-US', { minimumFractionDigits: Number(numM[1]), maximumFractionDigits: Number(numM[1]) })
    const fixM = f.match(/^[Ff](\d+)$/)
    if (fixM) return n.toFixed(Number(fixM[1]))
    const pctM = f.match(/^[Pp](\d+)$/)
    if (pctM) return (n * 100).toFixed(Number(pctM[1])) + '%'
    return n.toLocaleString('en-US')
  })
  cf('TO_NUMBER', function(s) {
    if (s === null) return null
    const n = Number(String(s).replace(/[$€£¥,\s]/g, ''))
    return Number.isFinite(n) ? n : null
  })
  cf('TRY_CAST', function(v) { if (v === null) return null; const n = Number(v); return Number.isFinite(n) ? n : null })
  cf('SIGN',     function(n) { if (n === null) return null; const v = Number(n); return v > 0 ? 1 : v < 0 ? -1 : 0 })
  cf('LOG2',     function(n) { return n === null ? null : Math.log2(Number(n)) })
  cf('LOG10',    function(n) { return n === null ? null : Math.log10(Number(n)) })
  cf('PI',       function()  { return Math.PI })
  cf('CBRT',     function(n) { return n === null ? null : Math.cbrt(Number(n)) })
  cf('TRUNCATE', function(n, places) {
    if (n === null) return null
    const factor = Math.pow(10, Number(places) || 0)
    return Math.trunc(Number(n) * factor) / factor
  })
  cf('TO_CHAR', function(value, fmt) {
    if (value === null || value === undefined) return null
    if (!fmt) return String(value)
    const d = _parseBrowserDate(value)
    if (d) {
      return String(fmt)
        .replace(/YYYY/g, d.getUTCFullYear())
        .replace(/YY/g,   String(d.getUTCFullYear()).slice(-2))
        .replace(/MM/g,   String(d.getUTCMonth() + 1).padStart(2, '0'))
        .replace(/DD/g,   String(d.getUTCDate()).padStart(2, '0'))
        .replace(/HH24/g, String(d.getUTCHours()).padStart(2, '0'))
        .replace(/HH/g,   String(d.getUTCHours() % 12 || 12).padStart(2, '0'))
        .replace(/MI/g,   String(d.getUTCMinutes()).padStart(2, '0'))
        .replace(/SS/g,   String(d.getUTCSeconds()).padStart(2, '0'))
    }
    const n = Number(value)
    if (Number.isFinite(n)) {
      const places = (String(fmt).match(/0+\.?(0*)$/) || ['', ''])[1].length
      return n.toFixed(places)
    }
    return String(value)
  })
  cf('PATINDEX', function(pattern, expr) {
    if (!pattern || expr === null) return 0
    const re = new RegExp(String(pattern).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*').replace(/_/g, '.'), 'i')
    const m = String(expr).match(re)
    return m ? String(expr).indexOf(m[0]) + 1 : 0
  })
  cf('SOUNDEX', function(s) {
    if (s === null || !String(s).trim()) return null
    const str = String(s).toUpperCase().replace(/[^A-Z]/g, '')
    if (!str) return null
    const codes = { B:1,F:1,P:1,V:1, C:2,G:2,J:2,K:2,Q:2,S:2,X:2,Z:2, D:3,T:3, L:4, M:5,N:5, R:6 }
    let code = str[0], prev = codes[str[0]] || 0
    for (let i = 1; i < str.length && code.length < 4; i++) {
      const c = codes[str[i]] || 0
      if (c && c !== prev) { code += c; prev = c } else if (!c) { prev = 0 }
    }
    return (code + '000').slice(0, 4)
  })

  // ── Compatibility functions (SQL Server / MySQL names not native to SQLite) ──
  const _soundexCode = (s) => {
    const str = String(s ?? '').toUpperCase().replace(/[^A-Z]/g, '')
    if (!str) return '0000'
    const codes = { B:1,F:1,P:1,V:1, C:2,G:2,J:2,K:2,Q:2,S:2,X:2,Z:2, D:3,T:3, L:4, M:5,N:5, R:6 }
    let code = str[0], prev = codes[str[0]] || 0
    for (let i = 1; i < str.length && code.length < 4; i++) {
      const c = codes[str[i]] || 0
      if (c && c !== prev) { code += c; prev = c } else if (!c) { prev = 0 }
    }
    return (code + '000').slice(0, 4)
  }
  cf('DATALENGTH', function(s) { return s === null || s === undefined ? null : new TextEncoder().encode(String(s)).length })
  cf('DIFFERENCE', function(a, b) {
    if (a === null || b === null) return null
    const x = _soundexCode(a), y = _soundexCode(b)
    let m = 0; for (let i = 0; i < 4; i++) if (x[i] === y[i]) m++
    return m
  })
  cf('QUOTENAME', function(s, q) {
    if (s === null || s === undefined) return null
    const open = q ? String(q) : '['
    const close = open === '[' ? ']' : open
    return open + String(s) + close
  })
  cf('SUBSTRING', function(s, start, len) {
    if (s === null || s === undefined) return null
    const str = String(s)
    const st = Number(start) || 1
    const from = st > 0 ? st - 1 : Math.max(0, str.length + st)
    return (len === undefined || len === null) ? str.slice(from) : str.substr(from, Math.max(0, Number(len) || 0))
  })
  cf('REPLICATE', function(s, n) { return s === null ? null : String(s).repeat(Math.max(0, Number(n) || 0)) })
  cf('ISNUMERIC', function(v) {
    if (v === null || v === undefined) return 0
    return /^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(String(v).trim().replace(/,/g, '')) ? 1 : 0
  })
  cf('CONVERT', function(type, expr, _style) {
    if (expr === null || expr === undefined) return null
    const t = String(type || '').toUpperCase()
    if (/INT/.test(t)) { const n = parseInt(String(expr).replace(/,/g, ''), 10); return Number.isFinite(n) ? n : null }
    if (/DEC|NUM|FLOAT|REAL|DOUBLE/.test(t)) { const n = parseFloat(String(expr).replace(/,/g, '')); return Number.isFinite(n) ? n : null }
    if (/DATE|TIME/.test(t)) { const d = _parseBrowserDate(expr); return d ? d.toISOString().slice(0, 10) : null }
    return String(expr)
  })
  cf('USER_NAME', function() { return 'local_user' })

  // Math functions (sql.js is usually built without SQLite's math extension)
  const num = (x) => (x === null || x === undefined ? null : Number(x))
  const m1 = (name, fn) => cf(name, function(x) { const n = num(x); return n === null || Number.isNaN(n) ? null : fn(n) })
  m1('ACOS', Math.acos); m1('ASIN', Math.asin); m1('ATAN', Math.atan)
  m1('COS', Math.cos); m1('SIN', Math.sin); m1('TAN', Math.tan)
  m1('COT', (x) => 1 / Math.tan(x)); m1('SQRT', Math.sqrt); m1('SQUARE', (x) => x * x)
  m1('CEILING', Math.ceil); m1('FLOOR', Math.floor)
  m1('DEGREES', (x) => x * 180 / Math.PI); m1('RADIANS', (x) => x * Math.PI / 180)
  cf('ATN2', function(y, x) { return (y === null || x === null) ? null : Math.atan2(Number(y), Number(x)) })
  cf('POWER', function(x, y) { return (x === null || y === null) ? null : Math.pow(Number(x), Number(y)) })
  cf('LOG', function(x, base) {
    const n = num(x); if (n === null) return null
    return (base === undefined || base === null) ? Math.log(n) : Math.log(n) / Math.log(Number(base))
  })
  cf('RAND', function() { return Math.random() })

  // Date-part builders (SQL Server style)
  const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December']
  const DAY_NAMES = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']
  cf('DATEFROMPARTS', function(y, mo, d) {
    if (y === null || mo === null || d === null) return null
    const dt = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d)))
    return Number.isNaN(dt.getTime()) ? null : dt.toISOString().slice(0, 10)
  })
  cf('ISDATE', function(v) { return _parseBrowserDate(v) ? 1 : 0 })
  cf('DATEPART', function(part, dateVal) {
    const d = _parseBrowserDate(dateVal); if (!d) return null
    const p = String(part || '').toLowerCase().replace(/s$/, '')
    if (p === 'year' || p === 'yy' || p === 'yyyy') return d.getUTCFullYear()
    if (p === 'month' || p === 'mm' || p === 'm') return d.getUTCMonth() + 1
    if (p === 'day' || p === 'dd' || p === 'd') return d.getUTCDate()
    if (p === 'hour' || p === 'hh') return d.getUTCHours()
    if (p === 'minute' || p === 'mi' || p === 'n') return d.getUTCMinutes()
    if (p === 'second' || p === 'ss') return d.getUTCSeconds()
    if (p === 'quarter' || p === 'qq' || p === 'q') return Math.ceil((d.getUTCMonth() + 1) / 3)
    if (p === 'weekday' || p === 'dw') return d.getUTCDay() + 1
    return null
  })
  cf('DATENAME', function(part, dateVal) {
    const d = _parseBrowserDate(dateVal); if (!d) return null
    const p = String(part || '').toLowerCase().replace(/s$/, '')
    if (p === 'month' || p === 'mm' || p === 'm') return MONTH_NAMES[d.getUTCMonth()]
    if (p === 'weekday' || p === 'dw') return DAY_NAMES[d.getUTCDay()]
    if (p === 'year' || p === 'yy' || p === 'yyyy') return String(d.getUTCFullYear())
    if (p === 'day' || p === 'dd' || p === 'd') return String(d.getUTCDate())
    return null
  })
}

function buildHeaderRenameMap(columns = []) {
  const renameMap = {}
  const used = new Set()
  for (const rawName of columns) {
    const source = String(rawName ?? '')
    const base = normalizeHeaderName(source) || source
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

function normalizeRowsWithHeaders(rows = []) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return { rows: [], columns: [], renameMap: {} }
  }
  const rawColumns = Object.keys(rows[0] || {})
  const renameMap = buildHeaderRenameMap(rawColumns)
  const columns = rawColumns.map((raw) => renameMap[String(raw)])
  const normalizedRows = rows.map((row) => {
    const out = {}
    for (const raw of rawColumns) {
      const key = String(raw)
      out[renameMap[key]] = row ? row[key] : null
    }
    return out
  })
  return { rows: normalizedRows, columns, renameMap }
}

// ── Column/table metadata ─────────────────────────────────────────────────────

function getTableColumnCaseMap(dbName, tableName) {
  return DB_TABLE_COLUMN_CASE && DB_TABLE_COLUMN_CASE[String(dbName||'').toLowerCase()] && DB_TABLE_COLUMN_CASE[String(dbName||'').toLowerCase()][String(tableName||'').toLowerCase()] || null
}
function getTableColumnTypeMap(dbName, tableName) {
  return DB_TABLE_COLUMN_TYPES && DB_TABLE_COLUMN_TYPES[String(dbName||'').toLowerCase()] && DB_TABLE_COLUMN_TYPES[String(dbName||'').toLowerCase()][String(tableName||'').toLowerCase()] || {}
}
function getTableSchema(dbName, tableName) {
  return DB_TABLE_SCHEMA && DB_TABLE_SCHEMA[String(dbName||'').toLowerCase()] && DB_TABLE_SCHEMA[String(dbName||'').toLowerCase()][String(tableName||'').toLowerCase()] || 'public'
}

function registerTableColumns(dbName, tableName, columns, schemaName) {
  if (!dbName || !tableName) return
  const nd = String(dbName).toLowerCase()
  const nt = String(tableName).toLowerCase()
  registerKnownDatabase(nd)
  DB_TABLE_NAME_CASE[nd][nt] = String(tableName)
  DB_TABLE_SCHEMA[nd][nt]    = String(schemaName || 'public')
  const caseMap = {}, typeMap = {}
  for (const col of (columns || [])) {
    const name = typeof col === 'object' ? String(col && col.name || '') : String(col || '')
    if (!name) continue
    const type = typeof col === 'object' ? normalizeSqlType(col && col.type || 'TEXT') : 'TEXT'
    caseMap[name.toLowerCase()] = name
    typeMap[name.toLowerCase()] = type
  }
  DB_TABLE_COLUMN_CASE[nd][nt]  = caseMap
  DB_TABLE_COLUMN_TYPES[nd][nt] = typeMap
}

function removeTableColumns(dbName, tableName) {
  const nd = String(dbName||'').toLowerCase()
  const nt = String(tableName||'').toLowerCase()
  if (DB_TABLE_COLUMN_CASE[nd])  delete DB_TABLE_COLUMN_CASE[nd][nt]
  if (DB_TABLE_COLUMN_TYPES[nd]) delete DB_TABLE_COLUMN_TYPES[nd][nt]
  if (DB_TABLE_NAME_CASE[nd])    delete DB_TABLE_NAME_CASE[nd][nt]
  if (DB_TABLE_SCHEMA[nd])       delete DB_TABLE_SCHEMA[nd][nt]
}

// ── sql.js execution wrappers ─────────────────────────────────────────────────

function runRead(db, sql) {
  const results = db.exec(sql)
  if (!results || !results.length) return []
  const first = results[0]
  return first.values.map(function(row) {
    const obj = {}
    first.columns.forEach(function(col, i) { obj[col] = row[i] })
    return obj
  })
}

function runWrite(db, sql) {
  db.run(sql)
  return db.getRowsModified()
}

function execStatement(db, sql) {
  const upper = sql.trim().toUpperCase()
  if (/^(SELECT|WITH|EXPLAIN|PRAGMA)\b/.test(upper)) {
    return { type: 'rows', data: runRead(db, sql) }
  }
  return { type: 'write', data: runWrite(db, sql) }
}

// ── Comment stripping / statement splitting ───────────────────────────────────

function stripSqlComments(sqlText) {
  let out = '', i = 0, inSingle = false, inDouble = false, inLine = false, inBlock = false
  while (i < sqlText.length) {
    const ch = sqlText[i], nx = sqlText[i + 1]
    if (inLine)  { if (ch === '\n') { inLine = false; out += ch } i++; continue }
    if (inBlock) { if (ch === '*' && nx === '/') { inBlock = false; i += 2 } else i++; continue }
    if (!inSingle && !inDouble) {
      if (ch === '-' && nx === '-') { inLine = true; i += 2; continue }
      if (ch === '/' && nx === '*') { inBlock = true; i += 2; continue }
    }
    if (ch === "'" && !inDouble) { inSingle = !inSingle; out += ch; i++; continue }
    if (ch === '"' && !inSingle) { inDouble = !inDouble; out += ch; i++; continue }
    out += ch; i++
  }
  return out
}

function splitSqlStatements(sqlText) {
  const stmts = []
  let cur = '', inSingle = false, inDouble = false
  for (let i = 0; i < sqlText.length; i++) {
    const ch = sqlText[i]
    if (ch === "'" && !inDouble) { inSingle = !inSingle; cur += ch; continue }
    if (ch === '"' && !inSingle) { inDouble = !inDouble; cur += ch; continue }
    if (ch === ';' && !inSingle && !inDouble) {
      const t = cur.trim(); if (t) stmts.push(t); cur = ''; continue
    }
    cur += ch
  }
  const t = cur.trim(); if (t) stmts.push(t)
  return stmts
}

// ── Identifier parsing ────────────────────────────────────────────────────────

function normalizeIdentifier(s) { return String(s || '').replace(/["'`\[\]]/g, '').trim() }
function splitIdentifierParts(token) { return normalizeIdentifier(token).split('.').filter(Boolean) }

function normalizeTableToken(token) {
  const p = splitIdentifierParts(token)
  return p.length ? p[p.length - 1].toLowerCase() : ''
}
function getOriginalTableName(token) {
  const p = splitIdentifierParts(token)
  return p.length ? p[p.length - 1] : ''
}
function extractDbQualifier(token) {
  const p = splitIdentifierParts(token)
  if (p.length >= 3) return p[0].toLowerCase()
  if (p.length === 2 && databaseExists(p[0])) return p[0].toLowerCase()
  return ''
}
function extractSchemaQualifier(token) {
  const p = splitIdentifierParts(token)
  if (p.length >= 3) return p[1].toLowerCase()
  if (p.length === 2 && !databaseExists(p[0])) return p[0].toLowerCase()
  return 'public'
}

function findDatabasesForTable(tableName) {
  const nt = String(tableName || '').toLowerCase()
  return [...KNOWN_DATABASES].filter(function(dbName) {
    if (DB_TABLE_NAME_CASE && DB_TABLE_NAME_CASE[dbName] && DB_TABLE_NAME_CASE[dbName][nt]) return true
    const db = getDbInstance(dbName)
    if (!db) return false
    try {
      return runRead(db, "SELECT name FROM sqlite_master WHERE type='table' AND lower(name)=lower('" + nt.replace(/'/g, "''") + "')").length > 0
    } catch(e) { return false }
  })
}

function resolveTableDatabase(token, currentDb) {
  const ex = extractDbQualifier(token || '')
  if (ex) return ex
  if (currentDb) return String(currentDb).toLowerCase()
  const m = findDatabasesForTable(normalizeTableToken(token || ''))
  return m.length === 1 ? m[0] : ''
}

function extractTableTokens(sql) {
  const tokens = []
  const patterns = [
    /\bfrom\s+([a-zA-Z0-9_"'`\.\[\]]+)/gi,
    /\bjoin\s+([a-zA-Z0-9_"'`\.\[\]]+)/gi,
    /\bupdate\s+([a-zA-Z0-9_"'`\.\[\]]+)/gi,
    /\binsert\s+into\s+([a-zA-Z0-9_"'`\.\[\]]+)/gi,
    /\bdelete\s+from\s+([a-zA-Z0-9_"'`\.\[\]]+)/gi,
    /\bcreate\s+table\s+(?:if\s+not\s+exists\s+)?([a-zA-Z0-9_"'`\.\[\]]+)/gi,
    /\bdrop\s+table\s+(?:if\s+exists\s+)?([a-zA-Z0-9_"'`\.\[\]]+)/gi,
    /\balter\s+table\s+([a-zA-Z0-9_"'`\.\[\]]+)/gi,
  ]
  for (const p of patterns) {
    let m
    while ((m = p.exec(sql)) !== null) { if (m[1]) tokens.push(m[1]) }
  }
  return tokens
}

function resolveStatementDatabase(sql, currentDb) {
  const token = extractTableTokens(sql)[0]
  if (!token) return currentDb
  const ex = extractDbQualifier(token)
  if (ex) return ex
  if (currentDb) return currentDb
  const m = findDatabasesForTable(normalizeTableToken(token))
  return m.length === 1 ? m[0] : ''
}

// ── Statement parsers ─────────────────────────────────────────────────────────

function parseUseDatabase(sql) {
  const m = sql.match(/^\s*use\s+([a-zA-Z0-9_"'`\[\]\.-]+)\s*$/i)
  if (!m) return null
  return String(m[1]).replace(/["'`\[\]]/g, '').toLowerCase().replace(/-/g, '_')
}
function parseCreateDatabase(sql) {
  const m = sql.match(/^\s*create\s+database\s+(?:if\s+not\s+exists\s+)?([a-zA-Z0-9_"'`\[\]\.-]+)/i)
  if (!m) return null
  return String(m[1]).replace(/["'`\[\]]/g, '').toLowerCase().replace(/-/g, '_')
}
function parseDropDatabase(sql) {
  const m = sql.match(/^\s*drop\s+database\s+(if\s+exists\s+)?([a-zA-Z0-9_"'`\[\]\.-]+)/i)
  if (!m) return null
  return { databaseName: String(m[2]).replace(/["'`\[\]]/g, '').toLowerCase().replace(/-/g, '_'), ifExists: Boolean(m[1]) }
}
function parseCreateTableToken(sql) {
  const m = sql.match(/^\s*create\s+table\s+(?:if\s+not\s+exists\s+)?([a-zA-Z0-9_"'`\.\[\]]+)/i)
  return m ? m[1] : null
}
function parseDropTableToken(sql) {
  const m = sql.match(/^\s*drop\s+table\s+(?:if\s+exists\s+)?([a-zA-Z0-9_"'`\.\[\]]+)/i)
  return m ? m[1] : null
}
function parseShowStatement(stmt) {
  if (/^\s*show\s+(?:full\s+)?tables\b/i.test(stmt))   return { type: 'tables' }
  if (/^\s*show\s+(?:all\s+)?databases\b/i.test(stmt)) return { type: 'databases' }
  if (/^\s*show\s+schemas\b/i.test(stmt))               return { type: 'databases' }
  const m = stmt.match(/^\s*show\s+(?:full\s+)?columns\s+(?:from|in)\s+([a-zA-Z0-9_"'`\.\[\]]+)/i)
  if (m) return { type: 'columns', tableName: normalizeTableToken(m[1]), tableToken: m[1] }
  return null
}
function parseDescribeTable(stmt) {
  const m = stmt.match(/^\s*(?:describe|desc)\s+([a-zA-Z0-9_"'`\.\[\]]+)\s*$/i)
  if (!m) {
    const m2 = stmt.match(/^\s*(?:sp_help|exec\s+sp_help)\s+'?([a-zA-Z0-9_]+)'?\s*$/i)
    return m2 ? normalizeTableToken(m2[1]) : ''
  }
  return normalizeTableToken(m[1])
}
function parseTruncateTable(stmt) {
  const m = stmt.match(/^\s*truncate\s+(?:table\s+)?([a-zA-Z0-9_"'`\.\[\]]+)\s*$/i)
  return m ? normalizeTableToken(m[1]) : null
}
function parseRenameTable(stmt) {
  const m = stmt.match(/^\s*(?:alter\s+table\s+([a-zA-Z0-9_"'`\.\[\]]+)\s+rename\s+(?:to\s+)?|rename\s+table\s+([a-zA-Z0-9_"'`\.\[\]]+)\s+to\s+)([a-zA-Z0-9_"'`\.\[\]]+)\s*$/i)
  if (!m) return null
  return { oldTableToken: m[1]||m[2], oldTableName: normalizeTableToken(m[1]||m[2]), newTableName: normalizeTableToken(m[3]) }
}
function parseAlterAddColumn(stmt) {
  const m = stmt.match(/^\s*alter\s+table\s+([a-zA-Z0-9_"'`\.\[\]]+)\s+add\s+(?:column\s+)?(?:`([^`]+)`|"([^"]+)"|'([^']+)'|\[([^\]]+)\]|([a-zA-Z_][\w$]*))/i)
  if (!m) return null
  return { tableToken: m[1], tableName: normalizeTableToken(m[1]), columnName: m[2]||m[3]||m[4]||m[5]||m[6]||null }
}
function parseAlterModifyColumn(stmt) {
  const m = stmt.match(/^\s*alter\s+table\s+([a-zA-Z0-9_"'`\.\[\]]+)\s+modify\s+(?:column\s+)?(?:`([^`]+)`|"([^"]+)"|'([^']+)'|\[([^\]]+)\]|([a-zA-Z_][\w$]*))\s+([a-zA-Z][\w$]*(?:\s*\([^)]*\))?)\s*$/i)
  if (!m) return null
  return { tableToken: m[1], tableName: normalizeTableToken(m[1]), columnName: m[2]||m[3]||m[4]||m[5]||m[6]||null, columnType: normalizeSqlType(m[7]) }
}
function parseAlterChangeColumn(stmt) {
  const m = stmt.match(/^\s*alter\s+table\s+([a-zA-Z0-9_"'`\.\[\]]+)\s+change\s+(?:column\s+)?(?:`([^`]+)`|"([^"]+)"|'([^']+)'|\[([^\]]+)\]|([a-zA-Z_][\w$]*))[\s]+(?:`([^`]+)`|"([^"]+)"|'([^']+)'|\[([^\]]+)\]|([a-zA-Z_][\w$]*))\s+([a-zA-Z][\w$]*(?:\s*\([^)]*\))?)\s*$/i)
  if (!m) return null
  return { tableToken: m[1], tableName: normalizeTableToken(m[1]), oldColumnName: m[2]||m[3]||m[4]||m[5]||m[6]||null, newColumnName: m[7]||m[8]||m[9]||m[10]||null, columnType: normalizeSqlType(m[11]) }
}
function parseAlterColumnType(stmt) {
  const m = stmt.match(/^\s*alter\s+table\s+([a-zA-Z0-9_"'`\.\[\]]+)\s+alter\s+(?:column\s+)?(?:`([^`]+)`|"([^"]+)"|'([^']+)'|\[([^\]]+)\]|([a-zA-Z_][\w$]*))\s+(?:set\s+data\s+)?type\s+([a-zA-Z][\w$]*(?:\s*\([^)]*\))?)\s*$/i)
  if (!m) return null
  return { tableToken: m[1], tableName: normalizeTableToken(m[1]), columnName: m[2]||m[3]||m[4]||m[5]||m[6]||null, columnType: normalizeSqlType(m[7]) }
}
function parseAlterRenameColumn(stmt) {
  const m = stmt.match(/^\s*alter\s+table\s+([a-zA-Z0-9_"'`\.\[\]]+)\s+rename\s+(?:column\s+)?(?:`([^`]+)`|"([^"]+)"|'([^']+)'|\[([^\]]+)\]|([a-zA-Z_][\w$]*))\s+to\s+(?:`([^`]+)`|"([^"]+)"|'([^']+)'|\[([^\]]+)\]|([a-zA-Z_][\w$]*))\s*$/i)
  if (!m) return null
  return { tableToken: m[1], tableName: normalizeTableToken(m[1]), oldColumnName: m[2]||m[3]||m[4]||m[5]||m[6]||null, newColumnName: m[7]||m[8]||m[9]||m[10]||m[11]||null }
}
function parseAlterDropColumn(stmt) {
  const m = stmt.match(/^\s*alter\s+table\s+([a-zA-Z0-9_"'`\.\[\]]+)\s+drop\s+(?:column\s+)?(?:`([^`]+)`|"([^"]+)"|'([^']+)'|\[([^\]]+)\]|([a-zA-Z_][\w$]*))\s*$/i)
  if (!m) return null
  return { tableToken: m[1], tableName: normalizeTableToken(m[1]), columnName: m[2]||m[3]||m[4]||m[5]||m[6]||null }
}
function parseGetConnectQuery(stmt) {
  const m = stmt.match(/^\s*(?:\(\s*([a-zA-Z0-9_"'`\-]+)\s*\)\s+get\s+connect|get\s*\(\s*([a-zA-Z0-9_"'`\-]+)\s*\)\s+connect|get\s+([a-zA-Z0-9_"'`\-]+)\s+connect)\s*$/i)
  if (!m) return null
  return String(m[1]||m[2]||m[3]).replace(/["'`]/g,'').toLowerCase().replace(/-/g,'_')
}

// ── CREATE TABLE column extraction ────────────────────────────────────────────

function splitTopLevelComma(text) {
  const parts = [], cur = { v: '' }
  let depth = 0, inSingle = false, inDouble = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (ch === "'" && !inDouble) { inSingle = !inSingle; cur.v += ch; continue }
    if (ch === '"' && !inSingle) { inDouble = !inDouble; cur.v += ch; continue }
    if (!inSingle && !inDouble) {
      if (ch === '(') { depth++; cur.v += ch; continue }
      if (ch === ')') { depth = Math.max(0,depth-1); cur.v += ch; continue }
      if (ch === ',' && depth === 0) { if (cur.v.trim()) parts.push(cur.v.trim()); cur.v = ''; continue }
    }
    cur.v += ch
  }
  if (cur.v.trim()) parts.push(cur.v.trim())
  return parts
}

function extractCreateTableColumns(sql) {
  const openIdx = sql.indexOf('(')
  if (openIdx < 0) return []
  let depth = 0, closeIdx = -1, inSingle = false, inDouble = false
  for (let i = openIdx; i < sql.length; i++) {
    const ch = sql[i]
    if (ch === "'" && !inDouble) { inSingle = !inSingle; continue }
    if (ch === '"' && !inSingle) { inDouble = !inDouble; continue }
    if (inSingle || inDouble) continue
    if (ch === '(') depth++
    if (ch === ')') { depth--; if (depth === 0) { closeIdx = i; break } }
  }
  if (closeIdx < 0) return []
  const body = sql.slice(openIdx + 1, closeIdx)
  return splitTopLevelComma(body)
    .filter(function(d) { return !/^(primary|constraint|unique|foreign|check|key)\b/i.test(d) })
    .map(function(d) {
      const m = d.match(/^\s*(?:`([^`]+)`|"([^"]+)"|'([^']+)'|\[([^\]]+)\]|([a-zA-Z_][\w$]*))\s+([^,]+?)\s*$/)
      if (!m) return null
      const name = m[1]||m[2]||m[3]||m[4]||m[5]
      const rawType = String(m[6]||'').trim().split(/\s+/)[0]
      return { name: name, type: normalizeSqlType(rawType) }
    }).filter(Boolean)
}

// ── Table rebuild (SQLite has limited ALTER TABLE) ────────────────────────────

function rebuildTable(db, dbName, tableName, newColumns, rowTransform) {
  const nt = String(tableName).toLowerCase()
  const display = (DB_TABLE_NAME_CASE[dbName] && DB_TABLE_NAME_CASE[dbName][nt]) || tableName
  const schema = getTableSchema(dbName, nt)
  const rows = runRead(db, 'SELECT * FROM ' + escapeIdentifier(display))
  const tmp = '__tmp_' + Date.now()
  const defs = newColumns.map(function(c) { return escapeIdentifier(c.name) + ' ' + c.type }).join(', ')
  db.run('CREATE TABLE ' + escapeIdentifier(tmp) + ' (' + defs + ')')
  for (const row of rows) {
    const newRow = rowTransform ? rowTransform(row) : row
    const cols = newColumns.map(function(c) { return escapeIdentifier(c.name) }).join(', ')
    const vals = newColumns.map(function(c) { return escapeLiteral(newRow && newRow[c.name] !== undefined ? newRow[c.name] : null) }).join(', ')
    db.run('INSERT INTO ' + escapeIdentifier(tmp) + ' (' + cols + ') VALUES (' + vals + ')')
  }
  db.run('DROP TABLE IF EXISTS ' + escapeIdentifier(display))
  db.run('ALTER TABLE ' + escapeIdentifier(tmp) + ' RENAME TO ' + escapeIdentifier(display))
  registerTableColumns(dbName, display, newColumns, schema)
}

function applyAlterDropColumn(dbName, tableName, columnName) {
  const db = getDbInstance(dbName)
  if (!db) throw new Error('Database not found: ' + dbName)
  const nt = normalizeTableToken(tableName)
  const caseMap = getTableColumnCaseMap(dbName, nt) || {}
  const typeMap = getTableColumnTypeMap(dbName, nt) || {}
  const target = String(columnName).toLowerCase()
  const newCols = Object.values(caseMap)
    .filter(function(n) { return String(n).toLowerCase() !== target })
    .map(function(n) { return { name: n, type: typeMap[String(n).toLowerCase()] || 'TEXT' } })
  if (newCols.length === 0) throw new Error('Cannot drop the only column')
  rebuildTable(db, dbName, tableName, newCols, null)
}

function applyAlterRenameColumn(dbName, tableName, oldName, newName) {
  const db = getDbInstance(dbName)
  if (!db) throw new Error('Database not found: ' + dbName)
  const nt = normalizeTableToken(tableName)
  const caseMap = getTableColumnCaseMap(dbName, nt) || {}
  const typeMap = getTableColumnTypeMap(dbName, nt) || {}
  const oldLower = String(oldName).toLowerCase()
  const newCols = Object.values(caseMap).map(function(n) {
    const l = String(n).toLowerCase()
    return { name: l === oldLower ? newName : n, type: typeMap[l] || 'TEXT' }
  })
  rebuildTable(db, dbName, tableName, newCols, function(row) {
    const mapped = Object.assign({}, row)
    const srcName = caseMap[oldLower] || oldName
    if (srcName !== newName) { mapped[newName] = row[srcName]; delete mapped[srcName] }
    return mapped
  })
}

function applyAlterChangeColumn(dbName, tableName, oldName, newName, colType) {
  applyAlterRenameColumn(dbName, tableName, oldName, newName)
  if (normalizeSqlType(colType) !== 'TEXT') {
    applyAlterModifyColumn(dbName, tableName, newName, colType)
  }
}

function applyRenameTable(dbName, oldTable, newTable) {
  const db = getDbInstance(dbName)
  if (!db) throw new Error('Database not found: ' + dbName)
  const nt = normalizeTableToken(oldTable)
  const display = (DB_TABLE_NAME_CASE[dbName] && DB_TABLE_NAME_CASE[dbName][nt]) || oldTable
  db.run('ALTER TABLE ' + escapeIdentifier(display) + ' RENAME TO ' + escapeIdentifier(newTable))
  const caseMap = getTableColumnCaseMap(dbName, nt) || {}
  const typeMap = getTableColumnTypeMap(dbName, nt) || {}
  const schema = getTableSchema(dbName, nt)
  const cols = Object.values(caseMap).map(function(n) { return { name: n, type: typeMap[String(n).toLowerCase()]||'TEXT' } })
  removeTableColumns(dbName, oldTable)
  registerTableColumns(dbName, newTable, cols, schema)
}

function applyAlterModifyColumn(dbName, tableName, columnName, columnType) {
  const db = getDbInstance(dbName)
  if (!db) throw new Error('Database not found: ' + dbName)
  const nt = normalizeTableToken(tableName)
  const caseMap = getTableColumnCaseMap(dbName, nt) || {}
  const typeMap = getTableColumnTypeMap(dbName, nt) || {}
  const target = String(columnName).toLowerCase()
  const newType = normalizeSqlType(columnType)
  const newCols = Object.values(caseMap).map(function(n) {
    return { name: n, type: String(n).toLowerCase() === target ? newType : (typeMap[String(n).toLowerCase()]||'TEXT') }
  })
  rebuildTable(db, dbName, tableName, newCols, function(row) {
    const mapped = Object.assign({}, row)
    const srcName = caseMap[target]
    if (srcName) {
      mapped[srcName] = coerceValueByType(row[srcName], newType)
    }
    return mapped
  })
}

// ── Statement normalisation ───────────────────────────────────────────────────

function expandMultiAlterModify(stmt) {
  const h = stmt.match(/^\s*alter\s+table\s+([a-zA-Z0-9_"'`\.\[\]]+)\s+/i)
  if (!h) return null
  const tablePart = stmt.slice(0, h[0].length).trimEnd()
  const rest = stmt.slice(h[0].length)
  if (!/^modify\s/i.test(rest)) return null
  const segs = [], cur = { v: '' }
  let depth = 0
  for (const ch of rest) {
    if (ch === '(') { depth++; cur.v += ch; continue }
    if (ch === ')') { depth--; cur.v += ch; continue }
    if (ch === ',' && depth === 0) { if (cur.v.trim()) segs.push(cur.v.trim()); cur.v = ''; continue }
    cur.v += ch
  }
  if (cur.v.trim()) segs.push(cur.v.trim())
  if (segs.length <= 1) return null
  return segs.map(function(s) { return tablePart + ' ' + s })
}

// Rewrite SQL Server / T-SQL syntax unsupported by SQLite
function preprocessSql(sql) {
  // SELECT TOP N  /  SELECT TOP (N)  /  SELECT TOP N PERCENT → SELECT ... LIMIT N
  const topMatch = sql.match(/^(\s*SELECT\s+)TOP\s*\(?\s*(\d+)\s*\)?\s*(?:PERCENT\s+)?/i)
  if (topMatch) {
    const n = topMatch[2]
    const rest = sql.slice(topMatch[0].length)
    if (!/\bLIMIT\b/i.test(rest)) {
      return `${topMatch[1]}${rest.trimEnd()}\nLIMIT ${n}`
    }
    return `${topMatch[1]}${rest}`
  }
  return sql
}

function rewriteCaseUpdate(stmt) {
  const compact = stmt.trim().replace(/;\s*$/,'')
  const m = compact.match(/^\s*update\s+([a-zA-Z0-9_"'`\.\[\]]+)\s+set\s+([a-zA-Z_][\w$]*)\s*=\s*case\s+when\s+([\s\S]+?)\s+then\s+([\s\S]+?)\s+else\s+([\s\S]+?)\s+end\s*$/i)
  if (!m) return null
  return [
    'UPDATE ' + m[1] + ' SET ' + m[2] + ' = ' + m[4] + ' WHERE (' + m[3] + ')',
    'UPDATE ' + m[1] + ' SET ' + m[2] + ' = ' + m[5] + ' WHERE NOT (' + m[3] + ')',
  ]
}

function normalizeStatementsForRuntime(statements) {
  const out = []
  for (const raw of statements) {
    const stmt = preprocessSql(raw.trim().replace(/;\s*$/,''))
    if (!stmt) continue
    // Skip transaction control — sql.js auto-commits and has no multi-statement txn support
    if (/^\s*(BEGIN|START)\s+(TRANSACTION|TRAN)\s*$/i.test(stmt)) continue
    if (/^\s*COMMIT(?:\s+(TRANSACTION|TRAN))?\s*$/i.test(stmt)) continue
    if (/^\s*ROLLBACK(?:\s+(TRANSACTION|TRAN))?\s*$/i.test(stmt)) continue
    // Skip T-SQL variable declarations / SET session vars / PRINT — not valid in SQLite
    if (/^\s*DECLARE\s+@/i.test(stmt)) continue
    if (/^\s*SET\s+@/i.test(stmt)) continue
    if (/^\s*SET\s+(NOCOUNT|ANSI_NULLS|QUOTED_IDENTIFIER|IMPLICIT_TRANSACTIONS|XACT_ABORT|CONCAT_NULL_YIELDS_NULL|ARITHABORT|ARITH_WARNINGS)\b/i.test(stmt)) continue
    if (/^\s*PRINT\s+/i.test(stmt)) continue
    // Expand multi-column MODIFY into individual statements
    const multi = expandMultiAlterModify(stmt)
    if (multi) { out.push.apply(out, multi); continue }
    // Rewrite CASE-in-UPDATE to two statements
    const caseUpd = rewriteCaseUpdate(stmt)
    if (caseUpd) { out.push.apply(out, caseUpd); continue }
    out.push(stmt)
  }
  return out
}

// ── Result normalisation ──────────────────────────────────────────────────────

function mergeColumnTypeMaps(stmt, dbName) {
  const merged = {}
  for (const token of extractTableTokens(stmt)) {
    const nt = normalizeTableToken(token)
    const tdb = resolveTableDatabase(token, dbName)
    const caseMap = getTableColumnCaseMap(tdb, nt)
    const typeMap = getTableColumnTypeMap(tdb, nt)
    if (!caseMap || !typeMap) continue
    for (const lower in caseMap) {
      const actual = caseMap[lower]
      merged[String(actual).toLowerCase()] = uiType(typeMap[lower] || 'TEXT')
    }
  }
  return merged
}

function inferUiType(rows, col) {
  const kind = sampleColumnKind(rows, col)
  if (kind === 'INTEGER') return 'INT'
  if (kind === 'REAL') return 'NUMBER'
  if (kind === 'DATE') return 'DATE'
  if (kind === 'BOOLEAN') return 'BOOLEAN'
  return 'STRING'
}

// Matches the "Limit 100" toggle in the UI and the server default in
// app/api/query/route.js, so the same query returns the same number of rows
// whether it runs in the browser (sql.js) or server-side (better-sqlite3).
const PREVIEW_ROW_LIMIT = 100

function normalizeResultRows(rows, limitEnabled, stmt, dbName) {
  if (!Array.isArray(rows)) return { columns: [], rows: [], columnTypes: {} }
  const limited = limitEnabled ? rows.slice(0, PREVIEW_ROW_LIMIT) : rows
  const normalizedOutput = normalizeRowsWithHeaders(limited)
  const columns = normalizedOutput.columns
  const outputRows = normalizedOutput.rows
  const knownTypes = mergeColumnTypeMaps(stmt, dbName)
  const columnTypes = {}
  for (const raw in normalizedOutput.renameMap) {
    const normalized = normalizedOutput.renameMap[raw]
    if (!normalized) continue
    columnTypes[normalized] = knownTypes[String(raw).toLowerCase()] || knownTypes[String(normalized).toLowerCase()] || inferUiType(outputRows, normalized)
  }
  return { columns: columns, rows: outputRows, columnTypes: columnTypes }
}

// ── Tables list ───────────────────────────────────────────────────────────────

function listTablesInDb(dbName) {
  const db = getDbInstance(dbName)
  if (!db) return []
  try {
    return runRead(db, "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").map(function(r) { return r.name })
  } catch(e) { return [] }
}

function getTableColumnsFromSqlite(dbName, tableName) {
  const db = getDbInstance(dbName)
  if (!db || !tableName) return []
  try {
    const pragmaRows = runRead(db, 'PRAGMA table_info(' + escapeIdentifier(tableName) + ')')
    return pragmaRows
      .map(function(r) {
        const name = String(r && r.name || '').trim()
        const type = normalizeSqlType(String(r && r.type || 'TEXT'))
        if (!name) return null
        return { name: name, type: type }
      })
      .filter(Boolean)
  } catch (e) {
    return []
  }
}

function ensureTableMetadataFromSqlite(dbName, tableName) {
  if (!dbName || !tableName) return
  const nd = String(dbName).toLowerCase()
  const nt = String(tableName).toLowerCase()
  const existingCaseMap = getTableColumnCaseMap(nd, nt)
  const hasExisting = existingCaseMap && Object.keys(existingCaseMap).length > 0
  if (hasExisting) return

  const sqliteColumns = getTableColumnsFromSqlite(nd, tableName)
  if (sqliteColumns.length > 0) {
    const schemaName = getTableSchema(nd, nt)
    registerTableColumns(nd, tableName, sqliteColumns, schemaName)
  }
}

function listRuntimeTables() {
  const rows = []
  for (const dbName of [...KNOWN_DATABASES]) {
    for (const tableName of listTablesInDb(dbName)) {
      const nt = String(tableName).toLowerCase()
      rows.push({
        table_catalog: dbName,
        table_schema: getTableSchema(dbName, nt),
        table_name: (DB_TABLE_NAME_CASE[dbName] && DB_TABLE_NAME_CASE[dbName][nt]) || tableName,
        table_type: 'BASE TABLE',
      })
    }
  }
  return rows
}

// ── SQL error enrichment ──────────────────────────────────────────────────────

function enrichSqlError(message, stmt) {
  const msg = String(message || '')
  // "no such function: X"
  const noFuncMatch = msg.match(/no such function:\s*(\w+)/i)
  if (noFuncMatch) {
    const fn = noFuncMatch[1].toUpperCase()
    const hints = {
      GETDATE:      'Use GETDATE() — it is registered as a custom function here. Make sure you are running against a database.',
      SYSDATETIME:  'Use GETDATE() or NOW() instead of SYSDATETIME().',
      SYSDATE:      'Use GETDATE() or NOW() instead of SYSDATE().',
      LEN:          'LEN() is supported. If you see this error on a browser database make sure it is loaded first.',
      DATEDIFF:     'DATEDIFF(unit, start, end) or DATEDIFF(date1, date2) is supported. Ensure you are querying a loaded database.',
      DATEADD:      'DATEADD(unit, n, date) is supported. Ensure you are querying a loaded database.',
      ISNULL:       'ISNULL(expr, replacement) is supported. Alternatively use COALESCE(expr, replacement).',
      NVL:          'NVL(expr, alt) is supported. Alternatively use COALESCE(expr, alt).',
      LEFT:         'LEFT(str, n) is supported. Alternatively use SUBSTR(str, 1, n).',
      RIGHT:        'RIGHT(str, n) is supported. Alternatively use SUBSTR(str, -n).',
      CHARINDEX:    'CHARINDEX(needle, haystack[, start]) is supported. Alternatively use INSTR(haystack, needle).',
      LOCATE:       'LOCATE(needle, haystack) is supported. Alternatively use INSTR(haystack, needle).',
      QUARTER:      'QUARTER(date) is supported. Ensure you are querying a loaded database.',
      CONCAT:       'CONCAT(a, b, ...) is supported. Alternatively use a || b syntax.',
      ILIKE:        'SQLite LIKE is already case-insensitive for ASCII. Use LIKE instead of ILIKE.',
      IFNULL:       'Use COALESCE(expr, alt) or IFNULL(expr, alt) — IFNULL is natively supported by SQLite.',
      STDEV:        'STDEV() aggregate is registered for server-side databases. For browser databases it is not yet supported in aggregate form.',
      STDDEV:       'STDDEV() aggregate is registered for server-side databases.',
      MEDIAN:       'MEDIAN() aggregate is registered for server-side databases.',
      STRING_AGG:   'STRING_AGG(expr, sep) is registered for server-side databases. For browser databases use GROUP_CONCAT(expr, sep).',
      FORMAT:       'FORMAT(value, fmt) is supported. Ensure you are querying a loaded database.',
      DAY:          'DAY(date) is supported. Alternatively use CAST(strftime(\'%d\', date) AS INTEGER).',
      MONTH:        'MONTH(date) is supported. Alternatively use CAST(strftime(\'%m\', date) AS INTEGER).',
      YEAR:         'YEAR(date) is supported. Alternatively use CAST(strftime(\'%Y\', date) AS INTEGER).',
      HOUR:         'HOUR(datetime) is supported. Alternatively use CAST(strftime(\'%H\', datetime) AS INTEGER).',
      TO_NUMBER:    'TO_NUMBER(str) is supported. Alternatively use CAST(str AS REAL).',
      TO_CHAR:      'TO_CHAR(value, format) is supported for server-side databases. Alternatively use CAST(value AS TEXT).',
      DECODE:       'DECODE(expr, s1, r1, ...) is supported. Alternatively use a CASE WHEN expression.',
      IIF:          'IIF(condition, true_val, false_val) is supported. Alternatively use CASE WHEN condition THEN true_val ELSE false_val END.',
      STUFF:        'STUFF(str, start, len, replacement) is supported.',
      LPAD:         'LPAD(str, len, pad) is supported.',
      RPAD:         'RPAD(str, len, pad) is supported.',
      NVL2:         'NVL2(expr, not_null, is_null) is supported. Alternatively use CASE WHEN expr IS NOT NULL THEN not_null ELSE is_null END.',
    }
    const hint = hints[fn]
    if (hint) {
      return `No such function: ${fn}. ${hint}`
    }
    return `No such function: ${fn}. This function is not natively supported by SQLite. ` +
      `Try an equivalent: e.g. use SUBSTR() for string slicing, STRFTIME() for dates, COALESCE() for null handling.`
  }
  // "no such table: X"
  const noTableMatch = msg.match(/no such table:\s*(.+)/i)
  if (noTableMatch) {
    return `Table not found: "${noTableMatch[1].trim()}". ` +
      `Make sure the table exists in the current database. Use SHOW TABLES to see available tables, ` +
      `or create the table first with CREATE TABLE.`
  }
  // "no such column: X"
  const noColMatch = msg.match(/no such column:\s*(.+)/i)
  if (noColMatch) {
    return `Column not found: "${noColMatch[1].trim()}". ` +
      `Check the column name spelling. Use DESCRIBE table_name or SHOW COLUMNS FROM table_name to see available columns.`
  }
  // syntax error
  if (/syntax error/i.test(msg)) {
    return `SQL syntax error: ${msg}. Check for missing commas, unmatched parentheses, or unsupported keywords.`
  }
  // near "X": syntax error
  const nearMatch = msg.match(/near "([^"]+)":\s*syntax error/i)
  if (nearMatch) {
    return `SQL syntax error near "${nearMatch[1]}". Check your query around that keyword or value.`
  }
  return msg
}

// ── Public API ────────────────────────────────────────────────────────────────

export function isServerSideDatabasePublic(dbName) {
  return isServerSideDatabase(dbName)
}

export function setDatabaseCredentials(dbName, username, password) {
  const n = String(dbName||'').toLowerCase()
  if (!n) return
  DB_CREDENTIALS[n] = { username: username, password: password }
  DB_CONNECTION_STATE[n] = true
}

export function getDatabaseCredentials(dbName) {
  return DB_CREDENTIALS[String(dbName||'').toLowerCase()] || null
}

export function setDatabaseConnected(dbName, isConnected) {
  DB_CONNECTION_STATE[String(dbName||'').toLowerCase()] = isConnected
}

export function isDatabaseConnected(dbName) {
  return DB_CONNECTION_STATE[String(dbName||'').toLowerCase()] || false
}

export function clearAllRuntimeDatabases() {
  for (const db of DB_INSTANCES.values()) {
    try { db.close() } catch {}
  }
  DB_INSTANCES.clear()
  SERVER_SIDE_DBS.clear()

  for (const dbName of [...KNOWN_DATABASES]) {
    delete DB_TABLE_COLUMN_CASE[dbName]
    delete DB_TABLE_COLUMN_TYPES[dbName]
    delete DB_TABLE_NAME_CASE[dbName]
    delete DB_TABLE_SCHEMA[dbName]
    delete DB_CREDENTIALS[dbName]
    delete DB_CONNECTION_STATE[dbName]
  }

  KNOWN_DATABASES.clear()
  ACTIVE_DATABASE = ''
}

export async function ensureDatabaseExists(dbName) {
  await ensureRuntimeInitialized()
  if (!dbName) return false
  const n = String(dbName).toLowerCase()
  if (!databaseExists(n)) {
    await getOrCreateDbInstance(n)
    return true
  }
  return false
}

export function getRuntimeTableMetadata() {
  const metadata = {}
  for (const dbName of [...KNOWN_DATABASES].sort()) {
    metadata[dbName] = metadata[dbName] || {}

    // For server-side DBs: read directly from the registered name map (no WASM instance)
    // For in-browser DBs: read from sql.js instance + fallback to name map
    const registeredTables = DB_TABLE_NAME_CASE[dbName] ? Object.values(DB_TABLE_NAME_CASE[dbName]) : []
    const sqliteTables = listTablesInDb(dbName)
    // Merge both sources, dedup by lowercase name
    const seen = new Set()
    const allTables = []
    for (const t of [...sqliteTables, ...registeredTables]) {
      const key = String(t).toLowerCase()
      if (!seen.has(key)) { seen.add(key); allTables.push(t) }
    }

    for (const tableName of allTables) {
      const nt = String(tableName).toLowerCase()
      if (!isServerSideDatabase(dbName)) ensureTableMetadataFromSqlite(dbName, tableName)
      const schema = getTableSchema(dbName, nt)
      const caseMap = getTableColumnCaseMap(dbName, nt) || {}
      const typeMap = getTableColumnTypeMap(dbName, nt) || {}
      metadata[dbName][schema] = metadata[dbName][schema] || {}
      metadata[dbName][schema][(DB_TABLE_NAME_CASE[dbName] && DB_TABLE_NAME_CASE[dbName][nt]) || tableName] = {
        columns: Object.values(caseMap).map(function(col) {
          return { name: col, type: uiType(typeMap[String(col).toLowerCase()] || 'TEXT') }
        }),
        type: 'table',
      }
    }
  }
  return metadata
}

export function exportRuntimeSnapshot() {
  const databases = []
  for (const dbName of [...KNOWN_DATABASES].sort()) {
    const db = getDbInstance(dbName)
    const tables = []
    for (const tableName of listTablesInDb(dbName)) {
      const nt = String(tableName).toLowerCase()
      ensureTableMetadataFromSqlite(dbName, tableName)
      const display = (DB_TABLE_NAME_CASE[dbName] && DB_TABLE_NAME_CASE[dbName][nt]) || tableName
      const schema = getTableSchema(dbName, nt)
      const caseMap = getTableColumnCaseMap(dbName, nt) || {}
      const typeMap = getTableColumnTypeMap(dbName, nt) || {}
      const rows = db ? runRead(db, 'SELECT * FROM ' + escapeIdentifier(display)) : []
      const tableColumns = Object.values(caseMap).map(function(col) {
        return { name: col, type: uiType(typeMap[String(col).toLowerCase()]||'TEXT') }
      })
      tables.push({
        name: display,
        schemaName: schema,
        columns: tableColumns,
        rows: rows,
      })
    }
    databases.push({ name: dbName, tables: tables })
  }
  return { version: 2, createdAt: new Date().toISOString(), databases: databases }
}

export function exportRuntimeSqlDump() {
  const lines = []
  for (const dbName of [...KNOWN_DATABASES].sort()) {
    const db = getDbInstance(dbName)
    if (!db) continue

    lines.push(`CREATE DATABASE IF NOT EXISTS ${dbName};`)
    lines.push(`USE ${dbName};`)

    for (const tableName of listTablesInDb(dbName)) {
      const escapedTable = String(tableName).replace(/'/g, "''")
      const ddlRows = runRead(db, `SELECT sql FROM sqlite_master WHERE type='table' AND name='${escapedTable}'`)
      const ddl = String(ddlRows?.[0]?.sql || '').trim()

      if (ddl) {
        lines.push(`${ddl};`)
      } else {
        const cols = getTableColumnsFromSqlite(dbName, tableName)
        if (cols.length > 0) {
          const defs = cols.map((c) => `${escapeIdentifier(c.name)} ${normalizeSqlType(c.type)}`).join(', ')
          lines.push(`CREATE TABLE ${escapeIdentifier(tableName)} (${defs});`)
        } else {
          lines.push(`CREATE TABLE ${escapeIdentifier(tableName)} (id INTEGER);`)
        }
      }

      const rows = runRead(db, `SELECT * FROM ${escapeIdentifier(tableName)}`)
      if (rows.length > 0) {
        const columnOrder = getTableColumnsFromSqlite(dbName, tableName).map(c => c.name)
        const rowColumns = columnOrder.length > 0 ? columnOrder : Object.keys(rows[0] || {})
        if (rowColumns.length > 0) {
          const colSql = rowColumns.map(c => escapeIdentifier(c)).join(', ')
          for (const row of rows) {
            const valSql = rowColumns.map(c => escapeLiteral(row?.[c])).join(', ')
            lines.push(`INSERT INTO ${escapeIdentifier(tableName)} (${colSql}) VALUES (${valSql});`)
          }
        }
      }
    }
  }

  return lines.join('\n')
}

// ── File-based persistence (via /api/databases) ───────────────────────────────

/**
 * Save all runtime sql.js databases as binary .db files on the server.
 * Calls POST /api/databases for each known database.
 */
export async function persistAllDatabasesToFiles() {
  if (typeof window === 'undefined') return
  const results = []
  for (const dbName of [...KNOWN_DATABASES]) {
    if (isServerSideDatabase(dbName)) {
      results.push({ db: dbName, skipped: true, reason: 'server-side database' })
      continue
    }
    const db = getDbInstance(dbName)
    if (!db) continue
    try {
      const data = Array.from(db.export())  // Uint8Array → plain array for JSON
      if (!data.length) {
        results.push({ db: dbName, skipped: true, reason: 'empty export payload' })
        continue
      }
      const res = await fetch('/api/databases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ db: dbName, data }),
      })
      const json = await res.json()
      results.push({ db: dbName, ...json })
    } catch (e) {
      results.push({ db: dbName, error: String(e?.message || e) })
    }
  }
  return results
}

/**
 * Restore all .db files from the server into runtime sql.js instances.
 * Calls GET /api/databases to list names, then GET /api/databases?db=name for each.
 */
export async function restoreAllDatabasesFromFiles() {
  if (typeof window === 'undefined') return
  const SQL = await getSqlJs()

  // Get list of persisted db names
  let names = []
  try {
    const res = await fetch('/api/databases')
    const json = await res.json()
    names = Array.isArray(json.databases) ? json.databases : []
  } catch { return }

  for (const dbName of names) {
    try {
      const res = await fetch(`/api/databases?db=${encodeURIComponent(dbName)}`)
      if (!res.ok) continue
      const arrayBuffer = await res.arrayBuffer()
      if (!arrayBuffer.byteLength) continue
      const data = new Uint8Array(arrayBuffer)

      // Replace existing instance with the loaded binary
      const existing = DB_INSTANCES.get(dbName)
      if (existing) { try { existing.close() } catch {} }
      const db = new SQL.Database(data)
      registerBrowserFunctions(db)
      DB_INSTANCES.set(dbName, db)
      registerKnownDatabase(dbName)

      // Rebuild column metadata from the loaded db
      for (const tableName of listTablesInDb(dbName)) {
        ensureTableMetadataFromSqlite(dbName, tableName)
      }
    } catch {}
  }
}

export async function deletePersistedDatabase(dbName) {
  if (typeof window === 'undefined') return
  try {
    await fetch(`/api/databases?db=${encodeURIComponent(dbName)}`, { method: 'DELETE' })
  } catch {}
}

/**
 * Lightweight restore: fetch DB names + table schemas from /api/query
 * WITHOUT downloading any binary .db files into the browser.
 * Large databases (hf_db, pf_db, etc.) are registered as server-side only.
 */
export async function restoreServerDatabaseMetadata() {
  if (typeof window === 'undefined') return
  try {
    const res = await fetch('/api/query')
    if (!res.ok) return
    const json = await res.json()
    const databases = Array.isArray(json.databases) ? json.databases : []

    for (const dbInfo of databases) {
      const dbName = String(dbInfo.name || '').toLowerCase()
      if (!dbName) continue

      markServerSideDatabase(dbName)
      // Mark server-side databases as connected by default (they're always available)
      setDatabaseConnected(dbName, true)

      // Fetch table schema for this DB
      try {
        const metaRes = await fetch(`/api/query?db=${encodeURIComponent(dbName)}`)
        if (!metaRes.ok) continue
        const meta = await metaRes.json()
        const tables = Array.isArray(meta.tables) ? meta.tables : []
        for (const table of tables) {
          const tableName = String(table.name || '').trim()
          if (!tableName) continue
          const cols = Array.isArray(table.columns) ? table.columns.map(c => ({ name: c.name, type: c.type || 'TEXT' })) : []
          registerTableColumns(dbName, tableName, cols, 'public')
        }
      } catch {}
    }
  } catch {}
}

async function refreshServerDatabaseMetadataForDb(dbName) {
  if (typeof window === 'undefined') return
  const n = String(dbName || '').toLowerCase().trim()
  if (!n) return

  const metaRes = await fetch(`/api/query?db=${encodeURIComponent(n)}`)
  if (!metaRes.ok) {
    throw new Error(`Failed to refresh metadata for ${n}`)
  }

  const meta = await metaRes.json()
  const tables = Array.isArray(meta.tables) ? meta.tables : []

  markServerSideDatabase(n)
  setDatabaseConnected(n, true)
  dropRuntimeDbInstance(n)

  DB_TABLE_COLUMN_CASE[n] = {}
  DB_TABLE_COLUMN_TYPES[n] = {}
  DB_TABLE_NAME_CASE[n] = {}
  DB_TABLE_SCHEMA[n] = {}

  for (const table of tables) {
    const tableName = String(table && table.name || '').trim()
    if (!tableName) continue
    const cols = Array.isArray(table.columns)
      ? table.columns.map(function(c) {
          return {
            name: String(c && c.name || '').trim(),
            type: normalizeSqlType(c && c.type || 'TEXT'),
          }
        }).filter(function(c) { return c.name })
      : []
    registerTableColumns(n, tableName, cols, 'public')
  }
}

async function runServerSql(dbName, sql, limitEnabled) {
  const res = await fetch('/api/query', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ db: dbName, sql, limitEnabled: limitEnabled !== false }),
  })
  const json = await res.json().catch(function() { return {} })
  if (!res.ok) {
    throw new Error(json && json.error ? json.error : `Server query failed (${res.status})`)
  }
  if (!json || json.success !== true) {
    throw new Error(json && json.error ? json.error : 'Server query failed')
  }
  const hasStmtError = Array.isArray(json.resultSets) && json.resultSets.some(function(rs) { return rs && rs.isError })
  if (hasStmtError) {
    const firstError = json.resultSets.find(function(rs) { return rs && rs.isError })
    const msg = firstError && firstError.rows && firstError.rows[0] && firstError.rows[0].error
    throw new Error(String(msg || 'Server import statement failed'))
  }
  return json
}

function isServerSchemaMutationStatement(stmt) {
  const text = String(stmt || '').trim()
  if (!text) return false
  return /^\s*(CREATE|DROP|ALTER|TRUNCATE|RENAME)\b/i.test(text)
}

export async function importRuntimeSqlDump(sqlDump) {
  const text = String(sqlDump || '').trim()
  if (!text) return { success: true, statementCount: 0 }

  clearAllRuntimeDatabases()
  const result = await executeQuery(text, { limitEnabled: false })
  if (!result?.success) {
    throw new Error(result?.error || 'Failed to import SQL dump')
  }
  return result
}

export async function importRuntimeSnapshot(snapshot) {
  await ensureRuntimeInitialized()
  const databases = Array.isArray(snapshot && snapshot.databases) ? snapshot.databases : []
  for (const database of databases) {
    const dbName = String(database && database.name || '').toLowerCase().trim()
    if (!dbName) continue
    const db = await getOrCreateDbInstance(dbName)
    setDatabaseConnected(dbName, false)
    const tables = Array.isArray(database && database.tables) ? database.tables : []
    for (const table of tables) {
      const tableName = String(table && table.name || '').trim()
      if (!tableName) continue
      const schema = String(table && table.schemaName || 'public')
      const rows = Array.isArray(table && table.rows) ? table.rows : []
      let columns = Array.isArray(table && table.columns) ? table.columns.filter(Boolean) : []
      if (columns.length === 0 && rows[0]) {
        columns = Object.keys(rows[0]).map(function(n) { return { name: n, type: inferSqlType(rows, n) } })
      }
      if (columns.length === 0) columns = [{ name: 'id', type: 'INTEGER' }]
      const normCols = columns.map(function(c) {
        return { name: String(c && c.name || c || '').trim(), type: normalizeSqlType(c && c.type || 'TEXT') }
      }).filter(function(c) { return c.name })
      db.run('DROP TABLE IF EXISTS ' + escapeIdentifier(tableName))
      const defs = normCols.map(function(c) { return escapeIdentifier(c.name) + ' ' + c.type }).join(', ')
      db.run('CREATE TABLE IF NOT EXISTS ' + escapeIdentifier(tableName) + ' (' + defs + ')')
      for (const row of rows) {
        const cols = normCols.map(function(c) { return escapeIdentifier(c.name) }).join(', ')
        const vals = normCols.map(function(c) { return escapeLiteral(row && row[c.name]) }).join(', ')
        db.run('INSERT INTO ' + escapeIdentifier(tableName) + ' (' + cols + ') VALUES (' + vals + ')')
      }
      registerTableColumns(dbName, tableName, normCols, schema)
    }
  }
}

export async function importTableData({ databaseName, tableName, rows, schemaName, columnTypes, onProgress }) {
  await ensureRuntimeInitialized()
  rows = rows || []
  schemaName = schemaName || 'public'
  const nd = String(databaseName || '').toLowerCase().trim()
  const nt = String(tableName || '').trim()
  if (!nd) throw new Error('Target database is required.')
  if (!databaseExists(nd)) throw new Error('Database does not exist: ' + nd)
  if (!nt) throw new Error('Target table name is required.')
  if (!Array.isArray(rows) || rows.length === 0) throw new Error('No rows to import.')
  const inputCols = Object.keys(rows[0])
  const colRenameMap = buildHeaderRenameMap(inputCols)
  const cols = inputCols.map((col) => colRenameMap[String(col)])
  if (cols.length === 0) throw new Error('Imported data has no columns.')
  const normalizedRows = rows.map((row) => {
    const next = {}
    for (const raw of inputCols) {
      const source = String(raw)
      next[colRenameMap[source]] = row?.[source]
    }
    return next
  })

  const normalizedTypes = {}
  if (columnTypes && typeof columnTypes === 'object') {
    for (const raw of inputCols) {
      const source = String(raw)
      const normalized = colRenameMap[source]
      const direct = columnTypes[source]
      let ci
      if (!direct) {
        for (const k in columnTypes) {
          if (normalizeHeaderName(k).toLowerCase() === normalizeHeaderName(source).toLowerCase()) {
            ci = columnTypes[k]
            break
          }
        }
      }
      if (direct || ci) normalizedTypes[normalized] = direct || ci
    }
  }

  const typedCols = cols.map(function(col) {
    const direct = normalizedTypes[col]
    let ci
    if (!direct && normalizedTypes) {
      for (const k in normalizedTypes) {
        if (k.toLowerCase() === col.toLowerCase()) { ci = normalizedTypes[k]; break }
      }
    }
    return { name: col, type: normalizeSqlType(direct || ci || inferSqlType(normalizedRows, col)) }
  })

  const emitProgress = typeof onProgress === 'function'
    ? function(progress) {
        try { onProgress(progress || {}) } catch {}
      }
    : function() {}

  emitProgress({
    phase: 'prepare',
    processedRows: 0,
    totalRows: normalizedRows.length,
    percent: 0,
    message: 'Preparing import structure…',
  })

  if (isServerSideDatabase(nd)) {
    const tableSql = escapeIdentifier(nt)
    const columnDefsSql = typedCols.map(function(c) {
      return escapeIdentifier(c.name) + ' ' + c.type
    }).join(', ')

    await runServerSql(nd, `DROP TABLE IF EXISTS ${tableSql}; CREATE TABLE ${tableSql} (${columnDefsSql});`, false)

    emitProgress({
      phase: 'create-table',
      processedRows: 0,
      totalRows: normalizedRows.length,
      percent: 0,
      message: 'Table created. Importing rows…',
    })

    const chunkSize = 200
    for (let i = 0; i < normalizedRows.length; i += chunkSize) {
      const chunk = normalizedRows.slice(i, i + chunkSize)
      const chunkStatements = chunk.map(function(row) {
        const c = typedCols.map(function(col) { return escapeIdentifier(col.name) }).join(', ')
        const v = typedCols.map(function(col) { return escapeLiteral(row[col.name]) }).join(', ')
        return 'INSERT INTO ' + tableSql + ' (' + c + ') VALUES (' + v + ')'
      }).join('; ')
      if (chunkStatements) {
        await runServerSql(nd, chunkStatements + ';', false)
      }

      const processedRows = Math.min(i + chunk.length, normalizedRows.length)
      const percent = normalizedRows.length > 0 ? (processedRows / normalizedRows.length) * 100 : 100
      emitProgress({
        phase: 'insert-rows',
        processedRows,
        totalRows: normalizedRows.length,
        percent,
        message: `Importing rows… ${processedRows.toLocaleString()} / ${normalizedRows.length.toLocaleString()}`,
      })
    }

    await refreshServerDatabaseMetadataForDb(nd)
    emitProgress({
      phase: 'refresh-metadata',
      processedRows: normalizedRows.length,
      totalRows: normalizedRows.length,
      percent: 100,
      message: 'Import complete. Metadata refreshed.',
    })
    return { databaseName: nd, tableName: nt, rowCount: rows.length, columns: cols }
  }

  const db = await getOrCreateDbInstance(nd)
  db.run('DROP TABLE IF EXISTS ' + escapeIdentifier(nt))
  const defs = typedCols.map(function(c) { return escapeIdentifier(c.name) + ' ' + c.type }).join(', ')
  db.run('CREATE TABLE ' + escapeIdentifier(nt) + ' (' + defs + ')')
  emitProgress({
    phase: 'create-table',
    processedRows: 0,
    totalRows: normalizedRows.length,
    percent: 0,
    message: 'Table created. Importing rows…',
  })

  const localChunkSize = 500
  for (let i = 0; i < normalizedRows.length; i += localChunkSize) {
    const chunk = normalizedRows.slice(i, i + localChunkSize)
    for (const row of chunk) {
      const c = typedCols.map(function(c) { return escapeIdentifier(c.name) }).join(', ')
      const v = typedCols.map(function(c) { return escapeLiteral(row[c.name]) }).join(', ')
      db.run('INSERT INTO ' + escapeIdentifier(nt) + ' (' + c + ') VALUES (' + v + ')')
    }

    const processedRows = Math.min(i + chunk.length, normalizedRows.length)
    const percent = normalizedRows.length > 0 ? (processedRows / normalizedRows.length) * 100 : 100
    emitProgress({
      phase: 'insert-rows',
      processedRows,
      totalRows: normalizedRows.length,
      percent,
      message: `Importing rows… ${processedRows.toLocaleString()} / ${normalizedRows.length.toLocaleString()}`,
    })
  }

  emitProgress({
    phase: 'finalize',
    processedRows: normalizedRows.length,
    totalRows: normalizedRows.length,
    percent: 100,
    message: 'Import complete.',
  })
  registerTableColumns(nd, nt, typedCols, schemaName)
  return { databaseName: nd, tableName: nt, rowCount: rows.length, columns: cols }
}

export async function executeQuery(sql, options) {
  options = options || { limitEnabled: true }
  try {
      const sqlNoComments = stripSqlComments(sql)
      if (!sqlNoComments.trim()) {
        return { success: false, error: 'Empty query', resultSets: [], rowsAffected: 0 }
      }

      const statements = splitSqlStatements(sqlNoComments)
      const normalizedStatements = normalizeStatementsForRuntime(statements)
      if (!normalizedStatements.length) {
        return {
          success: false,
          error: 'No executable statements found. The provided syntax may be unsupported in this runtime.',
          resultSets: [],
          rowsAffected: 0,
          statementCount: 0,
        }
      }

      const resultSets = []
      const createdDatabases = []
      const droppedDatabases = []
      const pendingServerMetadataRefresh = new Set()
      let totalRowsAffected = 0
      let currentDb = ACTIVE_DATABASE || [...KNOWN_DATABASES][0] || ''

        for (const stmt of normalizedStatements) {
          if (!stmt.trim()) continue
          const upper = stmt.trim().toUpperCase()

          // compatibility intercepts
          if (/information_schema|pg_catalog|stl_query|svv_tables/i.test(stmt)) {
            resultSets.push({ columns: ['table_catalog','table_schema','table_name','table_type'], rows: listRuntimeTables(), stmt: stmt.substring(0,80) })
            continue
          }
          if (/current_user|current_database|version\(\)/i.test(stmt)) {
            resultSets.push({ columns: ['current_user','current_database','version'], rows: [{ current_user:'local_user', current_database: currentDb||null, version:'Local SQL Workspace (SQLite / sql.js)' }], stmt: stmt.substring(0,80) })
            continue
          }

          // USE database
          const useDb = parseUseDatabase(stmt)
          if (useDb) {
            if (!databaseExists(useDb)) { return { success: false, error: 'Database does not exist: ' + useDb, resultSets: [], rowsAffected: 0 } }
            currentDb = useDb
            ACTIVE_DATABASE = useDb
            continue
          }

          // CREATE DATABASE
          const createDb = parseCreateDatabase(stmt)
          if (createDb) {
            await getOrCreateDbInstance(createDb)
            createdDatabases.push(createDb)
            if (DB_CONNECTION_STATE[createDb] === undefined) setDatabaseConnected(createDb, false)
            currentDb = createDb
            ACTIVE_DATABASE = createDb
            continue
          }

          // GET CONNECT
          const connectDb = parseGetConnectQuery(stmt)
          if (connectDb) {
            const creds = getDatabaseCredentials(connectDb)
            resultSets.push({ columns: ['status','username','password'], rows: [creds ? { status:'CONNECTED', username:creds.username, password:creds.password } : { status:'NOT_CONNECTED', username:null, password:null }], stmt: stmt.substring(0,80) })
            continue
          }

          // DROP DATABASE
          const dropDb = parseDropDatabase(stmt)
          if (dropDb) {
            if (!databaseExists(dropDb.databaseName)) {
              if (!dropDb.ifExists) { return { success: false, error: 'Database does not exist: ' + dropDb.databaseName, resultSets: [], rowsAffected: 0 } }
              continue
            }
            removeKnownDatabase(dropDb.databaseName)
            droppedDatabases.push(dropDb.databaseName)
            if (currentDb === dropDb.databaseName) currentDb = ''
            if (ACTIVE_DATABASE === dropDb.databaseName) ACTIVE_DATABASE = [...KNOWN_DATABASES][0] || ''
            continue
          }

          // SHOW
          const showSpec = parseShowStatement(stmt)
          if (showSpec) {
            if (showSpec.type === 'databases') {
              resultSets.push({ columns: ['Database'], rows: [...KNOWN_DATABASES].sort().map(function(n) { return { Database: n } }), stmt: stmt.substring(0,80) })
            } else if (showSpec.type === 'tables') {
              const tblRows = listRuntimeTables()
                .filter(function(r) { return !currentDb || r.table_catalog === currentDb })
                .map(function(r) { return { Tables_in_db: r.table_name, Table_type: r.table_type } })
              resultSets.push({ columns: ['Tables_in_db','Table_type'], rows: tblRows, stmt: stmt.substring(0,80) })
            } else if (showSpec.type === 'columns') {
              const sdb = resolveTableDatabase(showSpec.tableToken, currentDb) || currentDb
              const caseMap = getTableColumnCaseMap(sdb, showSpec.tableName) || {}
              const typeMap = getTableColumnTypeMap(sdb, showSpec.tableName) || {}
              resultSets.push({ columns: ['Field','Type','Null','Key','Default','Extra'], rows: Object.values(caseMap).map(function(n) { return { Field:n, Type: uiType(typeMap[String(n).toLowerCase()]||'TEXT'), Null:'YES', Key:'', Default:'NULL', Extra:'' } }), stmt: stmt.substring(0,80) })
            }
            continue
          }

          // DESCRIBE
          if (/^\s*(?:describe|desc|sp_help|exec\s+sp_help)\s+/i.test(stmt)) {
            const dt = parseDescribeTable(stmt)
            if (dt) {
              const ddb = resolveTableDatabase(dt, currentDb) || currentDb
              const caseMap = getTableColumnCaseMap(ddb, dt) || {}
              const typeMap = getTableColumnTypeMap(ddb, dt) || {}
              resultSets.push({ columns: ['Field','Type','Null','Key','Default','Extra'], rows: Object.values(caseMap).map(function(n) { return { Field:n, Type: uiType(typeMap[String(n).toLowerCase()]||'TEXT'), Null:'YES', Key:'', Default:'NULL', Extra:'' } }), stmt: stmt.substring(0,80) })
              continue
            }
          }

          const targetDb = resolveStatementDatabase(stmt, currentDb)

          // ── Server-side routing for file-based databases ───────────────────
          if (isServerSideDatabase(targetDb)) {
            try {
              const apiRes = await fetch('/api/query', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ db: targetDb, sql: stmt, limitEnabled: options.limitEnabled }),
              })
              const apiJson = await apiRes.json()
              if (apiJson.success && Array.isArray(apiJson.resultSets)) {
                for (const rs of apiJson.resultSets) {
                  // Enrich error messages coming from server-side statements
                  if (rs && rs.isError && rs.rows && rs.rows[0] && rs.rows[0].error) {
                    rs.rows[0].error = enrichSqlError(rs.rows[0].error, stmt)
                  }
                  resultSets.push(rs)
                }
                totalRowsAffected += Number(apiJson.rowsAffected || 0)
                if (isServerSchemaMutationStatement(stmt) && targetDb) {
                  pendingServerMetadataRefresh.add(String(targetDb).toLowerCase())
                }
              } else {
                const srvErrMsg = enrichSqlError(apiJson.error || 'Server query failed', stmt)
                resultSets.push({ columns: ['error'], rows: [{ error: srvErrMsg }], stmt: stmt.substring(0, 80), isError: true })
              }
            } catch (fetchErr) {
              resultSets.push({ columns: ['error'], rows: [{ error: 'Server unreachable: ' + String(fetchErr?.message || fetchErr) }], stmt: stmt.substring(0, 80), isError: true })
            }
            currentDb = targetDb || currentDb
            continue
          }

          // TRUNCATE
          const truncate = parseTruncateTable(stmt)
          if (truncate) {
            const tdb = resolveTableDatabase(truncate, targetDb) || targetDb
            const db = getDbInstance(tdb)
            if (!db) { return { success: false, error: 'Database not found: ' + tdb, resultSets: [], rowsAffected: 0 } }
            const display = (DB_TABLE_NAME_CASE[tdb] && DB_TABLE_NAME_CASE[tdb][truncate]) || truncate
            db.run('DELETE FROM ' + escapeIdentifier(display))
            currentDb = tdb || currentDb; continue
          }

          // RENAME TABLE
          const renameTable = parseRenameTable(stmt)
          if (renameTable) {
            const rdb = resolveTableDatabase(renameTable.oldTableToken, targetDb) || targetDb
            applyRenameTable(rdb, renameTable.oldTableName, renameTable.newTableName)
            currentDb = rdb || currentDb; continue
          }

          // ALTER TABLE variants (our custom implementations)
          if (/^\s*ALTER\s+TABLE\b/i.test(stmt)) {
            const alterModify = parseAlterModifyColumn(stmt)
            if (alterModify) {
              const adb = resolveTableDatabase(alterModify.tableToken, targetDb) || targetDb
              applyAlterModifyColumn(adb, alterModify.tableName, alterModify.columnName, alterModify.columnType)
              currentDb = adb || currentDb; continue
            }
            const alterColType = parseAlterColumnType(stmt)
            if (alterColType) {
              const adb = resolveTableDatabase(alterColType.tableToken, targetDb) || targetDb
              applyAlterModifyColumn(adb, alterColType.tableName, alterColType.columnName, alterColType.columnType)
              currentDb = adb || currentDb; continue
            }
            const changeCol = parseAlterChangeColumn(stmt)
            if (changeCol) {
              const adb = resolveTableDatabase(changeCol.tableToken, targetDb) || targetDb
              applyAlterChangeColumn(adb, changeCol.tableName, changeCol.oldColumnName, changeCol.newColumnName, changeCol.columnType)
              currentDb = adb || currentDb; continue
            }
            const renameCol = parseAlterRenameColumn(stmt)
            if (renameCol) {
              const adb = resolveTableDatabase(renameCol.tableToken, targetDb) || targetDb
              applyAlterRenameColumn(adb, renameCol.tableName, renameCol.oldColumnName, renameCol.newColumnName)
              currentDb = adb || currentDb; continue
            }
            const dropCol = parseAlterDropColumn(stmt)
            if (dropCol) {
              const adb = resolveTableDatabase(dropCol.tableToken, targetDb) || targetDb
              applyAlterDropColumn(adb, dropCol.tableName, dropCol.columnName)
              currentDb = adb || currentDb; continue
            }
            // ALTER TABLE ADD COLUMN / RENAME TO → fall through to native SQLite
          }

          // Native SQLite execution
          if (!targetDb) {
            return { success: false, error: 'No database selected. Run CREATE DATABASE and USE first.', resultSets: [], rowsAffected: 0 }
          }

          const db = await getOrCreateDbInstance(targetDb)
          let result
          try {
            result = execStatement(db, stmt)
          } catch (stmtErr) {
            const friendlyMsg = enrichSqlError(stmtErr.message, stmt)
            resultSets.push({ columns: ['error'], rows: [{ error: friendlyMsg }], stmt: stmt.substring(0, 80), isError: true })
            currentDb = targetDb || currentDb
            continue
          }

          if (result.type === 'rows') {
            const normalized = normalizeResultRows(result.data, options.limitEnabled, stmt, targetDb)
            resultSets.push({ 
              columns: normalized.columns, 
              rows: normalized.rows, 
              columnTypes: normalized.columnTypes, 
              isEmpty: result.data.length === 0,
              stmt: stmt.substring(0,80) 
            })
          } else {
            if (/^(INSERT|UPDATE|DELETE)\b/i.test(upper)) totalRowsAffected += result.data

            if (/^\s*CREATE\s+TABLE\b/i.test(stmt)) {
              const token = parseCreateTableToken(stmt)
              if (token) {
                const tname = getOriginalTableName(token)
                const schema = extractSchemaQualifier(token)
                const cols = extractCreateTableColumns(stmt)
                if (tname) registerTableColumns(targetDb, tname, cols, schema)
              }
            }

            if (/^\s*ALTER\s+TABLE\b/i.test(stmt) && /\bADD\b/i.test(stmt)) {
              const altered = parseAlterAddColumn(stmt)
              if (altered && altered.tableName && altered.columnName) {
                const altDb = resolveTableDatabase(altered.tableToken, targetDb)
                const caseMap = getTableColumnCaseMap(altDb, altered.tableName) || {}
                const typeMap = getTableColumnTypeMap(altDb, altered.tableName) || {}
                const exists = Object.keys(caseMap).some(function(k) { return k === altered.columnName.toLowerCase() })
                if (!exists) {
                  const newCols = Object.values(caseMap).map(function(n) { return { name: n, type: typeMap[String(n).toLowerCase()]||'TEXT' } })
                  newCols.push({ name: altered.columnName, type: 'TEXT' })
                  registerTableColumns(altDb, (DB_TABLE_NAME_CASE[altDb] && DB_TABLE_NAME_CASE[altDb][altered.tableName]) || altered.tableName, newCols, getTableSchema(altDb, altered.tableName))
                }
              }
            }

            if (/^\s*DROP\s+TABLE\b/i.test(stmt)) {
              const token = parseDropTableToken(stmt)
              const tname = normalizeTableToken(token)
              const dropDb = resolveTableDatabase(token, targetDb)
              if (tname) removeTableColumns(dropDb, tname)
            }
          }

          currentDb = targetDb || currentDb
          if (currentDb) ACTIVE_DATABASE = currentDb
        }

        if (pendingServerMetadataRefresh.size > 0) {
          for (const dbName of pendingServerMetadataRefresh) {
            try {
              await refreshServerDatabaseMetadataForDb(dbName)
            } catch {}
          }
        }

        if (currentDb) ACTIVE_DATABASE = currentDb
        return { success: true, resultSets: resultSets, rowsAffected: totalRowsAffected, statementCount: normalizedStatements.length, createdDatabases: createdDatabases, droppedDatabases: droppedDatabases, currentDatabase: currentDb || ACTIVE_DATABASE || null }
  } catch(err) {
    return { success: false, error: enrichSqlError(err.message, sql), resultSets: [], rowsAffected: 0 }
  }
}
