import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.0'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
const FROM_EMAIL = Deno.env.get('FROM_EMAIL') ?? 'noreply@blwcannexus.ca'
const PRIMARY_ORIGIN = Deno.env.get('ALLOWED_ORIGIN') ?? ''

const DEV_ORIGINS = new Set([
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:3000',
  'http://127.0.0.1:5173',
  'https://nexus.lwcanada.org',
  'https://blwcannexus.vercel.app',
])

const LOCAL_DEV_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/

function getCorsHeaders(req: Request) {
  const origin = req.headers.get('origin') ?? ''
  const allowed =
    !PRIMARY_ORIGIN ||
    origin === PRIMARY_ORIGIN ||
    DEV_ORIGINS.has(origin) ||
    LOCAL_DEV_ORIGIN.test(origin)

  return {
    'Access-Control-Allow-Origin': allowed ? origin || '*' : PRIMARY_ORIGIN,
    'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  }
}

function jsonResponse(status: number, body: Record<string, unknown>, req: Request) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: getCorsHeaders(req) })
  }

  if (req.method !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' }, req)
  }

  try {
    const payload = await req.json()
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    let query = supabase
      .from('users')
      .select('id, email, first_name')
      .eq('status', 'active')
      .eq('opted_out', false)
      .not('email', 'is', null)

    if (payload.department_ids && payload.department_ids.length > 0) {
      query = query.in('department_id', payload.department_ids)
    } else if (payload.roles && payload.roles.length > 0) {
      query = query.in('role', payload.roles)
    }

    const { data: recipients } = await query
    const recipientList = recipients || []

    let unsubscribedQuery = supabase
      .from('users')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'active')
      .eq('opted_out', true)

    if (payload.department_ids && payload.department_ids.length > 0) {
      unsubscribedQuery = unsubscribedQuery.in('department_id', payload.department_ids)
    } else if (payload.roles && payload.roles.length > 0) {
      unsubscribedQuery = unsubscribedQuery.in('role', payload.roles)
    }

    const { count: unsubscribed } = await unsubscribedQuery

    let sent = 0
    for (const recipient of recipientList) {
      try {
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${RESEND_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: FROM_EMAIL,
            to: recipient.email,
            subject: payload.subject,
            html: `<p>Hi ${recipient.first_name || 'there'},</p><p>${payload.description || 'Check out our new features!'}</p>`,
          }),
        })
        sent++
      } catch (e) {
        console.error('Send failed:', e)
      }
    }

    return jsonResponse(200, { sent, skipped: unsubscribed || 0 }, req)
  } catch (err) {
    console.error(err)
    return jsonResponse(500, { error: err instanceof Error ? err.message : 'Internal error' }, req)
  }
})
