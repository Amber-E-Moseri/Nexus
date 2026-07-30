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
    if (members.length === 0) return jsonResponse(200, { message: 'No members to sync', inserted: 0, updated: 0 })

    let inserted = 0
    let updated = 0

    for (const member of members) {
      const { firstName, lastName, fullName, email, subgroup, leadership } = member
      if (!email) continue

      const { data: existing } = await supabase
        .from('roster')
        .select('id')
        .eq('email', email.toLowerCase())
        .single()

      const resolvedFirst = firstName || ''
      const resolvedLast = lastName || ''
      const resolvedFull = fullName || [resolvedFirst, resolvedLast].filter(Boolean).join(' ')

      const memberData: Record<string, string> = {
        email: email.toLowerCase(),
        first_name: resolvedFirst,
        last_name: resolvedLast,
        full_name: resolvedFull,
        subgroup: subgroup || '',
      }
      if (leadership !== undefined) memberData.leadership = leadership

      if (existing) {
        const { error } = await supabase.from('roster').update(memberData).eq('id', existing.id)
        if (!error) updated++
      } else {
        const { error } = await supabase.from('roster').insert([memberData])
        if (!error) inserted++
      }
    }

    return jsonResponse(200, { message: 'Roster synced successfully', inserted, updated, total: members.length })
  } catch (error) {
    console.error('Error processing request:', error)
    return jsonResponse(500, { error: 'Internal server error', details: String(error) })
  }
})
