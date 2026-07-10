import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.0'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const nexusApiKey = Deno.env.get('NEXUS_API_KEY')!

const supabase = createClient(supabaseUrl, supabaseServiceKey)

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type',
}

function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  })
}

serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (request.method !== 'GET') {
    return jsonResponse(405, { error: 'Method not allowed' })
  }

  const authHeader = request.headers.get('authorization') || ''
  const token = authHeader.replace('Bearer ', '')

  if (!token || token !== nexusApiKey) {
    return jsonResponse(401, { error: 'Unauthorized' })
  }

  try {
    const { data, error } = await supabase
      .from('users')
      .select('id, full_name, email')
      .eq('status', 'active')
      .order('full_name', { ascending: true })

    if (error) {
      console.error('Users query error:', error)
      return jsonResponse(500, { error: 'Failed to fetch users' })
    }

    return jsonResponse(200, { users: data || [] })
  } catch (err) {
    console.error('Error:', err)
    return jsonResponse(500, { error: 'Internal server error' })
  }
})
