import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.0'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const registrationApiKey = Deno.env.get('REGISTRATION_SYNC_API_KEY')!

const supabase = createClient(supabaseUrl, supabaseServiceKey)

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type',
}

function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return jsonResponse(405, { error: 'Method not allowed' })

  const authHeader = request.headers.get('authorization') || ''
  const token = authHeader.replace('Bearer ', '')
  if (!token || token !== registrationApiKey) {
    return jsonResponse(401, { error: 'Unauthorized: Invalid API key' })
  }

  try {
    const body = await request.json()
    const { members } = body

    if (!Array.isArray(members)) return jsonResponse(400, { error: 'members must be an array' })
    if (members.length === 0) return jsonResponse(200, { message: 'No members to sync', upserted: 0 })

    const seen = new Set<string>()
    const rows = members
      .filter((m: Record<string, string>) => m.email?.trim())
      .map((m: Record<string, string>) => ({
        email: m.email.trim().toLowerCase(),
        full_name: (m.full_name || m.fullName || '').trim(),
        subgroup: (m.subgroup || '').trim(),
        fellowship: (m.fellowship || '').trim(),
        phone_number: (m.phone_number || m.phoneNumber || m.phone || '').trim(),
        synced_at: new Date().toISOString(),
      }))
      .filter((r) => {
        if (seen.has(r.email)) return false
        seen.add(r.email)
        return true
      })

    const { error } = await supabase
      .from('working_list')
      .upsert(rows, { onConflict: 'email' })

    if (error) {
      console.error('Upsert error:', error)
      return jsonResponse(500, { error: 'Database error', details: error.message })
    }

    return jsonResponse(200, { message: 'Working list synced', upserted: rows.length })
  } catch (error) {
    console.error('Error:', error)
    return jsonResponse(500, { error: 'Internal server error', details: String(error) })
  }
})
