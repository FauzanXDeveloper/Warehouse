'use client'

import { useState } from 'react'

export default function AnalysisPanel({ 
  sqlAnalysis, 
  dataAnalysis, 
  insights = [],
  visible = true 
}) {
  const [activeTab, setActiveTab] = useState('query') // 'query' | 'data' | 'insights'

  if (!visible) return null

  // Helper to format large numbers
  const fmt = (n) => typeof n === 'number' ? n.toLocaleString() : n

  // SVG Icons
  const InfoIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  )

  const WarningIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3.05h16.94a2 2 0 0 0 1.71-3.05L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  )

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      background: 'var(--bg-primary)',
      overflow: 'hidden',
      borderTop: '1px solid var(--border)',
    }}>
      {/* Tab Bar */}
      <div style={{
        display: 'flex',
        gap: 0,
        background: 'var(--bg-secondary)',
        borderBottom: '1px solid var(--border)',
        flexShrink: 0,
      }}>
        {[
          { id: 'query', label: 'SQL Analysis' },
          { id: 'data', label: 'Data Stats' },
          { id: 'insights', label: 'Insights' },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: '8px 14px',
              fontSize: 12,
              fontWeight: activeTab === tab.id ? 600 : 400,
              background: 'transparent',
              border: 'none',
              color: activeTab === tab.id ? 'var(--text-primary)' : 'var(--text-secondary)',
              borderBottom: activeTab === tab.id ? '2px solid var(--accent-blue)' : '2px solid transparent',
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{
        flex: 1,
        overflow: 'auto',
        padding: '12px 16px',
      }}>
        {/* SQL Analysis Tab */}
        {activeTab === 'query' && sqlAnalysis && (
          <div>
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase' }}>Query Type</div>
              <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--accent-blue)', marginBottom: 8 }}>{sqlAnalysis.type}</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{sqlAnalysis.description}</div>
            </div>

            {sqlAnalysis.tables && sqlAnalysis.tables.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase' }}>Tables Involved</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {sqlAnalysis.tables.map((tbl, i) => (
                    <div
                      key={i}
                      style={{
                        fontSize: 11,
                        background: 'rgba(31, 111, 235, 0.1)',
                        color: '#79c0ff',
                        padding: '4px 10px',
                        borderRadius: 4,
                        border: '1px solid rgba(31, 111, 235, 0.3)',
                      }}
                    >
                      {tbl}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {sqlAnalysis.columns && sqlAnalysis.columns.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase' }}>Selected Columns</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  {sqlAnalysis.columns.slice(0, 5).join(', ')}{sqlAnalysis.columns.length > 5 ? ` (+${sqlAnalysis.columns.length - 5} more)` : ''}
                </div>
              </div>
            )}

            {sqlAnalysis.clauses && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase' }}>Query Clauses</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {Object.entries(sqlAnalysis.clauses).map(([clause, active]) => {
                    if (clause === 'limit') return null
                    return (
                      <div
                        key={clause}
                        style={{
                          fontSize: 10,
                          padding: '3px 8px',
                          borderRadius: 3,
                          background: active ? '#3fb95033' : '#6e768166',
                          color: active ? '#3fb950' : '#8b949e',
                          border: `1px solid ${active ? '#3fb95055' : '#6e768144'}`,
                        }}
                      >
                        {clause === 'groupBy' ? 'GROUP BY' : clause === 'orderBy' ? 'ORDER BY' : clause}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Data Stats Tab */}
        {activeTab === 'data' && dataAnalysis && (
          <div>
            <div style={{ marginBottom: 16, padding: '10px 12px', background: 'var(--bg-secondary)', borderRadius: 6, border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase' }}>Summary</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Total Rows</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: '#79c0ff' }}>{fmt(dataAnalysis.rowCount)}</div>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Columns</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: '#79c0ff' }}>{fmt(dataAnalysis.columnCount)}</div>
                </div>
                {typeof dataAnalysis.summary?.qualityScore === 'number' && (
                  <div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Quality Score</div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: dataAnalysis.summary.qualityScore >= 90 ? '#3fb950' : dataAnalysis.summary.qualityScore >= 70 ? '#e8bf6a' : '#f85149' }}>{dataAnalysis.summary.qualityScore}/100</div>
                  </div>
                )}
                {typeof dataAnalysis.summary?.avgCompleteness === 'number' && (
                  <div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Completeness</div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: '#79c0ff' }}>{dataAnalysis.summary.avgCompleteness}%</div>
                  </div>
                )}
              </div>

              {dataAnalysis.summary?.columnTypes && (
                <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 6 }}>Column Types</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 11 }}>
                    {dataAnalysis.summary.columnTypes.numeric > 0 && (
                      <div><span style={{ color: '#79c0ff' }}>●</span> Numeric: {dataAnalysis.summary.columnTypes.numeric}</div>
                    )}
                    {dataAnalysis.summary.columnTypes.string > 0 && (
                      <div><span style={{ color: '#ffa657' }}>●</span> String: {dataAnalysis.summary.columnTypes.string}</div>
                    )}
                    {dataAnalysis.summary.columnTypes.date > 0 && (
                      <div><span style={{ color: '#3fb950' }}>●</span> Date: {dataAnalysis.summary.columnTypes.date}</div>
                    )}
                    {dataAnalysis.summary.columnTypes.boolean > 0 && (
                      <div><span style={{ color: '#f85149' }}>●</span> Boolean: {dataAnalysis.summary.columnTypes.boolean}</div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Column Stats */}
            {dataAnalysis.stats && dataAnalysis.stats.length > 0 && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 10, textTransform: 'uppercase' }}>Column Details</div>
                {dataAnalysis.stats.slice(0, 10).map((stat, i) => (
                  <div
                    key={i}
                    style={{
                      marginBottom: 10,
                      padding: '10px 12px',
                      background: 'var(--bg-secondary)',
                      borderRadius: 6,
                      border: '1px solid var(--border)',
                    }}
                  >
                    <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 4 }}>{stat.name}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 6 }}>
                      {stat.type === 'numeric' && `Numeric • ${stat.count} values`}
                      {stat.type === 'string' && `String • ${stat.distinct} unique`}
                      {stat.type === 'date' && `Date • ${stat.count} dates`}
                      {stat.type === 'boolean' && `Boolean`}
                      {stat.nullCount > 0 && ` • ${stat.nullCount} NULL`}
                    </div>

                    {stat.type === 'numeric' && (
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, fontSize: 11 }}>
                        <div><span style={{ color: 'var(--text-muted)' }}>Min:</span> {fmt(stat.min)}</div>
                        <div><span style={{ color: 'var(--text-muted)' }}>Max:</span> {fmt(stat.max)}</div>
                        <div><span style={{ color: 'var(--text-muted)' }}>Avg:</span> {fmt(Math.round(stat.avg))}</div>
                        <div><span style={{ color: 'var(--text-muted)' }}>Median:</span> {fmt(Math.round(stat.median))}</div>
                        <div><span style={{ color: 'var(--text-muted)' }}>Std:</span> {fmt(Math.round(stat.stddev))}</div>
                        <div><span style={{ color: 'var(--text-muted)' }}>Sum:</span> {fmt(Math.round(stat.sum))}</div>
                        {typeof stat.p25 === 'number' && <div><span style={{ color: 'var(--text-muted)' }}>P25:</span> {fmt(Math.round(stat.p25))}</div>}
                        {typeof stat.p75 === 'number' && <div><span style={{ color: 'var(--text-muted)' }}>P75:</span> {fmt(Math.round(stat.p75))}</div>}
                        <div><span style={{ color: 'var(--text-muted)' }}>Distinct:</span> {fmt(stat.distinct)}</div>
                      </div>
                    )}

                    {stat.type === 'string' && (
                      <div style={{ fontSize: 10, color: 'var(--text-secondary)' }}>
                        <div style={{ color: 'var(--text-muted)', marginBottom: 4 }}>Length {stat.minLength}–{stat.maxLength} (avg {stat.avgLength}) · {stat.completeness}% filled</div>
                        {stat.top3 && stat.top3.length > 0 && (
                          <>
                            <div style={{ color: 'var(--text-muted)', marginBottom: 2 }}>Top values:</div>
                            {stat.top3.map((t, j) => (
                              <div key={j}>"{t.value}" ({((t.count / dataAnalysis.rowCount) * 100).toFixed(0)}%)</div>
                            ))}
                          </>
                        )}
                      </div>
                    )}

                    {stat.type === 'date' && stat.earliest && (
                      <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                        {stat.earliest} to {stat.latest}
                      </div>
                    )}

                    {stat.type === 'boolean' && (
                      <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                        <div>True: {stat.trueCount} ({stat.truePercent}%)</div>
                        <div>False: {stat.falseCount} ({(100 - parseFloat(stat.truePercent)).toFixed(1)}%)</div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Insights Tab */}
        {activeTab === 'insights' && (
          <div>
            {insights && insights.length > 0 ? (
              <div>
                {insights.map((insight, i) => (
                  <div
                    key={i}
                    style={{
                      display: 'flex',
                      gap: 10,
                      marginBottom: 10,
                      padding: '12px 14px',
                      background: 'var(--bg-secondary)',
                      borderRadius: 6,
                      border: `1px solid ${insight.type === 'warning' ? 'rgba(248, 81, 73, 0.3)' : 'rgba(31, 111, 235, 0.3)'}`,
                      color: insight.type === 'warning' ? '#f85149' : '#79c0ff',
                    }}
                  >
                    <div style={{ marginTop: 2, flexShrink: 0 }}>
                      {insight.type === 'warning' ? <WarningIcon /> : <InfoIcon />}
                    </div>
                    <div style={{ fontSize: 12, lineHeight: 1.4 }}>
                      {insight.text}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '20px 10px', fontSize: 12 }}>
                No insights available
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
