/**
 * /api/databases
 * GET  ?db=name        → returns the .db file as binary (for restore on boot)
 * POST { db, data[] }  → writes binary Uint8Array to lib/data/<db>.db
 * GET  (no db param)   → returns list of all persisted db names
 */

import { NextResponse } from 'next/server'
import fs from 'node:fs'
import path from 'node:path'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const DATA_DIR = process.env.APP_DATA_DIR
  ? path.join(process.env.APP_DATA_DIR, 'data')
  : path.join(process.cwd(), 'lib', 'data')

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })
}

export async function GET(request) {
  try {
    ensureDataDir()
    const { searchParams } = new URL(request.url)
    const db = searchParams.get('db')

    if (!db) {
      // List all persisted databases
      const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.db'))
      const names = files.map(f => f.replace(/\.db$/, ''))
      return NextResponse.json({ databases: names })
    }

    // Return binary .db file
    const safeName = String(db).replace(/[^a-z0-9_\-]/gi, '_').toLowerCase()
    const filePath = path.join(DATA_DIR, `${safeName}.db`)
    if (!fs.existsSync(filePath)) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    const buffer = fs.readFileSync(filePath)
    return new NextResponse(buffer, {
      status: 200,
      headers: { 'Content-Type': 'application/octet-stream' },
    })
  } catch (err) {
    return NextResponse.json({ error: String(err?.message || err) }, { status: 500 })
  }
}

export async function POST(request) {
  try {
    ensureDataDir()
    const body = await request.json()
    const db = String(body?.db || '').trim()
    const data = body?.data  // array of bytes

    if (!db) return NextResponse.json({ error: 'db name required' }, { status: 400 })
    if (!Array.isArray(data)) return NextResponse.json({ error: 'data array required' }, { status: 400 })

    const safeName = db.replace(/[^a-z0-9_\-]/gi, '_').toLowerCase()
    const filePath = path.join(DATA_DIR, `${safeName}.db`)
    const buffer = Buffer.from(data)

    if (buffer.length === 0) {
      return NextResponse.json({ error: 'Refusing to overwrite database with empty payload' }, { status: 400 })
    }

    if (fs.existsSync(filePath)) {
      const stats = fs.statSync(filePath)
      if (stats.size > 0 && buffer.length < 1024) {
        return NextResponse.json({ error: 'Refusing suspiciously small overwrite for existing database file' }, { status: 400 })
      }

      if (stats.size > 5 * 1024 * 1024 && buffer.length < Math.floor(stats.size * 0.1)) {
        return NextResponse.json({ error: 'Refusing large shrink overwrite without explicit migration flow' }, { status: 400 })
      }

      if (stats.size > 0) {
        const backupPath = `${filePath}.bak`
        try {
          fs.copyFileSync(filePath, backupPath)
        } catch {}
      }
    }

    fs.writeFileSync(filePath, buffer)

    return NextResponse.json({ success: true, db: safeName, bytes: buffer.length })
  } catch (err) {
    return NextResponse.json({ error: String(err?.message || err) }, { status: 500 })
  }
}

export async function DELETE(request) {
  try {
    ensureDataDir()
    const { searchParams } = new URL(request.url)
    const db = searchParams.get('db')
    if (!db) return NextResponse.json({ error: 'db name required' }, { status: 400 })

    const safeName = String(db).replace(/[^a-z0-9_\-]/gi, '_').toLowerCase()
    const filePath = path.join(DATA_DIR, `${safeName}.db`)
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath)

    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: String(err?.message || err) }, { status: 500 })
  }
}
