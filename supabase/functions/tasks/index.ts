import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.0'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const nexusApiKey = Deno.env.get('NEXUS_API_KEY')!

const supabase = createClient(supabaseUrl, supabaseServiceKey)

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
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

  if (request.method !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' })
  }

  const authHeader = request.headers.get('authorization') || ''
  const token = authHeader.replace('Bearer ', '')

  if (!token || token !== nexusApiKey) {
    return jsonResponse(401, { error: 'Unauthorized' })
  }

  try {
    const body = await request.json()

    const { title, description, priority, due_date, assignee_id, space_id, source_name } = body

    if (!title || !space_id) {
      return jsonResponse(400, { error: 'title and space_id are required' })
    }

    const { data, error } = await supabase
      .from('tasks')
      .insert([
        {
          title,
          description: description || null,
          priority: priority || 'medium',
          due_date: due_date || null,
          assignee_id: assignee_id || null,
          space_id,
          source: 'api',
          source_name: source_name || null,
          created_by: assignee_id || null,
        },
      ])
      .select('id')
      .single()

    if (error) {
      console.error('Task insert error:', error)
      return jsonResponse(500, { error: 'Failed to create task' })
    }

    return jsonResponse(201, { id: data.id })
  } catch (err) {
    console.error('Error:', err)
    return jsonResponse(500, { error: 'Internal server error' })
  }
})
