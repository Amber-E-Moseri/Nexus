import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type, x-client-info, apikey',
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const token = Deno.env.get('REPORTS_API_TOKEN')
  if (!token) return json(500, { error: 'REPORTS_API_TOKEN secret not configured' })

  const BASE = 'https://leaders.lwcanada.org'
  const ROOT_UNIT_ID = 'cmotpb106000ewkxbi3md8xs6'

  function parseCSV(text: string): Record<string, string>[] {
    const lines = text.trim().split('\n')
    if (lines.length < 2) return []
    const headers = lines[0].split(',').map(h => h.trim())
    return lines.slice(1).map(line => {
      const values: string[] = []
      let current = ''
      let inQuotes = false
      for (const ch of line) {
        if (ch === '"') { inQuotes = !inQuotes; continue }
        if (ch === ',' && !inQuotes) { values.push(current.trim()); current = ''; continue }
        current += ch
      }
      values.push(current.trim())
      return Object.fromEntries(headers.map((h, i) => [h, values[i] ?? '']))
    })
  }

  async function fetchJSON(url: string) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } })
    return { status: res.status, data: await res.json() }
  }

  async function fetchCSV(url: string) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
    if (!res.ok) return { status: res.status, error: await res.text() }
    return { status: res.status, text: await res.text() }
  }

  // 1. Distinct unit kinds from units list
  const { data: unitsData } = await fetchJSON(`${BASE}/api/units?pageSize=1000`)
  const units: { id: string; name: string; kind: string }[] = unitsData?.data ?? []
  const kindCounts: Record<string, number> = {}
  for (const u of units) kindCounts[u.kind] = (kindCounts[u.kind] ?? 0) + 1
  const unitsByKind: Record<string, { id: string; name: string }[]> = {}
  for (const u of units) {
    if (!unitsByKind[u.kind]) unitsByKind[u.kind] = []
    unitsByKind[u.kind].push({ id: u.id, name: u.name })
  }

  // 2. Try export with date range — does the API support from/to params?
  const dateRangeResult = await fetchCSV(
    `${BASE}/api/services/export?unitId=${ROOT_UNIT_ID}&shape=checkins&from=2026-07-01&to=2026-07-31`
  )
  let dateRangeInfo: Record<string, unknown>
  if ('error' in dateRangeResult) {
    dateRangeInfo = { supported: false, error: dateRangeResult.error }
  } else {
    const rows = parseCSV(dateRangeResult.text!)
    const lastRow = rows[rows.length - 1]
    const truncated = lastRow?.['Service date']?.startsWith('TRUNCATED') ?? false
    dateRangeInfo = { supported: true, rows_returned: rows.length, truncated, first_row: rows[0], last_row: lastRow }
  }

  // 3. Try alternate date param names if from/to didn't narrow results
  const altDateResult = await fetchCSV(
    `${BASE}/api/services/export?unitId=${ROOT_UNIT_ID}&shape=checkins&startDate=2026-07-01&endDate=2026-07-31`
  )
  let altDateInfo: Record<string, unknown>
  if ('error' in altDateResult) {
    altDateInfo = { supported: false, error: altDateResult.error }
  } else {
    const rows = parseCSV(altDateResult.text!)
    altDateInfo = { rows_returned: rows.length, first_row: rows[0] }
  }

  return json(200, {
    unit_kind_counts: kindCounts,
    units_by_kind: unitsByKind,
    date_range_from_to: dateRangeInfo,
    date_range_startDate_endDate: altDateInfo,
  })
})
