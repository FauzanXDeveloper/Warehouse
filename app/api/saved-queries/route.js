import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

const DATA_DIR = process.env.APP_DATA_DIR
  ? path.join(process.env.APP_DATA_DIR, 'data')
  : path.join(process.cwd(), 'lib', 'data')
const FILE = path.join(DATA_DIR, 'saved_queries.json')

function readQueries() {
  try {
    const raw = fs.readFileSync(FILE, 'utf8')
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeQueries(queries) {
  fs.writeFileSync(FILE, JSON.stringify(queries, null, 2), 'utf8')
}

// GET — return all saved queries
export async function GET() {
  try {
    const queries = readQueries()
    return NextResponse.json({ ok: true, queries })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  }
}

// POST — create or replace full list (bulk sync)
export async function POST(req) {
  try {
    const body = await req.json()
    if (Array.isArray(body.queries)) {
      writeQueries(body.queries)
      return NextResponse.json({ ok: true, queries: body.queries })
    }
    // Single save: { name, sql }
    const { name, sql } = body
    if (!name) return NextResponse.json({ ok: false, error: 'name required' }, { status: 400 })
    const queries = readQueries()
    const entry = { id: Date.now(), name, sql: sql || '', createdAt: new Date().toLocaleDateString() }
    const updated = [entry, ...queries]
    writeQueries(updated)
    return NextResponse.json({ ok: true, queries: updated })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  }
}

// PUT — update a single query by id
export async function PUT(req) {
  try {
    const { id, name, sql } = await req.json()
    if (!id) return NextResponse.json({ ok: false, error: 'id required' }, { status: 400 })
    const queries = readQueries()
    const updated = queries.map(q => q.id === id ? { ...q, name: name ?? q.name, sql: sql ?? q.sql } : q)
    writeQueries(updated)
    return NextResponse.json({ ok: true, queries: updated })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  }
}

// DELETE — remove query by id
export async function DELETE(req) {
  try {
    const { id } = await req.json()
    if (!id) return NextResponse.json({ ok: false, error: 'id required' }, { status: 400 })
    const queries = readQueries()
    const updated = queries.filter(q => q.id !== id)
    writeQueries(updated)
    return NextResponse.json({ ok: true, queries: updated })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  }
}
