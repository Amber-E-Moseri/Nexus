// Member Intelligence — CMP sync function.
// Auth: user JWT verified by Supabase, role must be super_admin.
// DB writes use service-role client.

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

function findNameColumn(headers: string[]): string | null {
  const normalized = new Map(headers.map((h) => [h.toLowerCase().trim(), h]))
  for (const candidate of ['full name', 'name', 'person', 'attendee', 'member name', 'contact name', 'contact']) {
    if (normalized.has(candidate)) return normalized.get(candidate)!
  }
  return headers.find((h) => {
    const lower = h.toLowerCase().trim()
    return lower.includes('name') && lower !== 'service name' && lower !== 'host unit'
  }) ?? null
}

function nameToSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
}

interface SyncInput {
  dateFrom?: string
  dateTo?: string
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' })

  // — Auth: verify user JWT, require super_admin —
  const authorization = req.headers.get('Authorization')
  if (!authorization?.startsWith('Bearer ')) return json(401, { error: 'Authentication required' })

  const token = authorization.replace('Bearer ', '')

  // Check JWT claim first (same pattern as novaAuth.ts) — avoids RLS issues on the users table
  function decodeJwtClaim(t: string, claim: string): string | null {
    try {
      const payload = JSON.parse(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
      return payload[claim] ?? null
    } catch { return null }
  }

  // — Service-role client (for role lookup and all DB writes) —
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  const userClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authorization } } },
  )
  const { data: { user }, error: userError } = await userClient.auth.getUser()
  if (userError || !user) return json(401, { error: 'Invalid authentication token' })

  // Try JWT claim first, then service-role DB lookup (bypasses RLS) as fallback
  let role = decodeJwtClaim(token, 'user_role')
  if (!role) {
    const { data: profile } = await db.from('users').select('role').eq('id', user.id).maybeSingle()
    role = profile?.role ?? null
  }
  if (role !== 'super_admin') return json(403, { error: `super_admin role required, got: ${role ?? 'null'}` })

  const apiToken = Deno.env.get('REPORTS_API_TOKEN')
  if (!apiToken) return json(500, { error: 'REPORTS_API_TOKEN not configured' })

  let input: SyncInput = {}
  try { input = await req.json() } catch { /* no body = use defaults */ }

  const dateTo = input.dateTo ? new Date(input.dateTo) : new Date()
  const dateFrom = input.dateFrom
    ? new Date(input.dateFrom)
    : new Date(dateTo.getTime() - 90 * 24 * 60 * 60 * 1000)

  const dateFromStr = dateFrom.toISOString().split('T')[0]
  const dateToStr = dateTo.toISOString().split('T')[0]

  // — Insert sync log row up front —
  const { data: logRow } = await db
    .from('mi_sync_log')
    .insert({ status: 'running', records_in: {} })
    .select()
    .single()
  const logId = logRow?.id

  const recordsIn: Record<string, unknown> = {}

  try {
    // 1. HIERARCHY
    console.log('[mi-sync] Fetching hierarchy...')
    const unitsRes = await fetch(`${BASE_URL}/api/units?pageSize=1000`, {
      headers: { Authorization: `Bearer ${apiToken}` },
    })
    if (!unitsRes.ok) throw new Error(`Units endpoint failed: ${unitsRes.status}`)

    const units: any[] = ((await unitsRes.json()) as any).data || []
    const subgroups = units.filter((u) => u.kind === 'Subgroup')
    const fellowships = units.filter((u) => u.kind === 'Fellowship')
    const cells = units.filter((u) => u.kind === 'Cell' || u.kind === 'BSC')

    if (subgroups.length) {
      await db.from('mi_subgroups').upsert(
        subgroups.map((sg) => ({ cmp_id: sg.id, name: sg.name })),
        { onConflict: 'cmp_id' },
      )
    }

    const { data: savedSgs } = await db.from('mi_subgroups').select('id, cmp_id')
    const sgMap = new Map((savedSgs || []).map((sg) => [sg.cmp_id, sg.id]))

    if (fellowships.length) {
      await db.from('mi_fellowships').upsert(
        fellowships.map((f) => ({
          cmp_id: f.id,
          name: f.name,
          subgroup_id: f.parent_id ? (sgMap.get(f.parent_id) ?? null) : null,
        })),
        { onConflict: 'cmp_id' },
      )
    }

    const { data: savedFs } = await db.from('mi_fellowships').select('id, cmp_id')
    const fMap = new Map((savedFs || []).map((f) => [f.cmp_id, f.id]))

    if (cells.length) {
      await db.from('mi_cells').upsert(
        cells.map((c) => ({
          cmp_id: c.id,
          name: c.name,
          fellowship_id: c.parent_id ? (fMap.get(c.parent_id) ?? null) : null,
        })),
        { onConflict: 'cmp_id' },
      )
    }

    recordsIn.hierarchy = { subgroups: subgroups.length, fellowships: fellowships.length, cells: cells.length }
    console.log('[mi-sync] Hierarchy:', recordsIn.hierarchy)

    // 2. MEMBERS (best-effort — endpoint may not exist)
    console.log('[mi-sync] Attempting members endpoint...')
    let memberCount = 0
    try {
      const membersRes = await fetch(`${BASE_URL}/api/members?pageSize=5000`, {
        headers: { Authorization: `Bearer ${apiToken}` },
      })
      if (membersRes.ok) {
        const members: any[] = ((await membersRes.json()) as any).data || []
        const { data: cellsData } = await db.from('mi_cells').select('id, cmp_id')
        const { data: fsData } = await db.from('mi_fellowships').select('id, cmp_id')
        const { data: sgsData } = await db.from('mi_subgroups').select('id, cmp_id')
        const cellMap2 = new Map((cellsData || []).map((c) => [c.cmp_id, c.id]))
        const fMap2 = new Map((fsData || []).map((f) => [f.cmp_id, f.id]))
        const sgMap2 = new Map((sgsData || []).map((sg) => [sg.cmp_id, sg.id]))

        if (members.length) {
          await db.from('mi_members').upsert(
            members.map((m) => ({
              cmp_id: m.id,
              name: m.name,
              phone: m.phone ?? null,
              email: m.email ?? null,
              cell_id: m.cell_id ? (cellMap2.get(m.cell_id) ?? null) : null,
              fellowship_id: m.fellowship_id ? (fMap2.get(m.fellowship_id) ?? null) : null,
              subgroup_id: m.subgroup_id ? (sgMap2.get(m.subgroup_id) ?? null) : null,
              foundation_school_status: m.foundation_school_status || 'not_recorded',
              is_active: true,
            })),
            { onConflict: 'cmp_id' },
          )
          memberCount = members.length
        }
      } else {
        console.warn('[mi-sync] Members endpoint returned', membersRes.status, '— skipping')
      }
    } catch (e) {
      console.warn('[mi-sync] Members endpoint error:', (e as Error).message)
    }
    recordsIn.members = memberCount
    console.log('[mi-sync] Members synced:', memberCount)

    // 3. SERVICE ATTENDANCE
    console.log('[mi-sync] Fetching service CSV...')
    let eventCount = 0
    let attendanceCount = 0
    try {
      const csvRes = await fetch(
        `${BASE_URL}/api/services/export?unitId=${ROOT_UNIT_ID}&shape=checkins&from=${dateFromStr}&to=${dateToStr}`,
        { headers: { Authorization: `Bearer ${apiToken}` } },
      )
      if (csvRes.ok) {
        const rows = parseCSV(await csvRes.text())
        const nameCol = findNameColumn(Object.keys(rows[0] ?? {}))

        // Group rows into service events
        const eventMap = new Map<string, { date: string; title: string; names: string[]; firstTimers: Set<string> }>()
        for (const row of rows) {
          if ((row['Status'] ?? '').toLowerCase() !== 'submitted') continue
          const date = (row['Service date'] ?? '').split(/[ T]/)[0]
          if (!date || date.startsWith('TRUNCATED')) continue
          const title = (row['Service'] ?? '').trim() || 'Service'
          const hostUnit = (row['Host unit'] ?? '').trim()
          const key = `${date}|${title}|${hostUnit}`
          const event = eventMap.get(key) ?? { date, title: `${title} — ${hostUnit}`, names: [], firstTimers: new Set() }
          if (nameCol && row[nameCol]) {
            const name = row[nameCol].trim()
            if (name) {
              event.names.push(name)
              if ((row['First-timer at this service'] ?? '').toLowerCase() === 'yes') event.firstTimers.add(name)
            }
          }
          eventMap.set(key, event)
        }

        // Build/refresh member cache (name → id) for provisional matching
        const { data: existingMembers } = await db.from('mi_members').select('id, name, cmp_id')
        const memberByName = new Map((existingMembers || []).map((m) => [m.name.toLowerCase(), m.id]))
        const memberByCmpId = new Map((existingMembers || []).map((m) => [m.cmp_id, m.id]))

        for (const [key, event] of eventMap) {
          // Upsert the attendance event
          const cmpEventId = `svc_${key}`
          const { data: eventRow } = await db
            .from('mi_attendance_events')
            .upsert(
              { cmp_event_id: cmpEventId, event_date: event.date, event_type: 'service', title: event.title },
              { onConflict: 'cmp_event_id' },
            )
            .select('id')
            .single()

          if (!eventRow) continue
          eventCount++

          // Upsert attendance records — create provisional members for unknown names
          for (const name of event.names) {
            const nameLower = name.toLowerCase()
            let memberId = memberByName.get(nameLower)

            if (!memberId) {
              // Create provisional member so attendance can be tracked
              const provCmpId = `name_${nameToSlug(name)}`
              if (memberByCmpId.has(provCmpId)) {
                memberId = memberByCmpId.get(provCmpId)
              } else {
                const { data: newMember } = await db
                  .from('mi_members')
                  .upsert({ cmp_id: provCmpId, name }, { onConflict: 'cmp_id' })
                  .select('id')
                  .single()
                if (newMember) {
                  memberId = newMember.id
                  memberByName.set(nameLower, memberId)
                  memberByCmpId.set(provCmpId, memberId)
                }
              }
            }

            if (!memberId) continue

            await db.from('mi_attendance_records').upsert(
              {
                event_id: eventRow.id,
                member_id: memberId,
                status: 'attended',
                is_first_timer_at_service: event.firstTimers.has(name),
              },
              { onConflict: 'event_id,member_id' },
            )
            attendanceCount++
          }
        }
      } else {
        console.warn('[mi-sync] Service CSV returned', csvRes.status)
      }
    } catch (e) {
      console.warn('[mi-sync] Service attendance error:', (e as Error).message)
    }

    recordsIn.events = eventCount
    recordsIn.records = attendanceCount
    console.log('[mi-sync] Events:', eventCount, 'Records:', attendanceCount)

    // 4. FIRST-TIMERS — derive from attendance records with is_first_timer_at_service
    console.log('[mi-sync] Deriving first-timers...')
    try {
      const { data: firstTimerRecords } = await db
        .from('mi_attendance_records')
        .select('member_id, mi_attendance_events(event_date)')
        .eq('is_first_timer_at_service', true)

      for (const record of firstTimerRecords || []) {
        const eventDate = (record.mi_attendance_events as any)?.event_date
        if (!eventDate) continue
        await db.from('mi_first_timers').upsert(
          {
            member_id: record.member_id,
            first_service_date: eventDate,
            source: 'service',
          },
          { onConflict: 'member_id', ignoreDuplicates: false },
        )
      }
    } catch (e) {
      console.warn('[mi-sync] First-timers derivation error:', (e as Error).message)
    }

    // 5. FINALISE SYNC LOG
    if (logId) {
      await db.from('mi_sync_log').update({
        finished_at: new Date().toISOString(),
        status: 'success',
        records_in: recordsIn,
      }).eq('id', logId)
    }

    return json(200, { status: 'success', records_in: recordsIn })

  } catch (error) {
    const errorMsg = (error as Error).message
    console.error('[mi-sync] Fatal:', errorMsg)
    if (logId) {
      await db.from('mi_sync_log').update({
        finished_at: new Date().toISOString(),
        status: 'error',
        error_detail: errorMsg,
      }).eq('id', logId)
    }
    return json(500, { status: 'error', error: errorMsg })
  }
})
