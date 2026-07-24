'use client'
import { useState, useEffect } from 'react'
import { getSettings, saveSettings } from '@/lib/appStore'

const ACCENT_COLORS = ['#1f6feb', '#3fb950', '#8957e5', '#db61a2', '#e8bf6a', '#f85149', '#1abc9c', '#ff8c42']
const FONT_FAMILIES = [
  ["'Cascadia Code', 'Consolas', monospace", 'Cascadia Code'],
  ["'Consolas', 'Courier New', monospace", 'Consolas'],
  ["'JetBrains Mono', monospace", 'JetBrains Mono'],
  ["'Fira Code', monospace", 'Fira Code'],
  ["'Courier New', monospace", 'Courier New'],
]

export default function SettingsModal({ onClose, onThemeChange, onSettingsChange, theme }) {
  const [tab, setTab] = useState('general')
  const [settings, setSettings] = useState({ theme: 'dark', fontSize: 13, autoComplete: true, autoFormat: false, limitDefault: 100, wordWrap: true, minimap: false, lineNumbers: true, tabSize: 2, cursorStyle: 'line', fontFamily: '', accentColor: '' })
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    const s = getSettings()
    setSettings(prev => ({ ...prev, ...s }))
  }, [])

  const handleSave = () => {
    if (onSettingsChange) onSettingsChange(settings)
    else { saveSettings(settings); onThemeChange && onThemeChange(settings.theme) }
    setSaved(true)
    setTimeout(() => { setSaved(false); onClose() }, 800)
  }

  const selectStyle = { background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 4, padding: '4px 8px', fontSize: 12, color: 'var(--text-primary)', outline: 'none', fontFamily: 'inherit' }

  const Section = ({ title, children }) => (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10, paddingBottom: 5, borderBottom: '1px solid var(--border)' }}>{title}</div>
      {children}
    </div>
  )

  const Row = ({ label, hint, children }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 12, color: 'var(--text-primary)', marginBottom: 2 }}>{label}</div>
        {hint && <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{hint}</div>}
      </div>
      {children}
    </div>
  )

  const Toggle = ({ checked, onChange }) => (
    <div onClick={() => onChange(!checked)}
      style={{ width: 36, height: 20, borderRadius: 10, background: checked ? '#3fb950' : '#30363d', cursor: 'pointer', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}>
      <div style={{ position: 'absolute', top: 3, left: checked ? 19 : 3, width: 14, height: 14, borderRadius: '50%', background: '#fff', transition: 'left 0.2s' }} />
    </div>
  )

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000 }} onClick={onClose}>
      <div style={{ background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 12, width: 720, height: 560, maxWidth: '95vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 80px rgba(0,0,0,0.6)' }} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <line x1="4" y1="6" x2="20" y2="6"/><circle cx="8" cy="6" r="2" fill="var(--bg-panel)"/>
              <line x1="4" y1="12" x2="20" y2="12"/><circle cx="16" cy="12" r="2" fill="var(--bg-panel)"/>
              <line x1="4" y1="18" x2="20" y2="18"/><circle cx="8" cy="18" r="2" fill="var(--bg-panel)"/>
            </svg>
            Settings
          </span>
          <div style={{ flex: 1 }} />
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>×</button>
        </div>

        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          {/* Sidebar tabs */}
          <div style={{ width: 160, background: 'var(--bg-secondary)', borderRight: '1px solid var(--border)', padding: '8px 0', flexShrink: 0 }}>
            {[
              ['general', <svg key="g" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="4" y1="6" x2="20" y2="6"/><circle cx="8" cy="6" r="2" fill="var(--bg-secondary)"/><line x1="4" y1="12" x2="20" y2="12"/><circle cx="16" cy="12" r="2" fill="var(--bg-secondary)"/><line x1="4" y1="18" x2="20" y2="18"/><circle cx="8" cy="18" r="2" fill="var(--bg-secondary)"/></svg>, 'General'],
              ['appearance', <svg key="a" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/><line x1="2" y1="12" x2="22" y2="12"/></svg>, 'Appearance'],
              ['editor', <svg key="e" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 7 8 12 4 17"/><line x1="12" y1="17" x2="20" y2="17"/></svg>, 'Editor'],
              ['about', <svg key="ab" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>, 'About'],
            ].map(([id, icon, label]) => (
              <div key={id} onClick={() => setTab(id)}
                style={{ padding: '8px 14px', cursor: 'pointer', fontSize: 12, color: tab === id ? 'var(--text-primary)' : 'var(--text-secondary)', background: tab === id ? 'var(--bg-active)' : 'transparent', borderLeft: tab === id ? '2px solid var(--accent-blue)' : '2px solid transparent', display: 'flex', alignItems: 'center', gap: 7 }}
                onMouseEnter={e => { if (tab !== id) e.currentTarget.style.background = 'var(--bg-hover)' }}
                onMouseLeave={e => { if (tab !== id) e.currentTarget.style.background = 'transparent' }}>
                {icon}{label}
              </div>
            ))}
          </div>

          {/* Content */}
          <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px' }}>
            {tab === 'general' && (
              <div>
                <Section title="Query Execution">
                  <Row label="Default Row Limit" hint="Max rows returned per query when Limit 100 is enabled">
                    <input type="number" value={settings.limitDefault} onChange={e => setSettings(s => ({ ...s, limitDefault: parseInt(e.target.value) || 100 }))}
                      style={{ width: 80, background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 4, padding: '4px 8px', fontSize: 12, color: 'var(--text-primary)', outline: 'none', textAlign: 'right' }} />
                  </Row>
                  <Row label="Auto-format on save" hint="Automatically format SQL when saving a query">
                    <Toggle checked={settings.autoFormat} onChange={v => setSettings(s => ({ ...s, autoFormat: v }))} />
                  </Row>
                </Section>
                <Section title="User Interface">
                  <Row label="Auto-complete" hint="Show SQL keyword suggestions while typing">
                    <Toggle checked={settings.autoComplete} onChange={v => setSettings(s => ({ ...s, autoComplete: v }))} />
                  </Row>
                </Section>
              </div>
            )}

            {tab === 'appearance' && (
              <div>
                <Section title="Theme">
                  <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
                    {[['dark', 'Dark', '#0f1117'], ['light', 'Light', '#f0f4f8']].map(([id, label, bg]) => (
                      <div key={id} onClick={() => setSettings(s => ({ ...s, theme: id }))}
                        style={{ flex: 1, padding: 12, borderRadius: 8, border: settings.theme === id ? '2px solid var(--accent-blue)' : '1px solid var(--border)', background: bg, cursor: 'pointer', textAlign: 'center' }}>
                        <div style={{ fontSize: 20, marginBottom: 4, display: 'flex', justifyContent: 'center' }}>
                          {id === 'dark'
                            ? <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={id === 'dark' ? '#e6edf3' : '#1a2030'} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
                            : <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#1a2030" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4"/><line x1="12" y1="2" x2="12" y2="4"/><line x1="12" y1="20" x2="12" y2="22"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="2" y1="12" x2="4" y2="12"/><line x1="20" y1="12" x2="22" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
                          }
                        </div>
                        <div style={{ fontSize: 11, color: id === 'dark' ? '#e6edf3' : '#1a2030', fontWeight: 600 }}>{label}</div>
                      </div>
                    ))}
                  </div>
                </Section>
                <Section title="Accent Color">
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                    {ACCENT_COLORS.map(c => (
                      <div key={c} onClick={() => setSettings(s => ({ ...s, accentColor: c }))} title={c}
                        style={{ width: 26, height: 26, borderRadius: '50%', background: c, cursor: 'pointer', border: (settings.accentColor || '#1f6feb') === c ? '2px solid var(--text-primary)' : '2px solid transparent', boxShadow: '0 0 0 1px var(--border)' }} />
                    ))}
                    <button onClick={() => setSettings(s => ({ ...s, accentColor: '' }))}
                      style={{ fontSize: 10, padding: '0 8px', borderRadius: 4, border: '1px solid var(--border)', background: 'var(--bg-tertiary)', color: 'var(--text-secondary)', cursor: 'pointer' }}>Reset</button>
                  </div>
                </Section>
                <Section title="Font">
                  <Row label="Editor font family" hint="Typeface used in the SQL editor">
                    <select value={settings.fontFamily || ''} onChange={e => setSettings(s => ({ ...s, fontFamily: e.target.value }))} style={selectStyle}>
                      <option value="">Default</option>
                      {FONT_FAMILIES.map(([val, label]) => <option key={label} value={val}>{label}</option>)}
                    </select>
                  </Row>
                  <Row label="Editor font size" hint="Size of text in the SQL editor">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <button onClick={() => setSettings(s => ({ ...s, fontSize: Math.max(10, s.fontSize - 1) }))}
                        style={{ width: 24, height: 24, borderRadius: 4, border: '1px solid var(--border)', background: 'var(--bg-tertiary)', color: 'var(--text-primary)', cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>−</button>
                      <span style={{ fontSize: 12, color: 'var(--text-primary)', width: 24, textAlign: 'center' }}>{settings.fontSize}</span>
                      <button onClick={() => setSettings(s => ({ ...s, fontSize: Math.min(20, s.fontSize + 1) }))}
                        style={{ width: 24, height: 24, borderRadius: 4, border: '1px solid var(--border)', background: 'var(--bg-tertiary)', color: 'var(--text-primary)', cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
                    </div>
                  </Row>
                </Section>
              </div>
            )}

            {tab === 'editor' && (
              <Section title="Editor Options">
                <Row label="Word wrap" hint="Wrap long SQL lines in the editor">
                  <Toggle checked={settings.wordWrap !== false} onChange={v => setSettings(s => ({ ...s, wordWrap: v }))} />
                </Row>
                <Row label="Auto-complete" hint="SQL keyword, table & column suggestions while typing">
                  <Toggle checked={settings.autoComplete !== false} onChange={v => setSettings(s => ({ ...s, autoComplete: v }))} />
                </Row>
                <Row label="Line numbers" hint="Show line numbers in the editor gutter">
                  <Toggle checked={settings.lineNumbers !== false} onChange={v => setSettings(s => ({ ...s, lineNumbers: v }))} />
                </Row>
                <Row label="Minimap" hint="Show mini overview of the editor">
                  <Toggle checked={!!settings.minimap} onChange={v => setSettings(s => ({ ...s, minimap: v }))} />
                </Row>
                <Row label="Tab size" hint="Number of spaces per indentation level">
                  <select value={settings.tabSize || 2} onChange={e => setSettings(s => ({ ...s, tabSize: parseInt(e.target.value) || 2 }))} style={selectStyle}>
                    {[2, 4, 8].map(n => <option key={n} value={n}>{n} spaces</option>)}
                  </select>
                </Row>
                <Row label="Cursor style" hint="Shape of the text caret">
                  <select value={settings.cursorStyle || 'line'} onChange={e => setSettings(s => ({ ...s, cursorStyle: e.target.value }))} style={selectStyle}>
                    {['line', 'block', 'underline'].map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </Row>
                <Row label="Cursor blinking" hint="Caret blink animation style">
                  <select value={settings.cursorBlinking || 'blink'} onChange={e => setSettings(s => ({ ...s, cursorBlinking: e.target.value }))} style={selectStyle}>
                    {['blink', 'smooth', 'phase', 'expand', 'solid'].map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </Row>
              </Section>
            )}

            {tab === 'about' && (
              <div>
                <div style={{ textAlign: 'center', padding: '20px 0' }}>
                  <img src={theme === 'dark' ? '/white_logo_alrajhi.png' : '/alrajhi_logo.png'} alt="Al Rajhi" style={{ height: 40, marginBottom: 12 }} onError={e => e.target.style.display = 'none'} />
                  <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>RCR Query Editor v2</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>Retail Credit Risk — Al Rajhi Bank</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.7 }}>
                    Version 2.0.0<br />
                    Built with Next.js 14 + Monaco Editor<br />
                    Local SQL workspace powered by AlaSQL<br />
                    © 2024 Al Rajhi Bank
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', padding: '12px 20px', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
          <button onClick={onClose} style={{ padding: '6px 16px', fontSize: 12, cursor: 'pointer', borderRadius: 5, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', fontFamily: 'inherit' }}>Cancel</button>
          <button onClick={handleSave} style={{ padding: '6px 20px', fontSize: 12, cursor: 'pointer', borderRadius: 5, border: 'none', background: saved ? '#3fb950' : 'var(--accent-blue)', color: '#fff', fontFamily: 'inherit', transition: 'background 0.2s' }}>
            {saved ? '✓ Saved!' : 'Save & Apply'}
          </button>
        </div>
      </div>
    </div>
  )
}
