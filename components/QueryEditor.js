'use client'

import { useRef, useEffect, useState, useCallback, memo } from 'react'
import dynamic from 'next/dynamic'
import { loader } from '@monaco-editor/react'
import { SQL_REFERENCE_FUNCTIONS, SQL_REFERENCE_KEYWORDS } from '@/lib/sqlReferenceCatalog'

loader.config({
  paths: {
    vs: '/monaco/vs',
  },
})

const MonacoEditor = dynamic(() => import('@monaco-editor/react'), { ssr: false })

const BASE_SQL_KEYWORDS = [
  'SELECT', 'FROM', 'WHERE', 'JOIN', 'LEFT', 'RIGHT', 'INNER', 'OUTER', 'FULL',
  'ON', 'GROUP BY', 'ORDER BY', 'HAVING', 'LIMIT', 'OFFSET', 'INSERT', 'INTO',
  'VALUES', 'UPDATE', 'SET', 'DELETE', 'CREATE', 'TABLE', 'VIEW', 'DROP', 'ALTER',
  'ADD', 'COLUMN', 'INDEX', 'WITH', 'AS', 'UNION', 'ALL', 'DISTINCT', 'COUNT',
  'SUM', 'AVG', 'MIN', 'MAX', 'COALESCE', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END',
  'NULL', 'NOT', 'NULL', 'IS', 'IN', 'LIKE', 'BETWEEN', 'AND', 'OR', 'ASC', 'DESC'
]

const SQL_KEYWORDS = Array.from(new Set([...BASE_SQL_KEYWORDS, ...SQL_REFERENCE_KEYWORDS]))

const SQL_FUNCTIONS = [
  {
    name: 'COALESCE',
    signature: 'COALESCE(value1, value2, ...)',
    parameters: ['value1', 'value2', '...'],
    description: 'Returns the first non-NULL value from the argument list.',
    example: 'COALESCE(income, 0)'
  },
  {
    name: 'NULLIF',
    signature: 'NULLIF(expression1, expression2)',
    parameters: ['expression1', 'expression2'],
    description: 'Returns NULL when expression1 equals expression2, otherwise returns expression1.',
    example: 'NULLIF(status, \'N/A\')'
  },
  {
    name: 'ISNULL',
    signature: 'ISNULL(expression, replacement)',
    parameters: ['expression', 'replacement'],
    description: 'SQL Server style function that replaces NULL with a specified replacement value.',
    example: 'ISNULL(balance, 0)'
  },
  {
    name: 'IFNULL',
    signature: 'IFNULL(expression, replacement)',
    parameters: ['expression', 'replacement'],
    description: 'Returns replacement when expression is NULL.',
    example: 'IFNULL(city, \'Unknown\')'
  },
  {
    name: 'NVL',
    signature: 'NVL(expression, replacement)',
    parameters: ['expression', 'replacement'],
    description: 'Oracle style NULL replacement function.',
    example: 'NVL(risk_score, 0)'
  },
  {
    name: 'IIF',
    signature: 'IIF(condition, true_value, false_value)',
    parameters: ['condition', 'true_value', 'false_value'],
    description: 'SQL Server style inline conditional expression.',
    example: 'IIF(credit_score >= 700, \'GOOD\', \'RISK\')'
  },
  {
    name: 'CAST',
    signature: 'CAST(expression AS data_type)',
    parameters: ['expression', 'data_type'],
    description: 'Converts an expression to a target data type.',
    example: 'CAST(age AS INT)'
  },
  {
    name: 'CONVERT',
    signature: 'CONVERT(data_type, expression[, style])',
    parameters: ['data_type', 'expression', 'style'],
    description: 'SQL Server style conversion function with optional format style.',
    example: 'CONVERT(VARCHAR, approved_date, 23)'
  },
  {
    name: 'TRY_CAST',
    signature: 'TRY_CAST(expression AS data_type)',
    parameters: ['expression', 'data_type'],
    description: 'Returns NULL when conversion fails instead of raising an error.',
    example: 'TRY_CAST(amount AS NUMBER)'
  },
  {
    name: 'TRY_CONVERT',
    signature: 'TRY_CONVERT(data_type, expression[, style])',
    parameters: ['data_type', 'expression', 'style'],
    description: 'SQL Server style safe conversion that returns NULL on failure.',
    example: 'TRY_CONVERT(INT, age_text)'
  },
  {
    name: 'CONCAT',
    signature: 'CONCAT(value1, value2, ...)',
    parameters: ['value1', 'value2', '...'],
    description: 'Concatenates multiple values into a single string.',
    example: 'CONCAT(first_name, \' \', last_name)'
  },
  {
    name: 'SUBSTRING',
    signature: 'SUBSTRING(expression, start, length)',
    parameters: ['expression', 'start', 'length'],
    description: 'Returns a substring from an expression based on start and length.',
    example: 'SUBSTRING(customer_id, 1, 3)'
  },
  {
    name: 'DATEDIFF',
    signature: 'DATEDIFF(datepart, start_date, end_date)',
    parameters: ['datepart', 'start_date', 'end_date'],
    description: 'SQL Server style date difference function.',
    example: 'DATEDIFF(day, application_date, approval_date)'
  },
  {
    name: 'DATEADD',
    signature: 'DATEADD(datepart, number, date)',
    parameters: ['datepart', 'number', 'date'],
    description: 'SQL Server style date add function.',
    example: 'DATEADD(month, 3, approval_date)'
  },
  {
    name: 'LEN',
    signature: 'LEN(expression)',
    parameters: ['expression'],
    description: 'SQL Server style string length function.',
    example: 'LEN(customer_name)'
  }
]

for (const fn of SQL_REFERENCE_FUNCTIONS) {
  if (!SQL_FUNCTIONS.some((f) => f.name === fn.name)) {
    SQL_FUNCTIONS.push(fn)
  }
}

const SQL_FUNCTION_LOOKUP = SQL_FUNCTIONS.reduce((acc, fn) => {
  acc[fn.name] = fn
  return acc
}, {})

function getFunctionContext(text) {
  const stack = []

  const getIdentifierBeforeParen = (input, parenIndex) => {
    let i = parenIndex - 1
    while (i >= 0 && /\s/.test(input[i])) i -= 1
    let end = i
    while (i >= 0 && /[A-Za-z0-9_]/.test(input[i])) i -= 1
    const name = input.slice(i + 1, end + 1).toUpperCase()
    return name || null
  }

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]
    if (ch === '(') {
      const fnName = getIdentifierBeforeParen(text, i)
      stack.push({ fnName, argsStart: i + 1 })
      continue
    }
    if (ch === ')') {
      if (stack.length > 0) stack.pop()
    }
  }

  while (stack.length > 0) {
    const current = stack[stack.length - 1]
    if (!current.fnName || !SQL_FUNCTION_LOOKUP[current.fnName]) {
      stack.pop()
      continue
    }

    const argsText = text.slice(current.argsStart)
    let depth = 0
    let commas = 0
    for (let i = 0; i < argsText.length; i += 1) {
      const ch = argsText[i]
      if (ch === '(') depth += 1
      else if (ch === ')') depth = Math.max(0, depth - 1)
      else if (ch === ',' && depth === 0) commas += 1
    }

    return { functionName: current.fnName, activeParameter: commas }
  }

  return null
}

function QueryEditor({ sql, value, modelPath, onChange, onSelectionChange, onRun, height = '100%', themeMode = 'dark', schema = [], editorOptions = {} }) {
  const editorRef = useRef(null)
  // Live schema (tables/columns) for autocompletion — read by the completion
  // provider (registered once) so we never re-register on schema changes.
  const schemaRef = useRef(schema)
  useEffect(() => { schemaRef.current = Array.isArray(schema) ? schema : [] }, [schema])
  const selectionTimerRef = useRef(null)
  const [searchVisible, setSearchVisible] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [replaceQuery, setReplaceQuery] = useState('')
  const [matches, setMatches] = useState([])
  const [currentMatchIndex, setCurrentMatchIndex] = useState(-1)
  const decorationsRef = useRef([])
  const completionProviderRef = useRef(null)
  const signatureProviderRef = useRef(null)
  const hoverProviderRef = useRef(null)
  const selectionListenerRef = useRef(null)
  const localChangeSeqRef = useRef(0)
  const localValueSeqMapRef = useRef(new Map())
  const lastSelectionTextRef = useRef('')
  const lastModelPathRef = useRef(modelPath || 'query.sql')
  const changeTimerRef = useRef(null)
  const selectionRafRef = useRef(null)
  // Always-current refs so Monaco commands never capture stale closures
  const onRunRef = useRef(onRun)
  const onSelectionChangeRef = useRef(onSelectionChange)
  useEffect(() => { onRunRef.current = onRun }, [onRun])
  useEffect(() => { onSelectionChangeRef.current = onSelectionChange }, [onSelectionChange])
  const effectiveSql = sql !== undefined ? sql : value

  useEffect(() => {
    return () => {
      if (selectionListenerRef.current?.dispose) selectionListenerRef.current.dispose()
      if (completionProviderRef.current?.dispose) completionProviderRef.current.dispose()
      if (signatureProviderRef.current?.dispose) signatureProviderRef.current.dispose()
      if (hoverProviderRef.current?.dispose) hoverProviderRef.current.dispose()
      selectionListenerRef.current = null
      completionProviderRef.current = null
      signatureProviderRef.current = null
      hoverProviderRef.current = null
      if (changeTimerRef.current) { clearTimeout(changeTimerRef.current); changeTimerRef.current = null }
      if (selectionRafRef.current) { cancelAnimationFrame(selectionRafRef.current); selectionRafRef.current = null }
      if (selectionTimerRef.current) { clearTimeout(selectionTimerRef.current); selectionTimerRef.current = null }
      editorRef.current = null
    }
  }, [])

  const clearSearchDecorations = useCallback(() => {
    const editor = editorRef.current
    if (!editor) return
    try {
      decorationsRef.current = editor.deltaDecorations(decorationsRef.current || [], [])
    } catch (e) {
      // ignore
    }
  }, [])

  const updateSearchMatches = useCallback((query, focusIndex = 0) => {
    const editor = editorRef.current
    if (!editor) return
    const model = editor.getModel()
    if (!model || !query) {
      setMatches([])
      setCurrentMatchIndex(-1)
      clearSearchDecorations()
      return
    }

    const opts = { isRegex: false, matchCase: false, wordSeparators: null }
    const found = model.findMatches(query, true, false, false, null, true) || []
    setMatches(found)

    const decorations = found.map((m, i) => ({ range: m.range, options: { inlineClassName: i === focusIndex ? 'cm-search-current' : 'cm-search-match' } }))
    try {
      decorationsRef.current = editor.deltaDecorations(decorationsRef.current || [], decorations)
    } catch (e) {
      // ignore
    }

    if (found.length === 0) {
      setCurrentMatchIndex(-1)
      return
    }

    const idx = Math.max(0, Math.min(focusIndex, found.length - 1))
    setCurrentMatchIndex(idx)
    const r = found[idx].range
    editor.revealRangeInCenter(r)
    editor.setSelection(r)
  }, [clearSearchDecorations])

  const openSearch = useCallback((initial = '') => {
    setSearchVisible(true)
    setTimeout(() => {
      setSearchQuery(initial)
      updateSearchMatches(initial, 0)
      const input = document.querySelector('.qe-search-input')
      if (input) input.focus()
    }, 40)
  }, [updateSearchMatches])

  const closeSearch = useCallback(() => {
    setSearchVisible(false)
    setSearchQuery('')
    setMatches([])
    setCurrentMatchIndex(-1)
    clearSearchDecorations()
    const editor = editorRef.current
    if (editor) editor.focus()
  }, [clearSearchDecorations])

  const gotoMatch = useCallback((dir = 1) => {
    if (!matches || matches.length === 0) return
    const next = (currentMatchIndex + dir + matches.length) % matches.length
    setCurrentMatchIndex(next)
    const editor = editorRef.current
    if (!editor) return
    const r = matches[next].range
    try {
      const decorations = matches.map((m, i) => ({ range: m.range, options: { inlineClassName: i === next ? 'cm-search-current' : 'cm-search-match' } }))
      decorationsRef.current = editor.deltaDecorations(decorationsRef.current || [], decorations)
    } catch (e) {}
    editor.revealRangeInCenter(r)
    editor.setSelection(r)
  }, [matches, currentMatchIndex])

  const replaceCurrentMatch = useCallback(() => {
    const editor = editorRef.current
    if (!editor || !searchQuery || matches.length === 0 || currentMatchIndex < 0) return
    const target = matches[currentMatchIndex]
    if (!target?.range) return

    editor.pushUndoStop()
    editor.executeEdits('qe-replace-one', [{ range: target.range, text: replaceQuery, forceMoveMarkers: true }])
    editor.pushUndoStop()

    const nextIndex = Math.min(currentMatchIndex, Math.max(0, matches.length - 1))
    updateSearchMatches(searchQuery, nextIndex)
  }, [searchQuery, replaceQuery, matches, currentMatchIndex, updateSearchMatches])

  const replaceAllMatches = useCallback(() => {
    const editor = editorRef.current
    if (!editor || !searchQuery) return
    const model = editor.getModel()
    if (!model) return

    const found = model.findMatches(searchQuery, true, false, false, null, true) || []
    if (found.length === 0) return

    const edits = found
      .slice()
      .reverse()
      .map((m) => ({ range: m.range, text: replaceQuery, forceMoveMarkers: true }))

    editor.pushUndoStop()
    editor.executeEdits('qe-replace-all', edits)
    editor.pushUndoStop()

    updateSearchMatches(searchQuery, 0)
  }, [searchQuery, replaceQuery, updateSearchMatches])

  function handleEditorDidMount(editor, monaco) {
    editorRef.current = editor

    if (!monaco?.languages?.registerCompletionItemProvider || !monaco?.languages?.CompletionItemKind) {
      return
    }

    if (completionProviderRef.current?.dispose) completionProviderRef.current.dispose()
    completionProviderRef.current = monaco.languages.registerCompletionItemProvider('sql', {
      triggerCharacters: ['(', ','],
      provideCompletionItems: () => {
        const keywordSuggestions = SQL_KEYWORDS.map(kw => ({
          label: kw,
          kind: monaco.languages.CompletionItemKind.Keyword,
          insertText: kw,
          detail: 'SQL Keyword'
        }))

        const functionSuggestions = SQL_FUNCTIONS.map(fn => ({
          label: fn.name,
          kind: monaco.languages.CompletionItemKind.Function,
          insertText: `${fn.name}()` ,
          detail: fn.signature,
          documentation: {
            value: `${fn.description}\n\nExample: ${fn.example}`
          }
        }))

        // Schema-aware suggestions: tables + de-duplicated column names
        const currentSchema = schemaRef.current || []
        const tableSuggestions = currentSchema.map(t => ({
          label: t.table,
          kind: monaco.languages.CompletionItemKind.Struct,
          insertText: t.table,
          detail: t.database ? `table · ${t.database}` : 'table',
          sortText: '0_' + t.table,
        }))
        const columnSeen = new Set()
        const columnSuggestions = []
        for (const t of currentSchema) {
          for (const c of (t.columns || [])) {
            const key = String(c.name).toLowerCase()
            if (columnSeen.has(key)) continue
            columnSeen.add(key)
            columnSuggestions.push({
              label: c.name,
              kind: monaco.languages.CompletionItemKind.Field,
              insertText: c.name,
              detail: `${c.type || 'column'} · ${t.table}`,
              sortText: '1_' + c.name,
            })
          }
        }

        return { suggestions: [...tableSuggestions, ...columnSuggestions, ...keywordSuggestions, ...functionSuggestions] }
      }
    })

    if (signatureProviderRef.current?.dispose) signatureProviderRef.current.dispose()
    signatureProviderRef.current = monaco.languages.registerSignatureHelpProvider('sql', {
      signatureHelpTriggerCharacters: ['(', ','],
      signatureHelpRetriggerCharacters: [','],
      provideSignatureHelp: (model, position) => {
        const textUntilCursor = model.getValueInRange({
          startLineNumber: 1,
          startColumn: 1,
          endLineNumber: position.lineNumber,
          endColumn: position.column,
        })

        const context = getFunctionContext(textUntilCursor)
        if (!context) return null

        const fn = SQL_FUNCTION_LOOKUP[context.functionName]
        if (!fn) return null

        const activeParameter = Math.min(context.activeParameter, Math.max(0, fn.parameters.length - 1))

        return {
          value: {
            signatures: [{
              label: fn.signature,
              documentation: {
                value: `${fn.description}\n\nExample: ${fn.example}`
              },
              parameters: fn.parameters.map(param => ({ label: param })),
            }],
            activeSignature: 0,
            activeParameter,
          },
          dispose: () => {},
        }
      }
    })

    if (hoverProviderRef.current?.dispose) hoverProviderRef.current.dispose()
    hoverProviderRef.current = monaco.languages.registerHoverProvider('sql', {
      provideHover: (model, position) => {
        const wordInfo = model.getWordAtPosition(position)
        if (!wordInfo?.word) return null
        const fn = SQL_FUNCTION_LOOKUP[wordInfo.word.toUpperCase()]
        if (!fn) return null

        return {
          range: new monaco.Range(position.lineNumber, wordInfo.startColumn, position.lineNumber, wordInfo.endColumn),
          contents: [
            { value: `**${fn.name}**` },
            { value: `\`${fn.signature}\`` },
            { value: fn.description },
            { value: `Example: \`${fn.example}\`` },
          ],
        }
      }
    })

    if (selectionListenerRef.current?.dispose) selectionListenerRef.current.dispose()
    selectionListenerRef.current = editor.onDidChangeCursorSelection(() => {
      // Debounce so rapid Shift+Arrow selection doesn't re-render the parent on
      // every keypress — the parent tree is large and that is the main lag source.
      if (selectionTimerRef.current) clearTimeout(selectionTimerRef.current)
      selectionTimerRef.current = setTimeout(() => {
        selectionTimerRef.current = null
        if (typeof onSelectionChangeRef.current !== 'function') return
        const sel = editor.getSelection()
        const text = sel ? (editor.getModel()?.getValueInRange(sel) || '') : ''
        if (text === lastSelectionTextRef.current) return
        lastSelectionTextRef.current = text
        onSelectionChangeRef.current(text)
      }, 120)
    })

    if (monaco?.KeyMod && monaco?.KeyCode?.Enter) {
      editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
        if (typeof onRunRef.current === 'function') onRunRef.current()
      })
    }

    // add custom search activation (Ctrl/Cmd+F) that opens our invisible search UI
    try {
      const FIND_CMD = monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyF
      editor.addCommand(FIND_CMD, () => {
        openSearch('')
      })
    } catch (e) {}

    try {
      const REPLACE_CMD = monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyH
      editor.addCommand(REPLACE_CMD, () => {
        openSearch('')
      })
    } catch (e) {}

    // add context menu action to open search
    try {
      editor.addAction({
        id: 'qe.openSearch',
        label: 'Search in Query',
        keybindings: [],
        contextMenuGroupId: 'navigation',
        contextMenuOrder: 1.5,
        run: () => { openSearch('') }
      })
    } catch (e) {}

    // close search on Escape
    editor.onKeyDown((e) => {
      if (e.keyCode === monaco.KeyCode.Escape && searchVisible) {
        closeSearch()
      }
    })

    editor.focus()
  }

  useEffect(() => {
    const editor = editorRef.current
    if (!editor) return
    const resolvedPath = modelPath || 'query.sql'
    const pathChanged = lastModelPathRef.current !== resolvedPath
    if (pathChanged) {
      lastModelPathRef.current = resolvedPath
      localChangeSeqRef.current = 0
      localValueSeqMapRef.current = new Map()
    }

    const incoming = effectiveSql ?? ''
    const current = editor.getValue()
    if (incoming === current) return

    const incomingSeq = localValueSeqMapRef.current.get(incoming) || 0
    if (!pathChanged && editor.hasTextFocus?.() && incomingSeq > 0 && incomingSeq < localChangeSeqRef.current) {
      return
    }

    const position = editor.getPosition()
    editor.setValue(incoming)
    if (position) editor.setPosition(position)
  }, [effectiveSql, modelPath])

  return (
    <div style={{ height, width: '100%', overflow: 'hidden', position: 'relative' }}>
      <MonacoEditor
        height={height}
        language="sql"
        theme={themeMode === 'light' ? 'vs' : 'vs-dark'}
        path={modelPath || 'query.sql'}
        defaultValue={effectiveSql}
        onChange={(nextValue) => {
          const next = nextValue ?? ''
          const nextSeq = localChangeSeqRef.current + 1
          localChangeSeqRef.current = nextSeq
          localValueSeqMapRef.current.set(next, nextSeq)
          if (localValueSeqMapRef.current.size > 300) {
            localValueSeqMapRef.current = new Map([[next, nextSeq]])
          }

          // Debounce outward updates to avoid rerendering large parent trees while typing
          if (changeTimerRef.current) clearTimeout(changeTimerRef.current)
          changeTimerRef.current = setTimeout(() => {
            changeTimerRef.current = null
            if (typeof onChange === 'function') onChange(next)
          }, 220)
        }}
        onMount={handleEditorDidMount}
        options={{
          fontSize: editorOptions.fontSize || 13,
          fontFamily: editorOptions.fontFamily || "'Cascadia Code', 'Consolas', 'Courier New', monospace",
          fontLigatures: true,
          minimap: { enabled: !!editorOptions.minimap },
          scrollBeyondLastLine: false,
          wordWrap: editorOptions.wordWrap === false ? 'off' : 'on',
          lineNumbers: editorOptions.lineNumbers === false ? 'off' : 'on',
          glyphMargin: false,
          folding: true,
          lineDecorationsWidth: 0,
          lineNumbersMinChars: 3,
          renderLineHighlight: 'line',
          cursorBlinking: editorOptions.cursorBlinking || 'blink',
          cursorStyle: editorOptions.cursorStyle || 'line',
          cursorSmoothCaretAnimation: 'off',
          smoothScrolling: false,
          tabSize: editorOptions.tabSize || 2,
          insertSpaces: true,
          automaticLayout: true,
          suggest: {
            showKeywords: true,
            showSnippets: true,
            showFunctions: true,
          },
          parameterHints: {
            enabled: true,
          },
          quickSuggestions: editorOptions.autoComplete === false
            ? { other: false, comments: false, strings: false }
            : { other: true, comments: false, strings: false },
          scrollbar: {
            verticalScrollbarSize: 6,
            horizontalScrollbarSize: 6,
          },
          padding: { top: 8, bottom: 8 },
          contextmenu: true,
          rulers: [],
          bracketPairColorization: { enabled: true },
          semanticHighlighting: { enabled: true },
        }}
      />

      {searchVisible && (
        <div style={{ position: 'absolute', right: 12, top: 12, zIndex: 30, background: themeMode === 'light' ? '#fff' : '#1f2937', border: '1px solid rgba(255,255,255,0.06)', padding: 8, borderRadius: 6, display: 'flex', gap: 8, alignItems: 'center', minWidth: 260 }}>
          <input
            className="qe-search-input"
            value={searchQuery}
            onChange={(e) => { const v = e.target.value; setSearchQuery(v); updateSearchMatches(v, 0) }}
            placeholder="Search in query (press Esc to close)"
            style={{ padding: '6px 8px', borderRadius: 4, border: '1px solid rgba(0,0,0,0.1)', background: themeMode === 'light' ? '#fff' : '#111827', color: themeMode === 'light' ? '#000' : '#fff', flex: 1 }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                gotoMatch(1)
              } else if (e.key === 'F3') {
                gotoMatch(e.shiftKey ? -1 : 1)
              } else if (e.key === 'Escape') {
                closeSearch()
              }
            }}
          />
          <input
            value={replaceQuery}
            onChange={(e) => setReplaceQuery(e.target.value)}
            placeholder="Replace"
            style={{ padding: '6px 8px', borderRadius: 4, border: '1px solid rgba(0,0,0,0.1)', background: themeMode === 'light' ? '#fff' : '#111827', color: themeMode === 'light' ? '#000' : '#fff', width: 150 }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                replaceCurrentMatch()
              } else if (e.key === 'Escape') {
                closeSearch()
              }
            }}
          />
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <button onClick={() => gotoMatch(-1)} title="Previous" style={{ padding: '6px 8px' }}>{'←'}</button>
            <button onClick={() => gotoMatch(1)} title="Next" style={{ padding: '6px 8px' }}>{'→'}</button>
            <button onClick={() => replaceCurrentMatch()} title="Replace current" style={{ padding: '6px 8px' }}>Replace</button>
            <button onClick={() => replaceAllMatches()} title="Replace all" style={{ padding: '6px 8px' }}>All</button>
          </div>
          <div style={{ color: themeMode === 'light' ? '#111' : '#ddd', fontSize: 12 }}>{matches.length > 0 ? `${currentMatchIndex + 1}/${matches.length}` : '0/0'}</div>
          <button onClick={() => closeSearch()} title="Close" style={{ marginLeft: 6, padding: '6px 8px' }}>✕</button>
        </div>
      )}

      <style>{`\n        .cm-search-match { background: rgba(250, 204, 21, 0.18); border-bottom: 1px solid rgba(250,204,21,0.35); }\n        .cm-search-current { background: rgba(250, 204, 21, 0.35); border-bottom: 1px solid rgba(250,204,21,0.6); }\n      `}</style>
    </div>
  )
}

// Memoised so unrelated parent re-renders (toasts, result streaming, tab metadata)
// don't force the Monaco tree to reconcile — keeps typing and selection smooth.
export default memo(QueryEditor)
