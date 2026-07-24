'use client'
import { useState, useEffect } from 'react'
import { getNotebooks, saveNotebook, deleteNotebook, createNotebook, ensureSqlReferenceNotebooks } from '@/lib/appStore'
import { executeQuery } from '@/lib/queryEngine'
import QueryEditor from '@/components/QueryEditor'

// Simple markdown renderer (bold, italic, headers, code)
function renderMd(text) {
  return text
    .replace(/^### (.+)$/gm, '<h3 style="font-size:13px;font-weight:700;color:var(--text-primary);margin:8px 0 4px">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 style="font-size:15px;font-weight:700;color:var(--text-primary);margin:10px 0 5px;border-bottom:1px solid var(--border);padding-bottom:4px">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 style="font-size:17px;font-weight:700;color:var(--text-primary);margin:10px 0 6px">$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code style="background:var(--bg-tertiary);padding:1px 5px;border-radius:3px;font-family:monospace;font-size:11px">$1</code>')
    .replace(/\n/g, '<br/>')
}

function CellResult({ result }) {
  if (!result) return null
  if (result.error) return <div style={{ padding: '6px 8px', background: '#2d1b1b', borderRadius: 4, color: '#f85149', fontSize: 11, fontFamily: 'monospace', marginTop: 4 }}>Error: {result.error}</div>
  if (!result.rows || result.rows.length === 0) return <div style={{ padding: '6px 8px', background: 'var(--bg-tertiary)', borderRadius: 4, color: 'var(--text-muted)', fontSize: 11, marginTop: 4 }}>Query returned 0 rows</div>
  return (
    <div style={{ marginTop: 4, overflowX: 'auto', borderRadius: 4, border: '1px solid var(--border)' }}>
      <table style={{ borderCollapse: 'collapse', fontSize: 11, width: '100%' }}>
        <thead>
          <tr>{result.columns.map(c => <th key={c} style={{ padding: '4px 10px', background: 'var(--bg-panel)', color: 'var(--text-secondary)', borderBottom: '1px solid var(--border)', textAlign: 'left', whiteSpace: 'nowrap', fontWeight: 600, fontSize: 10, textTransform: 'uppercase' }}>{c}</th>)}</tr>
        </thead>
        <tbody>
          {result.rows.slice(0, 20).map((row, i) => (
            <tr key={i}>{result.columns.map(c => <td key={c} style={{ padding: '3px 10px', borderBottom: '1px solid var(--border-light)', color: 'var(--text-primary)', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{row[c] === null ? <span style={{ color: 'var(--text-muted)' }}>NULL</span> : String(row[c])}</td>)}</tr>
          ))}
        </tbody>
      </table>
      {result.rows.length > 20 && <div style={{ padding: '4px 10px', fontSize: 10, color: 'var(--text-muted)', background: 'var(--bg-tertiary)' }}>… {result.rows.length - 20} more rows</div>}
    </div>
  )
}

function NotebookCell({ cell, onUpdate, onDelete, onRun, onAddAfter, schema = [], themeMode = 'dark', editorOptions = {} }) {
  const [editing, setEditing] = useState(cell.type === 'sql')
  const [content, setContent] = useState(cell.content)
  const [showMenu, setShowMenu] = useState(false)

  const save = () => { onUpdate({ ...cell, content }); setEditing(false) }
  const onSqlChange = (next) => { setContent(next); onUpdate({ ...cell, content: next }) }

  return (
    <div style={{ marginBottom: 8, border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden', background: 'var(--bg-panel)' }}>
      {/* Cell header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 8px', background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)' }}>
        <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'monospace', flex: 1 }}>
          {cell.type === 'sql' ? '▷ SQL' : '≡ Markdown'}
        </span>
        {cell.type === 'sql' && (
          <button onClick={() => onRun({ ...cell, content })} disabled={cell.running}
            style={{ padding: '2px 8px', fontSize: 10, cursor: cell.running ? 'not-allowed' : 'pointer', borderRadius: 3, border: 'none', background: 'var(--accent-blue)', color: '#fff', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 3 }}>
            {cell.running ? '⟳ Running…' : '▶ Run (Ctrl+Enter)'}
          </button>
        )}
        {cell.type === 'markdown' && (
          <button onClick={() => setEditing(e => !e)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 11, padding: '1px 4px', display: 'inline-flex', alignItems: 'center' }} title={editing ? 'View' : 'Edit'}>
            {editing
              ? <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"/><circle cx="12" cy="12" r="3"/></svg>
              : <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>
            }
          </button>
        )}
        <div style={{ position: 'relative' }}>
          <button onClick={() => setShowMenu(s => !s)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 14, padding: '1px 4px', lineHeight: 1 }}>⋮</button>
          {showMenu && (
            <div style={{ position: 'absolute', right: 0, top: '100%', zIndex: 50, background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 5, boxShadow: '0 4px 16px rgba(0,0,0,0.3)', minWidth: 130 }} onClick={() => setShowMenu(false)}>
              {[['Add SQL Cell Below', () => onAddAfter(cell.id, 'sql')], ['Add Text Below', () => onAddAfter(cell.id, 'markdown')], ['Delete Cell', () => onDelete(cell.id)]].map(([label, action]) => (
                <div key={label} onClick={action} style={{ padding: '6px 12px', cursor: 'pointer', fontSize: 11, color: label === 'Delete Cell' ? '#f85149' : 'var(--text-primary)' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>{label}</div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Cell body */}
      <div style={{ padding: 8 }}>
        {cell.type === 'sql' ? (
          <div style={{ border: '1px solid var(--border)', borderRadius: 4, overflow: 'hidden', background: 'var(--bg-tertiary)' }}>
            <QueryEditor
              sql={content}
              modelPath={`notebook-cell-${cell.id}.sql`}
              themeMode={themeMode}
              schema={schema}
              editorOptions={editorOptions}
              height={150}
              onChange={onSqlChange}
              onRun={() => onRun({ ...cell, content })}
            />
          </div>
        ) : editing ? (
          <textarea value={content} onChange={e => setContent(e.target.value)}
            onBlur={save}
            style={{ width: '100%', minHeight: 60, background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 4, padding: 8, fontSize: 12, color: 'var(--text-primary)', fontFamily: 'inherit', resize: 'vertical', outline: 'none', boxSizing: 'border-box' }} />
        ) : (
          <div style={{ fontSize: 12, lineHeight: 1.6, color: 'var(--text-primary)' }}
            dangerouslySetInnerHTML={{ __html: renderMd(content) }} />
        )}
        {cell.type === 'sql' && <CellResult result={cell.result} />}
      </div>
    </div>
  )
}

export function NotebookEditorView({ notebook, onClose, onSave, schema = [], themeMode = 'dark', editorOptions = {} }) {
  const [cells, setCells] = useState(notebook.cells || [])
  const [name, setName] = useState(notebook.name)
  const [editingName, setEditingName] = useState(false)

  const updateCell = (updated) => setCells(cs => cs.map(c => c.id === updated.id ? updated : c))
  const deleteCell = (id) => setCells(cs => cs.filter(c => c.id !== id))
  const addAfter = (afterId, type) => {
    const idx = cells.findIndex(c => c.id === afterId)
    const newCell = { id: Date.now(), type, content: type === 'sql' ? 'SELECT 1;' : 'Enter text here…', result: null }
    const next = [...cells]
    next.splice(idx + 1, 0, newCell)
    setCells(next)
  }

  const runCell = async (cell) => {
    setCells(cs => cs.map(c => c.id === cell.id ? { ...c, running: true, result: null } : c))
    try {
      const result = await executeQuery(cell.content, { limitEnabled: false })
      const cellResult = result.success && result.resultSets.length > 0
        ? result.resultSets[0]
        : result.success ? { columns: [], rows: [] } : { error: result.error }
      setCells(cs => cs.map(c => c.id === cell.id ? { ...c, running: false, result: cellResult } : c))
    } catch (err) {
      setCells(cs => cs.map(c => c.id === cell.id ? { ...c, running: false, result: { error: String(err) } } : c))
    }
  }

  const handleSave = () => {
    onSave({ ...notebook, name, cells })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg-primary)' }}>
      {/* Notebook toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', background: 'var(--bg-panel)', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        {editingName ? (
          <input autoFocus value={name} onChange={e => setName(e.target.value)}
            onBlur={() => setEditingName(false)} onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') setEditingName(false) }}
            style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--accent-blue)', borderRadius: 4, padding: '3px 8px', fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', outline: 'none' }} />
        ) : (
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', cursor: 'pointer' }} onDoubleClick={() => setEditingName(true)} title="Double-click to rename">{name}</span>
        )}
        <div style={{ flex: 1 }} />
        <button onClick={() => { cells.forEach(c => { if (c.type === 'sql') runCell(c) }) }}
          style={{ padding: '4px 12px', fontSize: 11, cursor: 'pointer', borderRadius: 4, border: 'none', background: 'var(--accent-green)', color: '#fff', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 4 }}>▶▶ Run All</button>
        <button onClick={handleSave}
          style={{ padding: '4px 12px', fontSize: 11, cursor: 'pointer', borderRadius: 4, border: '1px solid var(--accent-blue)', background: 'transparent', color: 'var(--accent-blue)', fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 4 }}><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>Save</button>
        <button onClick={() => { addAfter(cells[cells.length - 1]?.id || 0, 'sql'); }} style={{ padding: '4px 10px', fontSize: 11, cursor: 'pointer', borderRadius: 4, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', fontFamily: 'inherit' }}>+ SQL</button>
        <button onClick={() => { addAfter(cells[cells.length - 1]?.id || 0, 'markdown'); }} style={{ padding: '4px 10px', fontSize: 11, cursor: 'pointer', borderRadius: 4, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', fontFamily: 'inherit' }}>+ Text</button>
        <button onClick={onClose} style={{ padding: '4px 10px', fontSize: 11, cursor: 'pointer', borderRadius: 4, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', fontFamily: 'inherit' }}>✕ Close</button>
      </div>
      {/* Cells */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
        {cells.map(cell => (
          <NotebookCell key={cell.id} cell={cell} onUpdate={updateCell} onDelete={deleteCell} onRun={runCell} onAddAfter={addAfter} schema={schema} themeMode={themeMode} editorOptions={editorOptions} />
        ))}
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <button onClick={() => setCells(cs => [...cs, { id: Date.now(), type: 'sql', content: 'SELECT 1;', result: null }])}
            style={{ padding: '5px 14px', fontSize: 11, cursor: 'pointer', borderRadius: 4, border: '1px dashed var(--border)', background: 'transparent', color: 'var(--text-muted)', fontFamily: 'inherit' }}>+ Add SQL Cell</button>
          <button onClick={() => setCells(cs => [...cs, { id: Date.now(), type: 'markdown', content: 'Enter text here…', result: null }])}
            style={{ padding: '5px 14px', fontSize: 11, cursor: 'pointer', borderRadius: 4, border: '1px dashed var(--border)', background: 'transparent', color: 'var(--text-muted)', fontFamily: 'inherit' }}>+ Add Text</button>
        </div>
      </div>
    </div>
  )
}

export default function NotebooksPanel({ onOpenNotebook, width }) {
  const [notebooks, setNotebooks] = useState([])
  const [search, setSearch] = useState('')
  const [openNb, setOpenNb] = useState(null)

  const reload = () => setNotebooks(getNotebooks())
  useEffect(() => {
    ensureSqlReferenceNotebooks()
    reload()
  }, [])

  const filtered = notebooks.filter(n => !search || n.name.toLowerCase().includes(search.toLowerCase()))

  const handleCreate = () => {
    const nb = createNotebook('New Notebook ' + (notebooks.length + 1))
    reload()
    if (onOpenNotebook) onOpenNotebook(nb); else setOpenNb(nb)
  }

  const handleSave = (nb) => {
    const updated = saveNotebook(nb)
    setNotebooks(updated)
    setOpenNb(prev => prev?.id === nb.id ? nb : prev)
  }

  if (openNb) {
    const fresh = notebooks.find(n => n.id === openNb.id) || openNb
    return <NotebookEditorView notebook={fresh} onClose={() => setOpenNb(null)} onSave={handleSave} />
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg-secondary)', width, borderRight: '1px solid var(--border)' }}>
      <div style={{ padding: '10px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>Notebooks</div>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search notebooks…"
          style={{ width: '100%', background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 4, padding: '4px 8px', fontSize: 11, color: 'var(--text-primary)', outline: 'none', marginBottom: 6, boxSizing: 'border-box' }} />
        <button onClick={handleCreate}
          style={{ width: '100%', padding: '5px', fontSize: 11, cursor: 'pointer', borderRadius: 4, border: '1px solid var(--accent-blue)', background: 'transparent', color: 'var(--accent-blue)', fontFamily: 'inherit' }}>
          + New Notebook
        </button>
      </div>
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {filtered.length === 0 && (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 11 }}>
            No notebooks yet.
          </div>
        )}
        {filtered.map(nb => (
          <div key={nb.id} style={{ borderBottom: '1px solid var(--border-light)', padding: '8px 10px', cursor: 'pointer' }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ flex: 1, fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 5 }}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>{nb.name}</span>
              <button onClick={() => { setNotebooks(deleteNotebook(nb.id)) }} title="Delete"
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 14, padding: '1px 3px', lineHeight: 1 }}>×</button>
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4 }}>{nb.createdAt} · {nb.cells?.length || 0} cells</div>
            <button onClick={() => { if (onOpenNotebook) onOpenNotebook(nb); else setOpenNb(nb) }}
              style={{ padding: '3px 10px', fontSize: 10, cursor: 'pointer', borderRadius: 3, border: '1px solid var(--accent-blue)', background: 'transparent', color: 'var(--accent-blue)', fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7h5l2 2h11v10a2 2 0 0 1-2 2H3z"/><path d="M3 7V5a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2"/></svg>
              Open
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
