'use client'
import { useState, useEffect } from 'react'
import {
  getScheduled,
  toggleScheduled,
  deleteScheduled,
  addScheduled,
  updateScheduled,
  getSavedQueries,
  getEmailSignatures,
  saveEmailSignature,
  updateEmailSignature,
  deleteEmailSignature,
} from '@/lib/appStore'

const WEEK_DAYS = [
  { value: 0, short: 'Sun', full: 'Sunday' },
  { value: 1, short: 'Mon', full: 'Monday' },
  { value: 2, short: 'Tue', full: 'Tuesday' },
  { value: 3, short: 'Wed', full: 'Wednesday' },
  { value: 4, short: 'Thu', full: 'Thursday' },
  { value: 5, short: 'Fri', full: 'Friday' },
  { value: 6, short: 'Sat', full: 'Saturday' },
]

function getDefaultDate() {
  return new Date().toISOString().slice(0, 10)
}

function getDefaultTime() {
  return '08:00'
}

function parseDateTimeLocal(date, time) {
  if (!date || !time) return null
  const dt = new Date(`${date}T${time}:00`)
  if (Number.isNaN(dt.getTime())) return null
  return dt
}

function formatDateTime(dt) {
  if (!dt) return 'Pending'
  return dt.toLocaleString([], {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function normalizeScheduleMeta(item) {
  if (item.scheduleMeta) return item.scheduleMeta
  return {
    mode: 'legacy',
    schedule: item.schedule || 'Manual',
  }
}

function computeNextRun(meta, now = new Date()) {
  if (!meta || meta.mode === 'legacy') return null

  if (meta.mode === 'once') {
    const runAt = parseDateTimeLocal(meta.date, meta.time)
    return runAt && runAt > now ? runAt : null
  }

  if (meta.mode !== 'recurring') return null

  const [hh, mm] = (meta.time || '08:00').split(':').map(v => Number(v))
  const allowedDays =
    meta.recurrence === 'daily' ? [0, 1, 2, 3, 4, 5, 6]
      : meta.recurrence === 'weekdays' ? [1, 2, 3, 4, 5]
      : meta.recurrence === 'weekends' ? [0, 6]
      : Array.isArray(meta.customDays) && meta.customDays.length > 0 ? meta.customDays : [1]

  for (let offset = 0; offset <= 14; offset++) {
    const candidate = new Date(now)
    candidate.setHours(0, 0, 0, 0)
    candidate.setDate(candidate.getDate() + offset)
    if (!allowedDays.includes(candidate.getDay())) continue
    candidate.setHours(Number.isNaN(hh) ? 8 : hh, Number.isNaN(mm) ? 0 : mm, 0, 0)
    if (candidate > now) return candidate
  }

  return null
}

function scheduleLabel(meta) {
  if (!meta) return 'Pending'
  if (meta.mode === 'legacy') return meta.schedule

  if (meta.mode === 'once') {
    const dt = parseDateTimeLocal(meta.date, meta.time)
    return `One-time · ${formatDateTime(dt)}`
  }

  if (meta.recurrence === 'daily') return `Every day at ${meta.time}`
  if (meta.recurrence === 'weekdays') return `Weekdays at ${meta.time}`
  if (meta.recurrence === 'weekends') return `Weekends at ${meta.time}`

  const days = (meta.customDays || [])
    .sort((a, b) => a - b)
    .map(d => WEEK_DAYS.find(w => w.value === d)?.short)
    .filter(Boolean)
    .join(', ')
  return `${days || 'Custom days'} at ${meta.time}`
}

function removeTrailingSignature(body, signatureContent) {
  if (!signatureContent) return body
  const normalizedBody = (body || '').trimEnd()
  const normalizedSignature = signatureContent.trim()
  if (!normalizedSignature) return body
  if (normalizedBody.endsWith(normalizedSignature)) {
    return normalizedBody.slice(0, normalizedBody.length - normalizedSignature.length).trimEnd()
  }
  return body
}

function appendSignature(body, signatureContent) {
  if (!signatureContent) return body
  const normalizedSignature = signatureContent.trim()
  if (!normalizedSignature) return body
  const base = (body || '').trimEnd()
  if (!base) return normalizedSignature
  if (base.endsWith(normalizedSignature)) return base
  return `${base}\n\n${normalizedSignature}`
}

export default function ScheduledPanel({ onOpenQuery, currentSql, width }) {
  const [items, setItems] = useState([])
  const [creating, setCreating] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [savedQueries, setSavedQueries] = useState([])
  const [signatures, setSignatures] = useState([])
  const [signatureEditorOpen, setSignatureEditorOpen] = useState(false)
  const [signatureForm, setSignatureForm] = useState({ id: null, name: '', content: '', imageUrl: '' })
  const [signaturePasteMessage, setSignaturePasteMessage] = useState('')
  const [schedulerStatus, setSchedulerStatus] = useState({ running: false, mailConfigured: false })
  const [form, setForm] = useState({
    queryId: '',
    mode: 'recurring',
    date: getDefaultDate(),
    time: getDefaultTime(),
    recurrence: 'daily',
    customDays: [1, 2, 3, 4, 5],
    exportType: 'csv',
    emailTo: '',
    emailCc: '',
    emailSubject: '',
    emailBody: '',
    emailImageUrl: '',
    signatureId: '',
  })
  const [expandedId, setExpandedId] = useState(null)

  const reload = () => setItems(getScheduled())
  const reloadSavedQueries = () => setSavedQueries(getSavedQueries())
  const reloadSignatures = () => setSignatures(getEmailSignatures())

  const resetForm = () => setForm({
    queryId: '',
    mode: 'recurring',
    date: getDefaultDate(),
    time: getDefaultTime(),
    recurrence: 'daily',
    customDays: [1, 2, 3, 4, 5],
    exportType: 'csv',
    emailTo: '',
    emailCc: '',
    emailSubject: '',
    emailBody: '',
    emailImageUrl: '',
    signatureId: '',
  })

  useEffect(() => {
    reload()
    reloadSavedQueries()
    reloadSignatures()

    fetch('/api/scheduler/init', { method: 'POST' })
      .then(r => r.json())
      .then(data => setSchedulerStatus({ running: !!data.running, mailConfigured: !!data.mailConfigured }))
      .catch(() => setSchedulerStatus({ running: false, mailConfigured: false }))

    fetch('/api/scheduler/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobs: getScheduled() }),
    }).catch(() => {})
  }, [])

  const handleToggleCustomDay = (day) => {
    setForm(prev => {
      const hasDay = prev.customDays.includes(day)
      let nextDays = hasDay ? prev.customDays.filter(d => d !== day) : [...prev.customDays, day]
      if (nextDays.length === 0) nextDays = [day]
      return { ...prev, customDays: nextDays }
    })
  }

  const selectedSignature = signatures.find(s => String(s.id) === String(form.signatureId)) || null

  const applySignatureSelection = (nextSignatureId, sigList = signatures) => {
    setForm(prev => {
      const prevSig = sigList.find(s => String(s.id) === String(prev.signatureId))
      const nextSig = sigList.find(s => String(s.id) === String(nextSignatureId))
      const withoutPrev = removeTrailingSignature(prev.emailBody, prevSig?.content)
      const withNext = appendSignature(withoutPrev, nextSig?.content)
      return {
        ...prev,
        signatureId: nextSignatureId,
        emailBody: withNext,
      }
    })
  }

  const openCreateForm = () => {
    reloadSavedQueries()
    reloadSignatures()
    setEditingId(null)
    resetForm()
    setCreating(true)
  }

  const openEditForm = (item) => {
    const meta = item.scheduleMeta || {}
    setEditingId(item.id)
    setCreating(true)
    setForm({
      queryId: String(item.queryId || ''),
      mode: meta.mode === 'once' ? 'once' : 'recurring',
      date: meta.date || getDefaultDate(),
      time: meta.time || getDefaultTime(),
      recurrence: meta.recurrence || 'daily',
      customDays: Array.isArray(meta.customDays) && meta.customDays.length > 0 ? meta.customDays : [1, 2, 3, 4, 5],
      exportType: item.exportType || 'csv',
      emailTo: item.email?.to || '',
      emailCc: item.email?.cc || '',
      emailSubject: item.email?.subject || '',
      emailBody: item.email?.body || '',
      emailImageUrl: item.email?.imageUrl || '',
      signatureId: String(item.signatureId || ''),
    })
    reloadSavedQueries()
    reloadSignatures()
  }

  const handleSaveSignature = () => {
    if (!signatureForm.name.trim()) return
    if (!signatureForm.content.trim() && !signatureForm.imageUrl.trim()) return
    let updated = []
    if (signatureForm.id) {
      updated = updateEmailSignature({ id: signatureForm.id, name: signatureForm.name.trim(), content: signatureForm.content.trim(), imageUrl: signatureForm.imageUrl.trim() })
      setSignatures(updated)
      if (String(form.signatureId) === String(signatureForm.id)) {
        applySignatureSelection(String(signatureForm.id), updated)
      }
    } else {
      updated = saveEmailSignature({ name: signatureForm.name.trim(), content: signatureForm.content.trim(), imageUrl: signatureForm.imageUrl.trim() })
      setSignatures(updated)
      const created = updated[0]
      if (created) applySignatureSelection(String(created.id), updated)
    }
    setSignatureEditorOpen(false)
    setSignatureForm({ id: null, name: '', content: '', imageUrl: '' })
    setSignaturePasteMessage('')
  }

  const startAddSignature = () => {
    setSignatureForm({ id: null, name: '', content: '', imageUrl: '' })
    setSignaturePasteMessage('')
    setSignatureEditorOpen(true)
  }

  const startEditSignature = () => {
    if (!selectedSignature) return
    setSignatureForm({ id: selectedSignature.id, name: selectedSignature.name, content: selectedSignature.content, imageUrl: selectedSignature.imageUrl || '' })
    setSignaturePasteMessage('')
    setSignatureEditorOpen(true)
  }

  const handleDeleteSignature = () => {
    if (!selectedSignature) return
    const confirmed = window.confirm(`Delete signature "${selectedSignature.name}"?`)
    if (!confirmed) return
    const updated = deleteEmailSignature(selectedSignature.id)
    setSignatures(updated)
    applySignatureSelection('', updated)
    if (signatureEditorOpen && String(signatureForm.id) === String(selectedSignature.id)) {
      setSignatureEditorOpen(false)
      setSignatureForm({ id: null, name: '', content: '', imageUrl: '' })
      setSignaturePasteMessage('')
    }
  }

  const handleSignatureImagePaste = (event) => {
    const clipboardItems = Array.from(event.clipboardData?.items || [])
    const imageItem = clipboardItems.find(item => item.type.startsWith('image/'))
    if (!imageItem) return
    event.preventDefault()
    const imageFile = imageItem.getAsFile()
    if (!imageFile) {
      setSignaturePasteMessage('Could not read pasted image.')
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = typeof reader.result === 'string' ? reader.result : ''
      if (!dataUrl) {
        setSignaturePasteMessage('Could not convert pasted image.')
        return
      }
      setSignatureForm(prev => ({ ...prev, imageUrl: dataUrl }))
      setSignaturePasteMessage('Image pasted into signature.')
    }
    reader.onerror = () => setSignaturePasteMessage('Could not convert pasted image.')
    reader.readAsDataURL(imageFile)
  }

  const handleCreate = () => {
    const selectedQuery = savedQueries.find(q => String(q.id) === String(form.queryId))
    if (!selectedQuery) return
    if (!form.emailTo.trim()) return

    const sql = selectedQuery.sql
    if (!sql?.trim()) return

    const meta = form.mode === 'once'
      ? { mode: 'once', date: form.date, time: form.time }
      : {
          mode: 'recurring',
          recurrence: form.recurrence,
          time: form.time,
          customDays: form.recurrence === 'custom' ? [...form.customDays] : [],
        }

    const next = computeNextRun(meta)
    const pretty = scheduleLabel(meta)
    const subject = form.emailSubject.trim() || `Scheduled Report: ${selectedQuery.name}`
    const selectedSig = signatures.find(s => String(s.id) === String(form.signatureId))

    const payload = {
      name: selectedQuery.name,
      queryId: selectedQuery.id,
      queryName: selectedQuery.name,
      schedule: pretty,
      scheduleMeta: meta,
      nextRun: next ? formatDateTime(next) : 'Pending',
      nextRunAt: next ? next.toISOString() : null,
      exportType: form.exportType,
      deliveryType: 'query-results',
      email: {
        to: form.emailTo.trim(),
        cc: form.emailCc.trim(),
        subject,
        body: form.emailBody.trim(),
        imageUrl: form.emailImageUrl.trim(),
      },
      signatureId: selectedSig?.id || null,
      signatureName: selectedSig?.name || '',
      signatureContent: selectedSig?.content || '',
      signatureImageUrl: selectedSig?.imageUrl || '',
      sql,
      enabled: true,
    }

    if (editingId) {
      const prev = items.find(i => i.id === editingId)
      if (!prev) return
      setItems(updateScheduled({ ...prev, ...payload, id: prev.id, lastRun: prev.lastRun, enabled: prev.enabled }))
    } else {
      setItems(addScheduled(payload))
    }

    setCreating(false)
    setEditingId(null)
    resetForm()
  }

  const previewMeta = form.mode === 'once'
    ? { mode: 'once', date: form.date, time: form.time }
    : {
        mode: 'recurring',
        recurrence: form.recurrence,
        time: form.time,
        customDays: form.recurrence === 'custom' ? form.customDays : [],
      }
  const previewNext = computeNextRun(previewMeta)
  const previewLabel = scheduleLabel(previewMeta)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg-secondary)', width, borderRight: '1px solid var(--border)' }}>
      <div style={{ padding: '10px', borderBottom: '1px solid var(--border)', overflowY: creating ? 'auto' : 'visible', maxHeight: creating ? '70%' : 'none', flexShrink: creating ? 1 : 0 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>Scheduled Queries</div>
        <div style={{ fontSize: 10, color: schedulerStatus.mailConfigured ? '#3fb950' : '#e8bf6a', marginBottom: 8, lineHeight: 1.35 }}>
          {schedulerStatus.mailConfigured
            ? 'Backend scheduler is active and SMTP is configured.'
            : 'Backend scheduler is active, but SMTP is not configured. Set SMTP env vars to send real emails.'}
        </div>
          {!creating ? (
          <button onClick={openCreateForm}
            style={{ width: '100%', padding: '5px', fontSize: 11, cursor: 'pointer', borderRadius: 4, border: '1px solid var(--accent-blue)', background: 'transparent', color: 'var(--accent-blue)', fontFamily: 'inherit' }}>
            + Schedule Query
          </button>
        ) : (
          <div style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 6, padding: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>{editingId ? 'Edit Scheduled Query' : 'New Scheduled Query'}</div>
            {savedQueries.length === 0 ? (
              <div style={{ fontSize: 10, color: '#e8bf6a', marginBottom: 8, lineHeight: 1.45 }}>
                No saved query found. Save your query first in the Queries panel, then come back and schedule it.
              </div>
            ) : (
              <>
                <label style={{ fontSize: 10, color: 'var(--text-muted)', display: 'block', marginBottom: 2 }}>Saved Query (Dropdown)</label>
                <select value={form.queryId} onChange={e => setForm(f => ({ ...f, queryId: e.target.value }))}
                  style={{ width: '100%', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 3, padding: '4px 8px', fontSize: 11, color: 'var(--text-primary)', outline: 'none', marginBottom: 6, cursor: 'pointer', boxSizing: 'border-box' }}>
                  <option value="">Select saved query…</option>
                  {savedQueries.map(q => <option key={q.id} value={q.id}>{q.name}</option>)}
                </select>
              </>
            )}

            <label style={{ fontSize: 10, color: 'var(--text-muted)', display: 'block', marginBottom: 2 }}>Run Type</label>
            <select value={form.mode} onChange={e => setForm(f => ({ ...f, mode: e.target.value }))}
              style={{ width: '100%', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 3, padding: '4px 8px', fontSize: 11, color: 'var(--text-primary)', outline: 'none', marginBottom: 6, cursor: 'pointer', boxSizing: 'border-box' }}>
              <option value="recurring">Recurring</option>
              <option value="once">One-time</option>
            </select>

            {form.mode === 'once' ? (
              <>
                <label style={{ fontSize: 10, color: 'var(--text-muted)', display: 'block', marginBottom: 2 }}>Calendar Date</label>
                <input type="date" value={form.date} min={getDefaultDate()} onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                  style={{ width: '100%', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 3, padding: '4px 8px', fontSize: 11, color: 'var(--text-primary)', outline: 'none', marginBottom: 6, boxSizing: 'border-box' }} />
              </>
            ) : (
              <>
                <label style={{ fontSize: 10, color: 'var(--text-muted)', display: 'block', marginBottom: 2 }}>Recurrence</label>
                <select value={form.recurrence} onChange={e => setForm(f => ({ ...f, recurrence: e.target.value }))}
                  style={{ width: '100%', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 3, padding: '4px 8px', fontSize: 11, color: 'var(--text-primary)', outline: 'none', marginBottom: 6, cursor: 'pointer', boxSizing: 'border-box' }}>
                  <option value="daily">Every day</option>
                  <option value="weekdays">Weekdays (Mon-Fri)</option>
                  <option value="weekends">Weekends (Sat-Sun)</option>
                  <option value="custom">Custom weekdays</option>
                </select>

                {form.recurrence === 'custom' && (
                  <div style={{ display: 'flex', gap: 4, marginBottom: 6, flexWrap: 'wrap' }}>
                    {WEEK_DAYS.map(day => {
                      const selected = form.customDays.includes(day.value)
                      return (
                        <button
                          key={day.value}
                          type="button"
                          onClick={() => handleToggleCustomDay(day.value)}
                          title={day.full}
                          style={{
                            padding: '3px 7px',
                            borderRadius: 4,
                            border: `1px solid ${selected ? 'var(--accent-blue)' : 'var(--border)'}`,
                            background: selected ? 'rgba(31,111,235,0.15)' : 'var(--bg-primary)',
                            color: selected ? 'var(--accent-blue-light)' : 'var(--text-secondary)',
                            cursor: 'pointer',
                            fontSize: 10,
                          }}
                        >
                          {day.short}
                        </button>
                      )
                    })}
                  </div>
                )}
              </>
            )}

            <label style={{ fontSize: 10, color: 'var(--text-muted)', display: 'block', marginBottom: 2 }}>Time</label>
            <input type="time" value={form.time} onChange={e => setForm(f => ({ ...f, time: e.target.value }))}
              style={{ width: '100%', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 3, padding: '4px 8px', fontSize: 11, color: 'var(--text-primary)', outline: 'none', marginBottom: 6, cursor: 'pointer', boxSizing: 'border-box' }}>
            </input>

            <label style={{ fontSize: 10, color: 'var(--text-muted)', display: 'block', marginBottom: 2 }}>Export Type</label>
            <select value={form.exportType} onChange={e => setForm(f => ({ ...f, exportType: e.target.value }))}
              style={{ width: '100%', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 3, padding: '4px 8px', fontSize: 11, color: 'var(--text-primary)', outline: 'none', marginBottom: 6, cursor: 'pointer', boxSizing: 'border-box' }}>
              <option value="csv">CSV</option>
              <option value="json">JSON</option>
              <option value="tsv">TSV</option>
              <option value="xlsx">Excel (XLSX)</option>
            </select>

            <div style={{ marginBottom: 6 }}>
              <label style={{ fontSize: 10, color: 'var(--text-muted)', display: 'block', marginBottom: 2 }}>Signature</label>
              <div style={{ display: 'flex', gap: 4 }}>
                <select value={form.signatureId} onChange={e => applySignatureSelection(e.target.value)}
                  style={{ flex: 1, background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 3, padding: '4px 8px', fontSize: 11, color: 'var(--text-primary)', outline: 'none', cursor: 'pointer', boxSizing: 'border-box' }}>
                  <option value="">No signature</option>
                  {signatures.map(sig => <option key={sig.id} value={sig.id}>{sig.name}</option>)}
                </select>
                <button type="button" onClick={startAddSignature}
                  style={{ padding: '4px 8px', fontSize: 10, borderRadius: 3, border: '1px solid var(--border)', background: 'var(--bg-primary)', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                  Add Signature
                </button>
                <button type="button" onClick={startEditSignature} disabled={!selectedSignature}
                  style={{ padding: '4px 8px', fontSize: 10, borderRadius: 3, border: '1px solid var(--border)', background: 'var(--bg-primary)', color: selectedSignature ? 'var(--text-secondary)' : 'var(--text-muted)', cursor: selectedSignature ? 'pointer' : 'not-allowed' }}>
                  Edit
                </button>
              </div>
            </div>

            <label style={{ fontSize: 10, color: 'var(--text-muted)', display: 'block', marginBottom: 2 }}>To</label>
            <input value={form.emailTo} onChange={e => setForm(f => ({ ...f, emailTo: e.target.value }))} placeholder="risk-team@company.com"
              style={{ width: '100%', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 3, padding: '4px 8px', fontSize: 11, color: 'var(--text-primary)', outline: 'none', marginBottom: 6, boxSizing: 'border-box' }} />

            <label style={{ fontSize: 10, color: 'var(--text-muted)', display: 'block', marginBottom: 2 }}>CC</label>
            <input value={form.emailCc} onChange={e => setForm(f => ({ ...f, emailCc: e.target.value }))} placeholder="manager@company.com (optional)"
              style={{ width: '100%', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 3, padding: '4px 8px', fontSize: 11, color: 'var(--text-primary)', outline: 'none', marginBottom: 6, boxSizing: 'border-box' }} />

            <label style={{ fontSize: 10, color: 'var(--text-muted)', display: 'block', marginBottom: 2 }}>Subject</label>
            <input value={form.emailSubject} onChange={e => setForm(f => ({ ...f, emailSubject: e.target.value }))} placeholder="Monthly Risk Snapshot"
              style={{ width: '100%', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 3, padding: '4px 8px', fontSize: 11, color: 'var(--text-primary)', outline: 'none', marginBottom: 6, boxSizing: 'border-box' }} />

            <label style={{ fontSize: 10, color: 'var(--text-muted)', display: 'block', marginBottom: 2 }}>Email</label>
            <textarea value={form.emailBody} onChange={e => setForm(f => ({ ...f, emailBody: e.target.value }))} placeholder="Hello team, please find the scheduled report attached."
              style={{ width: '100%', height: 56, background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 3, padding: '4px 8px', fontSize: 11, color: 'var(--text-primary)', outline: 'none', fontFamily: 'inherit', resize: 'vertical', marginBottom: 6, boxSizing: 'border-box' }} />

            <label style={{ fontSize: 10, color: 'var(--text-muted)', display: 'block', marginBottom: 2 }}>Image URL (optional)</label>
            <input value={form.emailImageUrl} onChange={e => setForm(f => ({ ...f, emailImageUrl: e.target.value }))} placeholder="https://example.com/banner.png"
              style={{ width: '100%', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 3, padding: '4px 8px', fontSize: 11, color: 'var(--text-primary)', outline: 'none', marginBottom: 6, boxSizing: 'border-box' }} />

            {selectedSignature && (
              <div style={{ marginBottom: 6, padding: '6px 8px', borderRadius: 4, border: '1px dashed var(--border)', background: 'var(--bg-primary)' }}>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 3 }}>Signature Preview · {selectedSignature.name}</div>
                <div style={{ whiteSpace: 'pre-wrap', fontSize: 10, color: 'var(--text-secondary)' }}>{selectedSignature.content}</div>
                {selectedSignature.imageUrl && (
                  <img src={selectedSignature.imageUrl} alt="Signature" style={{ marginTop: 6, maxWidth: '100%', maxHeight: 120, objectFit: 'contain', borderRadius: 4, border: '1px solid var(--border)' }} />
                )}
              </div>
            )}

            <div style={{ marginBottom: 6, padding: '6px 8px', borderRadius: 4, border: '1px solid var(--border)', background: 'var(--bg-primary)' }}>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 3 }}>Preview</div>
              <div style={{ fontSize: 11, color: 'var(--text-primary)', marginBottom: 2 }}>{previewLabel}</div>
              <div style={{ fontSize: 10, color: 'var(--text-secondary)' }}>Next run: {formatDateTime(previewNext)}</div>
              <div style={{ fontSize: 10, color: 'var(--text-secondary)' }}>Delivery: query results attachment ({form.exportType.toUpperCase()})</div>
              <div style={{ fontSize: 10, color: '#e8bf6a', marginTop: 3 }}>Real email sending needs backend integration (SMTP/Graph). This screen configures schedule metadata.</div>
            </div>

            <div style={{ display: 'flex', gap: 4 }}>
              <button onClick={handleCreate} disabled={!form.queryId || !form.emailTo.trim() || savedQueries.length === 0}
                style={{ flex: 1, padding: '4px 0', fontSize: 11, cursor: 'pointer', borderRadius: 3, border: 'none', background: 'var(--accent-blue)', color: '#fff', fontFamily: 'inherit' }}>
                {editingId ? 'Save Changes' : 'Schedule'}
              </button>
              <button onClick={() => { setCreating(false); setEditingId(null); resetForm() }}
                style={{ padding: '4px 10px', fontSize: 11, cursor: 'pointer', borderRadius: 3, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', fontFamily: 'inherit' }}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {items.length === 0 && (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 11 }}>
            No scheduled queries yet.
          </div>
        )}
        {items.map(item => (
          <div key={item.id} style={{ borderBottom: '1px solid var(--border-light)', padding: '8px 10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              {/* Toggle */}
              <div onClick={() => setItems(toggleScheduled(item.id))}
                style={{ width: 32, height: 17, borderRadius: 9, background: item.enabled ? '#3fb950' : '#30363d', cursor: 'pointer', position: 'relative', transition: 'background 0.2s', flexShrink: 0 }}>
                <div style={{ position: 'absolute', top: 2, left: item.enabled ? 17 : 2, width: 13, height: 13, borderRadius: '50%', background: '#fff', transition: 'left 0.2s' }} />
              </div>
              <span style={{ flex: 1, fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</span>
              <button onClick={() => onOpenQuery && onOpenQuery(item.sql, item.name)} title="Open SQL"
                style={{ background: 'none', border: 'none', color: 'var(--accent-blue)', cursor: 'pointer', fontSize: 11, padding: '1px 4px' }}>▶</button>
              <button onClick={() => openEditForm(item)} title="Edit"
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 12, padding: '1px 4px' }}>✎</button>
              <button onClick={() => setExpandedId(expandedId === item.id ? null : item.id)} title="Details"
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 11, padding: '1px 4px' }}>
                {expandedId === item.id ? '▲' : '▼'}
              </button>
              <button onClick={() => setItems(deleteScheduled(item.id))} title="Delete"
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 14, padding: '1px 3px', lineHeight: 1 }}>×</button>
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: 4 }}><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>{scheduleLabel(normalizeScheduleMeta(item))}</div>
            {expandedId === item.id && (
              <div style={{ marginTop: 6, padding: 6, background: 'var(--bg-tertiary)', borderRadius: 4 }}>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 3 }}>
                  Last run: {item.lastRun} · Next: {item.nextRunAt ? formatDateTime(new Date(item.nextRunAt)) : (item.nextRun || 'Pending')}
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 3 }}>Query: {item.queryName || item.name}</div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 3 }}>Delivery: Query results attachment</div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 3 }}>Export: {(item.exportType || 'csv').toUpperCase()}</div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 3 }}>To: {item.email?.to || '-'}</div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 3 }}>CC: {item.email?.cc || '-'}</div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 3 }}>Subject: {item.email?.subject || '-'}</div>
                {item.email?.body && <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 3 }}>Email: {item.email.body}</div>}
                {item.email?.imageUrl && <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 3 }}>Image URL: {item.email.imageUrl}</div>}
                {item.signatureName && <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 3 }}>Signature: {item.signatureName}</div>}
                {item.signatureImageUrl && (
                  <img src={item.signatureImageUrl} alt="Signature" style={{ marginBottom: 3, maxWidth: '100%', maxHeight: 90, objectFit: 'contain', borderRadius: 3, border: '1px solid var(--border)' }} />
                )}
                <pre style={{ fontSize: 10, color: 'var(--text-secondary)', fontFamily: 'monospace', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.sql}</pre>
              </div>
            )}
          </div>
        ))}
      </div>

      {signatureEditorOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ width: 'min(560px, 92vw)', background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 8, boxShadow: '0 12px 36px rgba(0,0,0,0.45)', padding: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>{signatureForm.id ? 'Edit Signature' : 'Add Signature'}</div>
            <input value={signatureForm.name} onChange={e => setSignatureForm(s => ({ ...s, name: e.target.value }))} placeholder="Signature name"
              style={{ width: '100%', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 4, padding: '6px 8px', fontSize: 12, color: 'var(--text-primary)', outline: 'none', marginBottom: 8, boxSizing: 'border-box' }} />
            <textarea value={signatureForm.content} onChange={e => setSignatureForm(s => ({ ...s, content: e.target.value }))} placeholder="Thanks & Regards,\nYour Name"
              style={{ width: '100%', height: 180, background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 4, padding: '8px', fontSize: 12, color: 'var(--text-primary)', outline: 'none', fontFamily: 'inherit', resize: 'vertical', marginBottom: 10, boxSizing: 'border-box', whiteSpace: 'pre-wrap' }} />
            <div onPaste={handleSignatureImagePaste} style={{ marginBottom: 8, border: '1px dashed var(--border)', borderRadius: 4, padding: '8px', fontSize: 11, color: 'var(--text-muted)', background: 'var(--bg-primary)' }}>
              Paste image here with Cmd+V / Ctrl+V
            </div>
            <input value={signatureForm.imageUrl} onChange={e => setSignatureForm(s => ({ ...s, imageUrl: e.target.value }))} placeholder="Or paste image URL / data URL"
              style={{ width: '100%', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 4, padding: '6px 8px', fontSize: 12, color: 'var(--text-primary)', outline: 'none', marginBottom: 8, boxSizing: 'border-box' }} />
            {signaturePasteMessage && <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 8 }}>{signaturePasteMessage}</div>}
            {signatureForm.imageUrl && <img src={signatureForm.imageUrl} alt="Signature preview" style={{ marginBottom: 10, maxWidth: '100%', maxHeight: 160, objectFit: 'contain', borderRadius: 4, border: '1px solid var(--border)' }} />}
            <div style={{ display: 'flex', gap: 6, justifyContent: 'space-between' }}>
              <div>
                {signatureForm.id && (
                  <button type="button" onClick={handleDeleteSignature}
                    style={{ padding: '6px 10px', fontSize: 11, borderRadius: 4, border: '1px solid #f85149', background: 'transparent', color: '#f85149', cursor: 'pointer' }}>
                    Delete Signature
                  </button>
                )}
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
              <button type="button" onClick={() => { setSignatureEditorOpen(false); setSignatureForm({ id: null, name: '', content: '', imageUrl: '' }); setSignaturePasteMessage('') }}
                style={{ padding: '6px 10px', fontSize: 11, borderRadius: 4, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                Cancel
              </button>
              <button type="button" onClick={handleSaveSignature}
                style={{ padding: '6px 10px', fontSize: 11, borderRadius: 4, border: 'none', background: 'var(--accent-blue)', color: '#fff', cursor: 'pointer' }}>
                Save Signature
              </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
