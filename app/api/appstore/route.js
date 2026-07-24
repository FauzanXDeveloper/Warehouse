import { NextResponse } from 'next/server'
import fs from 'node:fs'
import path from 'node:path'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const DATA_DIR = process.env.APP_DATA_DIR
  ? path.join(process.env.APP_DATA_DIR, 'data')
  : path.join(process.cwd(), 'lib', 'data')

const ALLOWED_SECTIONS = [
  'history',
  'notebooks',
  'settings',
  'saved_charts',
  'databases',
  'email_signatures',
  'editor_session',
  'connection_states',
]

function sectionFile(section) {
  return path.join(DATA_DIR, `${section}.json`)
}

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })
}

function readSection(section) {
  try {
    const raw = fs.readFileSync(sectionFile(section), 'utf8')
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function writeSection(section, data) {
  ensureDir()
  fs.writeFileSync(sectionFile(section), JSON.stringify(data, null, 2), 'utf8')
}

// GET /api/appstore           → returns all sections merged into one object
// GET /api/appstore?s=history → returns a single section
export async function GET(request) {
  try {
    ensureDir()
    const { searchParams } = new URL(request.url)
    const section = searchParams.get('s') || searchParams.get('section')

    if (section) {
      if (!ALLOWED_SECTIONS.includes(section)) {
        return NextResponse.json({ ok: false, error: 'Unknown section' }, { status: 400 })
      }
      return NextResponse.json({ ok: true, data: readSection(section) })
    }

    const result = {}
    for (const s of ALLOWED_SECTIONS) {
      result[s] = readSection(s)
    }
    return NextResponse.json({ ok: true, data: result })
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 })
  }
}

// POST /api/appstore { section, data }  → write a section to disk
export async function POST(request) {
  try {
    ensureDir()
    const body = await request.json()
    const { section, data } = body

    if (!section || !ALLOWED_SECTIONS.includes(section)) {
      return NextResponse.json({ ok: false, error: 'Unknown section' }, { status: 400 })
    }

    writeSection(section, data)
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 })
  }
}
