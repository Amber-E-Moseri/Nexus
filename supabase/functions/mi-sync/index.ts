// Member Intelligence — CMP sync function.
// SERVICE ROLE ONLY: syncs hierarchy, members, and attendance from LWCanada CMP API.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

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

interface SyncInput {
  dateFrom?: string // ISO date, default: today - 90 days
  dateTo?: string   // ISO date, default: today
}

interface SyncResult {
  hierarchy?: { subgroups: number; fellowships: number; cells: number }
  members?: { created: number; updated: number }
  events?: { created: number; updated: number }
  records?: { created: number; updated: number }
  error?: string
}

// Parse CSV helper (reuse from service-attendees pattern)
function parseCSV(text: string): Record<string, string>[] {
  const lines = text.trim().split('\n')
  if (lines.length < 2) return []
  const headers = lines[0].split(',').map((h) => h.trim())
  const rows: Record<string, string>[] = []
  for (const line of lines.slice(1)) {
    if (!line.trim()) continue
    const values: string[] = []
    let current = ''
    let inQuotes = false
    for (const char of line) {
      if (char === '"') { inQuotes = !inQuotes; continue }
      if (char === ',' && !inQuotes) { values.push(current.trim()); current = ''; continue }
      current += char
    }
    values.push(current.trim())
    rows.push(Object.fromEntries(headers.map((h, i) => [h, values[i] ?? ''])))
  }
  return rows
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' })

  const authHeader = req.headers.get('Authorization')
  const syncSecret = Deno.env.get('MI_SYNC_SECRET')
  if (!syncSecret || authHeader !== `Bearer ${syncSecret}`) {
    return json(401, { error: 'Unauthorized' })
  }

  const apiToken = Deno.env.get('REPORTS_API_TOKEN')
  if (!apiToken) return json(500, { error: 'REPORTS_API_TOKEN not configured' })

  let input: SyncInput = {}
  try {
    input = await req.json()
  } catch {
    // No body is OK, use defaults
  }

  // Default date range: last 90 days
  const dateTo = input.dateTo ? new Date(input.dateTo) : new Date()
  const dateFrom = input.dateFrom
    ? new Date(input.dateFrom)
    : new Date(dateTo.getTime() - 90 * 24 * 60 * 60 * 1000)

  const dateFromStr = dateFrom.toISOString().split('T')[0]
  const dateToStr = dateTo.toISOString().split('T')[0]

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  const logId = crypto.randomUUID()
  let syncLog: any = {
    id: logId,
    started_at: new Date().toISOString(),
    status: 'running',
    records_in: {},
  }

  try {
    // 1. SYNC HIERARCHY (Subgroup/Fellowship/Cell)
    console.log('[mi-sync] Fetching hierarchy...')
    const unitsRes = await fetch(`${BASE_URL}/api/units?pageSize=1000`, {
      headers: { Authorization: `Bearer ${apiToken}` },
    })
    if (!unitsRes.ok) throw new Error(`Units endpoint failed: ${unitsRes.status}`)

    const unitsData = await unitsRes.json() as any
    const units = unitsData.data || []

    // Filter by kind
    const subgroups = units.filter((u: any) => u.kind === 'Subgroup')
    const fellowships = units.filter((u: any) => u.kind === 'Fellowship')
    const cells = units.filter((u: any) => u.kind === 'Cell' || u.kind === 'BSC')

    // Upsert subgroups
    for (const sg of subgroups) {
      await supabase.from('mi_subgroups').upsert(
        { cmp_id: sg.id, name: sg.name },
        { onConflict: 'cmp_id' },
      )
    }

    // Upsert fellowships (with subgroup lookup)
    const sgMap = new Map<string, string>()
    const { data: savedSgs } = await supabase.from('mi_subgroups').select('id, cmp_id')
    for (const sg of savedSgs || []) sgMap.set(sg.cmp_id, sg.id)

    for (const f of fellowships) {
      const parentId = f.parent_id ? sgMap.get(f.parent_id) : null
      await supabase.from('mi_fellowships').upsert(
        { cmp_id: f.id, name: f.name, subgroup_id: parentId },
        { onConflict: 'cmp_id' },
      )
    }

    // Upsert cells (with fellowship lookup)
    const fMap = new Map<string, string>()
    const { data: savedFs } = await supabase.from('mi_fellowships').select('id, cmp_id')
    for (const f of savedFs || []) fMap.set(f.cmp_id, f.id)

    for (const c of cells) {
      const parentId = c.parent_id ? fMap.get(c.parent_id) : null
      await supabase.from('mi_cells').upsert(
        { cmp_id: c.id, name: c.name, fellowship_id: parentId },
        { onConflict: 'cmp_id' },
      )
    }

    syncLog.records_in.hierarchy = { subgroups: subgroups.length, fellowships: fellowships.length, cells: cells.length }
    console.log('[mi-sync] Hierarchy synced:', syncLog.records_in.hierarchy)

    // 2. SYNC MEMBERS
    console.log('[mi-sync] Fetching members...')
    let members: any[] = []
    try {
      // Try /api/members endpoint
      const membersRes = await fetch(`${BASE_URL}/api/members?pageSize=1000`, {
        headers: { Authorization: `Bearer ${apiToken}` },
      })
      if (membersRes.ok) {
        const membersData = await membersRes.json() as any
        members = membersData.data || []
      }
    } catch (e) {
      console.warn('[mi-sync] Members endpoint not available:', (e as Error).message)
    }

    // Build lookup maps for member assignment
    const cellMap = new Map<string, string>()
    const fMap2 = new Map<string, string>()
    const sgMap2 = new Map<string, string>()
    const { data: cellsData } = await supabase.from('mi_cells').select('id, cmp_id')
    const { data: fsData } = await supabase.from('mi_fellowships').select('id, cmp_id')
    const { data: sgsData } = await supabase.from('mi_subgroups').select('id, cmp_id')
    for (const c of cellsData || []) cellMap.set(c.cmp_id, c.id)
    for (const f of fsData || []) fMap2.set(f.cmp_id, f.id)
    for (const sg of sgsData || []) sgMap2.set(sg.cmp_id, sg.id)

    // Upsert members
    let memberCount = 0
    for (const m of members) {
      const cellId = m.cell_id ? cellMap.get(m.cell_id) : null
      const fellId = m.fellowship_id ? fMap2.get(m.fellowship_id) : null
      const sgId = m.subgroup_id ? sgMap2.get(m.subgroup_id) : null

      await supabase.from('mi_members').upsert(
        {
          cmp_id: m.id,
          name: m.name,
          phone: m.phone,
          email: m.email,
          cell_id: cellId,
          fellowship_id: fellId,
          subgroup_id: sgId,
          foundation_school_status: m.foundation_school_status || 'not_recorded',
          is_active: true,
        },
        { onConflict: 'cmp_id' },
      )
      memberCount++
    }

    syncLog.records_in.members = memberCount
    console.log('[mi-sync] Members synced:', memberCount)

    // 3. SYNC SERVICE ATTENDANCE
    console.log('[mi-sync] Fetching service attendance...')
    let serviceRecords = 0
    try {
      const csvRes = await fetch(
        `${BASE_URL}/api/services/export?unitId=${ROOT_UNIT_ID}&shape=checkins&from=${dateFromStr}&to=${dateToStr}`,
        { headers: { Authorization: `Bearer ${apiToken}` } },
      )
      if (csvRes.ok) {
        const csvText = await csvRes.text()
        const rows = parseCSV(csvText)

        // Group by (date, service, host)
        const eventMap = new Map<string, { date: string; serviceName: string; hostUnit: string; checked: string[] }>()
        const memberMap = new Map<string, string>()
        const { data: savedMembers } = await supabase.from('mi_members').select('id, cmp_id')
        for (const m of savedMembers || []) memberMap.set(m.cmp_id, m.id)

        for (const row of rows) {
          if ((row['Status'] ?? '').toLowerCase() !== 'submitted') continue
          const date = (row['Service date'] ?? '').split(/[ T]/)[0]
          if (!date || date.startsWith('TRUNCATED')) continue

          const serviceName = (row['Service'] ?? '').trim()
          const hostUnit = (row['Host unit'] ?? '').trim()
          if (!serviceName || !hostUnit) continue

          const key = `${date}|${serviceName}|${hostUnit}`
          const event = eventMap.get(key) || { date, serviceName, hostUnit, checked: [] }

          const name = (row['First name'] ?? '').trim() && (row['Last name'] ?? '').trim()
            ? `${(row['First name'] ?? '').trim()} ${(row['Last name'] ?? '').trim()}`
            : (row['Attendee'] ?? '').trim()

          if (name) event.checked.push(name)
          eventMap.set(key, event)
        }

        // Upsert events and records
        for (const [, event] of eventMap) {
          const { data: eventData } = await supabase
            .from('mi_attendance_events')
            .insert({
              cmp_event_id: `svc_${event.date}_${event.serviceName}`,
              event_date: event.date,
              event_type: 'service',
              title: event.serviceName,
            })
            .select()
            .maybeSingle()

          if (eventData) {
            for (const attendeeName of event.checked) {
              // Naive matching: find member with matching name (ideally would use better matching)
              const { data: matchedMembers } = await supabase
                .from('mi_members')
                .select('id')
                .textSearch('name', attendeeName)
                .limit(1)

              if (matchedMembers && matchedMembers.length > 0) {
                await supabase.from('mi_attendance_records').upsert(
                  {
                    event_id: eventData.id,
                    member_id: matchedMembers[0].id,
                    status: 'attended',
                    is_first_timer_at_service: (row['First-timer at this service'] ?? '').toLowerCase() === 'yes',
                  },
                  { onConflict: 'event_id,member_id' },
                )
                serviceRecords++
              }
            }
          }
        }
      }
    } catch (e) {
      console.warn('[mi-sync] Service attendance sync failed:', (e as Error).message)
    }

    syncLog.records_in.events = serviceRecords
    console.log('[mi-sync] Service records synced:', serviceRecords)

    // 4. UPDATE SYNC LOG
    syncLog.finished_at = new Date().toISOString()
    syncLog.status = 'success'
    await supabase.from('mi_sync_log').update(syncLog).eq('id', logId)

    return json(200, { status: 'success', ...syncLog })
  } catch (error) {
    const errorMsg = (error as Error).message
    console.error('[mi-sync] Error:', errorMsg)
    await supabase.from('mi_sync_log').update({
      finished_at: new Date().toISOString(),
      status: 'error',
      error_detail: errorMsg,
    }).eq('id', logId)
    return json(500, { status: 'error', error: errorMsg })
  }
})
