import fs from 'fs'
import { createClient } from '@supabase/supabase-js'

const env = {}
fs.readFileSync('.env.local', 'utf-8').split('\n').forEach(line => {
  const [key, val] = line.split('=')
  if (key) env[key.trim()] = val?.trim().replace(/^["']|["']$/g, '')
})

const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY)

async function check() {
  // Get all tasks with status info
  const { data: tasks } = await supabase
    .from('tasks')
    .select('id, title, status, status_id, task_type, is_personal, created_at')
    .limit(20)
  
  console.log('All Tasks (first 20):')
  if (tasks?.length > 0) {
    tasks.forEach(t => {
      console.log(`- "${t.title}": task_type=${t.task_type}, is_personal=${t.is_personal}, status="${t.status}", status_id="${t.status_id}"`)
    })
    
    // Show unique status values
    const uniqueStatus = [...new Set(tasks.map(t => t.status).filter(s => s))]
    console.log('\nUnique status values found:', uniqueStatus)
  } else {
    console.log('No tasks found')
  }
}

check().catch(console.error)
