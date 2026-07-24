/**
 * /api/query
 * POST { db, sql, limitEnabled }
 *   → executes SQL against the server-side .db file using better-sqlite3
 *   → never sends the DB binary to the browser
 *
 * GET  ?db=name
 *   → returns { tables: [...], tableCount: N } metadata only
 */

import { NextResponse } from 'next/server'
import path from 'node:path'
import fs from 'node:fs'
import Database from 'better-sqlite3'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const DATA_DIR = process.env.APP_DATA_DIR
  ? path.join(process.env.APP_DATA_DIR, 'data')
  : path.join(process.cwd(), 'lib', 'data')

// Cache open DB connections so we don't re-open on every request
const DB_CACHE = new Map()

function toDateParts(value) {
  if (value === null || value === undefined) return null

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return { month: value.getUTCMonth() + 1, year: value.getUTCFullYear() }
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    const excelEpochUtcMs = Date.UTC(1899, 11, 30)
    const utcMs = excelEpochUtcMs + Math.floor(value) * 24 * 60 * 60 * 1000
    const parsed = new Date(utcMs)
    if (!Number.isNaN(parsed.getTime())) {
      return { month: parsed.getUTCMonth() + 1, year: parsed.getUTCFullYear() }
    }
  }

  const raw = String(value).trim()
  if (!raw) return null

  if (/^\d+(?:\.\d+)?$/.test(raw)) {
    const numeric = Number(raw)
    if (Number.isFinite(numeric)) {
      const excelEpochUtcMs = Date.UTC(1899, 11, 30)
      const utcMs = excelEpochUtcMs + Math.floor(numeric) * 24 * 60 * 60 * 1000
      const parsed = new Date(utcMs)
      if (!Number.isNaN(parsed.getTime())) {
        return { month: parsed.getUTCMonth() + 1, year: parsed.getUTCFullYear() }
      }
    }
  }

  // Check M/D/YYYY or MM/DD/YYYY BEFORE generic new Date() to avoid
  // local-timezone parsing which causes UTC month/year to shift.
  const slashMatch = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (slashMatch) {
    const month = Number(slashMatch[1])
    const year = Number(slashMatch[3])
    if (month >= 1 && month <= 12 && Number.isFinite(year)) {
      return { month, year }
    }
  }

  // Also catch D-M-YYYY and YYYY-M-D patterns before generic parse
  const dashMDY = raw.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/)
  if (dashMDY) {
    const month = Number(dashMDY[1])
    const year = Number(dashMDY[3])
    if (month >= 1 && month <= 12) return { month, year }
  }

  // ISO YYYY-MM-DD — safe to read directly without time zone ambiguity
  const isoMatch = raw.match(/^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?/)
  if (isoMatch) {
    return { month: Number(isoMatch[2]), year: Number(isoMatch[1]) }
  }

  const parsed = new Date(raw)
  if (Number.isNaN(parsed.getTime())) return null
  return { month: parsed.getUTCMonth() + 1, year: parsed.getUTCFullYear() }
}

const MONTH_ABBR = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 }

// Parses a value string against an explicit Oracle-style format mask
// (tokens: YYYY, YY, MONTH, MON, MM, DD). Returns a Date (UTC) or null.
function parseDateWithFormat(value, fmt) {
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

// Parse any date-like value into a real Date object (UTC)
function parseDateVal(value) {
  if (value === null || value === undefined) return null
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value
  if (typeof value === 'number' && Number.isFinite(value)) {
    const ms = Date.UTC(1899, 11, 30) + Math.floor(value) * 86400000
    const d = new Date(ms)
    return Number.isNaN(d.getTime()) ? null : d
  }
  const raw = String(value).trim()
  if (!raw) return null

  // M/D/YYYY or MM/DD/YYYY — parse as UTC to avoid local-timezone drift
  const slash = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (slash) {
    const d2 = new Date(Date.UTC(Number(slash[3]), Number(slash[1]) - 1, Number(slash[2])))
    return Number.isNaN(d2.getTime()) ? null : d2
  }

  // D-M-YYYY
  const dashDMY = raw.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/)
  if (dashDMY) {
    const d2 = new Date(Date.UTC(Number(dashDMY[3]), Number(dashDMY[1]) - 1, Number(dashDMY[2])))
    return Number.isNaN(d2.getTime()) ? null : d2
  }

  // ISO YYYY-MM-DD or YYYY/MM/DD (date-only or with time) — parse as UTC explicitly
  const iso = raw.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[T ].*)?$/)
  if (iso) {
    const d2 = new Date(Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])))
    return Number.isNaN(d2.getTime()) ? null : d2
  }

  // DD-MON-YYYY / DD MON YYYY / DD/MON/YYYY (Oracle style, e.g. 09-NOV-2006)
  const mon = raw.match(/^(\d{1,2})[-/ ]([A-Za-z]{3,9})[-/ ](\d{2,4})$/)
  if (mon) {
    const m = MONTH_ABBR[mon[2].slice(0, 3).toLowerCase()]
    if (m) {
      let yr = Number(mon[3]); if (yr < 100) yr += yr < 70 ? 2000 : 1900
      const d2 = new Date(Date.UTC(yr, m - 1, Number(mon[1])))
      return Number.isNaN(d2.getTime()) ? null : d2
    }
  }

  // M/D/YY or M-D-YY (2-digit year) — treat month first, consistent with M/D/YYYY
  const shortY = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2})$/)
  if (shortY) {
    const yr = Number(shortY[3]) + (Number(shortY[3]) < 70 ? 2000 : 1900)
    const d2 = new Date(Date.UTC(yr, Number(shortY[1]) - 1, Number(shortY[2])))
    return Number.isNaN(d2.getTime()) ? null : d2
  }

  // Fallback generic parse (may have TZ issues for ambiguous strings)
  const d = new Date(raw)
  return Number.isNaN(d.getTime()) ? null : d
}

function registerCustomFunctions(db) {
  // ── Date extraction ──────────────────────────────────────────────────────
  db.function('MONTH', { deterministic: true }, (v) => {
    const d = parseDateVal(v); return d ? d.getUTCMonth() + 1 : null
  })
  db.function('YEAR', { deterministic: true }, (v) => {
    const d = parseDateVal(v); return d ? d.getUTCFullYear() : null
  })
  db.function('DAY', { deterministic: true }, (v) => {
    const d = parseDateVal(v); return d ? d.getUTCDate() : null
  })
  db.function('DAYOFMONTH', { deterministic: true }, (v) => {
    const d = parseDateVal(v); return d ? d.getUTCDate() : null
  })
  db.function('HOUR', { deterministic: true }, (v) => {
    const d = parseDateVal(v); return d ? d.getUTCHours() : null
  })
  db.function('MINUTE', { deterministic: true }, (v) => {
    const d = parseDateVal(v); return d ? d.getUTCMinutes() : null
  })
  db.function('SECOND', { deterministic: true }, (v) => {
    const d = parseDateVal(v); return d ? d.getUTCSeconds() : null
  })
  db.function('DAYOFWEEK', { deterministic: true }, (v) => {
    // Returns 1=Sunday … 7=Saturday (SQL Server / MySQL convention)
    const d = parseDateVal(v); return d ? d.getUTCDay() + 1 : null
  })
  db.function('WEEKDAY', { deterministic: true }, (v) => {
    // MySQL: 0=Monday … 6=Sunday
    const d = parseDateVal(v); return d ? (d.getUTCDay() + 6) % 7 : null
  })
  db.function('DAYOFYEAR', { deterministic: true }, (v) => {
    const d = parseDateVal(v)
    if (!d) return null
    const start = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
    return Math.floor((d - start) / 86400000) + 1
  })
  db.function('WEEK', { deterministic: true }, (v) => {
    const d = parseDateVal(v)
    if (!d) return null
    const start = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
    return Math.ceil(((d - start) / 86400000 + start.getUTCDay() + 1) / 7)
  })
  db.function('WEEKOFYEAR', { deterministic: true }, (v) => {
    const d = parseDateVal(v)
    if (!d) return null
    const start = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
    return Math.ceil(((d - start) / 86400000 + start.getUTCDay() + 1) / 7)
  })
  db.function('QUARTER', { deterministic: true }, (v) => {
    const d = parseDateVal(v); return d ? Math.ceil((d.getUTCMonth() + 1) / 3) : null
  })

  // ── Current date / time ──────────────────────────────────────────────────
  const nowStr = () => new Date().toISOString().slice(0, 19).replace('T', ' ')
  const todayStr = () => new Date().toISOString().slice(0, 10)
  db.function('GETDATE',    { deterministic: false }, () => nowStr())
  db.function('GETUTCDATE', { deterministic: false }, () => nowStr())
  db.function('SYSDATETIME',{ deterministic: false }, () => nowStr())
  db.function('SYSDATE',    { deterministic: false }, () => nowStr())
  db.function('NOW',        { deterministic: false }, () => nowStr())
  db.function('CURDATE',    { deterministic: false }, () => todayStr())
  db.function('CURTIME',    { deterministic: false }, () => new Date().toISOString().slice(11, 19))
  db.function('TODAY',      { deterministic: false }, () => todayStr())

  // ── Date arithmetic ──────────────────────────────────────────────────────
  // DATEDIFF: MySQL 2-arg (date1-date2 in days) OR SQL Server 3-arg (unit, start, end)
  db.function('DATEDIFF', { deterministic: true, varargs: true }, (...args) => {
    if (args.length >= 3) {
      const unit = String(args[0] || 'day').toLowerCase().replace(/s$/, '')
      const d1 = parseDateVal(args[1]), d2 = parseDateVal(args[2])
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
    // MySQL 2-arg: DATEDIFF(date1, date2) → date1 − date2 in days
    const d1 = parseDateVal(args[0]), d2 = parseDateVal(args[1])
    if (!d1 || !d2) return null
    return Math.trunc((d1 - d2) / 86400000)
  })
  // DATEADD(unit, n, date)
  db.function('DATEADD', { deterministic: true }, (unit, n, dateVal) => {
    const d = parseDateVal(dateVal)
    if (!d) return null
    const num = Number(n) || 0
    const u = String(unit || 'day').toLowerCase().replace(/s$/, '')
    if (u === 'day'  || u === 'dd' || u === 'd')  d.setUTCDate(d.getUTCDate() + num)
    else if (u === 'week' || u === 'wk'|| u === 'ww') d.setUTCDate(d.getUTCDate() + num * 7)
    else if (u === 'month'|| u === 'mm'|| u === 'm')  d.setUTCMonth(d.getUTCMonth() + num)
    else if (u === 'year' || u === 'yy'|| u === 'yyyy') d.setUTCFullYear(d.getUTCFullYear() + num)
    else if (u === 'hour' || u === 'hh')               d.setUTCHours(d.getUTCHours() + num)
    else if (u === 'minute'|| u === 'mi'|| u === 'n')  d.setUTCMinutes(d.getUTCMinutes() + num)
    else if (u === 'second'|| u === 'ss'|| u === 's')  d.setUTCSeconds(d.getUTCSeconds() + num)
    return d.toISOString().slice(0, 19).replace('T', ' ')
  })
  // DATE_ADD(date, INTERVAL n unit) — MySQL synonym; simplified: DATE_ADD(date, n_days)
  db.function('DATE_ADD', { deterministic: true }, (dateVal, nDays) => {
    const d = parseDateVal(dateVal)
    if (!d) return null
    d.setUTCDate(d.getUTCDate() + (Number(nDays) || 0))
    return d.toISOString().slice(0, 10)
  })
  db.function('DATE_SUB', { deterministic: true }, (dateVal, nDays) => {
    const d = parseDateVal(dateVal)
    if (!d) return null
    d.setUTCDate(d.getUTCDate() - (Number(nDays) || 0))
    return d.toISOString().slice(0, 10)
  })
  db.function('DATE_DIFF', { deterministic: true }, (d1Val, d2Val) => {
    const d1 = parseDateVal(d1Val), d2 = parseDateVal(d2Val)
    if (!d1 || !d2) return null
    return Math.trunc((d1 - d2) / 86400000)
  })
  db.function('EOMONTH', { deterministic: true }, (dateVal, offset) => {
    const d = parseDateVal(dateVal)
    if (!d) return null
    const mo = d.getUTCMonth() + 1 + (Number(offset) || 0)
    const last = new Date(Date.UTC(d.getUTCFullYear(), mo, 0))
    return last.toISOString().slice(0, 10)
  })
  // DATE_FORMAT(date, format) — MySQL
  db.function('DATE_FORMAT', { deterministic: true }, (dateVal, fmt) => {
    const d = parseDateVal(dateVal)
    if (!d) return null
    return String(fmt || '')
      .replace(/%Y/g, d.getUTCFullYear())
      .replace(/%y/g, String(d.getUTCFullYear()).slice(-2))
      .replace(/%m/g, String(d.getUTCMonth() + 1).padStart(2, '0'))
      .replace(/%c/g, String(d.getUTCMonth() + 1))
      .replace(/%d/g, String(d.getUTCDate()).padStart(2, '0'))
      .replace(/%e/g, String(d.getUTCDate()))
      .replace(/%H/g, String(d.getUTCHours()).padStart(2, '0'))
      .replace(/%i/g, String(d.getUTCMinutes()).padStart(2, '0'))
      .replace(/%s/g, String(d.getUTCSeconds()).padStart(2, '0'))
      .replace(/%M/g, d.toLocaleString('en-US', { month: 'long',  timeZone: 'UTC' }))
      .replace(/%b/g, d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' }))
      .replace(/%W/g, d.toLocaleString('en-US', { weekday: 'long',  timeZone: 'UTC' }))
      .replace(/%a/g, d.toLocaleString('en-US', { weekday: 'short', timeZone: 'UTC' }))
  })
  // TO_CHAR(value, format) — Oracle / PostgreSQL
  db.function('TO_CHAR', { deterministic: true }, (value, fmt) => {
    if (value === null || value === undefined) return null
    if (!fmt) return String(value)
    const d = parseDateVal(value)
    if (d) {
      return String(fmt)
        .replace(/YYYY/g, d.getUTCFullYear())
        .replace(/YY/g,   String(d.getUTCFullYear()).slice(-2))
        .replace(/MM/g,   String(d.getUTCMonth() + 1).padStart(2, '0'))
        .replace(/MON/g,  d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' }).toUpperCase())
        .replace(/Mon/g,  d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' }))
        .replace(/MONTH/g,d.toLocaleString('en-US', { month: 'long',  timeZone: 'UTC' }).toUpperCase())
        .replace(/Month/g,d.toLocaleString('en-US', { month: 'long',  timeZone: 'UTC' }))
        .replace(/DD/g,   String(d.getUTCDate()).padStart(2, '0'))
        .replace(/DY/g,   d.toLocaleString('en-US', { weekday: 'short', timeZone: 'UTC' }).toUpperCase())
        .replace(/DAY/g,  d.toLocaleString('en-US', { weekday: 'long',  timeZone: 'UTC' }).toUpperCase())
        .replace(/HH24/g, String(d.getUTCHours()).padStart(2, '0'))
        .replace(/HH/g,   String(d.getUTCHours() % 12 || 12).padStart(2, '0'))
        .replace(/MI/g,   String(d.getUTCMinutes()).padStart(2, '0'))
        .replace(/SS/g,   String(d.getUTCSeconds()).padStart(2, '0'))
    }
    // Numeric formatting
    const n = Number(value)
    if (Number.isFinite(n)) {
      const fmtStr = String(fmt)
      const places = (fmtStr.match(/0+\.?(0*)$/) || ['', ''])[1].length
      if (fmtStr.includes('FM')) return n.toFixed(places).replace(/\.?0+$/, '')
      return n.toFixed(places)
    }
    return String(value)
  })
  db.function('TO_DATE', { deterministic: true, varargs: true }, (...args) => {
    const value = args[0], fmt = args[1]
    if (value === null || value === undefined) return null
    if (fmt) {
      const parsed = parseDateWithFormat(String(value), String(fmt))
      if (parsed) return parsed.toISOString().slice(0, 10)
    }
    const d = parseDateVal(value)
    return d ? d.toISOString().slice(0, 10) : null
  })
  db.function('ADD_MONTHS', { deterministic: true }, (dateVal, n) => {
    const d = parseDateVal(dateVal); if (!d) return null
    d.setUTCMonth(d.getUTCMonth() + (Number(n) || 0))
    return d.toISOString().slice(0, 10)
  })
  db.function('LAST_DAY', { deterministic: true }, (dateVal) => {
    const d = parseDateVal(dateVal); if (!d) return null
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).toISOString().slice(0, 10)
  })
  db.function('MONTHNAME', { deterministic: true }, (dateVal) => {
    const d = parseDateVal(dateVal); if (!d) return null
    return ['January','February','March','April','May','June','July','August','September','October','November','December'][d.getUTCMonth()]
  })
  db.function('DAYNAME', { deterministic: true }, (dateVal) => {
    const d = parseDateVal(dateVal); if (!d) return null
    return ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][d.getUTCDay()]
  })

  // ── String functions ─────────────────────────────────────────────────────
  db.function('LEN',    { deterministic: true }, (s) => s === null || s === undefined ? null : String(s).length)
  db.function('LENGTH2',{ deterministic: true }, (s) => s === null || s === undefined ? null : String(s).length)
  db.function('LEFT', { deterministic: true }, (s, n) => {
    if (s === null) return null
    return String(s).slice(0, Math.max(0, Number(n) || 0))
  })
  db.function('RIGHT', { deterministic: true }, (s, n) => {
    if (s === null) return null
    const len = Math.max(0, Number(n) || 0)
    return len === 0 ? '' : String(s).slice(-len)
  })
  db.function('CHARINDEX', { deterministic: true, varargs: true }, (...args) => {
    const [needle, haystack, startPos] = args
    if (needle === null || haystack === null) return 0
    const h = String(haystack), n = String(needle)
    const from = startPos !== undefined ? Math.max(0, Number(startPos) - 1) : 0
    const idx = h.indexOf(n, from)
    return idx === -1 ? 0 : idx + 1
  })
  db.function('LOCATE', { deterministic: true, varargs: true }, (...args) => {
    const [needle, haystack, startPos] = args
    if (needle === null || haystack === null) return 0
    const h = String(haystack), n = String(needle)
    const from = startPos !== undefined ? Math.max(0, Number(startPos) - 1) : 0
    const idx = h.indexOf(n, from)
    return idx === -1 ? 0 : idx + 1
  })
  db.function('PATINDEX', { deterministic: true }, (pattern, expr) => {
    if (!pattern || expr === null) return 0
    const re = new RegExp(String(pattern).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*').replace(/_/g, '.'), 'i')
    const m = String(expr).match(re)
    return m ? String(expr).indexOf(m[0]) + 1 : 0
  })
  db.function('ISNULL', { deterministic: true }, (expr, alt) =>
    (expr === null || expr === undefined) ? alt : expr)
  db.function('NVL',  { deterministic: true }, (expr, alt) =>
    (expr === null || expr === undefined) ? alt : expr)
  db.function('NVL2', { deterministic: true }, (expr, notNull, isNull) =>
    (expr === null || expr === undefined) ? isNull : notNull)
  db.function('LPAD', { deterministic: true }, (s, len, pad) => {
    if (s === null) return null
    const str = String(s), l = Math.max(0, Number(len) || 0)
    const p = (pad !== null && pad !== undefined) ? String(pad) : ' '
    if (!p) return str.slice(0, l)
    if (str.length >= l) return str.slice(0, l)
    return (p.repeat(Math.ceil((l - str.length) / p.length)) + str).slice(-(l))
  })
  db.function('RPAD', { deterministic: true }, (s, len, pad) => {
    if (s === null) return null
    const str = String(s), l = Math.max(0, Number(len) || 0)
    const p = (pad !== null && pad !== undefined) ? String(pad) : ' '
    if (!p) return str.slice(0, l)
    if (str.length >= l) return str.slice(0, l)
    return (str + p.repeat(Math.ceil((l - str.length) / p.length))).slice(0, l)
  })
  db.function('SPACE',  { deterministic: true }, (n) => ' '.repeat(Math.max(0, Number(n) || 0)))
  db.function('REPEAT', { deterministic: true }, (s, n) =>
    s === null ? null : String(s).repeat(Math.max(0, Number(n) || 0)))
  db.function('STR', { deterministic: true }, (n) =>
    n === null ? null : String(Number(n) || 0))
  db.function('INITCAP', { deterministic: true }, (s) => {
    if (s === null) return null
    return String(s).replace(/\b\w/g, c => c.toUpperCase()).replace(/\B\w/g, c => c.toLowerCase())
  })
  db.function('PROPER', { deterministic: true }, (s) => {
    if (s === null) return null
    return String(s).replace(/\b\w/g, c => c.toUpperCase()).replace(/\B\w/g, c => c.toLowerCase())
  })
  db.function('STUFF', { deterministic: true }, (s, start, length, repl) => {
    if (s === null) return null
    const str = String(s), st = (Number(start) || 1) - 1, l = Math.max(0, Number(length) || 0)
    return str.slice(0, st) + (repl === null || repl === undefined ? '' : String(repl)) + str.slice(st + l)
  })
  db.function('REVERSE', { deterministic: true }, (s) =>
    s === null ? null : String(s).split('').reverse().join(''))
  db.function('ASCII',   { deterministic: true }, (s) =>
    s === null || String(s).length === 0 ? null : String(s).charCodeAt(0))
  db.function('UNICODE', { deterministic: true }, (s) =>
    s === null || String(s).length === 0 ? null : String(s).charCodeAt(0))
  db.function('CHR',   { deterministic: true }, (n) => n === null ? null : String.fromCharCode(Number(n)))
  db.function('NCHAR', { deterministic: true }, (n) => n === null ? null : String.fromCharCode(Number(n)))
  db.function('TRANSLATE', { deterministic: true }, (s, fromStr, toStr) => {
    if (s === null) return null
    let result = String(s)
    const f = String(fromStr || ''), t = String(toStr || '')
    for (let i = 0; i < f.length; i++) {
      result = result.split(f[i]).join(i < t.length ? t[i] : '')
    }
    return result
  })
  db.function('SOUNDEX', { deterministic: true }, (s) => {
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
  // CONCAT varargs
  try {
    db.function('CONCAT', { deterministic: true, varargs: true }, (...args) =>
      args.map(a => a === null || a === undefined ? '' : String(a)).join(''))
  } catch {}
  // CONCAT_WS(sep, val1, val2, ...)
  try {
    db.function('CONCAT_WS', { deterministic: true, varargs: true }, (...args) => {
      const [sep, ...rest] = args
      return rest.filter(a => a !== null && a !== undefined).map(String).join(String(sep ?? ''))
    })
  } catch {}
  // DECODE(expr, s1, r1, s2, r2, ..., default)
  try {
    db.function('DECODE', { deterministic: true, varargs: true }, (...args) => {
      const [expr, ...pairs] = args
      for (let i = 0; i < pairs.length - 1; i += 2) {
        if (expr == pairs[i] || (expr === null && pairs[i] === null)) return pairs[i + 1]
      }
      return pairs.length % 2 === 1 ? pairs[pairs.length - 1] : null
    })
  } catch {}
  db.function('IIF', { deterministic: true }, (cond, t, f) => cond ? t : f)
  db.function('CHOOSE', { deterministic: true, varargs: true }, (index, ...vals) => {
    const i = Number(index) - 1
    return (i >= 0 && i < vals.length) ? vals[i] : null
  })

  // ── Numeric / formatting ─────────────────────────────────────────────────
  db.function('FORMAT', { deterministic: true }, (value, fmt) => {
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
  db.function('TO_NUMBER', { deterministic: true }, (s) => {
    if (s === null) return null
    const n = Number(String(s).replace(/[$€£¥,\s]/g, ''))
    return Number.isFinite(n) ? n : null
  })
  db.function('TRY_CAST', { deterministic: true }, (value) => {
    if (value === null) return null
    const n = Number(value); return Number.isFinite(n) ? n : null
  })
  db.function('SIGN', { deterministic: true }, (n) => {
    if (n === null) return null
    const v = Number(n)
    return v > 0 ? 1 : v < 0 ? -1 : 0
  })
  db.function('LOG2',  { deterministic: true }, (n) => n === null ? null : Math.log2(Number(n)))
  db.function('LOG10', { deterministic: true }, (n) => n === null ? null : Math.log10(Number(n)))
  db.function('PI',    { deterministic: true }, () => Math.PI)
  db.function('EXP',   { deterministic: true }, (n) => n === null ? null : Math.exp(Number(n)))
  db.function('CBRT',  { deterministic: true }, (n) => n === null ? null : Math.cbrt(Number(n)))
  db.function('TRUNCATE', { deterministic: true }, (n, places) => {
    if (n === null) return null
    const factor = Math.pow(10, Number(places) || 0)
    return Math.trunc(Number(n) * factor) / factor
  })

  // ── Aggregate functions ──────────────────────────────────────────────────
  // Welford's online algorithm — numerically stable for large financial values
  // (the naive sum-of-squares formula suffers catastrophic cancellation).
  const makeStdAgg = (population) => ({
    start: () => ({ mean: 0, m2: 0, count: 0 }),
    step: (acc, val) => {
      if (val !== null && val !== undefined) {
        const v = Number(val)
        if (Number.isFinite(v)) {
          acc.count++
          const delta = v - acc.mean
          acc.mean += delta / acc.count
          acc.m2 += delta * (v - acc.mean)
        }
      }
    },
    result: (acc) => {
      const n = population ? acc.count : acc.count - 1
      if (n < 1) return null
      return Math.sqrt(Math.max(0, acc.m2 / n))
    },
  })
  db.aggregate('STDEV',     makeStdAgg(false))
  db.aggregate('STDEV_SAMP',makeStdAgg(false))
  db.aggregate('STDDEV',    makeStdAgg(false))
  db.aggregate('STDDEV_SAMP', makeStdAgg(false))
  db.aggregate('STD',       makeStdAgg(false))
  db.aggregate('STDEV_POP', makeStdAgg(true))
  db.aggregate('STDDEV_POP',makeStdAgg(true))

  const makeVarAgg = (population) => ({
    start: () => ({ mean: 0, m2: 0, count: 0 }),
    step: (acc, val) => {
      if (val !== null && val !== undefined) {
        const v = Number(val)
        if (Number.isFinite(v)) {
          acc.count++
          const delta = v - acc.mean
          acc.mean += delta / acc.count
          acc.m2 += delta * (v - acc.mean)
        }
      }
    },
    result: (acc) => {
      const n = population ? acc.count : acc.count - 1
      if (n < 1) return null
      return Math.max(0, acc.m2 / n)
    },
  })
  db.aggregate('VARIANCE',    makeVarAgg(false))
  db.aggregate('VAR_SAMP',    makeVarAgg(false))
  db.aggregate('VAR_POP',     makeVarAgg(true))
  db.aggregate('VARIANCE_POP',makeVarAgg(true))

  db.aggregate('MEDIAN', {
    start: () => [],
    step: (acc, val) => {
      if (val !== null && val !== undefined) {
        const v = Number(val); if (Number.isFinite(v)) acc.push(v)
      }
    },
    result: (acc) => {
      if (!acc.length) return null
      acc.sort((a, b) => a - b)
      const mid = Math.floor(acc.length / 2)
      return acc.length % 2 === 0 ? (acc[mid - 1] + acc[mid]) / 2 : acc[mid]
    },
  })

  // PERCENTILE_CONT(value, fraction) — continuous percentile with linear
  // interpolation between adjacent ranks (matches SQL Server / PostgreSQL).
  // The fraction (0..1) is supplied per-row; we capture it in step.
  db.aggregate('PERCENTILE_CONT', {
    start: () => ({ values: [], frac: 0.5 }),
    step: (acc, val, frac) => {
      if (frac !== undefined && frac !== null) {
        const f = Number(frac); if (Number.isFinite(f)) acc.frac = Math.min(1, Math.max(0, f))
      }
      if (val !== null && val !== undefined) {
        const v = Number(val); if (Number.isFinite(v)) acc.values.push(v)
      }
    },
    result: (acc) => {
      const a = acc.values
      if (!a.length) return null
      a.sort((x, y) => x - y)
      if (a.length === 1) return a[0]
      const rank = acc.frac * (a.length - 1)
      const lo = Math.floor(rank), hi = Math.ceil(rank)
      if (lo === hi) return a[lo]
      return a[lo] + (a[hi] - a[lo]) * (rank - lo)
    },
  })

  // PERCENTILE_DISC(value, fraction) — discrete percentile: returns the first
  // value whose cumulative distribution is >= fraction (no interpolation).
  db.aggregate('PERCENTILE_DISC', {
    start: () => ({ values: [], frac: 0.5 }),
    step: (acc, val, frac) => {
      if (frac !== undefined && frac !== null) {
        const f = Number(frac); if (Number.isFinite(f)) acc.frac = Math.min(1, Math.max(0, f))
      }
      if (val !== null && val !== undefined) {
        const v = Number(val); if (Number.isFinite(v)) acc.values.push(v)
      }
    },
    result: (acc) => {
      const a = acc.values
      if (!a.length) return null
      a.sort((x, y) => x - y)
      const idx = Math.min(a.length - 1, Math.ceil(acc.frac * a.length) - 1)
      return a[Math.max(0, idx)]
    },
  })

  // STRING_AGG (SQL Server / PostgreSQL style)
  try {
    db.aggregate('STRING_AGG', {
      start: () => ({ values: [], sep: ',' }),
      step: (acc, val, sep) => {
        if (sep !== undefined && sep !== null) acc.sep = String(sep)
        if (val !== null && val !== undefined) acc.values.push(String(val))
      },
      result: (acc) => acc.values.length ? acc.values.join(acc.sep) : null,
    })
  } catch {}

  db.aggregate('LISTAGG', {
    start: () => ({ values: [], sep: '' }),
    step: (acc, val, sep) => {
      if (sep !== undefined && sep !== null) acc.sep = String(sep)
      if (val !== null && val !== undefined) acc.values.push(String(val))
    },
    result: (acc) => acc.values.length ? acc.values.join(acc.sep) : null,
  })

  db.aggregate('BOOL_AND', {
    start: () => true,
    step: (acc, val) => acc && Boolean(val),
    result: (acc) => acc ? 1 : 0,
  })
  db.aggregate('BOOL_OR', {
    start: () => false,
    step: (acc, val) => acc || Boolean(val),
    result: (acc) => acc ? 1 : 0,
  })

  // ── Compatibility functions (SQL Server / MySQL names). Registered safely so a
  //    name already provided natively by this SQLite build is left untouched. ──
  const reg = (name, opts, fn) => { try { db.function(name, opts, fn) } catch {} }
  const soundexCode = (s) => {
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
  reg('DATALENGTH', { deterministic: true }, (s) => s === null || s === undefined ? null : Buffer.byteLength(String(s), 'utf8'))
  reg('DIFFERENCE', { deterministic: true }, (a, b) => {
    if (a === null || b === null) return null
    const x = soundexCode(a), y = soundexCode(b)
    let m = 0; for (let i = 0; i < 4; i++) if (x[i] === y[i]) m++
    return m
  })
  reg('QUOTENAME', { deterministic: true, varargs: true }, (...args) => {
    const s = args[0], q = args[1]
    if (s === null || s === undefined) return null
    const open = q ? String(q) : '['
    const close = open === '[' ? ']' : open
    return open + String(s) + close
  })
  reg('SUBSTRING', { deterministic: true, varargs: true }, (...args) => {
    const s = args[0], start = args[1], len = args[2]
    if (s === null || s === undefined) return null
    const str = String(s)
    const st = Number(start) || 1
    const from = st > 0 ? st - 1 : Math.max(0, str.length + st)
    return (len === undefined || len === null) ? str.slice(from) : str.substr(from, Math.max(0, Number(len) || 0))
  })
  reg('REPLICATE', { deterministic: true }, (s, n) => s === null ? null : String(s).repeat(Math.max(0, Number(n) || 0)))
  reg('ISNUMERIC', { deterministic: true }, (v) => {
    if (v === null || v === undefined) return 0
    return /^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(String(v).trim().replace(/,/g, '')) ? 1 : 0
  })
  reg('CONVERT', { deterministic: true, varargs: true }, (...args) => {
    const type = args[0], expr = args[1]
    if (expr === null || expr === undefined) return null
    const t = String(type || '').toUpperCase()
    if (/INT/.test(t)) { const n = parseInt(String(expr).replace(/,/g, ''), 10); return Number.isFinite(n) ? n : null }
    if (/DEC|NUM|FLOAT|REAL|DOUBLE/.test(t)) { const n = parseFloat(String(expr).replace(/,/g, '')); return Number.isFinite(n) ? n : null }
    if (/DATE|TIME/.test(t)) { const d = parseDateVal(expr); return d ? d.toISOString().slice(0, 10) : null }
    return String(expr)
  })
  reg('USER_NAME', { deterministic: true, varargs: true }, () => 'local_user')

  // Math functions (only added when not already provided natively by this build)
  const num = (x) => (x === null || x === undefined ? null : Number(x))
  const m1 = (name, fn) => reg(name, { deterministic: true }, (x) => { const n = num(x); return n === null || Number.isNaN(n) ? null : fn(n) })
  m1('ACOS', Math.acos); m1('ASIN', Math.asin); m1('ATAN', Math.atan)
  m1('COS', Math.cos); m1('SIN', Math.sin); m1('TAN', Math.tan)
  m1('COT', (x) => 1 / Math.tan(x)); m1('SQRT', Math.sqrt); m1('SQUARE', (x) => x * x)
  m1('CEILING', Math.ceil); m1('FLOOR', Math.floor)
  m1('DEGREES', (x) => x * 180 / Math.PI); m1('RADIANS', (x) => x * Math.PI / 180)
  reg('ATN2', { deterministic: true }, (y, x) => (y === null || x === null) ? null : Math.atan2(Number(y), Number(x)))
  reg('POWER', { deterministic: true }, (x, y) => (x === null || y === null) ? null : Math.pow(Number(x), Number(y)))
  reg('LOG', { deterministic: true, varargs: true }, (...args) => {
    const n = num(args[0]); if (n === null) return null
    const base = args[1]
    return (base === undefined || base === null) ? Math.log(n) : Math.log(n) / Math.log(Number(base))
  })
  reg('RAND', { deterministic: false, varargs: true }, () => Math.random())

  const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December']
  const DAY_NAMES = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']
  reg('DATEFROMPARTS', { deterministic: true }, (y, mo, d) => {
    if (y === null || mo === null || d === null) return null
    const dt = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d)))
    return Number.isNaN(dt.getTime()) ? null : dt.toISOString().slice(0, 10)
  })
  reg('ISDATE', { deterministic: true }, (v) => parseDateVal(v) ? 1 : 0)
  reg('DATEPART', { deterministic: true }, (part, dateVal) => {
    const d = parseDateVal(dateVal); if (!d) return null
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
  reg('DATENAME', { deterministic: true }, (part, dateVal) => {
    const d = parseDateVal(dateVal); if (!d) return null
    const p = String(part || '').toLowerCase().replace(/s$/, '')
    if (p === 'month' || p === 'mm' || p === 'm') return MONTH_NAMES[d.getUTCMonth()]
    if (p === 'weekday' || p === 'dw') return DAY_NAMES[d.getUTCDay()]
    if (p === 'year' || p === 'yy' || p === 'yyyy') return String(d.getUTCFullYear())
    if (p === 'day' || p === 'dd' || p === 'd') return String(d.getUTCDate())
    return null
  })
}

function getCacheKey(dbName, writable = false) {
  const safeName = String(dbName).replace(/[^a-z0-9_\-]/gi, '_').toLowerCase()
  return `${safeName}:${writable ? 'rw' : 'ro'}`
}

function clearCachedDb(dbName) {
  const safeName = String(dbName).replace(/[^a-z0-9_\-]/gi, '_').toLowerCase()
  for (const mode of ['ro', 'rw']) {
    const key = `${safeName}:${mode}`
    const cached = DB_CACHE.get(key)
    if (cached) {
      try { cached.close() } catch {}
      DB_CACHE.delete(key)
    }
  }
}

function getDb(dbName, options = {}) {
  const writable = options?.writable === true
  const safeName = String(dbName).replace(/[^a-z0-9_\-]/gi, '_').toLowerCase()
  const cacheKey = getCacheKey(safeName, writable)
  if (DB_CACHE.has(cacheKey)) return DB_CACHE.get(cacheKey)

  if (writable) {
    const readonlyKey = getCacheKey(safeName, false)
    const readonlyDb = DB_CACHE.get(readonlyKey)
    if (readonlyDb) {
      try { readonlyDb.close() } catch {}
      DB_CACHE.delete(readonlyKey)
    }
  }

  const filePath = path.join(DATA_DIR, `${safeName}.db`)
  if (!fs.existsSync(filePath)) return null

  const db = new Database(filePath, { readonly: !writable, fileMustExist: true })

  // Performance pragmas
  db.pragma('cache_size = -32000')   // 32 MB page cache
  db.pragma('temp_store = MEMORY')
  db.pragma('busy_timeout = 5000')
  db.pragma('foreign_keys = ON')
  registerCustomFunctions(db)

  DB_CACHE.set(cacheKey, db)
  return db
}

function listDatabases() {
  if (!fs.existsSync(DATA_DIR)) return []
  return fs.readdirSync(DATA_DIR)
    // Only real .db files — exclude backups like `mob_db.db.bak` and
    // `mob_db.db.pre_undo_backup_*` which must never be treated as databases.
    .filter(f => /\.db$/i.test(f) && !/\.(bak|pre_undo_backup[^.]*)$/i.test(f))
    .map(f => f.replace(/\.db$/i, ''))
}

function normalizeDbAlias(name = '') {
  return String(name).replace(/[^a-z0-9_\-]/gi, '_').toLowerCase()
}

function quoteSqlString(text = '') {
  return `'${String(text).replace(/'/g, "''")}'`
}

function attachAvailableDatabases(db, options = {}) {
  const activeAlias = normalizeDbAlias(options?.activeDbAlias || '')
  const available = listDatabases()
  if (!available.length) return

  // Only attach databases the query actually references (db_name.table_name).
  // Attaching every .db on every request adds latency and can blow past
  // SQLite's default attached-database limit (10). When we can't determine the
  // referenced set, fall back to attaching all (preserves prior behaviour).
  const sqlText = String(options?.sql || '')
  let referenced = null
  if (sqlText) {
    referenced = new Set()
    for (const rawName of available) {
      const alias = normalizeDbAlias(rawName)
      if (!alias || alias === activeAlias) continue
      // word-boundary match for `alias.` used as a qualifier
      const re = new RegExp('(^|[^a-z0-9_])' + alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\.', 'i')
      if (re.test(sqlText)) referenced.add(alias)
    }
  }

  let attachedAliases = new Set()
  try {
    const dbList = db.prepare('PRAGMA database_list').all()
    attachedAliases = new Set(dbList.map(row => String(row?.name || '').toLowerCase()))
  } catch {}

  for (const rawName of available) {
    const alias = normalizeDbAlias(rawName)
    if (activeAlias && alias === activeAlias) continue
    if (!alias || attachedAliases.has(alias)) continue
    if (referenced && !referenced.has(alias)) continue

    const filePath = path.join(DATA_DIR, `${alias}.db`)
    if (!fs.existsSync(filePath)) continue

    try {
      db.exec(`ATTACH DATABASE ${quoteSqlString(filePath)} AS ${escapeIdentifier(alias)}`)
      attachedAliases.add(alias)
    } catch {
      // Best-effort attach: continue so single-db queries still work.
    }
  }
}

// Rewrite SQL Server / T-SQL syntax that SQLite doesn't natively understand.
// Called per-statement (already split; no semicolons inside).
function preprocessSql(sql) {
  // SELECT TOP N  /  SELECT TOP (N)  /  SELECT TOP N PERCENT
  // → SELECT ... LIMIT N
  const topMatch = sql.match(
    /^(\s*SELECT\s+)TOP\s*\(?\s*(\d+)\s*\)?\s*(?:PERCENT\s+)?/i
  )
  if (topMatch) {
    const n = topMatch[2]
    const rest = sql.slice(topMatch[0].length)
    // Don't double-add LIMIT if the body already has one
    if (!/\bLIMIT\b/i.test(rest)) {
      return `${topMatch[1]}${rest.trimEnd()}\nLIMIT ${n}`
    }
    return `${topMatch[1]}${rest}`
  }
  return sql
}

function rewriteActiveDatabaseQualifier(statement = '', dbAlias = '') {
  const alias = normalizeDbAlias(dbAlias)
  if (!alias) return statement

  const source = String(statement)
  const lowerSource = source.toLowerCase()
  const lowerAlias = alias.toLowerCase()
  let output = ''
  let index = 0
  let inSingle = false
  let inDouble = false
  let inBacktick = false
  let inBracket = false

  const isWordChar = (char) => /[a-z0-9_]/i.test(char)

  while (index < source.length) {
    const char = source[index]

    if (!inDouble && !inBacktick && !inBracket && char === "'") {
      inSingle = !inSingle
      output += char
      index += 1
      continue
    }
    if (!inSingle && !inBacktick && !inBracket && char === '"') {
      inDouble = !inDouble
      output += char
      index += 1
      continue
    }
    if (!inSingle && !inDouble && !inBracket && char === '`') {
      inBacktick = !inBacktick
      output += char
      index += 1
      continue
    }
    if (!inSingle && !inDouble && !inBacktick && char === '[') {
      inBracket = true
      output += char
      index += 1
      continue
    }
    if (inBracket && char === ']') {
      inBracket = false
      output += char
      index += 1
      continue
    }

    if (!inSingle && !inDouble && !inBacktick && !inBracket) {
      const startsWithAlias = lowerSource.startsWith(lowerAlias, index)
      const previousChar = index > 0 ? source[index - 1] : ''
      const previousOk = !previousChar || !isWordChar(previousChar)

      if (startsWithAlias && previousOk) {
        let cursor = index + alias.length
        while (cursor < source.length && /\s/.test(source[cursor])) cursor += 1
        if (cursor < source.length && source[cursor] === '.') {
          output += `main${source.slice(index + alias.length, cursor)}.`
          index = cursor + 1
          continue
        }
      }
    }

    output += char
    index += 1
  }

  return output
}

function getTableInfo(db) {
  const tables = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
  ).all()

  return tables.map(t => {
    const cols = db.prepare(`PRAGMA table_info(${escapeIdentifier(t.name)})`).all()
    const rowCountRow = db.prepare(`SELECT COUNT(*) AS cnt FROM ${escapeIdentifier(t.name)}`).get()
    return {
      name: t.name,
      rowCount: rowCountRow?.cnt ?? 0,
      columns: cols.map(c => ({
        name: c.name,
        type: c.type || 'TEXT',
        pk: c.pk === 1,
      })),
    }
  })
}

function escapeIdentifier(id = '') {
  return '"' + String(id).replace(/"/g, '""') + '"'
}

function escapeLiteral(value) {
  if (value === null || value === undefined) return 'NULL'
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'NULL'
  if (typeof value === 'boolean') return value ? '1' : '0'
  return "'" + String(value).replace(/'/g, "''") + "'"
}

function normalizeIdentifier(token = '') {
  return String(token || '').replace(/["'`\[\]]/g, '').trim()
}

function splitIdentifierParts(token = '') {
  return normalizeIdentifier(token).split('.').filter(Boolean)
}

function normalizeTableToken(token = '') {
  const parts = splitIdentifierParts(token)
  return parts.length ? parts[parts.length - 1] : ''
}

function normalizeDeclaredType(type) {
  const text = String(type || '').trim().replace(/\s+/g, ' ')
  if (!text) return 'TEXT'
  return text.toUpperCase()
}

function toUiType(declaredType) {
  const normalized = normalizeDeclaredType(declaredType)
  if (normalized.includes('INT')) return 'INT'
  if (
    normalized.includes('REAL') ||
    normalized.includes('NUM') ||
    normalized.includes('DEC') ||
    normalized.includes('FLOAT') ||
    normalized.includes('DOUBLE')
  ) return 'NUMBER'
  if (normalized.includes('BOOL')) return 'BOOLEAN'
  if (normalized.includes('DATE') || normalized.includes('TIME')) return 'DATE'
  return 'STRING'
}

function formatDateMddyyyy(value) {
  const d = parseDateVal(value)
  if (!d) return null
  const month = d.getUTCMonth() + 1
  const day = String(d.getUTCDate()).padStart(2, '0')
  const year = d.getUTCFullYear()
  return `${month}/${day}/${year}`
}

function parseRenameTable(stmt) {
  const m = stmt.match(/^\s*(?:alter\s+table\s+([a-zA-Z0-9_"'`\.\[\]]+)\s+rename\s+(?:to\s+)?|rename\s+table\s+([a-zA-Z0-9_"'`\.\[\]]+)\s+to\s+)([a-zA-Z0-9_"'`\.\[\]]+)\s*$/i)
  if (!m) return null
  return { oldTableName: normalizeTableToken(m[1] || m[2]), newTableName: normalizeTableToken(m[3]) }
}

function parseTruncateTable(stmt) {
  const m = stmt.match(/^\s*truncate\s+(?:table\s+)?([a-zA-Z0-9_"'`\.\[\]]+)\s*$/i)
  return m ? { tableName: normalizeTableToken(m[1]) } : null
}

function parseAlterModifyColumn(stmt) {
  const m = stmt.match(/^\s*alter\s+table\s+([a-zA-Z0-9_"'`\.\[\]]+)\s+modify\s+(?:column\s+)?(?:`([^`]+)`|"([^"]+)"|'([^']+)'|\[([^\]]+)\]|([a-zA-Z_][\w$]*))\s+([a-zA-Z][\w$]*(?:\s*\([^)]*\))?)\s*$/i)
  if (!m) return null
  return { tableName: normalizeTableToken(m[1]), columnName: m[2] || m[3] || m[4] || m[5] || m[6] || null, columnType: normalizeDeclaredType(m[7]) }
}

function parseAlterColumnType(stmt) {
  const m = stmt.match(/^\s*alter\s+table\s+([a-zA-Z0-9_"'`\.\[\]]+)\s+alter\s+(?:column\s+)?(?:`([^`]+)`|"([^"]+)"|'([^']+)'|\[([^\]]+)\]|([a-zA-Z_][\w$]*))\s+(?:set\s+data\s+)?type\s+([a-zA-Z][\w$]*(?:\s*\([^)]*\))?)\s*$/i)
  if (!m) return null
  return { tableName: normalizeTableToken(m[1]), columnName: m[2] || m[3] || m[4] || m[5] || m[6] || null, columnType: normalizeDeclaredType(m[7]) }
}

function parseAlterChangeColumn(stmt) {
  const m = stmt.match(/^\s*alter\s+table\s+([a-zA-Z0-9_"'`\.\[\]]+)\s+change\s+(?:column\s+)?(?:`([^`]+)`|"([^"]+)"|'([^']+)'|\[([^\]]+)\]|([a-zA-Z_][\w$]*))\s+(?:`([^`]+)`|"([^"]+)"|'([^']+)'|\[([^\]]+)\]|([a-zA-Z_][\w$]*))\s+([a-zA-Z][\w$]*(?:\s*\([^)]*\))?)\s*$/i)
  if (!m) return null
  return { tableName: normalizeTableToken(m[1]), oldColumnName: m[2] || m[3] || m[4] || m[5] || m[6] || null, newColumnName: m[7] || m[8] || m[9] || m[10] || m[11] || null, columnType: normalizeDeclaredType(m[12]) }
}

function parseAlterRenameColumn(stmt) {
  const m = stmt.match(/^\s*alter\s+table\s+([a-zA-Z0-9_"'`\.\[\]]+)\s+rename\s+(?:column\s+)?(?:`([^`]+)`|"([^"]+)"|'([^']+)'|\[([^\]]+)\]|([a-zA-Z_][\w$]*))\s+to\s+(?:`([^`]+)`|"([^"]+)"|'([^']+)'|\[([^\]]+)\]|([a-zA-Z_][\w$]*))\s*$/i)
  if (!m) return null
  return { tableName: normalizeTableToken(m[1]), oldColumnName: m[2] || m[3] || m[4] || m[5] || m[6] || null, newColumnName: m[7] || m[8] || m[9] || m[10] || m[11] || null }
}

function parseAlterDropColumn(stmt) {
  const m = stmt.match(/^\s*alter\s+table\s+([a-zA-Z0-9_"'`\.\[\]]+)\s+drop\s+(?:column\s+)?(?:`([^`]+)`|"([^"]+)"|'([^']+)'|\[([^\]]+)\]|([a-zA-Z_][\w$]*))\s*$/i)
  if (!m) return null
  return { tableName: normalizeTableToken(m[1]), columnName: m[2] || m[3] || m[4] || m[5] || m[6] || null }
}

function getPragmaTableInfo(db, tableName) {
  return db.prepare(`PRAGMA table_info(${escapeIdentifier(tableName)})`).all()
}

function getTableArtifacts(db, tableName) {
  return db.prepare(
    "SELECT type, name, sql FROM sqlite_master WHERE tbl_name = ? AND type IN ('index','trigger') AND sql IS NOT NULL ORDER BY type, name"
  ).all(tableName)
}

function buildColumnDefinition(column) {
  let sql = `${escapeIdentifier(column.name)} ${normalizeDeclaredType(column.type || 'TEXT')}`
  if (column.notnull) sql += ' NOT NULL'
  if (column.dflt_value !== null && column.dflt_value !== undefined) sql += ` DEFAULT ${column.dflt_value}`
  if (column.pk) sql += ' PRIMARY KEY'
  return sql
}

function coerceValue(value, targetType) {
  if (value === null || value === undefined) return null
  const normalized = normalizeDeclaredType(targetType)
  if (normalized.includes('INT')) {
    const next = parseInt(String(value).replace(/,/g, ''), 10)
    return Number.isFinite(next) ? next : null
  }
  if (normalized.includes('REAL') || normalized.includes('NUM') || normalized.includes('DEC') || normalized.includes('FLOAT') || normalized.includes('DOUBLE')) {
    const next = parseFloat(String(value).replace(/,/g, ''))
    return Number.isFinite(next) ? next : null
  }
  if (normalized.includes('BOOL')) {
    if (typeof value === 'boolean') return value ? 1 : 0
    if (typeof value === 'number') return Number.isFinite(value) ? (value === 0 ? 0 : 1) : null
    const text = String(value).trim().toUpperCase()
    if (['1', 'Y', 'YES', 'TRUE', 'T'].includes(text)) return 1
    if (['0', 'N', 'NO', 'FALSE', 'F'].includes(text)) return 0
    return null
  }
  if (normalized.includes('DATE') || normalized.includes('TIME')) {
    return formatDateMddyyyy(value)
  }
  if (normalized.includes('CHAR') || normalized.includes('TEXT') || normalized.includes('STRING') || normalized.includes('VARCHAR')) {
    return String(value)
  }
  return value
}

function rebuildTable(db, tableName, newColumns, rowTransform) {
  const tableInfo = getPragmaTableInfo(db, tableName)
  if (!tableInfo.length) throw new Error(`Table not found: ${tableName}`)
  const rows = db.prepare(`SELECT * FROM ${escapeIdentifier(tableName)}`).all()
  const artifacts = getTableArtifacts(db, tableName)
  const tmpName = `__tmp_${tableName}_${Date.now()}`
  const createSql = `CREATE TABLE ${escapeIdentifier(tmpName)} (${newColumns.map(buildColumnDefinition).join(', ')})`

  const tx = db.transaction(() => {
    db.exec(createSql)
    for (const row of rows) {
      const nextRow = rowTransform ? rowTransform(row) : row
      const columnNames = newColumns.map((column) => escapeIdentifier(column.name)).join(', ')
      const values = newColumns.map((column) => escapeLiteral(nextRow?.[column.name])).join(', ')
      db.exec(`INSERT INTO ${escapeIdentifier(tmpName)} (${columnNames}) VALUES (${values})`)
    }
    db.exec(`DROP TABLE ${escapeIdentifier(tableName)}`)
    db.exec(`ALTER TABLE ${escapeIdentifier(tmpName)} RENAME TO ${escapeIdentifier(tableName)}`)
    for (const artifact of artifacts) {
      if (artifact.sql) db.exec(artifact.sql)
    }
  })

  tx()
}

function applyAlterDropColumn(db, tableName, columnName) {
  const tableInfo = getPragmaTableInfo(db, tableName)
  const target = String(columnName || '').toLowerCase()
  const newColumns = tableInfo.filter((column) => String(column.name || '').toLowerCase() !== target)
  if (newColumns.length === 0) throw new Error('Cannot drop the only column')
  rebuildTable(db, tableName, newColumns, null)
}

function applyAlterRenameColumn(db, tableName, oldName, newName) {
  const tableInfo = getPragmaTableInfo(db, tableName)
  const oldLower = String(oldName || '').toLowerCase()
  const newColumns = tableInfo.map((column) => ({
    ...column,
    name: String(column.name || '').toLowerCase() === oldLower ? newName : column.name,
  }))
  rebuildTable(db, tableName, newColumns, (row) => {
    const mapped = { ...row }
    const sourceColumn = tableInfo.find((column) => String(column.name || '').toLowerCase() === oldLower)?.name
    if (sourceColumn && sourceColumn !== newName) {
      mapped[newName] = row[sourceColumn]
      delete mapped[sourceColumn]
    }
    return mapped
  })
}

function applyAlterModifyColumn(db, tableName, columnName, columnType) {
  const tableInfo = getPragmaTableInfo(db, tableName)
  const target = String(columnName || '').toLowerCase()
  const newColumns = tableInfo.map((column) => ({
    ...column,
    type: String(column.name || '').toLowerCase() === target ? normalizeDeclaredType(columnType) : (column.type || 'TEXT'),
  }))
  rebuildTable(db, tableName, newColumns, (row) => {
    const mapped = { ...row }
    const sourceColumn = tableInfo.find((column) => String(column.name || '').toLowerCase() === target)?.name
    if (sourceColumn) mapped[sourceColumn] = coerceValue(row[sourceColumn], columnType)
    return mapped
  })
}

function applyAlterChangeColumn(db, tableName, oldName, newName, columnType) {
  const tableInfo = getPragmaTableInfo(db, tableName)
  const oldLower = String(oldName || '').toLowerCase()
  const newColumns = tableInfo.map((column) => {
    const isTarget = String(column.name || '').toLowerCase() === oldLower
    return {
      ...column,
      name: isTarget ? newName : column.name,
      type: isTarget ? normalizeDeclaredType(columnType) : (column.type || 'TEXT'),
    }
  })
  rebuildTable(db, tableName, newColumns, (row) => {
    const mapped = { ...row }
    const sourceColumn = tableInfo.find((column) => String(column.name || '').toLowerCase() === oldLower)?.name
    if (sourceColumn) {
      mapped[newName] = coerceValue(row[sourceColumn], columnType)
      if (sourceColumn !== newName) delete mapped[sourceColumn]
    }
    return mapped
  })
}

function runServerStatement(db, stmt, rowLimit) {
  const trimmed = stmt.trim()
  const upper = trimmed.toUpperCase()

  if (/^\s*show\s+(?:full\s+)?tables\b/i.test(trimmed)) {
    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    ).all()
    return { columns: ['Tables'], rows: tables.map((table) => ({ Tables: table.name })) }
  }

  const descMatch = trimmed.match(/^\s*(?:describe|desc)\s+([a-zA-Z0-9_"'`]+)\s*$/i)
  if (descMatch) {
    const tableName = descMatch[1].replace(/["'`]/g, '')
    const cols = getPragmaTableInfo(db, tableName)
    return {
      columns: ['Field', 'Type', 'Null', 'Key', 'Default'],
      rows: cols.map((column) => ({
        Field: column.name,
        Type: column.type || 'TEXT',
        Null: column.notnull ? 'NO' : 'YES',
        Key: column.pk ? 'PRI' : '',
        Default: column.dflt_value ?? 'NULL',
      })),
    }
  }

  const truncateSpec = parseTruncateTable(trimmed)
  if (truncateSpec) {
    const info = db.prepare(`DELETE FROM ${escapeIdentifier(truncateSpec.tableName)}`).run()
    return { columns: ['message', 'rowsAffected'], rows: [{ message: 'Table truncated', rowsAffected: info.changes || 0 }], rowsAffected: info.changes || 0, write: true }
  }

  const renameTableSpec = parseRenameTable(trimmed)
  if (renameTableSpec) {
    db.exec(`ALTER TABLE ${escapeIdentifier(renameTableSpec.oldTableName)} RENAME TO ${escapeIdentifier(renameTableSpec.newTableName)}`)
    return { columns: ['message'], rows: [{ message: `Table renamed to ${renameTableSpec.newTableName}` }], write: true }
  }

  const alterModify = parseAlterModifyColumn(trimmed)
  if (alterModify) {
    applyAlterModifyColumn(db, alterModify.tableName, alterModify.columnName, alterModify.columnType)
    return { columns: ['message'], rows: [{ message: `Column ${alterModify.columnName} modified to ${alterModify.columnType}` }], write: true }
  }

  const alterColumnType = parseAlterColumnType(trimmed)
  if (alterColumnType) {
    applyAlterModifyColumn(db, alterColumnType.tableName, alterColumnType.columnName, alterColumnType.columnType)
    return { columns: ['message'], rows: [{ message: `Column ${alterColumnType.columnName} modified to ${alterColumnType.columnType}` }], write: true }
  }

  const alterChange = parseAlterChangeColumn(trimmed)
  if (alterChange) {
    applyAlterChangeColumn(db, alterChange.tableName, alterChange.oldColumnName, alterChange.newColumnName, alterChange.columnType)
    return { columns: ['message'], rows: [{ message: `Column ${alterChange.oldColumnName} changed to ${alterChange.newColumnName}` }], write: true }
  }

  const alterRename = parseAlterRenameColumn(trimmed)
  if (alterRename) {
    applyAlterRenameColumn(db, alterRename.tableName, alterRename.oldColumnName, alterRename.newColumnName)
    return { columns: ['message'], rows: [{ message: `Column ${alterRename.oldColumnName} renamed to ${alterRename.newColumnName}` }], write: true }
  }

  const alterDrop = parseAlterDropColumn(trimmed)
  if (alterDrop) {
    applyAlterDropColumn(db, alterDrop.tableName, alterDrop.columnName)
    return { columns: ['message'], rows: [{ message: `Column ${alterDrop.columnName} dropped` }], write: true }
  }

  if (/^\s*(SELECT|WITH|PRAGMA|EXPLAIN)\b/i.test(upper)) {
    const prepared = db.prepare(trimmed)
    if (!prepared.reader) {
      const info = prepared.run()
      return {
        columns: ['message', 'rowsAffected'],
        rows: [{ message: 'Statement executed', rowsAffected: info.changes || 0 }],
        rowsAffected: info.changes || 0,
        write: true,
      }
    }
    // Stream rows instead of materialising the whole result set — a SELECT *
    // on a multi-GB table would otherwise load every row into memory at once.
    // We fetch up to rowLimit+1: the extra row tells us the result was capped
    // without having to scan (or count) the entire table.
    const limited = []
    let wasLimited = false
    for (const row of prepared.iterate()) {
      if (limited.length >= rowLimit) { wasLimited = true; break }
      limited.push(row)
    }
    const columns = limited.length > 0 ? Object.keys(limited[0]) : []
    const metadata = prepared.columns ? prepared.columns() : []
    const columnTypes = {}
    for (const meta of metadata) {
      const name = String(meta?.name || '')
      if (!name) continue
      columnTypes[name] = toUiType(meta?.type || '')
    }
    return {
      columns,
      rows: limited,
      columnTypes,
      // When capped we don't know the exact total without a full scan; report
      // the rows returned so the UI can show "showing first N (more available)".
      totalRows: limited.length,
      limited: wasLimited,
      isEmpty: limited.length === 0,
    }
  }

  if (/^\s*(INSERT|UPDATE|DELETE|REPLACE)\b/i.test(upper)) {
    const info = db.prepare(trimmed).run()
    return { columns: ['message', 'rowsAffected'], rows: [{ message: 'Statement executed', rowsAffected: info.changes || 0 }], rowsAffected: info.changes || 0, write: true }
  }

  if (/^\s*(BEGIN|COMMIT|ROLLBACK)\b/i.test(upper)) {
    db.exec(trimmed)
    return { columns: ['message'], rows: [{ message: `${upper.split(/\s+/)[0]} OK` }], write: true }
  }

  db.exec(trimmed)
  return { columns: ['message'], rows: [{ message: 'Statement executed successfully' }], write: true }
}

// GET: return metadata (table list + columns) for a DB — no data transfer
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)
    const dbParam = searchParams.get('db')

    // List all available DBs with table counts
    if (!dbParam) {
      const names = listDatabases()
      const summary = names.map(name => {
        try {
          const db = getDb(name)
          if (!db) return { name, tableCount: 0, available: false }
          const count = db.prepare(
            "SELECT COUNT(*) AS cnt FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
          ).get()
          return { name, tableCount: count?.cnt ?? 0, available: true }
        } catch {
          return { name, tableCount: 0, available: false }
        }
      })
      return NextResponse.json({ databases: summary })
    }

    const db = getDb(dbParam)
    if (!db) return NextResponse.json({ error: 'Database not found: ' + dbParam }, { status: 404 })

    const tables = getTableInfo(db)
    return NextResponse.json({ db: dbParam, tables, tableCount: tables.length })
  } catch (err) {
    return NextResponse.json({ error: String(err?.message || err) }, { status: 500 })
  }
}

// POST: execute SQL on server, return rows (no full DB download)
export async function POST(request) {
  try {
    const body = await request.json()
    const dbName = String(body?.db || '').trim()
    const sql = String(body?.sql || '').trim()
    const limitEnabled = body?.limitEnabled !== false
    // Matches the "Limit 100" UI toggle and the browser-side PREVIEW_ROW_LIMIT.
    const rowLimit = limitEnabled ? (Number(body?.rowLimit) || 100) : 100000

    if (!dbName) return NextResponse.json({ error: 'db name required' }, { status: 400 })
    if (!sql) return NextResponse.json({ error: 'sql required' }, { status: 400 })

    const stmts = splitStatements(sql)
    const requiresWrite = stmts.some((stmt) => isLikelyWriteStatement(stmt))

    const db = getDb(dbName, { writable: requiresWrite })
    if (!db) return NextResponse.json({ error: 'Database not found: ' + dbName }, { status: 404 })

    // Enable cross-database SQL (db_name.table_name) in a single run.
    attachAvailableDatabases(db, { writable: requiresWrite, activeDbAlias: dbName, sql })

    const startMs = Date.now()
    const resultSets = []
    let totalRowsAffected = 0
    let writeOccurred = false

    for (const stmt of stmts) {
      const trimmed = stmt.trim()
      if (!trimmed) continue
      try {
        const preprocessed = preprocessSql(trimmed)
        const rewritten = rewriteActiveDatabaseQualifier(preprocessed, dbName)
        const result = runServerStatement(db, rewritten, rowLimit)
        totalRowsAffected += Number(result.rowsAffected || 0)
        if (result.write) writeOccurred = true
        resultSets.push({
          columns: result.columns || [],
          rows: result.rows || [],
          columnTypes: result.columnTypes || {},
          totalRows: result.totalRows,
          limited: result.limited,
          isEmpty: result.isEmpty || false,
          stmt: rewritten.substring(0, 80),
        })
      } catch (stmtErr) {
        resultSets.push({
          columns: ['error'],
          rows: [{ error: String(stmtErr?.message || stmtErr) }],
          stmt: trimmed.substring(0, 80),
          isError: true,
        })
      }
    }

    if (writeOccurred) clearCachedDb(dbName)

    const elapsed = ((Date.now() - startMs) / 1000).toFixed(3)
    return NextResponse.json({
      success: true,
      resultSets,
      rowsAffected: totalRowsAffected,
      statementCount: stmts.filter(s => s.trim()).length,
      elapsed,
      serverSide: true,
    })
  } catch (err) {
    return NextResponse.json({ error: String(err?.message || err) }, { status: 500 })
  }
}

function splitStatements(sql) {
  const stmts = []
  let cur = ''
  let inSingle = false
  let inDouble = false
  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i]
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

function isLikelyWriteStatement(stmt = '') {
  const sql = String(stmt || '').trim()
  if (!sql) return false
  if (/^\s*(CREATE|DROP|ALTER|INSERT|UPDATE|DELETE|TRUNCATE|REPLACE|BEGIN|COMMIT|ROLLBACK)\b/i.test(sql)) {
    return true
  }
  if (/^\s*WITH\b/i.test(sql) && /\b(INSERT|UPDATE|DELETE|REPLACE)\b/i.test(sql)) {
    return true
  }
  return false
}
