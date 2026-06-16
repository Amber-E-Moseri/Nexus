const FRONTEND_URL = Deno.env.get('FRONTEND_URL') ?? ''
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

Deno.serve(async (req) => {
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state') // user_id
  const error = url.searchParams.get('error')

  const frontendUrl = FRONTEND_URL || 'http://localhost:5173'

  if (error || !code || !state) {
    return Response.redirect(`${frontendUrl}/planner?calendar_error=true`, 302)
  }

  // This function's own deployed URL is the redirect_uri
  const redirectUri = `${SUPABASE_URL}/functions/v1/google-oauth-callback`

  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/google-calendar-sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({
        action: 'exchange_code',
        payload: {
          code,
          redirect_uri: redirectUri,
          user_id: state,
        },
      }),
    })

    const data = await res.json()

    if (!res.ok || data.error) {
      console.error('[google-oauth-callback] exchange failed', data)
      return Response.redirect(`${frontendUrl}/planner?calendar_error=true`, 302)
    }

    return Response.redirect(`${frontendUrl}/planner?calendar_connected=true`, 302)
  } catch (err) {
    console.error('[google-oauth-callback]', err)
    return Response.redirect(`${frontendUrl}/planner?calendar_error=true`, 302)
  }
})
