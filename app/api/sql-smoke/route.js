export const runtime = 'nodejs'

export async function GET() {
  return Response.json(
    {
      ok: false,
      error: 'This endpoint is disabled.',
    },
    { status: 410 }
  )
}
