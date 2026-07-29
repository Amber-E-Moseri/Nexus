import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.0'

const supabaseUrl = Deno.env.get('SUPABASE_URL')
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
const registrationApiKey = Deno.env.get('REGISTRATION_SYNC_API_KEY')

console.log('Environment check:')
console.log('SUPABASE_URL:', supabaseUrl ? 'set' : 'MISSING')
console.log('SUPABASE_SERVICE_ROLE_KEY:', supabaseServiceKey ? 'set' : 'MISSING')
console.log('REGISTRATION_SYNC_API_KEY:', registrationApiKey ? 'set' : 'MISSING')

if (!supabaseUrl || !supabaseServiceKey || !registrationApiKey) {
  throw new Error('Missing required environment variables')
}

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

  // Verify API key
  const authHeader = request.headers.get('authorization') || ''
  const token = authHeader.replace('Bearer ', '')

  if (!token || token !== registrationApiKey) {
    return jsonResponse(401, { error: 'Unauthorized: Invalid API key' })
  }

  try {
    const body = await request.json()
    const { registrations } = body

    if (!Array.isArray(registrations)) {
      return jsonResponse(400, { error: 'registrations must be an array' })
    }

    if (registrations.length === 0) {
      return jsonResponse(200, { message: 'No registrations to sync', inserted: 0, updated: 0 })
    }

    let inserted = 0
    let updated = 0

    // Upsert each registration by email (email is unique identifier)
    for (const reg of registrations) {
      const { email, fullName, firstName, lastName, gender, subgroup, fellowship, phone, designation, shirtSize, foundationStatus, baptism, allergies, team, leadership, arrivalDate, arrivalTime, arrivalFlight, departureDate, departureTime, departureFlight, submittedAt } = reg

      if (!email) {
        console.warn('Skipping registration with no email:', reg)
        continue
      }

      const { data: existing, error: checkError } = await supabase
        .from('registrations')
        .select('id')
        .eq('email', email.toLowerCase())
        .single()

      if (checkError) {
        console.log(`Email ${email} not found (expected for new record):`, checkError.code)
      }

      const registrationData = {
        email: email.toLowerCase(),
        full_name: fullName || `${firstName || ''} ${lastName || ''}`.trim(),
        first_name: firstName || '',
        last_name: lastName || '',
        gender: gender || '',
        subgroup: subgroup || '',
        fellowship: fellowship || '',
        phone: phone || '',
        designation: designation || '',
        shirt_size: shirtSize || '',
        foundation_status: foundationStatus || '',
        baptism: baptism || '',
        allergies: allergies || '',
        team: team || '',
        leadership: leadership || '',
        arrival_date: arrivalDate || null,
        arrival_time: arrivalTime || '',
        arrival_flight: arrivalFlight || '',
        departure_date: departureDate || null,
        departure_time: departureTime || '',
        departure_flight: departureFlight || '',
        submitted_at: submittedAt || new Date().toISOString(),
      }

      if (existing) {
        // Update existing registration
        const { error } = await supabase
          .from('registrations')
          .update(registrationData)
          .eq('id', existing.id)

        if (error) {
          console.error('Error updating registration:', error)
        } else {
          updated++
        }
      } else {
        // Insert new registration
        const { error } = await supabase
          .from('registrations')
          .insert([registrationData])

        if (error) {
          console.error('Error inserting registration:', error)
        } else {
          inserted++
        }
      }
    }

    return jsonResponse(200, {
      message: 'Registrations synced successfully',
      inserted,
      updated,
      total: registrations.length,
    })
  } catch (error) {
    console.error('Error processing request:', error)
    return jsonResponse(500, { error: 'Internal server error', details: String(error) })
  }
})
