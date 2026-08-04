import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.0'

const BASE_URL = 'https://leaders.lwcanada.org'
const ROOT_UNIT_ID = 'cmotpb106000ewkxbi3md8xs6'

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
  const headers = lines[0].split(',').map((header) => header.trim())
  const rows: Record<string, string>[] = []

  for (const line of lines.slice(1)) {
    if (!line.trim()) continue
    const values: string[] = []
    let current = ''
    let inQuotes = false
    for (const character of line) {
      if (character === '"') { inQuotes = !inQuotes; continue }
      if (character === ',' && !inQuotes) { values.push(current.trim()); current = ''; continue }
      current += character
    }
    values.push(current.trim())
    rows.push(Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ''])))
  }

  return rows
}

function dateOnly(value: string) {
  return value.trim().split(/[ T]/)[0]
}

function monthRange(date: string) {
  const parsed = new Date(`${date}T12:00:00`)
  if (Number.isNaN(parsed.getTime())) return null
  const year = parsed.getFullYear()
  const month = parsed.getMonth()
  const from = `${year}-${String(month + 1).padStart(2, '0')}-01`
  const to = `${year}-${String(month + 2).padStart(2, '0')}-01`
  const lastDay = new Date(new Date(to).getTime() - 24 * 60 * 60 * 1000).getDate()
  return { from, to: `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}` }
}

function* monthRanges(fromDate: Date, toDate: Date) {
  const cursor = new Date(fromDate.getFullYear(), fromDate.getMonth(), 1)
  while (cursor <= toDate) {
    const year = cursor.getFullYear()
    const month = cursor.getMonth()
    const from = `${year}-${String(month + 1).padStart(2, '0')}-01`
    const lastDay = new Date(year, month + 1, 0).getDate()
    const to = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
    yield { from, to }
    cursor.setMonth(cursor.getMonth() + 1)
  }
}

function findNameColumn(headers: string[]) {
  const normalized = new Map(headers.map((header) => [header.toLowerCase().trim(), header]))
  for (const candidate of ['full name', 'name', 'person', 'attendee', 'member name', 'contact name', 'contact']) {
    if (normalized.has(candidate)) return normalized.get(candidate)!
  }
  return headers.find((header) => {
    const lower = header.toLowerCase().trim()
    return lower.includes('name') && lower !== 'service name' && lower !== 'host unit'
  }) ?? null
}

async function fetchCheckins(apiToken: string, from: string, to: string) {
  const response = await fetch(
    `${BASE_URL}/api/services/export?unitId=${ROOT_UNIT_ID}&shape=checkins&from=${from}&to=${to}`,
    { headers: { Authorization: `Bearer ${apiToken}` } },
  )
  if (!response.ok) throw new Error(`CMP returned HTTP ${response.status}`)
  return parseCSV(await response.text())
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' })

  const authorization = req.headers.get('Authorization')
  if (!authorization?.startsWith('Bearer ')) return json(401, { error: 'Authentication required' })

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authorization } },
  })
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) return json(401, { error: 'Invalid authentication token' })

  let body: {
    action?: string
    days?: number
    date?: string
    service_name?: string
    host_unit?: string
    report_id?: string
    updates?: Record<string, unknown>
  }
  try { body = await req.json() } catch { return json(400, { error: 'Invalid request body' }) }

  try {
    if (body.action === 'list') {
      const apiToken = Deno.env.get('REPORTS_API_TOKEN')
      if (!apiToken) return json(500, { error: 'REPORTS_API_TOKEN secret not configured' })
      const days = Math.min(Math.max(Number(body.days) || 60, 1), 365)
      const to = new Date()
      const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000)
      const rows: Record<string, string>[] = []
      for (const range of monthRanges(from, to)) {
        rows.push(...await fetchCheckins(apiToken, range.from, range.to))
      }
      const services = new Map<string, { date: string; service_name: string; host_unit: string; count: number }>()

      for (const row of rows) {
        const date = dateOnly(row['Service date'] ?? '')
        const serviceName = (row['Service'] ?? '').trim()
        const hostUnit = (row['Host unit'] ?? '').trim()
        if ((row['Status'] ?? '').trim().toLowerCase() !== 'submitted' || !date || !serviceName || !hostUnit || date.startsWith('TRUNCATED')) continue
        const key = `${date}\u0000${serviceName}\u0000${hostUnit}`
        const service = services.get(key) ?? { date, service_name: serviceName, host_unit: hostUnit, count: 0 }
        service.count += 1
        services.set(key, service)
      }

      return json(200, {
        services: [...services.values()].sort((a, b) => b.date.localeCompare(a.date) || a.service_name.localeCompare(b.service_name)),
        name_col: findNameColumn(Object.keys(rows[0] ?? {})),
      })
    }

    if (body.action === 'attendees') {
      if (!body.date || !body.service_name || !body.host_unit) return json(400, { error: 'date, service_name, and host_unit are required' })
      const apiToken = Deno.env.get('REPORTS_API_TOKEN')
      if (!apiToken) return json(500, { error: 'REPORTS_API_TOKEN secret not configured' })
      const range = monthRange(body.date)
      if (!range) return json(400, { error: 'date must be a valid ISO date' })
      const rows = await fetchCheckins(apiToken, range.from, range.to)
      const headers = Object.keys(rows[0] ?? {})
      const nameCol = findNameColumn(headers)
      if (!nameCol) return json(422, { error: 'No attendee name column found in CMP export', headers })
      const names = rows
        .filter((row) =>
          (row['Status'] ?? '').trim().toLowerCase() === 'submitted' &&
          dateOnly(row['Service date'] ?? '') === body.date &&
          (row['Service'] ?? '').trim() === body.service_name &&
          (row['Host unit'] ?? '').trim() === body.host_unit,
        )
        .map((row) => (row[nameCol] ?? '').trim())
        .filter(Boolean)

      return json(200, { names, name_col: nameCol, count: names.length })
    }

    if (body.action === 'update_report') {
      if (!body.report_id || !body.updates) return json(400, { error: 'report_id and updates are required' })

      const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
      const [{ data: existing, error: reportError }, { data: requester, error: requesterError }] = await Promise.all([
        admin.from('meeting_attendance_reports').select('id, created_by').eq('id', body.report_id).maybeSingle(),
        admin.from('users').select('role').eq('id', user.id).maybeSingle(),
      ])
      if (reportError || !existing) return json(404, { error: 'Report not found' })
      if (requesterError || !requester) return json(403, { error: 'User profile not found' })

      const canUpdate = existing.created_by === user.id || ['super_admin', 'regional_secretary'].includes(requester.role)
      if (!canUpdate) return json(403, { error: 'You do not have permission to update this report' })

      const allowedUpdates = {
        label: body.updates.label,
        report_date: body.updates.report_date,
        expected_count: body.updates.expected_count,
        attended_count: body.updates.attended_count,
        absent_count: body.updates.absent_count,
        unexpected_count: body.updates.unexpected_count,
        reach_pct: body.updates.reach_pct,
        present_names: body.updates.present_names,
        absent_names: body.updates.absent_names,
        unexpected_names: body.updates.unexpected_names,
        subgroup_filter: body.updates.subgroup_filter,
        by_subgroup: body.updates.by_subgroup,
      }
      const { data, error } = await admin
        .from('meeting_attendance_reports')
        .update(allowedUpdates)
        .eq('id', body.report_id)
        .select('id')
        .maybeSingle()
      if (error || !data) return json(500, { error: error?.message || 'Report update failed' })
      return json(200, { id: data.id })
    }

    return json(400, { error: "action must be 'list', 'attendees', or 'update_report'" })
  } catch (error) {
    return json(502, { error: error instanceof Error ? error.message : 'Unable to fetch CMP service data' })
  }
})
