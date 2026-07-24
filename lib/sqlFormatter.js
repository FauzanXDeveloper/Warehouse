// RCR SQL Formatter — formats SQL for readability

const KEYWORDS = [
  'SELECT','DISTINCT','TOP','FROM','WHERE','AND','OR','NOT','IN','EXISTS',
  'BETWEEN','LIKE','ILIKE','AS','ON','USING','SET','INTO','VALUES','OVER',
  'PARTITION BY','GROUP BY','ORDER BY','HAVING','LIMIT','OFFSET',
  'UNION ALL','UNION','INTERSECT','EXCEPT','WITH','RECURSIVE',
  'CASE','WHEN','THEN','ELSE','END',
  'LEFT OUTER JOIN','RIGHT OUTER JOIN','FULL OUTER JOIN',
  'INNER JOIN','CROSS JOIN','LEFT JOIN','RIGHT JOIN','FULL JOIN','JOIN',
  'INSERT INTO','INSERT','UPDATE','DELETE FROM','DELETE',
  'CREATE TABLE','CREATE VIEW','CREATE OR REPLACE VIEW','CREATE OR REPLACE',
  'DROP TABLE','DROP VIEW','DROP','ALTER TABLE','ALTER',
  'COUNT','SUM','AVG','MIN','MAX','COALESCE','NULLIF','CAST','CONVERT',
  'ROW_NUMBER','RANK','DENSE_RANK','LAG','LEAD','FIRST_VALUE','LAST_VALUE',
  'CURRENT_DATE','CURRENT_TIMESTAMP','GETDATE','NOW',
  'NULL','TRUE','FALSE','ASC','DESC','ALL','ANY','SOME','IS NULL','IS NOT NULL',
  'PRIMARY KEY','FOREIGN KEY','REFERENCES','INDEX','UNIQUE','NOT NULL',
  'DEFAULT','AUTO_INCREMENT','SERIAL','IDENTITY',
]

const NEWLINE_BEFORE = [
  'SELECT','FROM','WHERE',
  'LEFT OUTER JOIN','RIGHT OUTER JOIN','FULL OUTER JOIN',
  'INNER JOIN','CROSS JOIN','LEFT JOIN','RIGHT JOIN','FULL JOIN','JOIN',
  'GROUP BY','ORDER BY','HAVING','LIMIT','OFFSET',
  'UNION ALL','UNION','INTERSECT','EXCEPT','WITH',
  'INSERT INTO','UPDATE','DELETE FROM','SET','VALUES',
]

// Split a comma-separated list respecting nested parentheses
function splitTopLevelCommas(str) {
  const parts = []
  let depth = 0, current = ''
  for (let i = 0; i < str.length; i++) {
    const c = str[i]
    if (c === '(') depth++
    else if (c === ')') depth--
    else if (c === ',' && depth === 0) {
      parts.push(current.trim())
      current = ''
      continue
    }
    current += c
  }
  if (current.trim()) parts.push(current.trim())
  return parts
}

export function formatSQL(sql) {
  if (!sql || !sql.trim()) return sql

  // Handle multiple statements (split on ; then rejoin)
  const stmts = sql.split(';').map(s => s.trim()).filter(Boolean)
  if (stmts.length > 1) {
    return stmts.map(s => formatSQL(s)).join(';\n\n') + ';'
  }

  // Extract and preserve comments
  const commentMap = {}
  let s = sql.replace(/--[^\n]*/g, (m) => {
    const key = `__CMT${Object.keys(commentMap).length}__`
    commentMap[key] = m
    return key
  })

  // Normalize whitespace (collapse all whitespace to single space)
  s = s.replace(/[ \t\r\n]+/g, ' ').trim()

  // Capitalize multi-word keywords first (longest first), then single-word
  const sortedKw = [...KEYWORDS].sort((a, b) => b.split(' ').length - a.split(' ').length || b.length - a.length)
  sortedKw.forEach(kw => {
    const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s+')
    s = s.replace(new RegExp(`\\b(${escaped})\\b`, 'gi'), kw)
  })

  // Insert newlines before major clauses
  const sortedNL = [...NEWLINE_BEFORE].sort((a, b) => b.split(' ').length - a.split(' ').length || b.length - a.length)
  sortedNL.forEach(clause => {
    const escaped = clause.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s+')
    s = s.replace(new RegExp(`\\s+(${escaped})\\s+`, 'g'), `\n$1 `)
    s = s.replace(new RegExp(`^(${escaped})\\s+`, 'g'), `$1 `)
  })

  // Split into lines and handle indentation
  const lines = s.split('\n')
  const result = []

  lines.forEach(line => {
    const trimmed = line.trim()
    if (!trimmed) return

    const upper = trimmed.toUpperCase()
    const isMajorClause = NEWLINE_BEFORE.some(c => upper.startsWith(c))

    if (isMajorClause) {
      // Expand SELECT columns with continuation indent
      const selectMatch = trimmed.match(/^(SELECT(?:\s+DISTINCT)?(?:\s+TOP\s+\d+)?\s+)(.+)$/i)
      if (selectMatch) {
        const kw = selectMatch[1]           // e.g. "SELECT " or "SELECT DISTINCT "
        const rest = selectMatch[2]
        const cols = splitTopLevelCommas(rest)
        if (cols.length > 1) {
          const indent = ' '.repeat(kw.length)
          cols.forEach((col, i) => {
            result.push((i === 0 ? kw : indent) + col + (i < cols.length - 1 ? ',' : ''))
          })
          return
        }
      }
      result.push(trimmed)
    } else {
      result.push('       ' + trimmed)
    }
  })

  let formatted = result.join('\n')

  // Restore comments
  Object.entries(commentMap).forEach(([key, val]) => {
    formatted = formatted.replace(key, val)
  })

  // Add semicolon if missing
  if (formatted.trim() && !formatted.trim().endsWith(';')) {
    formatted = formatted.trim() + ';'
  }

  return formatted
}
