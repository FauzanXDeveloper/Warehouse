import fs from 'fs/promises'
import path from 'path'
import nodemailer from 'nodemailer'
import * as XLSX from 'xlsx'
import { executeQuery } from '../queryEngine'

const STORE_DIR = path.join(process.cwd(), '.runtime')
const STORE_FILE = path.join(STORE_DIR, 'scheduled-jobs.json')

function parseTime(time = '08:00') {
  const [hh, mm] = String(time).split(':').map(v => Number(v))
  return { hh: Number.isNaN(hh) ? 8 : hh, mm: Number.isNaN(mm) ? 0 : mm }
}

function computeNextRun(meta, now = new Date()) {
  if (!meta) return null

  if (meta.mode === 'once') {
    if (!meta.date || !meta.time) return null
    const dt = new Date(`${meta.date}T${meta.time}:00`)
    return Number.isNaN(dt.getTime()) || dt <= now ? null : dt
  }

  if (meta.mode !== 'recurring') return null

  const { hh, mm } = parseTime(meta.time)
  const allowedDays =
    meta.recurrence === 'daily' ? [0, 1, 2, 3, 4, 5, 6]
      : meta.recurrence === 'weekdays' ? [1, 2, 3, 4, 5]
      : meta.recurrence === 'weekends' ? [0, 6]
      : Array.isArray(meta.customDays) && meta.customDays.length > 0 ? meta.customDays : [1]

  for (let offset = 0; offset <= 21; offset++) {
    const candidate = new Date(now)
    candidate.setHours(0, 0, 0, 0)
    candidate.setDate(candidate.getDate() + offset)
    if (!allowedDays.includes(candidate.getDay())) continue
    candidate.setHours(hh, mm, 0, 0)
    if (candidate > now) return candidate
  }

  return null
}

function formatCsv(rows, columns, separator = ',') {
  const esc = (value) => {
    if (value === null || value === undefined) return ''
    const text = String(value)
    if (text.includes('"') || text.includes('\n') || text.includes('\r') || text.includes(separator)) {
      return `"${text.replace(/"/g, '""')}"`
    }
    return text
  }
  const head = columns.join(separator)
  const body = rows.map(row => columns.map(c => esc(row[c])).join(separator)).join('\n')
  return `${head}\n${body}`
}

function buildAttachment(resultSet, exportType = 'csv', baseName = 'query_results') {
  const columns = resultSet?.columns || []
  const rows = resultSet?.rows || []

  if (exportType === 'json') {
    return {
      filename: `${baseName}.json`,
      content: JSON.stringify(rows, null, 2),
      contentType: 'application/json',
    }
  }

  if (exportType === 'tsv') {
    return {
      filename: `${baseName}.tsv`,
      content: formatCsv(rows, columns, '\t'),
      contentType: 'text/tab-separated-values',
    }
  }

  if (exportType === 'xlsx') {
    const worksheetRows = rows.length > 0 ? rows : [Object.fromEntries(columns.map(c => [c, '']))]
    const worksheet = XLSX.utils.json_to_sheet(worksheetRows, { header: columns.length > 0 ? columns : undefined })
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Results')
    const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' })
    return {
      filename: `${baseName}.xlsx`,
      content: buffer,
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }
  }

  return {
    filename: `${baseName}.csv`,
    content: formatCsv(rows, columns, ','),
    contentType: 'text/csv',
  }
}

function splitRecipients(input = '') {
  return String(input)
    .split(/[;,]/)
    .map(v => v.trim())
    .filter(Boolean)
}

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function textToHtml(value = '') {
  return escapeHtml(value).replace(/\r?\n/g, '<br />')
}

function buildImageTag(imageUrl, altText = 'Email image', maxWidth = '100%') {
  if (!imageUrl) return ''
  return `<img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(altText)}" style="max-width:${maxWidth};height:auto;display:block;" />`
}

function renderTextWithImagePlaceholder(text = '', imageUrl = '', altText = 'Email image', maxWidth = '100%') {
  const raw = String(text || '')
  const parts = raw.split(/\{Image\}/gi)
  const hasPlaceholder = parts.length > 1
  const imageTag = buildImageTag(imageUrl, altText, maxWidth)

  const htmlParts = []
  for (let index = 0; index < parts.length; index++) {
    const segment = parts[index]
    if (segment) htmlParts.push(textToHtml(segment))
    if (index < parts.length - 1 && imageTag) {
      htmlParts.push(`<div style="margin:8px 0;">${imageTag}</div>`)
    }
  }

  if (!hasPlaceholder && imageTag) {
    if (htmlParts.length > 0) htmlParts.push('<br />')
    htmlParts.push(`<div style="margin-top:8px;">${imageTag}</div>`)
  }

  return htmlParts.join('')
}

function stripImagePlaceholder(text = '') {
  return String(text || '').replace(/\{Image\}/gi, '').trim()
}

function getMailerConfig() {
  return {
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE || 'false').toLowerCase() === 'true',
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
  }
}

function isMailerConfigured() {
  const cfg = getMailerConfig()
  return Boolean(cfg.host && cfg.port && cfg.from)
}

function buildTransporter() {
  const cfg = getMailerConfig()
  return nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: cfg.user && cfg.pass ? { user: cfg.user, pass: cfg.pass } : undefined,
  })
}

async function ensureStoreFile() {
  await fs.mkdir(STORE_DIR, { recursive: true })
  try {
    await fs.access(STORE_FILE)
  } catch {
    await fs.writeFile(STORE_FILE, JSON.stringify({ jobs: [] }, null, 2), 'utf8')
  }
}

export async function readSchedulerJobs() {
  await ensureStoreFile()
  const raw = await fs.readFile(STORE_FILE, 'utf8')
  const parsed = JSON.parse(raw || '{"jobs":[]}')
  return Array.isArray(parsed.jobs) ? parsed.jobs : []
}

export async function writeSchedulerJobs(jobs) {
  await ensureStoreFile()
  await fs.writeFile(STORE_FILE, JSON.stringify({ jobs }, null, 2), 'utf8')
  return jobs
}

export async function syncSchedulerJobs(clientJobs = []) {
  const normalized = (Array.isArray(clientJobs) ? clientJobs : []).map(job => {
    const nextRunAt = job.nextRunAt || computeNextRun(job.scheduleMeta || null)?.toISOString() || null
    return {
      ...job,
      deliveryType: job.deliveryType || 'query-results',
      exportType: job.exportType || 'csv',
      signatureImageUrl: job.signatureImageUrl || '',
      email: {
        to: job.email?.to || '',
        cc: job.email?.cc || '',
        subject: job.email?.subject || `Scheduled Report: ${job.queryName || job.name || 'Query Results'}`,
        body: job.email?.body || 'Please find attached the latest query results.',
        imageUrl: job.email?.imageUrl || '',
      },
      nextRunAt,
      enabled: Boolean(job.enabled),
      lastRun: job.lastRun || 'Never',
      lastError: job.lastError || null,
      lastSuccessAt: job.lastSuccessAt || null,
      lastErrorAt: job.lastErrorAt || null,
    }
  })

  await writeSchedulerJobs(normalized)
  return normalized
}

async function sendJobMail(job) {
  if (!isMailerConfigured()) throw new Error('SMTP is not configured')

  const toList = splitRecipients(job.email?.to)
  const ccList = splitRecipients(job.email?.cc)
  if (toList.length === 0) throw new Error('No recipients in TO field')

  const result = await executeQuery(job.sql, { limitEnabled: false, activeConnections: null })
  if (!result?.success) {
    const message = result?.messages?.map(m => m.text).join(' | ') || 'Query execution failed'
    throw new Error(message)
  }

  const firstSet = result.resultSets?.[0] || { columns: [], rows: [] }
  const baseName = String(job.queryName || 'query_results').replace(/[^a-z0-9-_]+/gi, '_').toLowerCase()
  const attachment = buildAttachment(firstSet, job.exportType, baseName)

  const cfg = getMailerConfig()
  const transporter = buildTransporter()

  const emailBodyText = job.email?.body || 'Please find attached the latest query results.'
  const signatureText = job.signatureContent || ''
  const emailImageUrl = String(job.email?.imageUrl || '').trim()
  const signatureImageUrl = String(job.signatureImageUrl || '').trim()

  const plainTextBody = [stripImagePlaceholder(emailBodyText), stripImagePlaceholder(signatureText)]
    .filter(Boolean)
    .join('\n\n')

  const htmlParts = []
  const emailHtml = renderTextWithImagePlaceholder(emailBodyText, emailImageUrl, 'Email image', '100%')
  if (emailHtml) htmlParts.push(`<div>${emailHtml}</div>`)

  if (signatureText) {
    const signatureHtml = renderTextWithImagePlaceholder(signatureText, signatureImageUrl, 'Signature image', '320px')
    if (signatureHtml) htmlParts.push(`<div style="margin-top:12px;">${signatureHtml}</div>`)
  }

  await transporter.sendMail({
    from: cfg.from,
    to: toList.join(', '),
    cc: ccList.length > 0 ? ccList.join(', ') : undefined,
    subject: job.email?.subject || `Scheduled Report: ${job.queryName || job.name || 'Query Results'}`,
    text: plainTextBody,
    html: htmlParts.join(''),
    attachments: [attachment],
  })
}

export async function testSmtpConnection(testRecipient) {
  if (!isMailerConfigured()) {
    throw new Error('SMTP is not configured. Please set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM in .env.local')
  }

  const cfg = getMailerConfig()
  const transporter = buildTransporter()
  await transporter.verify()

  if (!testRecipient) {
    return { ok: true, verified: true, mailSent: false }
  }

  const to = splitRecipients(testRecipient)
  if (to.length === 0) {
    throw new Error('Invalid recipient for SMTP test')
  }

  await transporter.sendMail({
    from: cfg.from,
    to: to.join(', '),
    subject: 'SMTP Test - RCR Scheduler',
    text: 'SMTP is configured correctly. This is a test email from RCR Scheduler.',
  })

  return { ok: true, verified: true, mailSent: true, recipient: to.join(', ') }
}

async function runDueJobs() {
  if (globalThis.__rcrSchedulerRunning) return
  globalThis.__rcrSchedulerRunning = true

  try {
    const jobs = await readSchedulerJobs()
    const now = new Date()

    for (const job of jobs) {
      if (!job.enabled) continue

      const dueAt = job.nextRunAt ? new Date(job.nextRunAt) : computeNextRun(job.scheduleMeta || null, now)
      if (!dueAt || Number.isNaN(dueAt.getTime()) || dueAt > now) {
        if (!job.nextRunAt && dueAt) job.nextRunAt = dueAt.toISOString()
        continue
      }

      try {
        await sendJobMail(job)
        job.lastRun = now.toLocaleString()
        job.lastSuccessAt = now.toISOString()
        job.lastError = null
        job.lastErrorAt = null

        if (job.scheduleMeta?.mode === 'once') {
          job.enabled = false
          job.nextRunAt = null
          job.nextRun = 'Completed'
        } else {
          const next = computeNextRun(job.scheduleMeta || null, new Date(now.getTime() + 1000))
          job.nextRunAt = next ? next.toISOString() : null
          job.nextRun = next ? next.toLocaleString() : 'Pending'
        }
      } catch (error) {
        job.lastError = error instanceof Error ? error.message : String(error)
        job.lastErrorAt = now.toISOString()
        const retry = computeNextRun(job.scheduleMeta || null, new Date(now.getTime() + 60 * 1000))
        job.nextRunAt = retry ? retry.toISOString() : job.nextRunAt
      }
    }

    await writeSchedulerJobs(jobs)
  } finally {
    globalThis.__rcrSchedulerRunning = false
  }
}

export function initSchedulerWorker() {
  if (globalThis.__rcrSchedulerTimer) {
    return getSchedulerStatus()
  }

  globalThis.__rcrSchedulerTimer = setInterval(() => {
    runDueJobs().catch(() => {})
  }, 30 * 1000)

  runDueJobs().catch(() => {})
  return getSchedulerStatus()
}

export function getSchedulerStatus() {
  return {
    running: Boolean(globalThis.__rcrSchedulerTimer),
    mailConfigured: isMailerConfigured(),
    intervalSeconds: 30,
  }
}

export async function triggerSchedulerNow() {
  await runDueJobs()
  return getSchedulerStatus()
}
