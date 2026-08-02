import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.0'
import { PDFDocument, StandardFonts, rgb } from 'https://esm.sh/pdf-lib@1.17.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type, x-client-info, apikey',
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

type WeekRow = {
  church_name: string
  total_attendance: number
  first_timers: number
  status: string
  wow_delta: number | null
  rolling_avg_4wk: number | null
  merged_with: string[] | null
  note: string | null
}

function fmt(n: number | null): string {
  if (n == null) return '—'
  return n.toLocaleString()
}

function delta(n: number | null): string {
  if (n == null) return '—'
  if (n > 0) return `+${n}`
  return String(n)
}

// ── PDF generation ─────────────────────────────────────────────────────────────

async function buildPDF(weekLabel: string, rows: WeekRow[]): Promise<Uint8Array> {
  const doc  = await PDFDocument.create()
  const page = doc.addPage([612, 792])
  const { height } = page.getSize()

  const regular = await doc.embedFont(StandardFonts.Helvetica)
  const bold    = await doc.embedFont(StandardFonts.HelveticaBold)

  const INK    = rgb(0.102, 0.071, 0.125)
  const PURPLE = rgb(0.298, 0.165, 0.573)
  const GRAY   = rgb(0.541, 0.498, 0.600)
  const GREEN  = rgb(0.122, 0.541, 0.298)
  const RED    = rgb(0.769, 0.220, 0.227)
  const LINE   = rgb(0.906, 0.886, 0.933)

  const reported = rows.filter(r => r.status === 'reported')
  const netTotal = reported.reduce((s, r) => s + r.total_attendance, 0)
  const netFT    = reported.reduce((s, r) => s + r.first_timers, 0)
  const netDelta = reported.reduce((s, r) => s + (r.wow_delta ?? 0), 0)

  let y = height - 50

  // Title block
  page.drawText('BLW CANADA', { x: 50, y, font: bold, size: 8, color: GRAY })
  y -= 22
  page.drawText('Weekly Growth Report', { x: 50, y, font: bold, size: 18, color: INK })
  y -= 16
  page.drawText('Week of ' + weekLabel, { x: 50, y, font: regular, size: 11, color: GRAY })
  y -= 20

  page.drawLine({ start: { x: 50, y }, end: { x: 562, y }, thickness: 0.5, color: LINE })
  y -= 18

  // Network summary
  page.drawText('NETWORK ATTENDANCE', { x: 50,  y, font: bold, size: 7, color: GRAY })
  page.drawText('FIRST-TIMERS',       { x: 220, y, font: bold, size: 7, color: GRAY })
  page.drawText('CENTERS REPORTING',  { x: 370, y, font: bold, size: 7, color: GRAY })
  y -= 16
  page.drawText(netTotal.toLocaleString(), { x: 50,  y, font: bold, size: 20, color: INK })
  page.drawText(netFT.toLocaleString(),    { x: 220, y, font: bold, size: 20, color: INK })
  page.drawText(`${reported.length} / ${rows.length}`, { x: 370, y, font: bold, size: 20, color: INK })
  y -= 14
  const dStr = netDelta >= 0 ? `+${netDelta} vs prev week` : `${netDelta} vs prev week`
  page.drawText(dStr, { x: 50, y, font: regular, size: 9, color: netDelta >= 0 ? GREEN : RED })
  y -= 24

  page.drawLine({ start: { x: 50, y }, end: { x: 562, y }, thickness: 0.5, color: LINE })
  y -= 18

  // Table columns
  const COLS = [
    { label: 'CENTER',      x: 50,  w: 155, align: 'left'  },
    { label: 'ATTENDANCE',  x: 205, w: 80,  align: 'right' },
    { label: '1ST-TIMERS',  x: 285, w: 75,  align: 'right' },
    { label: 'WoW',         x: 360, w: 55,  align: 'right' },
    { label: '4-WK AVG',    x: 415, w: 65,  align: 'right' },
    { label: 'STATUS',      x: 480, w: 82,  align: 'right' },
  ]

  for (const col of COLS) {
    const tw = bold.widthOfTextAtSize(col.label, 7)
    const x  = col.align === 'right' ? col.x + col.w - tw : col.x
    page.drawText(col.label, { x, y, font: bold, size: 7, color: GRAY })
  }
  y -= 12
  page.drawLine({ start: { x: 50, y }, end: { x: 562, y }, thickness: 1.2, color: PURPLE })
  y -= 14

  const STATUS_LABEL: Record<string, string> = {
    reported: 'Reported', merged: 'Merged',
    did_not_meet: 'Did Not Meet', missing: 'Missing', current: 'In Progress',
  }

  const sorted = [...rows].sort((a, b) => b.total_attendance - a.total_attendance)

  for (const row of sorted) {
    const name = row.church_name.length > 26 ? row.church_name.slice(0, 25) + '…' : row.church_name
    page.drawText(name, { x: COLS[0].x, y, font: regular, size: 9, color: INK })

    const draw = (text: string, col: typeof COLS[0], color = INK) => {
      const tw = regular.widthOfTextAtSize(text, 9)
      const x  = col.align === 'right' ? col.x + col.w - tw : col.x
      page.drawText(text, { x, y, font: regular, size: 9, color })
    }

    draw(row.status === 'reported' ? fmt(row.total_attendance) : '—', COLS[1])
    draw(row.status === 'reported' ? fmt(row.first_timers)     : '—', COLS[2])

    if (row.status === 'reported' && row.wow_delta != null) {
      draw(delta(row.wow_delta), COLS[3], row.wow_delta >= 0 ? GREEN : RED)
    } else {
      draw('—', COLS[3], GRAY)
    }

    draw(fmt(row.rolling_avg_4wk), COLS[4], GRAY)
    draw(STATUS_LABEL[row.status] ?? row.status, COLS[5], GRAY)

    y -= 13
    page.drawLine({ start: { x: 50, y: y + 2 }, end: { x: 562, y: y + 2 }, thickness: 0.3, color: LINE })
  }

  // Footer
  page.drawText(
    'WoW = week-over-week attendance change · 4-Wk Avg = rolling 4-week average',
    { x: 50, y: 30, font: regular, size: 7.5, color: GRAY }
  )

  return doc.save()
}

// ── HTML email ─────────────────────────────────────────────────────────────────

function buildEmail(
  weekLabel: string,
  rows: WeekRow[],
  schedule: { church_name: string; church_unit_id: string }[]
): string {
  const reported  = rows.filter(r => r.status === 'reported')
  const merged    = rows.filter(r => r.status === 'merged')
  const didntMeet = rows.filter(r => r.status === 'did_not_meet')
  const missing   = rows.filter(r => r.status === 'missing')

  const networkTotal    = reported.reduce((s, r) => s + r.total_attendance, 0)
  const networkFT       = reported.reduce((s, r) => s + r.first_timers, 0)
  const networkDelta    = reported.reduce((s, r) => s + (r.wow_delta ?? 0), 0)
  const networkDeltaStr = delta(networkDelta)

  const nameMap = new Map(schedule.map(s => [s.church_unit_id, s.church_name]))

  const topGrowing = [...reported].sort((a, b) => (b.wow_delta ?? 0) - (a.wow_delta ?? 0)).slice(0, 3)
  const topDecline = [...reported].sort((a, b) => (a.wow_delta ?? 0) - (b.wow_delta ?? 0)).filter(r => (r.wow_delta ?? 0) < 0).slice(0, 3)

  const statusIcon = (s: string) =>
    s === 'reported' ? '🟢' : s === 'merged' ? '🟡' : s === 'did_not_meet' ? '⚪' : '🔴'

  const tableRow = (r: WeekRow) => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #f0ede8;">${statusIcon(r.status)} ${r.church_name}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f0ede8;text-align:right;">${fmt(r.total_attendance)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f0ede8;text-align:right;">${fmt(r.first_timers)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f0ede8;text-align:right;color:${(r.wow_delta ?? 0) >= 0 ? '#16a34a' : '#dc2626'};">${delta(r.wow_delta)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f0ede8;text-align:right;color:#6b7280;">${fmt(r.rolling_avg_4wk)}</td>
    </tr>`

  const flagSection = (title: string, items: WeekRow[]) => {
    if (items.length === 0) return ''
    return `
    <h3 style="font-size:14px;font-weight:600;margin:24px 0 8px;color:#4b4438;">${title}</h3>
    <ul style="margin:0;padding-left:20px;color:#4b4438;">
      ${items.map(r => `<li style="margin-bottom:4px;">${r.church_name}${r.note ? ` — <em>${r.note}</em>` : ''}${r.merged_with?.length ? ` (merged with: ${r.merged_with.map(id => nameMap.get(id) ?? id).join(', ')})` : ''}</li>`).join('')}
    </ul>`
  }

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>BLW Canada — Weekly Growth Report</title></head>
<body style="margin:0;padding:0;background:#f9f7f4;font-family:system-ui,-apple-system,sans-serif;color:#1a1714;">
<div style="max-width:640px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.08);">

  <!-- Header -->
  <div style="background:#1a1714;padding:24px 32px;">
    <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#9E9488;margin-bottom:4px;">BLW Canada</div>
    <div style="font-size:22px;font-weight:700;color:#fff;">Weekly Growth Report</div>
    <div style="font-size:13px;color:#9E9488;margin-top:4px;">Week of ${weekLabel}</div>
  </div>

  <!-- Network summary -->
  <div style="padding:24px 32px;border-bottom:1px solid #f0ede8;">
    <div style="display:flex;gap:24px;flex-wrap:wrap;">
      <div>
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#9E9488;">Network Attendance</div>
        <div style="font-size:32px;font-weight:700;margin-top:4px;">${fmt(networkTotal)}</div>
        <div style="font-size:13px;color:${networkDelta >= 0 ? '#16a34a' : '#dc2626'};margin-top:2px;">${networkDeltaStr} vs last week</div>
      </div>
      <div>
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#9E9488;">First-Timers</div>
        <div style="font-size:32px;font-weight:700;margin-top:4px;">${fmt(networkFT)}</div>
      </div>
      <div>
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#9E9488;">Centers Reporting</div>
        <div style="font-size:32px;font-weight:700;margin-top:4px;">${reported.length}<span style="font-size:16px;color:#9E9488;"> / ${rows.length}</span></div>
      </div>
    </div>
  </div>

  <!-- Per-center table -->
  <div style="padding:24px 32px 0;">
    <h3 style="font-size:14px;font-weight:600;margin:0 0 12px;color:#4b4438;">All Service Centers</h3>
    <p style="font-size:12px;color:#9E9488;margin:0 0 10px;">PDF report attached for printing.</p>
    <div style="overflow-x:auto;">
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <thead>
          <tr style="background:#f9f7f4;">
            <th style="padding:8px 12px;text-align:left;font-weight:600;color:#9E9488;font-size:11px;text-transform:uppercase;letter-spacing:.05em;">Center</th>
            <th style="padding:8px 12px;text-align:right;font-weight:600;color:#9E9488;font-size:11px;text-transform:uppercase;letter-spacing:.05em;">Attendance</th>
            <th style="padding:8px 12px;text-align:right;font-weight:600;color:#9E9488;font-size:11px;text-transform:uppercase;letter-spacing:.05em;">1st-Timers</th>
            <th style="padding:8px 12px;text-align:right;font-weight:600;color:#9E9488;font-size:11px;text-transform:uppercase;letter-spacing:.05em;">WoW</th>
            <th style="padding:8px 12px;text-align:right;font-weight:600;color:#9E9488;font-size:11px;text-transform:uppercase;letter-spacing:.05em;">4-Wk Avg</th>
          </tr>
        </thead>
        <tbody>
          ${rows.sort((a, b) => b.total_attendance - a.total_attendance).map(tableRow).join('')}
        </tbody>
      </table>
    </div>
  </div>

  <!-- Highlights -->
  <div style="padding:8px 32px 24px;">
    ${topGrowing.length > 0 ? `
    <h3 style="font-size:14px;font-weight:600;margin:24px 0 8px;color:#4b4438;">📈 Top Growing</h3>
    <ul style="margin:0;padding-left:20px;color:#4b4438;">
      ${topGrowing.map(r => `<li style="margin-bottom:4px;">${r.church_name} — ${fmt(r.total_attendance)} (<span style="color:#16a34a;">${delta(r.wow_delta)}</span>)</li>`).join('')}
    </ul>` : ''}

    ${topDecline.length > 0 ? `
    <h3 style="font-size:14px;font-weight:600;margin:24px 0 8px;color:#4b4438;">📉 Declining</h3>
    <ul style="margin:0;padding-left:20px;color:#4b4438;">
      ${topDecline.map(r => `<li style="margin-bottom:4px;">${r.church_name} — ${fmt(r.total_attendance)} (<span style="color:#dc2626;">${delta(r.wow_delta)}</span>)</li>`).join('')}
    </ul>` : ''}

    ${flagSection('🟡 Merged Services', merged)}
    ${flagSection('⚪ Did Not Meet', didntMeet)}
    ${missing.length > 0 ? `
    <h3 style="font-size:14px;font-weight:600;margin:24px 0 8px;color:#dc2626;">🔴 Missing Reports (${missing.length})</h3>
    <ul style="margin:0;padding-left:20px;color:#4b4438;">
      ${missing.map(r => `<li style="margin-bottom:4px;">${r.church_name}</li>`).join('')}
    </ul>` : ''}
  </div>

  <!-- Legend + footer -->
  <div style="padding:16px 32px;background:#f9f7f4;border-top:1px solid #f0ede8;">
    <div style="font-size:11px;color:#9E9488;">
      🟢 Reported &nbsp;·&nbsp; 🟡 Merged &nbsp;·&nbsp; ⚪ Did Not Meet &nbsp;·&nbsp; 🔴 Missing
    </div>
    <div style="font-size:11px;color:#9E9488;margin-top:4px;">
      WoW = week-over-week attendance change · 4-Wk Avg = rolling 4-week average
    </div>
  </div>

</div>
</body></html>`
}

// ── Handler ────────────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' })

  const resendApiKey = Deno.env.get('RESEND_API_KEY')
  const fromEmail    = Deno.env.get('FROM_EMAIL') ?? 'BLW CAN NEXUS <noreply@blwcannexus.ca>'
  if (!resendApiKey) return json(500, { error: 'RESEND_API_KEY not configured' })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  // Optional body param: { week: "2026-07-27" } to send for a specific ISO week Monday.
  let body: { week?: string } = {}
  try { body = await req.json() } catch { /* no body */ }

  let weekStart: Date
  if (body.week) {
    weekStart = new Date(body.week + 'T00:00:00Z')
  } else {
    weekStart = new Date()
    weekStart.setUTCHours(0, 0, 0, 0)
    const day = weekStart.getUTCDay()
    weekStart.setUTCDate(weekStart.getUTCDate() - (day === 0 ? 6 : day - 1))
  }
  const weekStartStr = weekStart.toISOString().split('T')[0]

  const weekLabel = weekStart.toLocaleDateString('en-CA', {
    timeZone: 'America/Toronto',
    year: 'numeric', month: 'long', day: 'numeric',
  })

  // Fetch this week's data from the view
  const { data: rows, error: viewErr } = await supabase
    .from('v_service_center_weekly_growth')
    .select('church_name,total_attendance,first_timers,status,wow_delta,rolling_avg_4wk,merged_with,note')
    .eq('week_start_date', weekStartStr)

  if (viewErr) return json(500, { error: 'View query failed', details: viewErr.message })

  // Fetch schedule for name lookups in merged_with
  const { data: schedule } = await supabase
    .from('service_center_schedule')
    .select('church_name, church_unit_id')

  // Fetch active recipients
  const { data: recipients, error: recipErr } = await supabase
    .from('report_recipients')
    .select('email')
    .eq('active', true)

  if (recipErr) return json(500, { error: 'Recipients query failed', details: recipErr.message })
  if (!recipients || recipients.length === 0) return json(200, { message: 'No active recipients — email skipped' })

  const html    = buildEmail(weekLabel, (rows ?? []) as WeekRow[], (schedule ?? []))
  const subject = `BLW Canada — Weekly Growth Report · ${weekLabel}`
  const toAddresses = recipients.map((r: { email: string }) => r.email)

  // Generate PDF attachment
  let pdfAttachment: { filename: string; content: string } | undefined
  try {
    const pdfBytes = await buildPDF(weekLabel, (rows ?? []) as WeekRow[])
    let binary = ''
    for (const b of pdfBytes) binary += String.fromCharCode(b)
    pdfAttachment = {
      filename: `growth-report-${weekStartStr}.pdf`,
      content:  btoa(binary),
    }
  } catch (e) {
    console.error('PDF generation failed:', e)
    // Non-fatal: send email without attachment
  }

  const resendRes = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from:        fromEmail,
      to:          toAddresses,
      subject,
      html,
      ...(pdfAttachment ? { attachments: [pdfAttachment] } : {}),
    }),
  })

  if (!resendRes.ok) {
    const errBody = await resendRes.text()
    return json(502, { error: 'Resend API error', details: errBody })
  }

  return json(200, {
    sent:       true,
    recipients: toAddresses,
    week:       weekStartStr,
    centers:    (rows ?? []).length,
    pdfAttached: !!pdfAttachment,
  })
})
