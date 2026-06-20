import fs from 'fs'
import { createClient } from '@supabase/supabase-js'

const env = {}
fs.readFileSync('.env.local', 'utf-8').split('\n').forEach(line => {
  const [key, val] = line.split('=')
  if (key) env[key.trim()] = val?.trim().replace(/^["']|["']$/g, '')
})

const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY)

async function check() {
  // Get status definitions
  const { data: statuses } = await supabase
    .from('task_status_definitions')
    .select('id, name, legacy_key, category')
  
  console.log('Task Status Definitions:')
  if (statuses?.length > 0) {
    statuses.forEach(s => {
      console.log(`- ${s.name}: legacy_key="${s.legacy_key}", category="${s.category}"`)
    })
    
    // Check if "to_do" exists
    const hasToDo = statuses.some(s => s.legacy_key === 'to_do')
    console.log('\nHas "to_do" status:', hasToDo)
  } else {
    console.log('No statuses found')
  }
}

check().catch(console.error)
