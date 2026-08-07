// Test function to probe CMP API for members and cell events endpoints.
// Helps confirm what data shapes are available before building the sync function.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const BASE_URL = 'https://leaders.lwcanada.org'
const ROOT_UNIT_ID = 'cmotpb106000ewkxbi3md8xs6'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type, x-client-info, apikey',
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' })

  const apiToken = Deno.env.get('REPORTS_API_TOKEN')
  if (!apiToken) return json(500, { error: 'REPORTS_API_TOKEN not configured' })

  const body: { endpoint?: string } = await req.json().catch(() => ({}))
  const endpoint = body.endpoint || 'members'

  try {
    // Try various member endpoints
    if (endpoint === 'members') {
      const endpoints = [
        `/api/members?pageSize=100`,
        `/api/units/${ROOT_UNIT_ID}/members?pageSize=100`,
        `/api/members/export`,
      ]

      const results: Record<string, any> = {}
      for (const path of endpoints) {
        try {
          const res = await fetch(`${BASE_URL}${path}`, {
            headers: { Authorization: `Bearer ${apiToken}` },
          })
          results[path] = {
            status: res.status,
            ok: res.ok,
            contentType: res.headers.get('content-type'),
            sample: res.ok ? (await res.text()).slice(0, 500) : await res.text(),
          }
        } catch (e) {
          results[path] = { error: (e as Error).message }
        }
      }
      return json(200, { endpoint: 'members', results })
    }

    // Try various cell/events endpoints
    if (endpoint === 'events' || endpoint === 'cells') {
      const endpoints = [
        `/api/events?type=cell&pageSize=100`,
        `/api/cells/export`,
        `/api/services?type=cell&pageSize=100`,
        `/api/units/${ROOT_UNIT_ID}/events?type=cell`,
      ]

      const results: Record<string, any> = {}
      for (const path of endpoints) {
        try {
          const res = await fetch(`${BASE_URL}${path}`, {
            headers: { Authorization: `Bearer ${apiToken}` },
          })
          results[path] = {
            status: res.status,
            ok: res.ok,
            contentType: res.headers.get('content-type'),
            sample: res.ok ? (await res.text()).slice(0, 500) : await res.text(),
          }
        } catch (e) {
          results[path] = { error: (e as Error).message }
        }
      }
      return json(200, { endpoint: 'events', results })
    }

    return json(400, { error: 'Unknown endpoint. Try "members" or "events"' })
  } catch (error) {
    return json(500, { error: (error as Error).message })
  }
})
