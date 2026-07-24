// RCR App Store — server-backed JSON file persistence (no browser storage)
import { buildSqlReferenceNotebooks } from '@/lib/sqlReferenceCatalog'

// ── In-memory cache ───────────────────────────────────────────────────────────

function defaultStore() {
  return {
    history: [],
    savedQueries: [],
    notebooks: [],
    scheduledQueries: [],
    emailSignatures: [],
    settings: { theme: 'dark', fontSize: 13, autoComplete: true, autoFormat: false },
    savedCharts: [],
    databases: [],
    dbCredentials: {},
    runtimeSnapshot: null,
  }
}

function defaultSession() {
  return {
    editorTabs: null,
    activeTab: null,
    connectionStates: {},
  }
}

let _store = defaultStore()
let _session = defaultSession()
let _sqlDump = ''

// ── Background server sync ────────────────────────────────────────────────────

function _syncSection(section, data) {
  if (typeof window === 'undefined') return
  try {
    fetch('/api/appstore', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ section, data }),
    }).catch(() => {})
  } catch {}
}

// ── Bootstrap: load all data from server on startup ──────────────────────────

export async function initAppStore() {
  if (typeof window === 'undefined') return
  try {
    const res = await fetch('/api/appstore', { cache: 'no-store' })
    if (!res.ok) return
    const json = await res.json()
    if (!json.ok) return
    const d = json.data || {}

    const def = defaultStore()
    if (Array.isArray(d.history))          _store.history        = d.history
    if (Array.isArray(d.notebooks))        _store.notebooks      = d.notebooks
    if (d.settings)                        _store.settings       = { ...def.settings, ...d.settings }
    if (Array.isArray(d.saved_charts))     _store.savedCharts    = d.saved_charts
    if (Array.isArray(d.databases))        _store.databases      = d.databases
    if (Array.isArray(d.email_signatures)) _store.emailSignatures = d.email_signatures

    // Reconstruct dbCredentials from databases list
    for (const db of _store.databases) {
      if (db?.name) {
        _store.dbCredentials[db.name] = { username: db.username || '', password: db.password || '' }
      }
    }

    // Session sections
    if (d.editor_session) {
      const es = d.editor_session
      _session.editorTabs = Array.isArray(es.editorTabs) ? es.editorTabs : null
      _session.activeTab  = es.activeTab ?? null
    }
    if (d.connection_states && typeof d.connection_states === 'object') {
      _session.connectionStates = d.connection_states
    }
  } catch {}
}

// ── History ───────────────────────────────────────────────────────────────────

export function getHistory()        { return _store.history }
export function addHistory(entry) {
  _store.history = [{ id: Date.now(), ts: new Date().toLocaleString(), ...entry }, ..._store.history].slice(0, 200)
  _syncSection('history', _store.history)
}
export function clearHistory() {
  _store.history = []
  _syncSection('history', [])
}
export function deleteHistoryItem(id) {
  _store.history = _store.history.filter(h => h.id !== id)
  _syncSection('history', _store.history)
}

// ── Saved Queries (delegates to /api/saved-queries — own endpoint) ────────────

function _syncQueries(queries) {
  if (typeof window === 'undefined') return
  try {
    fetch('/api/saved-queries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ queries }),
    }).catch(() => {})
  } catch {}
}

export async function loadQueriesFromServer() {
  try {
    const res = await fetch('/api/saved-queries', { cache: 'no-store' })
    const data = await res.json()
    if (data.ok && Array.isArray(data.queries)) {
      _store.savedQueries = data.queries
      return data.queries
    }
  } catch {}
  return _store.savedQueries
}

export function getSavedQueries()     { return _store.savedQueries }
export function saveQuery(name, sql) {
  const entry = { id: Date.now(), name, sql, createdAt: new Date().toLocaleDateString() }
  _store.savedQueries = [entry, ..._store.savedQueries]
  _syncQueries(_store.savedQueries)
  return _store.savedQueries
}
export function updateQuery(id, name, sql) {
  _store.savedQueries = _store.savedQueries.map(q => q.id === id ? { ...q, name, sql } : q)
  _syncQueries(_store.savedQueries)
  return _store.savedQueries
}
export function deleteSavedQuery(id) {
  _store.savedQueries = _store.savedQueries.filter(q => q.id !== id)
  _syncQueries(_store.savedQueries)
  return _store.savedQueries
}
export function renameSavedQuery(id, name) {
  _store.savedQueries = _store.savedQueries.map(q => q.id === id ? { ...q, name } : q)
  _syncQueries(_store.savedQueries)
  return _store.savedQueries
}

// ── Notebooks ─────────────────────────────────────────────────────────────────

function _syncNotebooks() { _syncSection('notebooks', _store.notebooks) }

export function getNotebooks() { return _store.notebooks }
export function ensureSqlReferenceNotebooks() {
  const refs = buildSqlReferenceNotebooks()
  let changed = false
  for (const nb of refs) {
    const idx = _store.notebooks.findIndex(n => String(n.id) === String(nb.id))
    if (idx < 0) {
      _store.notebooks.push(nb); changed = true
    } else if ((_store.notebooks[idx].version || 0) !== (nb.version || 0)) {
      // Refresh the generated reference notebook in place when its version bumps.
      _store.notebooks[idx] = nb; changed = true
    }
  }
  if (changed) _syncNotebooks()
  return _store.notebooks
}
export function saveNotebook(nb) {
  const idx = _store.notebooks.findIndex(n => n.id === nb.id)
  if (idx >= 0) _store.notebooks[idx] = nb; else _store.notebooks = [nb, ..._store.notebooks]
  _syncNotebooks()
  return _store.notebooks
}
export function deleteNotebook(id) {
  _store.notebooks = _store.notebooks.filter(n => n.id !== id)
  _syncNotebooks()
  return _store.notebooks
}
export function createNotebook(name) {
  const nb = {
    id: Date.now(), name, createdAt: new Date().toLocaleDateString(),
    cells: [
      { id: Date.now(),     type: 'markdown', content: `# ${name}` },
      { id: Date.now() + 1, type: 'sql',      content: 'SELECT 1;', result: null },
    ],
  }
  _store.notebooks = [nb, ..._store.notebooks]
  _syncNotebooks()
  return nb
}

// ── Scheduled Queries (delegates to /api/scheduler/jobs) ─────────────────────

function _syncScheduled(jobs) {
  if (typeof window === 'undefined') return
  try {
    fetch('/api/scheduler/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobs }),
    }).catch(() => {})
  } catch {}
}

export function getScheduled()     { return _store.scheduledQueries }
export function toggleScheduled(id) {
  _store.scheduledQueries = _store.scheduledQueries.map(q => q.id === id ? { ...q, enabled: !q.enabled } : q)
  _syncScheduled(_store.scheduledQueries)
  return _store.scheduledQueries
}
export function deleteScheduled(id) {
  _store.scheduledQueries = _store.scheduledQueries.filter(q => q.id !== id)
  _syncScheduled(_store.scheduledQueries)
  return _store.scheduledQueries
}
export function addScheduled(item) {
  _store.scheduledQueries = [{ id: Date.now(), lastRun: 'Never', nextRun: 'Pending', ...item }, ..._store.scheduledQueries]
  _syncScheduled(_store.scheduledQueries)
  return _store.scheduledQueries
}
export function updateScheduled(item) {
  _store.scheduledQueries = _store.scheduledQueries.map(q => q.id === item.id ? item : q)
  _syncScheduled(_store.scheduledQueries)
  return _store.scheduledQueries
}

// ── Email Signatures ──────────────────────────────────────────────────────────

function _syncEmailSignatures() { _syncSection('email_signatures', _store.emailSignatures) }

export function getEmailSignatures() { return _store.emailSignatures }
export function saveEmailSignature(signature) {
  const entry = {
    id: Date.now(),
    name: signature.name,
    content: signature.content,
    imageUrl: signature.imageUrl || '',
    createdAt: new Date().toLocaleDateString(),
  }
  _store.emailSignatures = [entry, ..._store.emailSignatures]
  _syncEmailSignatures()
  return _store.emailSignatures
}
export function updateEmailSignature(signature) {
  _store.emailSignatures = _store.emailSignatures.map(sig => sig.id === signature.id ? { ...sig, ...signature } : sig)
  _syncEmailSignatures()
  return _store.emailSignatures
}
export function deleteEmailSignature(id) {
  _store.emailSignatures = _store.emailSignatures.filter(sig => sig.id !== id)
  _syncEmailSignatures()
  return _store.emailSignatures
}

// ── Settings ──────────────────────────────────────────────────────────────────

export function getSettings() { return _store.settings }
export function saveSettings(settings) {
  _store.settings = { ..._store.settings, ...settings }
  _syncSection('settings', _store.settings)
  return _store.settings
}

// ── Saved Charts ──────────────────────────────────────────────────────────────

function _syncCharts() { _syncSection('saved_charts', _store.savedCharts) }

export function getSavedCharts()  { return _store.savedCharts }
export function saveChart({ name, config, dataSnapshot, sourceSql = '' }) {
  const chart = { id: Date.now(), name, config, dataSnapshot, sourceSql, createdAt: new Date().toLocaleDateString() }
  _store.savedCharts = [chart, ..._store.savedCharts]
  _syncCharts()
  return _store.savedCharts
}
export function deleteChart(id) {
  _store.savedCharts = _store.savedCharts.filter(c => c.id !== id)
  _syncCharts()
  return _store.savedCharts
}
export function renameChart(id, name) {
  _store.savedCharts = _store.savedCharts.map(c => c.id === id ? { ...c, name } : c)
  _syncCharts()
  return _store.savedCharts
}

// ── Persistent Databases ──────────────────────────────────────────────────────

function _syncDatabases() { _syncSection('databases', _store.databases) }

export function getSavedDatabases()  { return _store.databases }
export function saveDatabaseInfo(dbName, username, password) {
  const idx = _store.databases.findIndex(d => d.name === dbName)
  const dbInfo = { name: dbName, username, password, createdAt: new Date().toISOString() }
  if (idx >= 0) _store.databases[idx] = dbInfo
  else _store.databases = [dbInfo, ..._store.databases]
  _store.dbCredentials[dbName] = { username, password }
  _syncDatabases()
}
export function getDatabaseCredentials(dbName) {
  return _store.dbCredentials[dbName] || null
}
export function removeSavedDatabase(dbName) {
  _store.databases = _store.databases.filter(d => d.name !== dbName)
  delete _store.dbCredentials[dbName]
  _syncDatabases()
}

// ── Runtime snapshot (in-memory only — large DBs use /api/databases) ──────────

export function saveRuntimeSnapshot(snapshot) { _store.runtimeSnapshot = snapshot || null }
export function getRuntimeSnapshot()           { return _store.runtimeSnapshot || null }
export function clearRuntimeSnapshot()         { _store.runtimeSnapshot = null }

// ── SQL dump (in-memory only) ─────────────────────────────────────────────────

export function saveRuntimeSqlSnapshot(sqlText) { _sqlDump = sqlText || '' }
export function getRuntimeSqlSnapshot()          { return _sqlDump }
export function clearRuntimeSqlSnapshot()        { _sqlDump = '' }

// ── Editor session ────────────────────────────────────────────────────────────

export function saveEditorSession(editorTabs, activeTab) {
  _session.editorTabs = Array.isArray(editorTabs) ? editorTabs : null
  _session.activeTab  = activeTab ?? null
  _syncSection('editor_session', { editorTabs: _session.editorTabs, activeTab: _session.activeTab })
}

export function getEditorSession() {
  return {
    editorTabs: Array.isArray(_session.editorTabs) ? _session.editorTabs : null,
    activeTab:  _session.activeTab ?? null,
  }
}

// ── Connection states ─────────────────────────────────────────────────────────

export function saveDatabaseConnectionState(dbName, isConnected) {
  if (!dbName) return
  if (!_session.connectionStates) _session.connectionStates = {}
  _session.connectionStates[String(dbName).toLowerCase()] = Boolean(isConnected)
  _syncSection('connection_states', _session.connectionStates)
}

export function removeDatabaseConnectionState(dbName) {
  if (!dbName) return
  if (!_session.connectionStates) _session.connectionStates = {}
  delete _session.connectionStates[String(dbName).toLowerCase()]
  _syncSection('connection_states', _session.connectionStates)
}

export function getDatabaseConnectionStates() {
  return _session.connectionStates ?? {}
}

// ── Full reset ────────────────────────────────────────────────────────────────

export function clearAllPersistedDatabases() {
  _store.databases      = []
  _store.dbCredentials  = {}
  _store.runtimeSnapshot = null
  _sqlDump = ''
  _session.connectionStates = {}
  _syncDatabases()
  _syncSection('connection_states', {})
}
