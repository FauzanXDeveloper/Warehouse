import { initSchedulerWorker, readSchedulerJobs, syncSchedulerJobs } from '@/lib/server/schedulerService'

export const runtime = 'nodejs'

export async function GET() {
  const jobs = await readSchedulerJobs()
  return Response.json({ ok: true, jobs })
}

export async function POST(request) {
  const body = await request.json().catch(() => ({}))
  const jobs = Array.isArray(body?.jobs) ? body.jobs : []
  const saved = await syncSchedulerJobs(jobs)
  initSchedulerWorker()
  return Response.json({ ok: true, count: saved.length })
}
