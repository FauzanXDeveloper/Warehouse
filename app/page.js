'use client'

import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import dynamic from 'next/dynamic'
import Sidebar from '@/components/Sidebar'
import ResultsPanel from '@/components/ResultsPanel'
import ExplainPanel from '@/components/ExplainPanel'
import AnalysisPanel from '@/components/AnalysisPanel'
import HistoryPanel from '@/components/HistoryPanel'
import QueriesPanel from '@/components/QueriesPanel'
import NotebooksPanel, { NotebookEditorView } from '@/components/NotebooksPanel'
import ScheduledPanel from '@/components/ScheduledPanel'
import SettingsModal from '@/components/SettingsModal'
import LoadDataModal from '@/components/LoadDataModal'
import DBConnectionModal from '@/components/DBConnectionModal'
import { executeQuery, setDatabaseCredentials, getDatabaseCredentials as getRuntimeDatabaseCredentials, setDatabaseConnected, ensureDatabaseExists, exportRuntimeSnapshot, importRuntimeSnapshot, exportRuntimeSqlDump, importRuntimeSqlDump, persistAllDatabasesToFiles, restoreAllDatabasesFromFiles, restoreServerDatabaseMetadata, isServerSideDatabasePublic, getRuntimeTableMetadata } from '@/lib/queryEngine'
import { formatSQL } from '@/lib/sqlFormatter'
import { initAppStore, addHistory, getSettings, saveSettings, getSavedCharts, deleteChart, getSavedDatabases, saveDatabaseInfo, getDatabaseCredentials as getStoredDatabaseCredentials, saveRuntimeSnapshot, getRuntimeSnapshot, saveRuntimeSqlSnapshot, getRuntimeSqlSnapshot, removeSavedDatabase, saveEditorSession, getEditorSession, saveDatabaseConnectionState, getDatabaseConnectionStates, removeDatabaseConnectionState, getSavedQueries, saveQuery, updateQuery, loadQueriesFromServer, saveNotebook } from '@/lib/appStore'
import { analyzeSQLQuery, analyzeDataset, generateInsights } from '@/lib/dataAnalyzer'
import ChartView from '@/components/ChartView'

const QueryEditor = dynamic(() => import('@/components/QueryEditor'), { ssr: false })

// ── Nav items ────────────────────────────────────────────────────────────────
const NAV = [
  { id: 'editor', label: 'Editor', icon: (a) => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={a ? '#4fc3f7' : '#6e7681'} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="4 7 8 12 4 17" /><line x1="12" y1="17" x2="20" y2="17" />
    </svg>
  )},
  { id: 'queries', label: 'Queries', icon: (a) => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={a ? '#4fc3f7' : '#6e7681'} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="8" y1="13" x2="16" y2="13" /><line x1="8" y1="17" x2="16" y2="17" />
    </svg>
  )},
  { id: 'notebooks', label: 'Notebooks', icon: (a) => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={a ? '#4fc3f7' : '#6e7681'} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" /><line x1="3" y1="9" x2="21" y2="9" /><line x1="3" y1="15" x2="21" y2="15" /><line x1="9" y1="9" x2="9" y2="21" />
    </svg>
  )},
  { id: 'charts', label: 'Charts', icon: (a) => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={a ? '#4fc3f7' : '#6e7681'} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /><line x1="2" y1="20" x2="22" y2="20" />
    </svg>
  )},
  { id: 'history', label: 'History', icon: (a) => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={a ? '#4fc3f7' : '#6e7681'} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 1 0 .49-4.95" /><polyline points="12 7 12 12 15 14" />
    </svg>
  )},
  { id: 'scheduled', label: 'Scheduled', icon: (a) => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={a ? '#4fc3f7' : '#6e7681'} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /><polyline points="15 14 12 14 12 18" />
    </svg>
  )},
]

const TBtn = ({ active, onClick, disabled, children, title, color = '#4fc3f7' }) => (
  <button onClick={onClick} disabled={disabled} title={title}
    style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 9px', fontSize: 12, cursor: disabled ? 'not-allowed' : 'pointer', borderRadius: 4, border: active ? `1px solid ${color}` : '1px solid var(--border)', background: active ? color + '22' : 'var(--bg-tertiary)', color: active ? color : 'var(--text-secondary)', opacity: disabled ? 0.5 : 1, transition: 'all 0.15s', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
    {children}
  </button>
)

// Notification toast
function Toast({ msg, type, onDone }) {
  useEffect(() => { const t = setTimeout(onDone, 2400); return () => clearTimeout(t) }, [onDone])
  const bg = type === 'success' ? '#3fb950' : type === 'error' ? '#f85149' : '#1f6feb'
  return <div style={{ position: 'fixed', bottom: 36, right: 20, background: bg, color: '#fff', padding: '9px 16px', borderRadius: 7, fontSize: 12, zIndex: 3000, boxShadow: '0 4px 16px rgba(0,0,0,0.4)', animation: 'rcr-fadein 0.2s ease' }}>{msg}</div>
}

const DEFAULT_SQL = `-- Welcome to Retail Credit Risk Query Editor`

const NEW_QUERY_SQL = '-- New query\nSELECT 1;'

function normalizeTabId(value) {
  const num = Number(value)
  if (!Number.isFinite(num)) return null
  const int = Math.trunc(num)
  return int > 0 ? int : null
}

function getNextTabId(tabList = []) {
  let maxId = 0
  for (const tab of tabList) {
    const id = normalizeTabId(tab && tab.id)
    if (id && id > maxId) maxId = id
  }
  return maxId + 1
}

function sanitizeEditorTabs(tabList = []) {
  const seen = new Set()
  let fallbackId = 1
  return (Array.isArray(tabList) ? tabList : []).map((tab) => {
    let id = normalizeTabId(tab && tab.id)
    if (!id || seen.has(id)) {
      while (seen.has(fallbackId)) fallbackId += 1
      id = fallbackId
    }
    seen.add(id)
    if (id >= fallbackId) fallbackId = id + 1
    return {
      ...(tab || {}),
      id,
      label: String(tab && tab.label || `Query ${id}`),
    }
  })
}

const MUTATION_SQL_RE = /\b(create|drop|alter|insert|update|delete|truncate|replace|upsert|merge)\b/i

// Applies appearance settings that live as CSS custom properties on <html>, so
// they take effect immediately and across the whole app (both themes).
function applyAppearanceVars(s = {}) {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  if (s.accentColor) {
    root.style.setProperty('--accent-blue', s.accentColor)
    root.style.setProperty('--accent-blue-light', s.accentColor)
  } else {
    root.style.removeProperty('--accent-blue')
    root.style.removeProperty('--accent-blue-light')
  }
}

// Maps stored settings → Monaco editor option overrides.
function toEditorOptions(s = {}) {
  return {
    fontSize: s.fontSize || 13,
    fontFamily: s.fontFamily || undefined,
    wordWrap: s.wordWrap !== false,
    minimap: !!s.minimap,
    lineNumbers: s.lineNumbers !== false,
    tabSize: s.tabSize || 2,
    cursorStyle: s.cursorStyle || 'line',
    cursorBlinking: s.cursorBlinking || 'blink',
    autoComplete: s.autoComplete !== false,
  }
}

// ── Charts side panel ─────────────────────────────────────────────────────────
function ChartsPanel({ width, onOpenChart, onOpenChartData, onOpenChartSql, refreshKey }) {
  const [charts, setCharts] = useState(() => getSavedCharts())
  const [filter, setFilter] = useState('')
  const [chartCtxMenu, setChartCtxMenu] = useState(null)

  const refresh = () => setCharts(getSavedCharts())

  // Re-read when a chart is saved from ResultsPanel
  useEffect(() => { if (refreshKey > 0) refresh() }, [refreshKey])
  const filtered = charts.filter(c => c.name.toLowerCase().includes(filter.toLowerCase()))

  return (
    <div style={{ width, background: 'var(--bg-secondary)', borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', flex: 1 }}>Saved Charts</span>
          <button onClick={refresh} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 14 }} title="Refresh">↻</button>
        </div>
        <input value={filter} onChange={e => setFilter(e.target.value)} placeholder="Filter charts…"
          style={{ width: '100%', background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 4, padding: '4px 8px', fontSize: 11, color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }} />
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '6px 8px' }}>
        {filtered.length === 0 && (
          <div style={{ padding: '24px 8px', textAlign: 'center', fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.6 }}>
            No saved charts yet.<br/>Run a query, then use the chart builder and click <strong>Save Chart</strong>.
          </div>
        )}
        {filtered.map(chart => (
          <div key={chart.id} style={{ padding: '7px 10px', marginBottom: 4, background: 'var(--bg-tertiary)', borderRadius: 5, cursor: 'pointer', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}
            onClick={() => onOpenChart(chart)}
            onContextMenu={e => { e.preventDefault(); e.stopPropagation(); setChartCtxMenu({ x: e.clientX, y: e.clientY, chart }) }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover, var(--bg-panel))'}
            onMouseLeave={e => e.currentTarget.style.background = 'var(--bg-tertiary)'}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="#4fc3f7"><path d="M5 9.2h3V19H5V9.2zM10.6 5h2.8v14h-2.8V5zM16.2 13h2.8v6h-2.8v-6z"/></svg>
            <div style={{ flex: 1, overflow: 'hidden' }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{chart.name}</div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{chart.config?.traces?.[0]?.type ?? 'chart'} · {chart.createdAt}</div>
            </div>
            <button onClick={e => { e.stopPropagation(); deleteChart(chart.id); refresh() }}
              style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 14, lineHeight: 1 }} title="Delete">×</button>
          </div>
        ))}
      </div>
      {chartCtxMenu && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 999 }} onClick={() => setChartCtxMenu(null)} onContextMenu={e => { e.preventDefault(); setChartCtxMenu(null) }} />
          <div style={{ position: 'fixed', left: chartCtxMenu.x, top: chartCtxMenu.y, zIndex: 1000, background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 8, boxShadow: '0 8px 32px rgba(0,0,0,0.5)', minWidth: 180, padding: '4px 0' }}>
            {[{
              label: 'Show Query Data',
              action: () => onOpenChartData && onOpenChartData(chartCtxMenu.chart)
            }, {
              label: 'Open SQL Query',
              action: () => onOpenChartSql && onOpenChartSql(chartCtxMenu.chart)
            }, {
              label: 'Open Chart',
              action: () => onOpenChart(chartCtxMenu.chart)
            }].map(({ label, action }) => (
              <div key={label}
                onClick={() => { action(); setChartCtxMenu(null) }}
                style={{ padding: '7px 16px', cursor: 'pointer', fontSize: 12, color: 'var(--text-primary)' }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                {label}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

export default function Home() {
  // ── Core state ──────────────────────────────────────────────────────────────
  const [tabs, setTabs] = useState([{ id: 1, label: 'Query 1', sql: DEFAULT_SQL }])
  const [activeTab, setActiveTab] = useState(1)
  const [renamingTab, setRenamingTab] = useState(null)
  const [renameVal, setRenameVal] = useState('')
  const [tabCtxMenu, setTabCtxMenu] = useState(null) // { x, y, tabId }
  const [dragOverTabId, setDragOverTabId] = useState(null)

  // ── Layout ──────────────────────────────────────────────────────────────────
  const [navItem, setNavItem] = useState('editor')
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [sidebarWidth, setSidebarWidth] = useState(260)
  const [resultsHeight, setResultsHeight] = useState(280)

  // ── Query execution ─────────────────────────────────────────────────────
  const [isRunning, setIsRunning] = useState(false)
  const [resultSets, setResultSets] = useState([])
  const [messages, setMessages] = useState([])
  const [executionInfo, setExecutionInfo] = useState(null)
  const [limitEnabled, setLimitEnabled] = useState(true)
    const [resultTabs, setResultTabs] = useState([])
    const [activeResultTab, setActiveResultTab] = useState(null)
    const [explainEnabled, setExplainEnabled] = useState(false)
  const [explainData, setExplainData] = useState(null)
  const [selectedText, setSelectedText] = useState('')
  const [analysisEnabled, setAnalysisEnabled] = useState(false)
  const [sqlAnalysis, setSqlAnalysis] = useState(null)
  const [dataAnalysis, setDataAnalysis] = useState(null)
  const [insights, setInsights] = useState([])
  const [catalogRefreshKey, setCatalogRefreshKey] = useState(0)

  // ── Modals / overlays ───────────────────────────────────────────────────────
  const [showSettings, setShowSettings] = useState(false)
  const [showLoadData, setShowLoadData] = useState(false)
  const [showCreateMenu, setShowCreateMenu] = useState(false)
  const [showDBConnection, setShowDBConnection] = useState(false)
  const [dbConnectionTarget, setDbConnectionTarget] = useState(null)
  const [toast, setToast] = useState(null)
  const [chartSaveKey, setChartSaveKey] = useState(0)

  // ── Theme ───────────────────────────────────────────────────────────────────
  const [theme, setTheme] = useState('dark')
  const [appSettings, setAppSettings] = useState({})
  const editorOptions = useMemo(() => toEditorOptions(appSettings), [appSettings])

  // ── Notebook fullscreen ───────────────────────────────────────────────────────
  const [openNotebook, setOpenNotebook] = useState(null)

  // Flattened schema (tables + columns) for schema-aware autocompletion in the
  // editor and notebook cells. Rebuilt only when the catalog changes.
  const schemaList = useMemo(() => {
    try {
      const meta = getRuntimeTableMetadata()
      const list = []
      for (const dbName of Object.keys(meta || {})) {
        for (const schemaName of Object.keys(meta[dbName] || {})) {
          for (const tableName of Object.keys(meta[dbName][schemaName] || {})) {
            const info = meta[dbName][schemaName][tableName]
            list.push({ table: tableName, database: dbName, columns: info?.columns || [] })
          }
        }
      }
      return list
    } catch { return [] }
  }, [catalogRefreshKey])

  // Resize refs
  const resizingPane = useRef(null)
  const startY = useRef(0); const startH = useRef(0)
  const startX = useRef(0); const startW = useRef(0)
  const resultsPaneRef = useRef(null)
  const liveH = useRef(resultsHeight)
  const resultTabsRef = useRef([])
  const dragTabRef = useRef(null)
  const runtimeDirtyRef = useRef(false)
  const persistInFlightRef = useRef(false)
  const lastPersistAtRef = useRef(0)

  // Apply theme + load settings from localStorage
  useEffect(() => {
    const s = getSettings()
    setTheme(s.theme || 'dark')
    setAppSettings(s || {})
    document.documentElement.setAttribute('data-theme', s.theme || 'dark')
    applyAppearanceVars(s)
  }, [])

  // Persist + apply all settings from the Settings modal (theme, accent, editor).
  const handleSettingsChange = useCallback((next) => {
    saveSettings(next)
    setAppSettings(next)
    setTheme(next.theme || 'dark')
    document.documentElement.setAttribute('data-theme', next.theme || 'dark')
    applyAppearanceVars(next)
  }, [])

  useEffect(() => {
    const bootstrapRuntime = async () => {
      // Load all persistent data from server JSON files (replaces localStorage/sessionStorage)
      await initAppStore()

      const savedEditorSession = getEditorSession()
      if (Array.isArray(savedEditorSession.editorTabs) && savedEditorSession.editorTabs.length > 0) {
        const safeTabs = sanitizeEditorTabs(savedEditorSession.editorTabs)
        setTabs(safeTabs)
        const requested = normalizeTabId(savedEditorSession.activeTab)
        const nextActive = requested && safeTabs.some(t => t.id === requested) ? requested : safeTabs[0].id
        setActiveTab(nextActive)
      }

      // Primary: restore from server DB metadata (lightweight — no binary download)
      // Large .db files (pf_db 1GB, hf_db 149MB) are served server-side only
      let restoredFromFiles = false
      try {
        await restoreServerDatabaseMetadata()
        const { getRuntimeTableMetadata } = await import('@/lib/queryEngine')
        const meta = getRuntimeTableMetadata()
        restoredFromFiles = Object.keys(meta).length > 0
      } catch {}

      // Fallback for small in-browser databases: restore from localStorage SQL dump
      if (!restoredFromFiles) {
        const savedSqlDump = getRuntimeSqlSnapshot()
        if (savedSqlDump.trim()) {
          await importRuntimeSqlDump(savedSqlDump)
        } else {
          const savedSnapshot = getRuntimeSnapshot()
          if (savedSnapshot) await importRuntimeSnapshot(savedSnapshot)
        }
      }

      const persistedDatabases = getSavedDatabases()
      const connectionStates = getDatabaseConnectionStates()
      for (const db of persistedDatabases) {
        if (!db?.name) continue
        if (!isServerSideDatabasePublic(db.name)) {
          await ensureDatabaseExists(db.name)
        }

        const creds = getStoredDatabaseCredentials(db.name)
        if (creds?.username && creds?.password) {
          setDatabaseCredentials(db.name, creds.username, creds.password)
        }

        const sessionConnected = Boolean(connectionStates[String(db.name).toLowerCase()])
        setDatabaseConnected(db.name, sessionConnected)
      }

      setCatalogRefreshKey(k => k + 1)

      // Load saved queries from server file (survives browser cache clears)
      await loadQueriesFromServer()
    }

    bootstrapRuntime()
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => {
      saveEditorSession(tabs, activeTab)
    }, 350)
    return () => clearTimeout(timer)
  }, [tabs, activeTab])

  useEffect(() => {
    resultTabsRef.current = resultTabs
  }, [resultTabs])

  const applyTheme = (t) => {
    setTheme(t)
    setAppSettings(prev => ({ ...prev, theme: t }))
    document.documentElement.setAttribute('data-theme', t)
    saveSettings({ theme: t })
  }

  const showToast = (msg, type = 'info') => setToast({ msg, type })

  const persistRuntimeState = useCallback(async ({ force = false, includeLocalBackup = false } = {}) => {
    const now = Date.now()
    if (!force && !runtimeDirtyRef.current) return
    if (!force && now - lastPersistAtRef.current < 20000) return
    if (persistInFlightRef.current) return

    persistInFlightRef.current = true
    try {
      // Only persist small in-browser DBs — server-side large DBs are already on disk
      await persistAllDatabasesToFiles().catch(() => {})

      if (includeLocalBackup) {
        const sqlDump = exportRuntimeSqlDump()
        saveRuntimeSqlSnapshot(sqlDump)
        const snapshot = exportRuntimeSnapshot()
        saveRuntimeSnapshot(snapshot)
      }

      runtimeDirtyRef.current = false
      lastPersistAtRef.current = Date.now()
    } catch {} finally {
      persistInFlightRef.current = false
    }
  }, [])

  useEffect(() => {
    const handleBeforeUnload = () => {
      persistRuntimeState({ force: true, includeLocalBackup: true })
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        persistRuntimeState({ force: true, includeLocalBackup: true })
      }
    }

    // Lightweight autosave; writes only when runtime changed
    const autoSaveInterval = setInterval(() => {
      persistRuntimeState()
    }, 30000)

    window.addEventListener('beforeunload', handleBeforeUnload)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      clearInterval(autoSaveInterval)
    }
  }, [persistRuntimeState])

  const handleDBConnectionConfirm = (dbName, username, password) => {
    const storedCreds = getStoredDatabaseCredentials(dbName)
    const runtimeCreds = getRuntimeDatabaseCredentials(dbName)
    const existingCreds = storedCreds || runtimeCreds
    const hasSavedCreds = Boolean(existingCreds?.username && existingCreds?.password)

    if (hasSavedCreds) {
      const valid = existingCreds.username === username && existingCreds.password === password
      if (!valid) {
        return { success: false, error: 'Invalid username or password.' }
      }
    }

    setDatabaseCredentials(dbName, username, password)
    saveDatabaseInfo(dbName, username, password)
    saveDatabaseConnectionState(dbName, true)
    setShowDBConnection(false)
    setDbConnectionTarget(null)
    setCatalogRefreshKey(k => k + 1)
    persistRuntimeState({ force: true, includeLocalBackup: true })
    showToast(`Connected to ${dbName}`, 'success')
    return { success: true }
  }

  // ── Active tab helpers ───────────────────────────────────────────────────────
  const activeTabData = tabs.find(t => t.id === activeTab)
  const updateSql = useCallback((sql) => setTabs(prev => prev.map(t => t.id === activeTab ? { ...t, sql } : t)), [activeTab])

  const addTab = (label, sql, savedQueryId) => {
    let id = null
    setTabs(prev => {
      id = getNextTabId(prev)
      return [...prev, { id, label: label || `Query ${id}`, sql: sql || NEW_QUERY_SQL, savedQueryId: savedQueryId || null }]
    })
    setActiveTab(id)
    setNavItem('editor')
    setOpenNotebook(null)
    return id
  }

  const openChartTab = (chart) => {
    let id = null
    setTabs(prev => {
      id = getNextTabId(prev)
      return [...prev, { id, label: chart.name || `Chart ${id}`, type: 'chart', config: chart.config, data: chart.dataSnapshot, sourceSql: chart.sourceSql || '' }]
    })
    setActiveTab(id)
    setNavItem('editor')
  }

  const openChartDataTab = (chart) => {
    let id = null
    setTabs(prev => {
      id = getNextTabId(prev)
      return [...prev, {
        id,
        label: `${chart.name || `Chart ${id}`} Data`,
        type: 'chart-data',
        data: chart.dataSnapshot || { columns: [], rows: [] },
        sourceSql: chart.sourceSql || '',
      }]
    })
    setActiveTab(id)
    setNavItem('editor')
  }

  const openChartSqlTab = (chart) => {
    const sql = chart?.sourceSql?.trim()
      ? chart.sourceSql
      : `-- SQL query is not available for this saved chart (older save format).
-- Re-save the chart from query results to store its SQL text.`
    addTab(`${chart?.name || 'Chart'} SQL`, sql)
  }

  const handleEditorTabDragStart = (e, tabId) => {
    dragTabRef.current = tabId
    e.dataTransfer.effectAllowed = 'move'
  }
  const handleEditorTabDragOver = (e, tabId) => {
    e.preventDefault()
    if (dragTabRef.current !== null && dragTabRef.current !== tabId) setDragOverTabId(tabId)
  }
  const handleEditorTabDrop = (e, targetTabId) => {
    e.preventDefault()
    const fromId = dragTabRef.current
    dragTabRef.current = null
    setDragOverTabId(null)
    if (!fromId || fromId === targetTabId) return
    setTabs(prev => {
      const fromIdx = prev.findIndex(t => t.id === fromId)
      const toIdx = prev.findIndex(t => t.id === targetTabId)
      if (fromIdx === -1 || toIdx === -1) return prev
      const next = [...prev]
      const [moved] = next.splice(fromIdx, 1)
      next.splice(toIdx, 0, moved)
      return next
    })
  }
  const handleEditorTabDragEnd = () => {
    dragTabRef.current = null
    setDragOverTabId(null)
  }

  const closeTab = (e, id) => {
    e.stopPropagation()
    setTabs(prev => {
      const n = prev.filter(t => t.id !== id)
      if (n.length === 0) {
        setActiveTab(1)
        return [{ id: 1, label: 'Query 1', sql: NEW_QUERY_SQL }]
      }
      if (activeTab === id && n.length) setActiveTab(n[Math.max(0, prev.findIndex(t => t.id === id) - 1)].id || n[0].id)
      return n
    })
  }

  // ── Format SQL ───────────────────────────────────────────────────────────────
  const handleFormat = useCallback(() => {
    if (!activeTabData) return
    const sql = activeTabData.sql
    const formatted = formatSQL(sql)
    if (formatted !== sql) {
      updateSql(formatted)
      showToast('SQL formatted', 'success')
    } else {
      showToast('SQL already formatted', 'info')
    }
  }, [activeTabData])

  // ── Save Query Handler ───────────────────────────────────────────────────────
  const handleSaveQuery = useCallback(() => {
    if (!activeTabData) return
    
    const allSavedQueries = getSavedQueries()
    const currentTabLabel = activeTabData.label
    const currentSql = activeTabData.sql
    const savedQueryId = activeTabData.savedQueryId
    
    const nameConflict = allSavedQueries.find(q =>
      q.name.toLowerCase() === currentTabLabel.toLowerCase() && 
      q.id !== savedQueryId
    )

    if (nameConflict) {
      const shouldOverride = window.confirm(`Query name "${currentTabLabel}" already exists. Do you want to override it?`)
      if (!shouldOverride) {
        showToast('Save cancelled.', 'info')
        return
      }

      updateQuery(nameConflict.id, currentTabLabel, currentSql)
      setTabs(prev => prev.map(t =>
        t.id === activeTab ? { ...t, savedQueryId: nameConflict.id } : t
      ))
      showToast(`✓ Query "${currentTabLabel}" overridden successfully.`, 'success')
      return
    }

    if (savedQueryId) {
      updateQuery(savedQueryId, currentTabLabel, currentSql)
      showToast(`✓ Query "${currentTabLabel}" updated successfully.`, 'success')
    } else {
      const saved = saveQuery(currentTabLabel, currentSql)
      const newId = saved?.[0]?.id || null
      showToast(`✓ Query "${currentTabLabel}" saved successfully.`, 'success')

      if (newId) {
        setTabs(prev => prev.map(t =>
          t.id === activeTab ? { ...t, savedQueryId: newId } : t
        ))
      }
    }
  }, [activeTabData, activeTab])

  const normalizeSql = (text = '') => String(text).replace(/\s+/g, ' ').trim().toLowerCase()

  const upsertResultTab = useCallback((tabPayload) => {
    const currentTabs = resultTabsRef.current || []
    const normalized = normalizeSql(tabPayload.fullSql || '')
    const existingIdx = normalized
      ? currentTabs.findIndex(t => normalizeSql(t.fullSql || t.sql || '') === normalized)
      : -1

    if (existingIdx >= 0) {
      const existing = currentTabs[existingIdx]
      const next = [...currentTabs]
      next[existingIdx] = {
        ...existing,
        ...tabPayload,
        id: existing.id,
        label: existing.label,
      }
      resultTabsRef.current = next
      setResultTabs(next)
      setActiveResultTab(existing.id)
      return
    }

    const created = { ...tabPayload, label: tabPayload.label || `Result ${currentTabs.length + 1}` }
    const next = [...currentTabs, created]
    resultTabsRef.current = next
    setResultTabs(next)
    setActiveResultTab(created.id)
  }, [])

  const splitSqlByUseSections = useCallback((script = '') => {
    const text = String(script || '')
    if (!text.trim()) return []

    const lines = text.split(/\r?\n/)
    const isUseLine = (line = '') => /^\s*USE\s+([a-zA-Z0-9_"'`\[\]\.-]+)\s*;?\s*$/i.test(line)
    const firstUseIndex = lines.findIndex(isUseLine)

    if (firstUseIndex < 0) return [text]

    const sections = []
    let current = lines.slice(0, firstUseIndex)

    for (let i = firstUseIndex; i < lines.length; i += 1) {
      const line = lines[i]
      if (i !== firstUseIndex && isUseLine(line)) {
        const chunk = current.join('\n').trim()
        if (chunk) sections.push(chunk)
        current = [line]
      } else {
        current.push(line)
      }
    }

    const lastChunk = current.join('\n').trim()
    if (lastChunk) sections.push(lastChunk)

    return sections.length ? sections : [text]
  }, [])

  const getUseDatabaseName = useCallback((sqlText = '') => {
    const match = String(sqlText || '').match(/^\s*USE\s+([a-zA-Z0-9_"'`\[\]\.-]+)\s*;?\s*$/im)
    if (!match) return null
    const raw = String(match[1] || '').trim()
    return raw.replace(/^['"`\[]|['"`\]]$/g, '') || null
  }, [])

  const getUseSectionTabLabel = useCallback((sqlText = '', fallbackDb = null) => {
    const lines = String(sqlText || '').split(/\r?\n/)
    const useLineIndex = lines.findIndex(line => /^\s*USE\s+([a-zA-Z0-9_"'`\[\]\.-]+)\s*;?\s*$/i.test(line))
    if (useLineIndex < 0) return fallbackDb ? `[${fallbackDb}]` : null

    for (let i = useLineIndex + 1; i < lines.length; i += 1) {
      const line = String(lines[i] || '').trim()
      if (!line) continue

      if (/^--/.test(line)) {
        const text = line.replace(/^--+\s*/, '').trim()
        if (text) return text
        continue
      }

      if (/^\/\*.*\*\/$/.test(line)) {
        const text = line.replace(/^\/\*\s*/, '').replace(/\s*\*\/$/, '').trim()
        if (text) return text
        continue
      }

      break
    }

    return fallbackDb ? `[${fallbackDb}]` : null
  }, [])

  // ── Run query ────────────────────────────────────────────────────────────────
  const handleRun = useCallback(async (sqlOverride) => {
    const sql = sqlOverride || selectedText || activeTabData?.sql || ''
    if (!sql.trim()) { showToast('No SQL to run', 'error'); return }

    const hasSelection = Boolean(selectedText && selectedText.trim())
    const useSections = !hasSelection ? splitSqlByUseSections(sql) : [sql]
    const shouldRunGrouped = !hasSelection && useSections.length > 1

    setIsRunning(true)
    setResultSets([])
    setExplainData(null)
    setSqlAnalysis(null)
    setDataAnalysis(null)
    setInsights([])
    setNavItem('editor')
    
    // Auto-expand results panel if collapsed
    if (resultsHeight === 0) setResultsHeight(280)

    const startMs = Date.now()
    setMessages([{ type: 'info', text: 'Running query…', ts: new Date().toLocaleTimeString() }])

    try {
      const runBlocks = shouldRunGrouped ? useSections : [sql]

      let lastResult = null
      let lastElapsed = '0.00'
      let hadFailure = false

      for (let blockIndex = 0; blockIndex < runBlocks.length; blockIndex += 1) {
        const blockSql = runBlocks[blockIndex]
        const blockStartMs = Date.now()
        const result = await executeQuery(blockSql, { limitEnabled })
        const elapsed = ((Date.now() - blockStartMs) / 1000).toFixed(2)
        const totalRows = (result.resultSets || []).reduce((s, rs) => s + rs.rows.length, 0)
        const hasEmptySelectResults = (result.resultSets || []).some(rs =>
          !rs.isError &&
          /^(SELECT|WITH|PRAGMA|EXPLAIN)/i.test(rs.stmt) &&
          (rs.isEmpty || rs.rows.length === 0)
        )

        const msgArray = result.success
          ? [
              { type: 'success', text: 'Query completed successfully.', ts: new Date().toLocaleTimeString() },
              { type: 'info', text: `${result.statementCount} statement(s) · ${totalRows} row(s) returned in ${elapsed}s`, ts: new Date().toLocaleTimeString() },
              ...(result.rowsAffected > 0 ? [{ type: 'info', text: `${result.rowsAffected} row(s) affected.`, ts: new Date().toLocaleTimeString() }] : []),
              ...(hasEmptySelectResults && totalRows === 0 ? [{ type: 'warning', text: '⚠ No data found. The query executed successfully but returned 0 rows. Possible causes: filter conditions don\'t match any rows, table is empty, or column names are incorrect.', ts: new Date().toLocaleTimeString() }] : []),
              ...(hasEmptySelectResults && totalRows > 0 ? [{ type: 'warning', text: '⚠ One or more SELECT queries returned no results. Check your WHERE conditions and verify the data exists.', ts: new Date().toLocaleTimeString() }] : []),
            ]
          : [{ type: 'error', text: result.error || 'Query failed.', ts: new Date().toLocaleTimeString() }]

        const blockDb = shouldRunGrouped ? getUseDatabaseName(blockSql) : null
        const blockLabel = shouldRunGrouped ? getUseSectionTabLabel(blockSql, blockDb) : null
        upsertResultTab({
          id: Date.now() + blockIndex,
          resultSets: result.success ? (result.resultSets || []) : [],
          messages: msgArray,
          executionInfo: { elapsed, rows: result.success ? totalRows : 0, statements: result.success ? result.statementCount : 0 },
          timestamp: new Date().toLocaleTimeString(),
          label: blockLabel || undefined,
          sql: blockDb ? `[${blockDb}] ${blockSql.substring(0, 80)}` : blockSql.substring(0, 100),
          fullSql: blockSql,
        })

        setResultSets(result.success ? (result.resultSets || []) : [])
        setMessages(msgArray)
        setExecutionInfo({ elapsed, rows: result.success ? totalRows : 0, statements: result.success ? result.statementCount : 0 })
        setCatalogRefreshKey(key => key + 1)

        if (result.success) {
          if (explainEnabled) setExplainData({ sql: blockSql, resultSets: result.resultSets || [] })

          if (analysisEnabled && result.resultSets.length > 0) {
            const firstResult = result.resultSets[0]
            const qAnalysis = analyzeSQLQuery(blockSql)
            setSqlAnalysis(qAnalysis)

            if (firstResult.rows && firstResult.rows.length > 0) {
              const dAnalysis = analyzeDataset(firstResult.columns, firstResult.rows)
              setDataAnalysis(dAnalysis)
              setInsights(generateInsights(qAnalysis, dAnalysis))
            }
          }

          const createdDatabases = result.createdDatabases || []
          if (createdDatabases.length > 0) {
            let dbNeedingFirstConnect = null

            for (const dbName of createdDatabases) {
              const storedCreds = getStoredDatabaseCredentials(dbName)
              const runtimeCreds = getRuntimeDatabaseCredentials(dbName)
              const creds = storedCreds || runtimeCreds || null

              saveDatabaseInfo(dbName, creds?.username || '', creds?.password || '')
              setDatabaseConnected(dbName, false)
              saveDatabaseConnectionState(dbName, false)

              if (!dbNeedingFirstConnect && !(storedCreds?.username && storedCreds?.password)) {
                dbNeedingFirstConnect = dbName
              }
            }

            setCatalogRefreshKey(key => key + 1)

            if (dbNeedingFirstConnect) {
              setDbConnectionTarget(dbNeedingFirstConnect)
              setShowDBConnection(true)
              showToast(`Database ${dbNeedingFirstConnect} created. Please connect.`, 'info')
            }
          }

          const droppedDatabases = result.droppedDatabases || []
          if (droppedDatabases.length > 0) {
            for (const dbName of droppedDatabases) {
              removeSavedDatabase(dbName)
              removeDatabaseConnectionState(dbName)
            }
            setCatalogRefreshKey(key => key + 1)
          }

          const isMutationQuery = MUTATION_SQL_RE.test(blockSql)
          const hasStructuralChange = (result.createdDatabases || []).length > 0 || (result.droppedDatabases || []).length > 0
          const hasWriteImpact = Number(result.rowsAffected || 0) > 0
          if (isMutationQuery || hasStructuralChange || hasWriteImpact) {
            runtimeDirtyRef.current = true
            persistRuntimeState()
          }

          addHistory({ sql: blockSql.replace(/\s+/g, ' ').substring(0, 500), elapsed, rows: totalRows, success: true })
        } else {
          addHistory({ sql: blockSql.replace(/\s+/g, ' ').substring(0, 500), elapsed, rows: 0, success: false, error: result.error })
          hadFailure = true
        }

        lastResult = result
        lastElapsed = elapsed

        if (!result.success) break
      }

      if (shouldRunGrouped) {
        if (hadFailure) {
          showToast('One USE section failed. Check result tabs for details.', 'error')
        } else {
          showToast(`✓ Ran ${runBlocks.length} USE section(s) successfully`, 'success')
        }
        return
      }

      const result = lastResult
      const elapsed = lastElapsed

      if (result && result.success) {
        setResultSets(result.resultSets)
        if (explainEnabled) setExplainData({ sql, resultSets: result.resultSets })

        // AUTO-ANALYZE: Generate SQL and data insights
        if (analysisEnabled && result.resultSets.length > 0) {
          const firstResult = result.resultSets[0]
          const qAnalysis = analyzeSQLQuery(sql)
          setSqlAnalysis(qAnalysis)

          if (firstResult.rows && firstResult.rows.length > 0) {
            const dAnalysis = analyzeDataset(firstResult.columns, firstResult.rows)
            setDataAnalysis(dAnalysis)

            const genInsights = generateInsights(qAnalysis, dAnalysis)
            setInsights(genInsights)
          }
        }

        const totalRows = result.resultSets.reduce((s, rs) => s + rs.rows.length, 0)
        
        // ──────────────────────────────────────────────────────────────────────
        // COMPREHENSIVE MESSAGE GENERATION SYSTEM
        // ──────────────────────────────────────────────────────────────────────
        const baseMessages = [
          { type: 'success', text: 'Query completed successfully.', ts: new Date().toLocaleTimeString() },
          { type: 'info', text: `${result.statementCount} statement(s) · ${totalRows} row(s) returned in ${elapsed}s`, ts: new Date().toLocaleTimeString() },
          ...(result.rowsAffected > 0 ? [{ type: 'info', text: `${result.rowsAffected} row(s) affected.`, ts: new Date().toLocaleTimeString() }] : []),
        ]
        
        // Detect various "no data" scenarios
        const hasEmptySelectResults = result.resultSets.some(rs => 
          !rs.isError && 
          /^(SELECT|WITH|PRAGMA|EXPLAIN)/i.test(rs.stmt) &&
          (rs.isEmpty || rs.rows.length === 0)
        )
        
        // Add warning message for no data scenarios
        if (hasEmptySelectResults && totalRows === 0) {
          baseMessages.push({
            type: 'warning',
            text: '⚠ No data found. The query executed successfully but returned 0 rows. Possible causes: filter conditions don\'t match any rows, table is empty, or column names are incorrect.',
            ts: new Date().toLocaleTimeString()
          })
        } else if (hasEmptySelectResults) {
          baseMessages.push({
            type: 'warning',
            text: '⚠ One or more SELECT queries returned no results. Check your WHERE conditions and verify the data exists.',
            ts: new Date().toLocaleTimeString()
          })
        }
        
        setMessages(baseMessages)
        setExecutionInfo({ elapsed, rows: totalRows, statements: result.statementCount })
        setCatalogRefreshKey(key => key + 1)

        const createdDatabases = result.createdDatabases || []
        if (createdDatabases.length > 0) {
          let dbNeedingFirstConnect = null

          for (const dbName of createdDatabases) {
            const storedCreds = getStoredDatabaseCredentials(dbName)
            const runtimeCreds = getRuntimeDatabaseCredentials(dbName)
            const creds = storedCreds || runtimeCreds || null

            saveDatabaseInfo(dbName, creds?.username || '', creds?.password || '')
            setDatabaseConnected(dbName, false)
            saveDatabaseConnectionState(dbName, false)

            if (!dbNeedingFirstConnect && !(storedCreds?.username && storedCreds?.password)) {
              dbNeedingFirstConnect = dbName
            }
          }

          setCatalogRefreshKey(key => key + 1)

          if (dbNeedingFirstConnect) {
            setDbConnectionTarget(dbNeedingFirstConnect)
            setShowDBConnection(true)
            showToast(`Database ${dbNeedingFirstConnect} created. Please connect.`, 'info')
          }
        }

        const droppedDatabases = result.droppedDatabases || []
        if (droppedDatabases.length > 0) {
          for (const dbName of droppedDatabases) {
            removeSavedDatabase(dbName)
            removeDatabaseConnectionState(dbName)
          }
          setCatalogRefreshKey(key => key + 1)
        }

        const isMutationQuery = MUTATION_SQL_RE.test(sql)
        const hasStructuralChange = (result.createdDatabases || []).length > 0 || (result.droppedDatabases || []).length > 0
        const hasWriteImpact = Number(result.rowsAffected || 0) > 0
        if (isMutationQuery || hasStructuralChange || hasWriteImpact) {
          runtimeDirtyRef.current = true
          persistRuntimeState()
        }

        // Save to history
        addHistory({ sql: sql.replace(/\s+/g, ' ').substring(0, 500), elapsed, rows: totalRows, success: true })
       showToast(`✓ ${totalRows} rows returned`, 'success')
       
       const newResultId = Date.now()
       const msgArray = [
         { type: 'success', text: 'Query completed successfully.', ts: new Date().toLocaleTimeString() },
         { type: 'info', text: `${result.statementCount} statement(s) · ${totalRows} row(s) returned in ${elapsed}s`, ts: new Date().toLocaleTimeString() },
         ...(result.rowsAffected > 0 ? [{ type: 'info', text: `${result.rowsAffected} row(s) affected.`, ts: new Date().toLocaleTimeString() }] : []),
         ...(hasEmptySelectResults && totalRows === 0 ? [{ type: 'warning', text: '⚠ No data found. The query executed successfully but returned 0 rows. Possible causes: filter conditions don\'t match any rows, table is empty, or column names are incorrect.', ts: new Date().toLocaleTimeString() }] : []),
         ...(hasEmptySelectResults && totalRows > 0 ? [{ type: 'warning', text: '⚠ One or more SELECT queries returned no results. Check your WHERE conditions and verify the data exists.', ts: new Date().toLocaleTimeString() }] : []),
       ]
       upsertResultTab({
         id: newResultId,
         resultSets: result.resultSets,
         messages: msgArray,
         executionInfo: { elapsed, rows: totalRows, statements: result.statementCount },
         timestamp: new Date().toLocaleTimeString(),
         sql: sql.substring(0, 100),
         fullSql: sql,
       })
      } else {
        const errorText = result?.error || 'Query failed.'
        setMessages([{ type: 'error', text: result.error || 'Query failed.', ts: new Date().toLocaleTimeString() }])
        setExecutionInfo({ elapsed, rows: 0 })
        addHistory({ sql: sql.replace(/\s+/g, ' ').substring(0, 500), elapsed, rows: 0, success: false, error: errorText })
         showToast('Query failed', 'error')
       
         const newResultId = Date.now()
         upsertResultTab({
           id: newResultId,
           resultSets: [],
           messages: [{ type: 'error', text: errorText, ts: new Date().toLocaleTimeString() }],
           executionInfo: { elapsed, rows: 0, statements: 0 },
           timestamp: new Date().toLocaleTimeString(),
           sql: sql.substring(0, 100),
           fullSql: sql,
         })
      }
    } catch (err) {
      const elapsed = ((Date.now() - startMs) / 1000).toFixed(2)
      addHistory({ sql: sql.substring(0, 500), elapsed, rows: 0, success: false, error: String(err) })
      showToast('Error: ' + String(err).substring(0, 60), 'error')
       
       const newResultId = Date.now()
       upsertResultTab({
         id: newResultId,
         resultSets: [],
         messages: [{ type: 'error', text: String(err), ts: new Date().toLocaleTimeString() }],
         executionInfo: { elapsed, rows: 0, statements: 0 },
         timestamp: new Date().toLocaleTimeString(),
         sql: sql.substring(0, 100),
         fullSql: sql,
       })
    } finally {
      setIsRunning(false)
    }
  }, [activeTabData, selectedText, limitEnabled, explainEnabled, analysisEnabled, upsertResultTab, persistRuntimeState, splitSqlByUseSections, getUseDatabaseName, getUseSectionTabLabel])

  // Get current active result tab data
  const activeResult = resultTabs.find(t => t.id === activeResultTab)
  const currentResultSets = activeResult?.resultSets || []
  const currentMessages = activeResult?.messages || []
  const currentExecutionInfo = activeResult?.executionInfo || null

    // Close result tab
    const closeResultTab = (tabId) => {
      setResultTabs(prev => {
        const closingIndex = prev.findIndex(t => t.id === tabId)
        const updated = prev.filter(t => t.id !== tabId)
        if (activeResultTab === tabId) {
          if (updated.length === 0) {
            setActiveResultTab(null)
          } else {
            const nextIndex = Math.max(0, closingIndex - 1)
            setActiveResultTab(updated[nextIndex]?.id || updated[0].id)
          }
        }
        return updated
      })
    }
  // ── Table double-click → open new tab ────────────────────────────────────────
  const handleTableDoubleClick = (tableName, schemaName) => {
    const prefix = schemaName && schemaName !== 'public' ? schemaName + '.' : ''
    addTab(tableName, `SELECT * FROM ${prefix}${tableName} LIMIT 100;`)
  }

  // ── Open query from panel → new tab ──────────────────────────────────────────
  const openQuery = (sql, label, savedQueryId) => addTab(label || 'Query', sql, savedQueryId)

  // ── Show DDL tab ─────────────────────────────────────────────────────────────
  const handleShowSQL = (tableName, ddl) => {
    addTab(`DDL: ${tableName}`, ddl)
  }

  // ── Create menu actions ──────────────────────────────────────────────────────
  const createActions = {
    'New Query': () => addTab(),
    'New Notebook': () => setNavItem('notebooks'),
    'New View': () => addTab('New View', 'CREATE OR REPLACE VIEW my_view AS\nSELECT * FROM my_table;'),
    'New Table': () => addTab('New Table', 'CREATE TABLE my_table (\n  id INT,\n  name STRING\n);'),
    'New Schema': () => addTab('New Schema', 'CREATE SCHEMA IF NOT EXISTS reporting;'),
  }

  // ── Resize handlers ──────────────────────────────────────────────────────────
  // For the results pane, mutate its DOM height directly while dragging (no React
  // re-render) and only commit to state on mouseup. Re-rendering Monaco + the
  // results grid on every mousemove was what made dragging feel laggy.
  const onMouseMove = useCallback((e) => {
    if (resizingPane.current === 'vert') {
      const h = Math.max(80, Math.min(600, startH.current + startY.current - e.clientY))
      liveH.current = h
      if (resultsPaneRef.current) resultsPaneRef.current.style.height = h + 'px'
    } else if (resizingPane.current === 'horiz') {
      setSidebarWidth(Math.max(180, Math.min(500, startW.current + e.clientX - startX.current)))
    }
  }, [])

  const onMouseUp = useCallback(() => {
    if (resizingPane.current === 'vert') setResultsHeight(liveH.current)
    resizingPane.current = null
    document.removeEventListener('mousemove', onMouseMove)
    document.removeEventListener('mouseup', onMouseUp)
  }, [onMouseMove])

  const startResize = (type, e) => {
    resizingPane.current = type
    if (type === 'vert') { startY.current = e.clientY; startH.current = resultsHeight; liveH.current = resultsHeight }
    else { startX.current = e.clientX; startW.current = sidebarWidth }
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }

  // ── Keyboard shortcuts ────────────────────────────────────────────────────────
  useEffect(() => {
    const h = (e) => {
      // While a notebook is fullscreen, let its own cell editors own these shortcuts.
      if (openNotebook) return
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); handleRun() }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'F') { e.preventDefault(); handleFormat() }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [handleRun, handleFormat, openNotebook])

  // ── Render sidebar panel based on nav ─────────────────────────────────────────
  const renderSidePanel = () => {
    switch (navItem) {
      case 'editor': return <Sidebar
        width={sidebarWidth}
        onCollapse={() => setSidebarOpen(false)}
        onTableDoubleClick={handleTableDoubleClick}
        onShowSQL={handleShowSQL}
        onLoadData={() => setShowLoadData(true)}
        onDBConnect={(dbName) => { setDbConnectionTarget(dbName); setShowDBConnection(true) }}
        onDBDisconnect={(dbName) => {
          setDatabaseConnected(dbName, false)
          saveDatabaseConnectionState(dbName, false)
          runtimeDirtyRef.current = true
          persistRuntimeState({ force: true, includeLocalBackup: true })
          setCatalogRefreshKey(k => k + 1)
          showToast(`Disconnected from ${dbName}`, 'info')
        }}
        refreshKey={catalogRefreshKey}
        theme={theme}
        onCreateAction={(label) => {
          const actions = {
            'New Query': () => addTab(),
            'New Notebook': () => setNavItem('notebooks'),
            'New View': () => addTab('New View', 'CREATE OR REPLACE VIEW my_view AS\nSELECT * FROM my_table;'),
            'New Table': () => addTab('New Table', 'CREATE TABLE my_table (\n  id INT,\n  name STRING\n);'),
            'New Schema': () => addTab('New Schema', 'CREATE SCHEMA IF NOT EXISTS reporting;'),
          }
          actions[label]?.()
        }}
      />
      case 'queries': return <QueriesPanel width={sidebarWidth} onOpenQuery={openQuery} currentSql={activeTabData?.sql} />
      case 'notebooks': return <NotebooksPanel width={sidebarWidth} onOpenNotebook={setOpenNotebook} />
      case 'history': return <HistoryPanel width={sidebarWidth} onOpenQuery={openQuery} />
      case 'scheduled': return <ScheduledPanel width={sidebarWidth} onOpenQuery={openQuery} currentSql={activeTabData?.sql} />
      case 'charts': return (
        <ChartsPanel width={sidebarWidth} onOpenChart={openChartTab} onOpenChartData={openChartDataTab} onOpenChartSql={openChartSqlTab} refreshKey={chartSaveKey} />
      )
      default: return null
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontFamily: 'var(--font-sans)', overflow: 'hidden' }}>

      {/* ── TOP HEADER ─────────────────────────────────────────────────────── */}
      <header style={{ height: 44, background: 'var(--bg-panel)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', padding: '0 14px', gap: 10, flexShrink: 0, zIndex: 20 }}>
        <img src={theme === 'dark' ? '/white_logo_alrajhi.png' : '/alrajhi_logo.png'} alt="Al Rajhi Bank" style={{ height: 28, objectFit: 'contain' }}
          onError={e => e.target.style.display = 'none'} />
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.2 }}>Retail Credit Risk</span>
          <span style={{ fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.2 }}>Query Editor v2</span>
        </div>
        <div style={{ flex: 1 }} />

        {/* User badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 27, height: 27, borderRadius: '50%', background: '#1a6b3c', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: '#fff' }}>A</div>
          <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>admin</span>
        </div>
      </header>

      {/* ── MAIN BODY ──────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* LEFT ICON NAV */}
        <nav style={{ width: 48, background: 'var(--bg-secondary)', borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 8, flexShrink: 0, gap: 2 }}>
          {NAV.map(item => (
            <button key={item.id} title={item.label}
              onClick={() => { setNavItem(item.id); if (!sidebarOpen) setSidebarOpen(true) }}
              style={{ width: 40, height: 44, borderRadius: 6, border: 'none', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2, background: navItem === item.id ? 'var(--bg-hover)' : 'transparent', position: 'relative', padding: 0 }}>
              {item.icon(navItem === item.id)}
              <span style={{ fontSize: 8, color: navItem === item.id ? '#4fc3f7' : 'var(--text-muted)', lineHeight: 1 }}>{item.label}</span>
              {navItem === item.id && <div style={{ position: 'absolute', left: 0, top: 6, bottom: 6, width: 2, background: '#4fc3f7', borderRadius: '0 2px 2px 0' }} />}
            </button>
          ))}

          {/* Spacer */}
          <div style={{ flex: 1 }} />

          {/* Theme toggle — bottom of nav like VS Code */}
          <button
            onClick={() => applyTheme(theme === 'dark' ? 'light' : 'dark')}
            title={theme === 'dark' ? 'Switch to Light mode' : 'Switch to Dark mode'}
            style={{ width: 40, height: 40, borderRadius: 6, border: 'none', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2, background: 'transparent', padding: 0, marginBottom: 2 }}>
            {theme === 'dark'
              ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6e7681" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="4"/><line x1="12" y1="2" x2="12" y2="4"/><line x1="12" y1="20" x2="12" y2="22"/>
                  <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
                  <line x1="2" y1="12" x2="4" y2="12"/><line x1="20" y1="12" x2="22" y2="12"/>
                  <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
                </svg>
              : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6e7681" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
                </svg>
            }
            <span style={{ fontSize: 8, color: 'var(--text-muted)', lineHeight: 1 }}>{theme === 'dark' ? 'Light' : 'Dark'}</span>
          </button>

          {/* Settings — bottom of nav like VS Code */}
          <button
            onClick={() => setShowSettings(true)}
            title="Settings"
            style={{ width: 40, height: 40, borderRadius: 6, border: 'none', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2, background: 'transparent', padding: 0, marginBottom: 6 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6e7681" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <line x1="4" y1="6" x2="20" y2="6" />
              <line x1="4" y1="12" x2="20" y2="12" />
              <line x1="4" y1="18" x2="20" y2="18" />
              <circle cx="8" cy="6" r="2" fill="var(--bg-secondary)" stroke="#6e7681" strokeWidth="1.6" />
              <circle cx="16" cy="12" r="2" fill="var(--bg-secondary)" stroke="#6e7681" strokeWidth="1.6" />
              <circle cx="8" cy="18" r="2" fill="var(--bg-secondary)" stroke="#6e7681" strokeWidth="1.6" />
            </svg>
            <span style={{ fontSize: 8, color: 'var(--text-muted)', lineHeight: 1 }}>Settings</span>
          </button>
        </nav>

        {/* SIDE PANEL */}
        {sidebarOpen ? (
          <>
            {renderSidePanel()}
            <div onMouseDown={e => startResize('horiz', e)}
              style={{ width: 4, cursor: 'col-resize', background: 'transparent', flexShrink: 0, zIndex: 10 }}
              onMouseEnter={e => e.currentTarget.style.background = '#4fc3f744'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'} />
          </>
        ) : (
          <button onClick={() => setSidebarOpen(true)}
            style={{ width: 16, background: 'var(--bg-secondary)', border: 'none', borderRight: '1px solid var(--border)', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 9, display: 'flex', alignItems: 'center', justifyContent: 'center' }} title="Expand">▶</button>
        )}

        {/* ── EDITOR + RESULTS ──────────────────────────────────────────── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>

          {openNotebook ? (
            <NotebookEditorView
              notebook={openNotebook}
              schema={schemaList}
              themeMode={theme}
              editorOptions={editorOptions}
              onClose={() => setOpenNotebook(null)}
              onSave={(nb) => { saveNotebook(nb); setOpenNotebook(nb); showToast('Notebook saved', 'success') }}
            />
          ) : (
          <>
          {/* Tab bar */}
          <div style={{ display: 'flex', alignItems: 'center', background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)', overflowX: 'auto', flexShrink: 0, minHeight: 34 }}>
            {tabs.map(tab => (
              <div key={tab.id}
                className={`editor-tab${activeTab === tab.id ? ' active' : ''}`}
                draggable
                onDragStart={e => handleEditorTabDragStart(e, tab.id)}
                onDragOver={e => handleEditorTabDragOver(e, tab.id)}
                onDrop={e => handleEditorTabDrop(e, tab.id)}
                onDragEnd={handleEditorTabDragEnd}
                onClick={() => { setActiveTab(tab.id); setNavItem('editor') }}
                onDoubleClick={() => { setRenamingTab(tab.id); setRenameVal(tab.label) }}
                onContextMenu={e => { e.preventDefault(); setTabCtxMenu({ x: e.clientX, y: e.clientY, tabId: tab.id }) }}
                style={dragOverTabId === tab.id ? { boxShadow: '-2px 0 0 #4fc3f7' } : undefined}>
                {tab.type === 'chart'
                  ? <svg width="10" height="10" viewBox="0 0 24 24" fill={activeTab === tab.id ? '#4fc3f7' : '#6e7681'} style={{ marginRight: 5, flexShrink: 0 }}><path d="M5 9.2h3V19H5V9.2zM10.6 5h2.8v14h-2.8V5zM16.2 13h2.8v6h-2.8v-6z"/></svg>
                  : <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke={activeTab === tab.id ? '#4fc3f7' : 'var(--text-muted)'} style={{ marginRight: 5, flexShrink: 0 }}>
                      <rect x="2" y="1" width="12" height="14" rx="1" strokeWidth="1.5" />
                      <line x1="5" y1="6" x2="11" y2="6" strokeWidth="1.2" />
                      <line x1="5" y1="9" x2="9" y2="9" strokeWidth="1.2" />
                    </svg>
                }
                {renamingTab === tab.id ? (
                  <input autoFocus value={renameVal}
                    onChange={e => setRenameVal(e.target.value)}
                    onBlur={() => { setTabs(prev => prev.map(t => t.id === tab.id ? { ...t, label: renameVal.trim() || t.label } : t)); setRenamingTab(null) }}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') { setTabs(prev => prev.map(t => t.id === tab.id ? { ...t, label: renameVal.trim() || t.label } : t)); setRenamingTab(null) } }}
                    onClick={e => e.stopPropagation()}
                    style={{ background: 'none', border: 'none', borderBottom: '1px solid #4fc3f7', color: 'var(--text-primary)', fontSize: 12, outline: 'none', width: 90, padding: '0 2px' }} />
                ) : (
                  <span style={{ maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title="Double-click to rename">{tab.label}</span>
                )}
                {tabs.length > 1 && (
                  <button onClick={e => closeTab(e, tab.id)}
                    style={{ marginLeft: 5, background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 14, padding: '0 2px', lineHeight: 1, flexShrink: 0 }}>×</button>
                )}
              </div>
            ))}
            <button onClick={() => addTab()}
              style={{ padding: '0 12px', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 18, flexShrink: 0, alignSelf: 'stretch' }} title="New tab">+</button>
          </div>

          {/* Toolbar */}
          {activeTabData?.type === 'chart' ? (
            <div style={{ flex: 1, overflow: 'hidden' }}>
              <ChartView
                data={activeTabData.data || { columns: [], rows: [] }}
                initialConfig={activeTabData.config || {}}
                onSaveChart={() => { setChartSaveKey(k => k + 1); setNavItem('charts') }}
              />
            </div>
          ) : activeTabData?.type === 'chart-data' ? (
            <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'var(--bg-panel)', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="#4fc3f7"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11zm0-13H5V5h14v1z"/></svg>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>Saved Chart Query Data</span>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{activeTabData.data?.rows?.length ?? 0} rows</span>
              </div>
              <div style={{ flex: 1, overflow: 'hidden' }}>
                <ResultsPanel
                  resultSets={[{ name: activeTabData.label || 'Saved Chart Data', columns: activeTabData.data?.columns || [], rows: activeTabData.data?.rows || [] }]}
                  isRunning={false}
                  executionInfo={{ elapsed: '0.00', rows: activeTabData.data?.rows?.length || 0, statements: 1 }}
                  messages={[{ type: 'info', text: 'Loaded saved chart snapshot data.', ts: new Date().toLocaleTimeString() }]}
                  sourceSql={activeTabData.sourceSql || ''}
                  onChartSaved={() => setChartSaveKey(k => k + 1)}
                  queryTabs={[]}
                  activeQueryTabId={null}
                  onSelectQueryTab={() => {}}
                  onCloseQueryTab={() => {}}
                />
              </div>
            </div>
          ) : (
          <><div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', background: 'var(--bg-panel)', borderBottom: '1px solid var(--border)', flexShrink: 0, flexWrap: 'wrap' }}>
            {/* Run */}
            <button className="btn-primary" onClick={() => handleRun(selectedText || activeTabData?.sql)} disabled={isRunning}
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 14px', fontSize: 12, fontWeight: 600 }}>
              {isRunning
                ? <><span style={{ display: 'inline-block', animation: 'rcr-spin 1s linear infinite' }}>⟳</span> Running…</>
                : <>▶ Run</>}
            </button>

            <div style={{ width: 1, height: 20, background: 'var(--border)' }} />

            <TBtn active={limitEnabled} onClick={() => setLimitEnabled(l => !l)} title="Toggle row limit (Limit 100)">
              <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor"><path d="M2 10.5a.5.5 0 0 1 .5-.5h3a.5.5 0 0 1 0 1h-3a.5.5 0 0 1-.5-.5zm0-3a.5.5 0 0 1 .5-.5h7a.5.5 0 0 1 0 1h-7a.5.5 0 0 1-.5-.5zm0-3a.5.5 0 0 1 .5-.5h11a.5.5 0 0 1 0 1h-11a.5.5 0 0 1-.5-.5z" /></svg>
              Limit 100
            </TBtn>

            <TBtn active={explainEnabled} onClick={() => setExplainEnabled(v => !v)} title="Show query execution plan after run" color="#e8bf6a">
              <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor"><path d="M1.5 1a.5.5 0 0 0-.5.5v4a.5.5 0 0 1-1 0v-4A1.5 1.5 0 0 1 1.5 0h4a.5.5 0 0 1 0 1h-4zM10 .5a.5.5 0 0 1 .5-.5h4A1.5 1.5 0 0 1 16 1.5v4a.5.5 0 0 1-1 0v-4a.5.5 0 0 0-.5-.5h-4a.5.5 0 0 1-.5-.5z" /></svg>
              Explain
            </TBtn>

            <TBtn active={analysisEnabled} onClick={() => setAnalysisEnabled(v => !v)} title="Auto-analyze SQL and data after run" color="#79c0ff">
              <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor"><path d="M2 2.5a.5.5 0 0 1 .5-.5h11a.5.5 0 0 1 0 1h-11a.5.5 0 0 1-.5-.5zm0 4a.5.5 0 0 1 .5-.5h7a.5.5 0 0 1 0 1h-7a.5.5 0 0 1-.5-.5zm0 4a.5.5 0 0 1 .5-.5h7a.5.5 0 0 1 0 1h-7a.5.5 0 0 1-.5-.5z" /></svg>
              Analyze
            </TBtn>

            <div style={{ width: 1, height: 20, background: 'var(--border)' }} />

            <TBtn onClick={handleFormat} title="Format SQL (Ctrl+Shift+F)">
              <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor"><path d="M2 2.5a.5.5 0 0 0-.5.5v1a.5.5 0 0 0 .5.5h11a.5.5 0 0 0 .5-.5V3a.5.5 0 0 0-.5-.5H2zm.5 3a.5.5 0 0 0 0 1h6a.5.5 0 0 0 0-1h-6zm0 3a.5.5 0 0 0 0 1h4a.5.5 0 0 0 0-1h-4z" /></svg>
              Format
            </TBtn>

            <TBtn onClick={handleSaveQuery} title="Save query to saved queries library (checks for name conflicts)">
              <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor"><path d="M14 1H2c-.5 0-1 .5-1 1v12c0 .5.5 1 1 1h12c.5 0 1-.5 1-1V2c0-.5-.5-1-1-1zm-1 9l-3 3-3-3V6h6v4z" /></svg>
              Save
            </TBtn>

            <div style={{ flex: 1 }} />

            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-muted)' }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#3fb950' }} />
              <span>Local Workspace</span>
            </div>
          </div>

          {/* Editor */}
          <div style={{ flex: 1, overflow: 'hidden', minHeight: 80 }}>
            <QueryEditor
              sql={activeTabData?.sql || ''}
              modelPath={`query-${activeTabData?.id || 'default'}.sql`}
              themeMode={theme}
              schema={schemaList}
              editorOptions={editorOptions}
              onChange={updateSql}
              onSelectionChange={setSelectedText}
              onRun={handleRun}
            />
          </div>

          {/* Resize handle with double-click collapse/expand */}
          <div onMouseDown={e => startResize('vert', e)}
            onDoubleClick={() => {
              if (resultsHeight > 40) {
                setResultsHeight(0)
              } else {
                setResultsHeight(280)
              }
            }}
            style={{ height: 5, cursor: 'row-resize', background: 'transparent', flexShrink: 0, borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s ease', userSelect: 'none' }}
            onMouseEnter={e => e.currentTarget.style.background = '#4fc3f722'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
            <div style={{ width: 30, height: 3, borderRadius: 2, background: 'var(--border)', transition: 'background 0.2s ease' }} />
          </div>

          {/* Results / Explain / Analysis */}
          <div ref={resultsPaneRef} style={{ height: resultsHeight, flexShrink: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            {explainEnabled
              ? <ExplainPanel sql={explainData?.sql || activeTabData?.sql || ''} visible={true} />
              : analysisEnabled && (sqlAnalysis || dataAnalysis)
                ? <AnalysisPanel sqlAnalysis={sqlAnalysis} dataAnalysis={dataAnalysis} insights={insights} visible={true} />
                : <ResultsPanel
                    resultSets={currentResultSets}
                    isRunning={isRunning}
                    executionInfo={currentExecutionInfo}
                    messages={currentMessages}
                  sourceSql={activeResult?.fullSql || activeTabData?.sql || ''}
                    onChartSaved={() => setChartSaveKey(k => k + 1)}
                    queryTabs={resultTabs}
                    activeQueryTabId={activeResultTab}
                    onSelectQueryTab={setActiveResultTab}
                    onCloseQueryTab={closeResultTab}
                    onRenameQueryTab={(id, label) => setResultTabs(prev => prev.map(t => t.id === id ? { ...t, label } : t))}
                    onReorderQueryTabs={setResultTabs}
                  />
            }
          </div>
          </>)}
          </>
          )}
        </div>
      </div>

      {/* ── STATUS BAR ─────────────────────────────────────────────────────── */}
      <div className="status-bar" style={{ flexShrink: 0 }}>
        <span>RCR Query Editor</span>
        <span style={{ color: 'var(--text-muted)' }}>|</span>
        <span style={{ color: '#3fb950' }}>● Local Workspace</span>
        <span style={{ color: 'var(--text-muted)' }}>|</span>
        <span>schema: public</span>
        <span style={{ color: 'var(--text-muted)' }}>|</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          {theme === 'dark'
            ? <><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>Dark</>
            : <><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4"/><line x1="12" y1="2" x2="12" y2="4"/><line x1="12" y1="20" x2="12" y2="22"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="2" y1="12" x2="4" y2="12"/><line x1="20" y1="12" x2="22" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>Light</>
          }
        </span>
        {executionInfo && (
          <><span style={{ color: 'var(--text-muted)' }}>|</span>
            <span>{executionInfo.elapsed}s · {executionInfo.rows} rows</span></>
        )}
        <div style={{ flex: 1 }} />
        <span>SQL</span>
        <span style={{ color: 'var(--text-muted)' }}>|</span>
        <span>UTF-8</span>
      </div>

      {/* ── MODALS ─────────────────────────────────────────────────────────── */}
      {showSettings && (
        <SettingsModal
          onClose={() => setShowSettings(false)}
          onThemeChange={applyTheme}
          onSettingsChange={handleSettingsChange}
          theme={theme}
        />
      )}

      {showLoadData && <LoadDataModal onClose={() => setShowLoadData(false)} onLoaded={() => { runtimeDirtyRef.current = true; persistRuntimeState({ force: true, includeLocalBackup: false }); setCatalogRefreshKey(k => k + 1) }} />}

      {showDBConnection && dbConnectionTarget && (
        <DBConnectionModal
          dbName={dbConnectionTarget}
          onConnect={handleDBConnectionConfirm}
          onClose={() => { setShowDBConnection(false); setDbConnectionTarget(null) }}
        />
      )}

      {toast && <Toast msg={toast.msg} type={toast.type} onDone={() => setToast(null)} />}

      {/* Close create menu on outside click */}
      {showCreateMenu && <div style={{ position: 'fixed', inset: 0, zIndex: 99 }} onClick={() => setShowCreateMenu(false)} />}

      {/* Tab context menu */}
      {tabCtxMenu && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 999 }} onClick={() => setTabCtxMenu(null)} onContextMenu={e => { e.preventDefault(); setTabCtxMenu(null) }} />
          <div style={{ position: 'fixed', left: tabCtxMenu.x, top: tabCtxMenu.y, zIndex: 1000, background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 8, boxShadow: '0 8px 32px rgba(0,0,0,0.5)', minWidth: 160, padding: '4px 0' }}>
            {[{
              label: 'Rename',
              action: () => { const t = tabs.find(t => t.id === tabCtxMenu.tabId); if (t) { setRenamingTab(t.id); setRenameVal(t.label); setActiveTab(t.id) } }
            }, {
              label: 'Close',
              action: () => closeTab({ stopPropagation: () => {} }, tabCtxMenu.tabId)
            }, {
              label: 'Close Others',
              action: () => { setTabs(prev => prev.filter(t => t.id === tabCtxMenu.tabId)); setActiveTab(tabCtxMenu.tabId) }
            }, {
              label: 'Close All',
              action: () => { setTabs([{ id: 1, label: 'Query 1', sql: NEW_QUERY_SQL }]); setActiveTab(1) }
            }].map(({ label, action }) => (
              <div key={label}
                onClick={() => { action(); setTabCtxMenu(null) }}
                style={{ padding: '7px 16px', cursor: 'pointer', fontSize: 12, color: label === 'Close All' ? '#f85149' : 'var(--text-primary)' }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                {label}
              </div>
            ))}
          </div>
        </>
      )}

      <style jsx global>{`
        @keyframes rcr-spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }
        @keyframes rcr-fadein { from { opacity: 0; transform: translateY(6px) } to { opacity: 1; transform: translateY(0) } }
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #30363d; border-radius: 3px; }
        ::-webkit-scrollbar-thumb:hover { background: #484f58; }
        select option { background: var(--bg-panel); color: var(--text-primary); }
      `}</style>
    </div>
  )
}
