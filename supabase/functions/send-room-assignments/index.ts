// Sends personalised room-assignment emails to every person assigned to a room.
// Called from the Room Assignments tab once rooms are finalised.
// Each email includes: room name, room head, roommates list, and event nights.

const ALLOWED_ORIGIN = Deno.env.get('ALLOWED_ORIGIN')
const FROM_EMAIL = Deno.env.get('FROM_EMAIL') ?? 'BLW CAN NEXUS <noreply@lwcanada.org>'
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN || '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  ...(ALLOWED_ORIGIN ? { Vary: 'Origin' } : {}),
}

function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

interface RoomPerson { email: string; fullName: string; fellowship?: string }
interface Room { name: string; people: RoomPerson[]; roomHead?: string }

function renderRoomEmail(recipientName: string, room: Room, eventName: string): string {
  const head = room.people.find(p => p.email === room.roomHead)
  const roommates = room.people.filter(p => p.email !== (head?.email ?? null))
  const headLine = head ? `<p><strong>Room head:</strong> ${head.fullName}</p>` : ''
  const roommateLines = roommates.length
    ? `<p><strong>Your roommates:</strong></p><ul>${roommates.map(p => `<li>${p.fullName}${p.fellowship ? ` <span style="color:#9E9488;font-size:13px">(${p.fellowship})</span>` : ''}</li>`).join('')}</ul>`
    : ''

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <style>
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;color:#1C1610;margin:0;padding:0;background:#F5F3F0}
    .container{max-width:600px;margin:0 auto;padding:20px}
    .card{background:#fff;border-radius:12px;padding:32px;box-shadow:0 2px 8px rgba(0,0,0,.08)}
    .header{margin-bottom:24px;padding-bottom:18px;border-bottom:1px solid #EDE9E3}
    .logo{font-family:Georgia,serif;font-size:18px;font-weight:700;color:#4C2A92}
    .room-badge{display:inline-block;background:#F0EBFF;color:#4C2A92;border-radius:8px;padding:10px 20px;font-size:22px;font-weight:700;margin:16px 0}
    .body{line-height:1.7;color:#4A4641}
    ul{margin:8px 0;padding-left:20px}
    li{margin:4px 0}
    .footer{margin-top:32px;padding-top:18px;border-top:1px solid #EDE9E3;font-size:12px;color:#9E9488;text-align:center}
  </style>
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="header"><div class="logo">BLW CAN Nexus</div></div>
      <div class="body">
        <p>Hi ${recipientName},</p>
        <p>Your room assignment for <strong>${eventName}</strong> is ready!</p>
        <div class="room-badge">🏠 ${room.name}</div>
        ${headLine}
        ${roommateLines}
        <p style="margin-top:24px;font-size:13px;color:#9E9488">
          If you have any questions about your room assignment, please reach out to the Accommodation team.
        </p>
      </div>
      <div class="footer">BLW Canada Sub-Region · ${eventName}</div>
    </div>
  </div>
</body>
</html>`
}

async function sendOne(to: string, subject: string, html: string): Promise<{ ok: boolean; error?: string }> {
  if (!RESEND_API_KEY) return { ok: false, error: 'RESEND_API_KEY not configured' }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM_EMAIL, to, subject, html }),
  })
  if (!res.ok) {
    const text = await res.text()
    return { ok: false, error: `Resend ${res.status}: ${text}` }
  }
  return { ok: true }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return jsonResponse(405, { error: 'Method not allowed' })

  try {
    const { rooms, eventName = 'This Is It 2.0' } = await req.json()
    if (!Array.isArray(rooms)) return jsonResponse(400, { error: 'rooms array is required' })

    const results: { email: string; ok: boolean; error?: string }[] = []

    for (const room of rooms as Room[]) {
      for (const person of room.people) {
        if (!person.email || person.email.startsWith('UNMATCHED:')) continue
        const html = renderRoomEmail(person.fullName || person.email, room, eventName)
        const result = await sendOne(person.email, `Your room assignment — ${eventName}`, html)
        results.push({ email: person.email, ...result })
      }
    }

    const failed = results.filter(r => !r.ok)
    return jsonResponse(200, {
      sent: results.filter(r => r.ok).length,
      failed: failed.length,
      errors: failed.length ? failed : undefined,
    })
  } catch (err) {
    return jsonResponse(500, { error: err instanceof Error ? err.message : 'Internal server error' })
  }
})
