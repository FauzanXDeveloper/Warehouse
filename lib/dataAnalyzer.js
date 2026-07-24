/**
 * Data Analysis Engine
 * Analyzes SQL queries and result data for insights
 */

// ── SQL Query Analyzer ────────────────────────────────────────────────────────
export function analyzeSQLQuery(sql) {
  if (!sql || typeof sql !== 'string') return null

  const upper = sql.toUpperCase().trim()
  const normalized = upper.replace(/\s+/g, ' ')

  // Detect query type
  let type = 'SELECT'
  if (normalized.startsWith('INSERT')) type = 'INSERT'
  else if (normalized.startsWith('UPDATE')) type = 'UPDATE'
  else if (normalized.startsWith('DELETE')) type = 'DELETE'
  else if (normalized.startsWith('CREATE')) type = 'CREATE'

  // Extract table names
  const tableMatch = normalized.match(/FROM\s+(\w+)|JOIN\s+(\w+)|INTO\s+(\w+)|UPDATE\s+(\w+)|CREATE\s+TABLE\s+(\w+)/gi)
  const tables = tableMatch ? tableMatch.map(m => m.replace(/^(FROM|JOIN|INTO|UPDATE|CREATE\s+TABLE)\s+/i, '').trim()).filter(Boolean) : []

  // Extract columns (simplified)
  const selectMatch = normalized.match(/SELECT\s+(.*?)\s+FROM/i)
  const selectClause = selectMatch ? selectMatch[1] : ''
  const columns = selectClause
    .split(',')
    .map(c => c.trim())
    .filter(c => c && c !== '*' && !c.includes('('))
    .map(c => c.split(/\s+/).pop())
    .slice(0, 10)

  // Detect clauses
  const hasWhere = /\sWHERE\s/i.test(normalized)
  const hasGroupBy = /\sGROUP\s+BY\s/i.test(normalized)
  const hasOrderBy = /\sORDER\s+BY\s/i.test(normalized)
  const hasJoin = /\sJOIN\s/i.test(normalized)
  const hasUnion = /\sUNION\s/i.test(normalized)
  const hasSubquery = (normalized.match(/SELECT/gi) || []).length > 1
  const hasAgg = /\b(COUNT|SUM|AVG|MAX|MIN|STDDEV)\s*\(/i.test(normalized)
  const hasLimit = /\sLIMIT\s+(\d+)/i.test(normalized)
  const limitMatch = normalized.match(/\sLIMIT\s+(\d+)/i)
  const limit = limitMatch ? parseInt(limitMatch[1]) : null

  // Where clause analysis
  const whereMatch = normalized.match(/WHERE\s+(.*?)(?:\sGROUP\s+BY|\sORDER\s+BY|\sLIMIT|\s*$)/i)
  const whereClause = whereMatch ? whereMatch[1] : ''

  return {
    type,
    tables,
    columns,
    clauses: {
      where: hasWhere,
      groupBy: hasGroupBy,
      orderBy: hasOrderBy,
      join: hasJoin,
      union: hasUnion,
      subquery: hasSubquery,
      aggregation: hasAgg,
      limit,
    },
    description: generateQueryDescription({
      type,
      tables,
      hasWhere,
      hasGroupBy,
      hasOrderBy,
      hasJoin,
      hasAgg,
      limit,
    }),
  }
}

function generateQueryDescription(props) {
  const { type, tables, hasWhere, hasGroupBy, hasOrderBy, hasJoin, hasAgg, limit } = props

  let desc = `${type} query`

  if (tables.length > 0) {
    desc += ` from ${tables.join(', ')}`
  }

  const parts = []
  if (hasWhere) parts.push('filtered')
  if (hasJoin) parts.push('joined')
  if (hasGroupBy) parts.push('grouped')
  if (hasAgg) parts.push('aggregated')
  if (hasOrderBy) parts.push('sorted')
  if (limit) parts.push(`limited to ${limit} rows`)

  if (parts.length > 0) {
    desc += ' — ' + parts.join(', ')
  }

  return desc
}

// ── Data Statistics ────────────────────────────────────────────────────────
export function analyzeDataset(columns, rows) {
  if (!rows || rows.length === 0) {
    return {
      rowCount: 0,
      columnCount: 0,
      columns: [],
      stats: [],
    }
  }

  const stats = columns.map(col => analyzeColumn(col, rows))

  return {
    rowCount: rows.length,
    columnCount: columns.length,
    columns: columns,
    stats: stats,
    summary: generateDataSummary(stats, rows.length),
  }
}

// Broad date-shape detection (mirrors looksLikeDateString in lib/queryEngine.js).
function looksLikeDateStr(value) {
  const s = String(value).trim()
  if (!s) return false
  if (/^\d{4}[-/]\d{1,2}[-/]\d{1,2}(?:[ T]\d{1,2}:\d{2}(?::\d{2})?)?$/.test(s)) return true
  if (/^\d{1,2}[/-]\d{1,2}[/-]\d{2}(?:\d{2})?$/.test(s)) return true
  if (/^\d{1,2}[-/ ][A-Za-z]{3,9}[-/ ]\d{2}(?:\d{2})?$/.test(s)) return true
  return false
}

// Determines the dominant kind of a set of non-null values with 80% tolerance,
// so a few stray values don't misclassify a column.
function detectKind(values) {
  let dates = 0, nums = 0, bools = 0
  const sample = values.slice(0, 500)
  for (const v of sample) {
    if (typeof v === 'boolean') { bools += 1; continue }
    if (typeof v === 'number') { nums += 1; continue }
    const s = String(v).trim()
    if (looksLikeDateStr(s)) { dates += 1; continue }
    if (/^[-+]?\d+(?:,\d{3})*(?:\.\d+)?$/.test(s) || /^[-+]?\.\d+$/.test(s)) { nums += 1; continue }
  }
  const n = sample.length || 1
  if (dates / n >= 0.8) return 'date'
  if (bools / n >= 0.8) return 'boolean'
  if (nums / n >= 0.8) return 'numeric'
  return 'string'
}

function analyzeColumn(colName, rows) {
  const values = rows.map(r => r[colName]).filter(v => v !== null && v !== undefined && v !== '')

  if (values.length === 0) {
    return { name: colName, type: 'empty', nullCount: rows.length, distinct: 0, completeness: 0 }
  }

  const kind = detectKind(values)
  let result
  if (kind === 'numeric') result = analyzeNumericColumn(colName, values, rows.length)
  else if (kind === 'date') result = analyzeDateColumn(colName, values, rows.length)
  else if (kind === 'boolean') result = analyzeBooleanColumn(colName, values, rows.length)
  else result = analyzeStringColumn(colName, values, rows.length)

  result.completeness = Number(((values.length / rows.length) * 100).toFixed(1))
  return result
}

function percentile(sorted, p) {
  if (sorted.length === 0) return null
  const idx = (sorted.length - 1) * p
  const lo = Math.floor(idx), hi = Math.ceil(idx)
  if (lo === hi) return sorted[lo]
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo)
}

function analyzeNumericColumn(name, values, totalRows) {
  const nums = values.map(v => Number(String(v).replace(/,/g, ''))).filter(n => !isNaN(n))
  const sorted = [...nums].sort((a, b) => a - b)
  const sum = nums.reduce((a, b) => a + b, 0)
  const avg = sum / nums.length
  const variance = nums.reduce((a, b) => a + (b - avg) ** 2, 0) / nums.length
  const median = sorted.length % 2 === 0
    ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
    : sorted[Math.floor(sorted.length / 2)]

  return {
    name,
    type: 'numeric',
    count: nums.length,
    nullCount: totalRows - nums.length,
    distinct: new Set(nums).size,
    min: Math.min(...nums),
    max: Math.max(...nums),
    avg,
    median,
    sum,
    stddev: Math.sqrt(variance),
    p25: percentile(sorted, 0.25),
    p75: percentile(sorted, 0.75),
    zeros: nums.filter(n => n === 0).length,
    negatives: nums.filter(n => n < 0).length,
  }
}

function analyzeDateColumn(name, values, totalRows) {
  const dates = values.map(v => new Date(v)).filter(d => !isNaN(d.getTime()))

  return {
    name,
    type: 'date',
    count: dates.length,
    nullCount: totalRows - dates.length,
    distinct: new Set(values).size,
    earliest: dates.length > 0 ? new Date(Math.min(...dates.map(d => d.getTime()))).toISOString().split('T')[0] : null,
    latest: dates.length > 0 ? new Date(Math.max(...dates.map(d => d.getTime()))).toISOString().split('T')[0] : null,
  }
}

function analyzeStringColumn(name, values, totalRows) {
  const distinct = new Set(values).size
  const lengths = values.map(v => String(v).length)
  const avgLen = lengths.reduce((a, l) => a + l, 0) / values.length

  // Top 3 values
  const freq = {}
  values.forEach(v => { freq[v] = (freq[v] || 0) + 1 })
  const top3 = Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([v, c]) => ({ value: v, count: c }))

  return {
    name,
    type: 'string',
    count: values.length,
    nullCount: totalRows - values.length,
    distinct,
    avgLength: Math.round(avgLen),
    minLength: Math.min(...lengths),
    maxLength: Math.max(...lengths),
    top3,
  }
}

function analyzeBooleanColumn(name, values, totalRows) {
  const trueCount = values.filter(v => v === true || v === 1 || String(v).toLowerCase() === 'true').length
  const falseCount = values.filter(v => v === false || v === 0 || String(v).toLowerCase() === 'false').length

  return {
    name,
    type: 'boolean',
    count: values.length,
    nullCount: totalRows - values.length,
    distinct: 2,
    trueCount,
    falseCount,
    truePercent: ((trueCount / values.length) * 100).toFixed(1),
  }
}

function generateDataSummary(stats, rowCount) {
  const numericCols = stats.filter(s => s.type === 'numeric')
  const stringCols = stats.filter(s => s.type === 'string')
  const dateCols = stats.filter(s => s.type === 'date')
  const boolCols = stats.filter(s => s.type === 'boolean')

  // Overall completeness = average non-null percentage across columns.
  const completenessValues = stats.map(s => typeof s.completeness === 'number' ? s.completeness : (s.type === 'empty' ? 0 : 100))
  const avgCompleteness = completenessValues.length
    ? completenessValues.reduce((a, b) => a + b, 0) / completenessValues.length
    : 100
  const emptyCols = stats.filter(s => s.type === 'empty').length
  // Quality score penalises missing data and fully-empty columns.
  const qualityScore = Math.max(0, Math.round(avgCompleteness - emptyCols * 5))

  const summary = {
    totalRows: rowCount,
    totalColumns: stats.length,
    columnTypes: {
      numeric: numericCols.length,
      string: stringCols.length,
      date: dateCols.length,
      boolean: boolCols.length,
      other: stats.filter(s => !['numeric', 'string', 'date', 'boolean', 'empty'].includes(s.type)).length,
    },
    highestDistinctColumn: stats.reduce((a, b) => (a.distinct || 0) > (b.distinct || 0) ? a : b, {}),
    nullyColumns: stats.filter(s => s.nullCount > 0),
    avgCompleteness: Number(avgCompleteness.toFixed(1)),
    qualityScore,
    emptyColumns: emptyCols,
  }

  return summary
}

// ── Insights Generation ────────────────────────────────────────────────────
export function generateInsights(sqlAnalysis, dataAnalysis) {
  const insights = []

  if (!dataAnalysis || dataAnalysis.rowCount === 0) {
    insights.push({ type: 'warning', text: 'No data returned' })
    return insights
  }

  // Data size insights
  if (dataAnalysis.rowCount > 10000) {
    insights.push({ type: 'info', text: `Large result set: ${dataAnalysis.rowCount.toLocaleString()} rows` })
  }

  // Aggregation insights
  if (sqlAnalysis?.clauses?.aggregation && dataAnalysis.rowCount < 20) {
    insights.push({ type: 'info', text: `Aggregation returned ${dataAnalysis.rowCount} group(s)` })
  }

  // Overall data-quality score
  if (typeof dataAnalysis.summary?.qualityScore === 'number') {
    const q = dataAnalysis.summary.qualityScore
    insights.push({ type: q >= 90 ? 'info' : 'warning', text: `Data quality score: ${q}/100 (avg completeness ${dataAnalysis.summary.avgCompleteness}%)` })
  }

  // Empty columns
  if (dataAnalysis.summary?.emptyColumns > 0) {
    insights.push({ type: 'warning', text: `${dataAnalysis.summary.emptyColumns} column(s) are entirely empty` })
  }

  // Null insights (report the worst offenders with percentages)
  const nullyCount = dataAnalysis.summary?.nullyColumns?.length || 0
  if (nullyCount > 0) {
    const worst = [...dataAnalysis.summary.nullyColumns]
      .sort((a, b) => (b.nullCount || 0) - (a.nullCount || 0))
      .slice(0, 4)
      .map(c => `${c.name} (${((c.nullCount / dataAnalysis.rowCount) * 100).toFixed(0)}%)`)
    insights.push({ type: 'warning', text: `${nullyCount} column(s) have NULL values: ${worst.join(', ')}${nullyCount > 4 ? '…' : ''}` })
  }

  // Numeric distribution + outlier hints
  const numCols = dataAnalysis.stats?.filter(s => s.type === 'numeric') || []
  numCols.forEach(col => {
    if (col.max - col.min > 0) {
      insights.push({ type: 'info', text: `${col.name}: range ${col.min.toLocaleString()} → ${col.max.toLocaleString()} (avg ${Number(col.avg).toLocaleString(undefined, { maximumFractionDigits: 2 })}, σ ${Number(col.stddev).toLocaleString(undefined, { maximumFractionDigits: 2 })})` })
      // Outlier hint: max/min lie far beyond ±3σ from the mean.
      if (col.stddev > 0 && (col.max > col.avg + 3 * col.stddev || col.min < col.avg - 3 * col.stddev)) {
        insights.push({ type: 'warning', text: `${col.name}: possible outliers — values exceed ±3σ from the mean` })
      }
    } else {
      insights.push({ type: 'info', text: `${col.name}: constant value (${col.min.toLocaleString()})` })
    }
  })

  // High cardinality strings
  const strCols = dataAnalysis.stats?.filter(s => s.type === 'string') || []
  strCols.forEach(col => {
    if (col.distinct > dataAnalysis.rowCount * 0.9) {
      insights.push({ type: 'info', text: `${col.name}: likely unique identifier (${col.distinct} distinct values)` })
    } else if (col.top3?.length > 0) {
      const topVal = col.top3[0].value
      const pct = ((col.top3[0].count / dataAnalysis.rowCount) * 100).toFixed(0)
      insights.push({ type: 'info', text: `${col.name}: top value is "${topVal}" (${pct}% of rows)` })
    }
  })

  // Date insights
  const dateCols = dataAnalysis.stats?.filter(s => s.type === 'date') || []
  dateCols.forEach(col => {
    if (col.earliest && col.latest) {
      insights.push({ type: 'info', text: `${col.name}: spans ${col.earliest} to ${col.latest}` })
    }
  })

  return insights
}
