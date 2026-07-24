'use client'
import { useState, useEffect, useRef } from 'react'
import { getSavedQueries, saveQuery, deleteSavedQuery, renameSavedQuery, loadQueriesFromServer } from '@/lib/appStore'

export default function QueriesPanel({ onOpenQuery, currentSql, width }) {
  const [queries, setQueries] = useState([])
  const [search, setSearch] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveName, setSaveName] = useState('')
  const [renamingId, setRenamingId] = useState(null)
  const [renameVal, setRenameVal] = useState('')
  const saveInputRef = useRef(null)

  const reload = async () => {
    const q = await loadQueriesFromServer()
    setQueries(q)
  }
  useEffect(() => { reload() }, [])
  useEffect(() => { if (saving && saveInputRef.current) saveInputRef.current.focus() }, [saving])

  const filtered = queries.filter(q =>
    !search || q.name.toLowerCase().includes(search.toLowerCase()) || q.sql.toLowerCase().includes(search.toLowerCase())
  )

  const handleSave = () => {
    if (!saveName.trim()) return
    setQueries(saveQuery(saveName.trim(), currentSql || '-- No SQL selected'))
    setSaving(false); setSaveName('')
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg-secondary)', width, borderRight: '1px solid var(--border)' }}>
      <div style={{ padding: '10px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>Saved Queries</div>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search saved queries…"
          style={{ width: '100%', background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 4, padding: '4px 8px', fontSize: 11, color: 'var(--text-primary)', outline: 'none', marginBottom: 6, boxSizing: 'border-box' }} />

        {saving ? (
          <div style={{ display: 'flex', gap: 4 }}>
            <input ref={saveInputRef} value={saveName} onChange={e => setSaveName(e.target.value)}
              placeholder="Query name…"
              onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') setSaving(false) }}
              style={{ flex: 1, background: 'var(--bg-tertiary)', border: '1px solid var(--accent-blue)', borderRadius: 4, padding: '4px 8px', fontSize: 11, color: 'var(--text-primary)', outline: 'none' }} />
            <button onClick={handleSave} style={{ padding: '4px 8px', fontSize: 11, cursor: 'pointer', borderRadius: 4, border: 'none', background: 'var(--accent-blue)', color: '#fff', fontFamily: 'inherit' }}>✓</button>
            <button onClick={() => setSaving(false)} style={{ padding: '4px 8px', fontSize: 11, cursor: 'pointer', borderRadius: 4, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', fontFamily: 'inherit' }}>✕</button>
          </div>
        ) : (
          <button onClick={() => setSaving(true)}
            style={{ width: '100%', padding: '5px', fontSize: 11, cursor: 'pointer', borderRadius: 4, border: '1px solid var(--accent-blue)', background: 'transparent', color: 'var(--accent-blue)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, fontFamily: 'inherit' }}>
            + Save Current Query
          </button>
        )}
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {filtered.length === 0 && (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 11, lineHeight: 1.7 }}>
            {queries.length === 0 ? 'No saved queries yet.\nRun a query and save it here.' : 'No matching queries.'}
          </div>
        )}
        {filtered.map(q => (
          <div key={q.id} style={{ borderBottom: '1px solid var(--border-light)', padding: '8px 10px' }}>
            {renamingId === q.id ? (
              <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
                <input autoFocus value={renameVal} onChange={e => setRenameVal(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') { if (renameVal.trim()) setQueries(renameSavedQuery(q.id, renameVal.trim())); setRenamingId(null) }
                    if (e.key === 'Escape') setRenamingId(null)
                  }}
                  style={{ flex: 1, background: 'var(--bg-tertiary)', border: '1px solid var(--accent-blue)', borderRadius: 3, padding: '3px 6px', fontSize: 11, color: 'var(--text-primary)', outline: 'none' }} />
                <button onClick={() => { if (renameVal.trim()) setQueries(renameSavedQuery(q.id, renameVal.trim())); setRenamingId(null) }}
                  style={{ padding: '3px 6px', fontSize: 10, cursor: 'pointer', borderRadius: 3, border: 'none', background: 'var(--accent-blue)', color: '#fff', fontFamily: 'inherit' }}>✓</button>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 3 }}>
                <span style={{ flex: 1, fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{q.name}</span>
                <button onClick={() => { setRenamingId(q.id); setRenameVal(q.name) }} title="Rename"
                  style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 11, padding: '1px 3px', display: 'inline-flex', alignItems: 'center' }}><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg></button>
                <button onClick={() => setQueries(deleteSavedQuery(q.id))} title="Delete"
                  style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 14, padding: '1px 3px', lineHeight: 1 }}>×</button>
              </div>
            )}
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4 }}>{q.createdAt}</div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 6 }}>
              {q.sql.replace(/\s+/g, ' ').substring(0, 100)}
            </div>
            <button onClick={() => onOpenQuery && onOpenQuery(q.sql, q.name, q.id)}
              style={{ padding: '3px 10px', fontSize: 10, cursor: 'pointer', borderRadius: 3, border: '1px solid var(--accent-blue)', background: 'transparent', color: 'var(--accent-blue)', fontFamily: 'inherit' }}>
              ▶ Open in Editor
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
