import { testSmtpConnection } from '@/lib/server/schedulerService'

export const runtime = 'nodejs'

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}))
    const recipient = typeof body?.recipient === 'string' ? body.recipient.trim() : ''
    const result = await testSmtpConnection(recipient)
    return Response.json({ ok: true, ...result })
  } catch (error) {
    return Response.json({ ok: false, error: error instanceof Error ? error.message : 'SMTP test failed' }, { status: 400 })
  }
}
