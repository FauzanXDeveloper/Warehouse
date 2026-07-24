'use client'

import { useState, useEffect } from 'react'
import { executeQuery } from '@/lib/queryEngine'

const OP_COLORS = ['#1f6feb', '#3fb950', '#ff9900', '#f85149', '#d2a8ff', '#ffa657']

// ── Honest structural analysis derived from the SQL text ──────────────────────
function analyzeStructure(sql) {
  const upper = sql.toUpperCase()
  const ops = []
  const add = (label, present, weight) => { if (present) ops.push({ label, weight }) }
  add('WHERE filter', /\bWHERE\b/.test(upper), 1)
  add('JOIN', /\bJOIN\b/.test(upper), 3)
  add('GROUP BY', /\bGROUP\s+BY\b/.test(upper), 2)
  add('HAVING', /\bHAVING\b/.test(upper), 2)
  add('ORDER BY', /\bORDER\s+BY\b/.test(upper), 2)
  add('DISTINCT', /\bDISTINCT\b/.test(upper), 1)
  add('UNION', /\bUNION\b/.test(upper), 2)
  add('Aggregation', /\b(COUNT|SUM|AVG|MAX|MIN|STDDEV|GROUP_CONCAT)\s*\(/.test(upper), 2)
  add('Window function', /\bOVER\s*\(/.test(upper), 3)
  add('LIMIT', /\bLIMIT\b/.test(upper), 0)
  const subqueries = Math.max(0, (upper.match(/\bSELECT\b/g) || []).length - 1)
  add(`Subquery ×${subqueries}`, subqueries > 0, 3 * subqueries)
  add('CTE (WITH)', /\bWITH\b/.test(upper), 2)

  const score = ops.reduce((a, o) => a + o.weight, 0)
  const complexity = score >= 10 ? 'High' : score >= 5 ? 'Moderate' : score >= 1 ? 'Low' : 'Trivial'
  return { ops, score, complexity, subqueries }
}

// Build a script that runs SQLite's real EXPLAIN QUERY PLAN on the main
// SELECT/WITH statement while preserving any leading USE <db> statements.
function buildExplainScript(sql) {
  const stmts = String(sql || '').split(';').map(s => s.trim()).filter(Boolean)
  let targetIdx = -1
  stmts.forEach((s, i) => { if (/^(SELECT|WITH)\b/i.test(s)) targetIdx = i })
  if (targetIdx < 0) return null
  const out = []
  stmts.forEach((s, i) => {
    if (/^USE\b/i.test(s)) out.push(s)
    else if (i === targetIdx) out.push('EXPLAIN QUERY PLAN ' + s)
  })
  return out.join(';\n') + ';'
}

// Compute indent depth for each plan row from its parent chain.
function withDepth(rows) {
  const byId = {}
  rows.forEach(r => { byId[r.id] = r })
  return rows.map(r => {
    let depth = 0, cur = r
    const guard = new Set()
    while (cur && Number(cur.parent) > 0 && byId[cur.parent] && !guard.has(cur.id)) {
      guard.add(cur.id); depth += 1; cur = byId[cur.parent]
    }
    return { ...r, depth }
  })
}

export default function ExplainPanel({ sql, visible }) {
  const [planRows, setPlanRows] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    if (!visible || !sql || !sql.trim()) { setPlanRows(null); setError(null); return }
    const script = buildExplainScript(sql)
    if (!script) { setPlanRows(null); setError('EXPLAIN is only available for SELECT / WITH queries.'); return }

    setLoading(true); setError(null)
    executeQuery(script, { limitEnabled: false }).then(res => {
      if (cancelled) return
      if (!res.success) { setError(res.error || 'Could not produce a query plan.'); setPlanRows(null); return }
      const planSet = (res.resultSets || []).find(rs => rs.columns?.some(c => String(c).toLowerCase() === 'detail'))
      if (!planSet) { setError('No query plan was returned.'); setPlanRows(null); return }
      const key = planSet.columns.find(c => String(c).toLowerCase() === 'detail')
      const idKey = planSet.columns.find(c => String(c).toLowerCase() === 'id')
      const parentKey = planSet.columns.find(c => String(c).toLowerCase() === 'parent')
      const rows = (planSet.rows || []).map((r, i) => ({
        id: idKey ? r[idKey] : i,
        parent: parentKey ? r[parentKey] : 0,
        detail: String(r[key] ?? ''),
      }))
      setPlanRows(withDepth(rows))
    }).catch(e => { if (!cancelled) { setError(String(e)); setPlanRows(null) } })
      .finally(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
  }, [sql, visible])

  if (!visible || !sql) return null
  const structure = analyzeStructure(sql)

  return (
    <div style={{ display: 'flex', height: '100%', background: 'var(--bg-primary)', overflow: 'hidden' }}>
      {/* Left: real query plan */}
      <div style={{ flex: 1, overflow: 'auto', padding: '12px 16px', borderRight: '1px solid var(--border)', minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 10 }}>
          Query Plan <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>· SQLite EXPLAIN QUERY PLAN (real)</span>
        </div>

        {loading && <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '8px 0' }}>Analyzing query plan…</div>}
        {error && !loading && (
          <div style={{ fontSize: 12, color: '#e8bf6a', padding: '10px 12px', background: 'rgba(232,191,106,0.08)', borderRadius: 6, border: '1px solid rgba(232,191,106,0.25)' }}>{error}</div>
        )}

        {!loading && !error && planRows && planRows.length > 0 && (
          <div>
            {planRows.map((r, i) => {
              const isScan = /SCAN\b/i.test(r.detail) && !/USING (INDEX|COVERING)/i.test(r.detail)
              const usesIndex = /USING (INDEX|COVERING INDEX|AUTOMATIC)/i.test(r.detail)
              const col = usesIndex ? '#3fb950' : isScan ? '#e8bf6a' : OP_COLORS[i % OP_COLORS.length]
              return (
                <div key={i} style={{ marginBottom: 6, marginLeft: r.depth * 18, padding: '8px 12px', background: 'var(--bg-secondary)', borderRadius: 6, border: '1px solid var(--border)', borderLeft: `3px solid ${col}` }}>
                  <div style={{ fontSize: 11, color: 'var(--text-primary)', fontFamily: 'monospace', lineHeight: 1.5 }}>
                    {r.depth > 0 && <span style={{ color: 'var(--text-muted)' }}>{'└─ '}</span>}{r.detail}
                  </div>
                  {isScan && <div style={{ fontSize: 10, color: '#e8bf6a', marginTop: 3 }}>Full table scan — consider an index if this table is large.</div>}
                  {usesIndex && <div style={{ fontSize: 10, color: '#3fb950', marginTop: 3 }}>Uses an index — efficient lookup.</div>}
                </div>
              )
            })}
          </div>
        )}
        {!loading && !error && planRows && planRows.length === 0 && (
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Query plan is empty (trivial query).</div>
        )}
      </div>

      {/* Right: structural analysis */}
      <div style={{ width: 320, overflow: 'auto', padding: '12px 14px', flexShrink: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 10 }}>Query Structure</div>

        <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
          <div style={{ flex: 1, background: 'var(--bg-secondary)', borderRadius: 6, padding: '8px 12px', border: '1px solid var(--border)' }}>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>Complexity</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: structure.complexity === 'High' ? '#f85149' : structure.complexity === 'Moderate' ? '#e8bf6a' : '#3fb950' }}>{structure.complexity}</div>
          </div>
          <div style={{ flex: 1, background: 'var(--bg-secondary)', borderRadius: 6, padding: '8px 12px', border: '1px solid var(--border)' }}>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>Cost weight</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#79c0ff' }}>{structure.score}</div>
          </div>
        </div>

        <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 8 }}>Operations detected</div>
        {structure.ops.length === 0 ? (
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>No complex operations — simple query.</div>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {structure.ops.map((o, i) => (
              <span key={i} style={{ fontSize: 10, padding: '3px 8px', borderRadius: 3, background: 'rgba(31,111,235,0.12)', color: '#79c0ff', border: '1px solid rgba(31,111,235,0.3)' }}>{o.label}</span>
            ))}
          </div>
        )}

        <div style={{ marginTop: 16, fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.6 }}>
          The plan on the left is produced by the real SQLite planner. Green rows use an index; amber rows are full table scans.
        </div>
      </div>
    </div>
  )
}
