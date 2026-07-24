'use client'
import { useState, useEffect } from 'react'
import { getHistory, clearHistory, deleteHistoryItem } from '@/lib/appStore'

export default function HistoryPanel({ onOpenQuery, width }) {
  const [history, setHistory] = useState([])
  const [schedulerHistory, setSchedulerHistory] = useState([])
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')

  const reload = () => setHistory(getHistory())
  const reloadSchedulerHistory = async () => {
    try {
      const res = await fetch('/api/scheduler/jobs', { cache: 'no-store' })
      const data = await res.json()
      if (!res.ok || !data?.ok || !Array.isArray(data.jobs)) return

      const events = []
      data.jobs.forEach(job => {
        if (job.lastSuccessAt || (job.lastRun && job.lastRun !== 'Never' && !job.lastError)) {
          const at = job.lastSuccessAt || null
          const order = at ? Date.parse(at) : Number(job.id) || 0
          events.push({
            id: `sched-success-${job.id}-${at || job.lastRun}`,
            ts: at ? new Date(at).toLocaleString() : (job.lastRun || 'Unknown time'),
            success: true,
            rows: 0,
            elapsed: '-',
            sql: job.sql || `Scheduled Query: ${job.queryName || job.name || 'Query'}`,
            source: 'scheduler',
            label: `Scheduled: ${job.queryName || job.name || 'Query'}`,
            _order: Number.isFinite(order) ? order : 0,
          })
        }

        if (job.lastError) {
          const at = job.lastErrorAt || null
          const order = at ? Date.parse(at) : Number(job.id) || 0
          events.push({
            id: `sched-error-${job.id}-${at || job.lastError}`,
            ts: at ? new Date(at).toLocaleString() : 'Unknown time',
            success: false,
            rows: 0,
            elapsed: '-',
            sql: job.sql || `Scheduled Query: ${job.queryName || job.name || 'Query'}`,
            error: job.lastError,
            source: 'scheduler',
            label: `Scheduled: ${job.queryName || job.name || 'Query'}`,
            _order: Number.isFinite(order) ? order : 0,
          })
        }
      })

      setSchedulerHistory(events)
    } catch {
    }
  }

  useEffect(() => {
    reload()
    reloadSchedulerHistory()
    const timer = setInterval(() => {
      reload()
      reloadSchedulerHistory()
    }, 10000)
    return () => clearInterval(timer)
  }, [])

  const combinedHistory = [...history, ...schedulerHistory].sort((a, b) => {
    const aOrder = typeof a._order === 'number' ? a._order : (Number(a.id) || 0)
    const bOrder = typeof b._order === 'number' ? b._order : (Number(b.id) || 0)
    return bOrder - aOrder
  })

  const filtered = combinedHistory.filter(h => {
    if (filter === 'success' && !h.success) return false
    if (filter === 'error' && h.success) return false
    const query = search.toLowerCase()
    return !search || (h.sql || '').toLowerCase().includes(query) || (h.error || '').toLowerCase().includes(query) || (h.label || '').toLowerCase().includes(query)
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg-secondary)', width, borderRight: '1px solid var(--border)' }}>
      <div style={{ padding: '10px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>Query History</div>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search history…"
          style={{ width: '100%', background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 4, padding: '4px 8px', fontSize: 11, color: 'var(--text-primary)', outline: 'none', marginBottom: 6, boxSizing: 'border-box' }} />
        <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
          {['all', 'success', 'error'].map(f => (
            <button key={f} onClick={() => setFilter(f)}
              style={{ flex: 1, padding: '3px 0', fontSize: 10, cursor: 'pointer', borderRadius: 3, border: '1px solid var(--border)', background: filter === f ? 'var(--accent-blue)' : 'var(--bg-tertiary)', color: filter === f ? '#fff' : 'var(--text-secondary)', textTransform: 'capitalize', fontFamily: 'inherit' }}>
              {f}
            </button>
          ))}
        </div>
        {history.length > 0 && (
          <button onClick={() => { clearHistory(); reload() }}
            style={{ width: '100%', padding: '3px 0', fontSize: 10, cursor: 'pointer', borderRadius: 3, border: '1px solid var(--accent-red)', background: 'transparent', color: 'var(--accent-red)', fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
            Clear All ({history.length})
          </button>
        )}
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {filtered.length === 0 && (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 11, lineHeight: 1.7 }}>
            {combinedHistory.length === 0 ? 'No query history yet.\nRun a query to see it here.' : 'No results match your filter.'}
          </div>
        )}
        {filtered.map(h => (
          <div key={h.id} style={{ borderBottom: '1px solid var(--border-light)', padding: '8px 10px', cursor: 'pointer', transition: 'background 0.1s' }}
            onClick={() => onOpenQuery && onOpenQuery(h.sql, 'History Query')}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: h.success ? '#3fb950' : '#f85149', flexShrink: 0 }} />
              <span style={{ fontSize: 10, color: 'var(--text-muted)', flex: 1 }}>{h.ts}</span>
              <span style={{ fontSize: 10, color: h.success ? '#3fb950' : '#f85149', fontWeight: 600 }}>{h.source === 'scheduler' ? (h.success ? 'Success' : 'Error') : (h.success ? `${h.rows} rows` : 'Error')}</span>
              <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{h.elapsed}s</span>
              {h.source !== 'scheduler' && (
                <button onClick={e => { e.stopPropagation(); deleteHistoryItem(h.id); reload() }}
                  style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 14, padding: '0 2px', lineHeight: 1 }}>×</button>
              )}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {h.label ? `${h.label} · ` : ''}{(h.sql || '').replace(/\s+/g, ' ').substring(0, 120)}
            </div>
            {h.error && <div style={{ fontSize: 10, color: '#f85149', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.error}</div>}
          </div>
        ))}
      </div>
    </div>
  )
}
