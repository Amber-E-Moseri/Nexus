import fs from 'fs'
import { createClient } from '@supabase/supabase-js'

const env = {}
fs.readFileSync('.env.local', 'utf-8').split('\n').forEach(line => {
  const [key, val] = line.split('=')
  if (key) env[key.trim()] = val?.trim().replace(/^["']|["']$/g, '')
})

console.log('Supabase URL:', env.VITE_SUPABASE_URL?.substring(0, 20) + '...')

const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY)

async function check() {
  // Try departments
  const { data: depts, error: deptError } = await supabase
    .from('departments')
    .select('id, name')
    .limit(3)
  
  console.log('Departments:', depts?.length || 0, deptError?.message || 'OK')
  
  // Try tasks with count
  const { count, error: countError } = await supabase
    .from('tasks')
    .select('id', { count: 'exact', head: true })
  
  console.log('Tasks count:', count, countError?.message || 'OK')
  
  // Try to get one task without filters
  const { data: tasks, error: taskError } = await supabase
    .from('tasks')
    .select('id, title, status')
    .limit(1)
  
  console.log('Sample task:', tasks?.[0] || 'None found', taskError?.message || 'OK')
}

check().catch(console.error)
