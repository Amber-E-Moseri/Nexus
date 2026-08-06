import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

/**
 * Daily cron job to clean up TTS cache
 * Called by Vercel Cron (see vercel.json)
 * Auth: x-vercel-cron-secret header must match CRON_SECRET env var
 */
export default async function handler(req: NextRequest) {
  // Verify Vercel cron secret
  const cronSecret = process.env.CRON_SECRET
  const incomingSecret = req.headers.get('x-vercel-cron-secret')

  if (!cronSecret || incomingSecret !== cronSecret) {
    console.error('[cleanup-tts-cache] Unauthorized cron request')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Call Supabase edge function
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    if (!supabaseUrl) {
      throw new Error('NEXT_PUBLIC_SUPABASE_URL not configured')
    }

    const res = await fetch(`${supabaseUrl}/functions/v1/cleanup-tts-cache`, {
      method: 'POST',
      headers: {
        'x-cron-secret': cronSecret,
        'Content-Type': 'application/json',
      },
    })

    const data = await res.json()

    if (!res.ok) {
      console.error('[cleanup-tts-cache] Edge function error', data)
      return NextResponse.json(
        { error: 'Cleanup failed', details: data },
        { status: res.status }
      )
    }

    console.log('[cleanup-tts-cache] Success', data)
    return NextResponse.json({ ok: true, ...data })
  } catch (err) {
    console.error('[cleanup-tts-cache] Error', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
