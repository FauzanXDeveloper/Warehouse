import { getSchedulerStatus, initSchedulerWorker } from '@/lib/server/schedulerService'

export const runtime = 'nodejs'

export async function GET() {
  const status = getSchedulerStatus()
  return Response.json(status)
}

export async function POST() {
  const status = initSchedulerWorker()
  return Response.json({ ok: true, ...status })
}
