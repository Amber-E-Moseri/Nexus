// Nova Jobs — background dispatcher.
// SERVICE ROLE ONLY: triggered by cron, never by users.
// See individual job files for documented service-role justification.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { cleanupAuditData } from './jobs/cleanupAuditData.ts'
import { checkBudgetHealth } from './jobs/checkBudgetHealth.ts'
import { embedContent } from './jobs/embedContent.ts'

type JobName = 'cleanup_audit_data' | 'check_budget_health' | 'embed_content'
const KNOWN_JOBS = new Set<JobName>(['cleanup_audit_data', 'check_budget_health', 'embed_content'])

serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 })
  }

  const authHeader = req.headers.get('Authorization')
  const cronSecret = Deno.env.get('NOVA_JOBS_SECRET')
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }

  let job: JobName
  try {
    const body = await req.json()
    if (!KNOWN_JOBS.has(body?.job)) {
      return new Response(JSON.stringify({ error: `Unknown job: ${body?.job}` }), { status: 400 })
    }
    job = body.job
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid request body.' }), { status: 400 })
  }

  // SERVICE ROLE CLIENT — documented. See module comment above.
  const serviceClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  try {
    switch (job) {
      case 'cleanup_audit_data': {
        const result = await cleanupAuditData(serviceClient)
        console.log('nova-jobs cleanup_audit_data:', result)
        return new Response(JSON.stringify({ job, result }), {
          status: 200, headers: { 'Content-Type': 'application/json' },
        })
      }
      case 'check_budget_health': {
        const result = await checkBudgetHealth(serviceClient)
        console.log('nova-jobs check_budget_health:', result)
        return new Response(JSON.stringify({ job, result }), {
          status: 200, headers: { 'Content-Type': 'application/json' },
        })
      }
      case 'embed_content': {
        const result = await embedContent(serviceClient)
        console.log('nova-jobs embed_content:', result)
        return new Response(JSON.stringify({ job, result }), {
          status: 200, headers: { 'Content-Type': 'application/json' },
        })
      }
    }
  } catch (error) {
    console.error(`nova-jobs ${job} error:`, error)
    return new Response(JSON.stringify({ error: (error as Error)?.message || 'Job failed' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    })
  }
})
