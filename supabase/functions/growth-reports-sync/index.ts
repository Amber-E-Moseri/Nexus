import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.0'

const BASE_URL = 'https://leaders.lwcanada.org'
const ROOT_UNIT_ID = 'cmotpb106000ewkxbi3md8xs6'  // BLW Canada — returns all sub-unit data
const PHASE1_KINDS = new Set(['SundayService', 'GlobalService'])

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

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.trim().split('\n')
  if (lines.length < 2) return []
  const headers = lines[0].split(',').map(h => h.trim())
  const rows: Record<string, string>[] = []
  for (const line of lines.slice(1)) {
    if (!line.trim()) continue
    const values: string[] = []
    let current = ''
    let inQuotes = false
    for (const ch of line) {
      if (ch === '"') { inQuotes = !inQuotes; continue }
      if (ch === ',' && !inQuotes) { values.push(current.trim()); current = ''; continue }
      current += ch
    }
    values.push(current.trim())
    rows.push(Object.fromEntries(headers.map((h, i) => [h, values[i] ?? ''])))
  }
  return rows
}

// Yield {from, to} pairs month by month over the date range
function* monthRange(fromDate: Date, toDate: Date) {
  const cur = new Date(fromDate.getFullYear(), fromDate.getMonth(), 1)
  while (cur <= toDate) {
    const y = cur.getFullYear()
    const m = cur.getMonth()
    const monthStart = `${y}-${String(m + 1).padStart(2, '0')}-01`
    const lastDay = new Date(y, m + 1, 0).getDate()
    const monthEnd = `${y}-${String(m + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
    yield { from: monthStart, to: monthEnd }
    cur.setMonth(cur.getMonth() + 1)
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' })

  const apiToken = Deno.env.get('REPORTS_API_TOKEN')
  if (!apiToken) return json(500, { error: 'REPORTS_API_TOKEN secret not configured' })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  // Optional from/to body params for backfill; defaults to last 14 days
  let body: { from?: string; to?: string } = {}
  try { body = await req.json() } catch { /* no body = defaults */ }

  const toDate = body.to ? new Date(body.to) : new Date()
  const fromDate = body.from
    ? new Date(body.from)
    : new Date(toDate.getTime() - 14 * 24 * 60 * 60 * 1000)

  // Build name → unit_id map from schedule table
  const { data: schedule, error: schedErr } = await supabase
    .from('service_center_schedule')
    .select('church_unit_id, church_name')
  if (schedErr) return json(500, { error: 'Could not load schedule', details: schedErr.message })

  const churchByName = new Map<string, string>(
    (schedule ?? []).map((s: { church_unit_id: string; church_name: string }) =>
      [s.church_name.toLowerCase().trim(), s.church_unit_id]
    )
  )

  let totalUpserted = 0
  const errors: string[] = []
  const reactivated: string[] = []

  for (const { from, to } of monthRange(fromDate, toDate)) {
    let csvText: string
    try {
      const res = await fetch(
        `${BASE_URL}/api/services/export?unitId=${ROOT_UNIT_ID}&shape=checkins&from=${from}&to=${to}`,
        { headers: { Authorization: `Bearer ${apiToken}` } }
      )
      if (!res.ok) {
        errors.push(`${from}: HTTP ${res.status}`)
        continue
      }
      csvText = await res.text()
    } catch (e) {
      errors.push(`${from}: fetch failed — ${String(e)}`)
      continue
    }

    const rows = parseCSV(csvText)

    // Filter: phase-1 scope only, submitted, non-truncation rows
    const phaseRows = rows.filter(r =>
      PHASE1_KINDS.has(r['Kind']) &&
      r['Status'] === 'Submitted' &&
      r['Host unit'] &&
      !r['Service date'].startsWith('TRUNCATED') &&
      churchByName.has(r['Host unit'].toLowerCase().trim())
    )

    // Aggregate per (church, kind, date, service name)
    type Agg = { church_unit_id: string; church_name: string; service_kind: string; service_date: string; service_name: string; total: number; ft: number }
    const agg = new Map<string, Agg>()

    for (const row of phaseRows) {
      const nameKey = row['Host unit'].toLowerCase().trim()
      const churchUnitId = churchByName.get(nameKey)!
      const serviceDate = row['Service date'].split(' ')[0]  // strip time component
      const key = `${churchUnitId}::${row['Kind']}::${serviceDate}::${row['Service']}`

      if (!agg.has(key)) {
        agg.set(key, {
          church_unit_id: churchUnitId,
          church_name:    row['Host unit'],
          service_kind:   row['Kind'],
          service_date:   serviceDate,
          service_name:   row['Service'],
          total:          0,
          ft:             0,
        })
      }
      const entry = agg.get(key)!
      entry.total += 1
      if (row['First-timer at this service'] === 'yes') entry.ft += 1
    }

    if (agg.size === 0) continue

    const upsertRows = [...agg.values()].map(e => ({
      church_unit_id:   e.church_unit_id,
      church_name:      e.church_name,
      service_kind:     e.service_kind,
      service_date:     e.service_date,
      service_name:     e.service_name,
      total_attendance: e.total,
      first_timers:     e.ft,
      synced_at:        new Date().toISOString(),
    }))

    const { error: upsertErr } = await supabase
      .from('service_reports')
      .upsert(upsertRows, { onConflict: 'church_unit_id,service_kind,service_date' })

    if (upsertErr) {
      errors.push(`${from}: upsert error — ${upsertErr.message}`)
      continue
    }

    totalUpserted += upsertRows.length

    // Auto-reactivate any inactive centers that just reported data
    const reportingIds = [...new Set(upsertRows.map(r => r.church_unit_id))]
    const inactive = (schedule ?? []).filter(
      (s: { church_unit_id: string; church_name: string }) =>
        reportingIds.includes(s.church_unit_id)
    )
    // Fetch current active status for those centers
    const { data: currentStatus } = await supabase
      .from('service_center_schedule')
      .select('id, church_unit_id, active')
      .in('church_unit_id', reportingIds)
    const toReactivate = (currentStatus ?? []).filter((s: { active: boolean }) => !s.active)
    if (toReactivate.length > 0) {
      const reactivateUnitIds = toReactivate.map((s: { church_unit_id: string }) => s.church_unit_id)
      // Backfill the inactive gap period as did_not_meet before flipping active,
      // so those historical weeks never appear as "missing" in the dashboard.
      const gapFrom = new Date(Date.now() - 52 * 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
      const gapTo   = new Date().toISOString().split('T')[0]
      await supabase.rpc('fill_center_gaps', { p_from: gapFrom, p_to: gapTo, p_unit_ids: reactivateUnitIds })

      await supabase
        .from('service_center_schedule')
        .update({ active: true })
        .in('id', toReactivate.map((s: { id: string }) => s.id))
      reactivated.push(...reactivateUnitIds)
    }
  }

  return json(200, {
    ok: errors.length === 0,
    upserted: totalUpserted,
    reactivated: reactivated.length > 0 ? reactivated : undefined,
    range: { from: fromDate.toISOString().split('T')[0], to: toDate.toISOString().split('T')[0] },
    errors: errors.length > 0 ? errors : undefined,
  })
})
