import { triggerSchedulerNow } from '@/lib/server/schedulerService'

export const runtime = 'nodejs'

export async function POST() {
  const status = await triggerSchedulerNow()
  return Response.json({ ok: true, ...status })
}
