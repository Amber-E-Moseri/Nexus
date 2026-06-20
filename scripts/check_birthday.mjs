import fs from 'fs'
import { createClient } from '@supabase/supabase-js'

// Load env
const env = {}
fs.readFileSync('.env.local', 'utf-8').split('\n').forEach(line => {
  const [key, val] = line.split('=')
  if (key) env[key.trim()] = val?.trim().replace(/^["']|["']$/g, '')
})

const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY)

async function check() {
  // Get birthday/personal tasks
  const { data: tasks, error } = await supabase
    .from('tasks')
    .select('id, title, status, status_id, is_personal, created_at')
    .eq('is_personal', true)
    .limit(5)
  
  if (error) {
    console.error('Error:', error)
    return
  }
  
  console.log('Personal/Birthday Tasks:')
  if (tasks?.length > 0) {
    tasks.forEach(t => {
      console.log(`- "${t.title}": status="${t.status}", status_id="${t.status_id}"`)
    })
  } else {
    console.log('No personal tasks found')
  }
}

check().catch(console.error)
