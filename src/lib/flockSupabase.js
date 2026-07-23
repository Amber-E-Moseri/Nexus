/**
 * Flock CRM — Supabase backend layer.
 *
 * Drop-in replacement for the GAS callFlockAPI. All data is scoped to the
 * logged-in pastor via RLS (pastor_id = auth.uid()). super_admin sees all rows.
 *
 * Usage in panels: import { callFlockCRM as callFlockAPI, FLOCK, flockCard, ... }
 * from this module. The action names and param shapes match the original GAS API
 * so panel render logic is unchanged.
 */

import { supabase } from './supabase'

// Re-export style tokens so panels need only one import
export { FLOCK, flockCard, formatTimeAgo, initials } from './flockApi'

// ── Settings metadata (static — labels/descs are not stored in DB) ────────────

const SETTINGS_META = {
  YOUR_NAME:             { label: 'Your Name',             desc: 'Used in greetings and email reminders.' },
  REMINDER_EMAIL:        { label: 'Reminder Email',        desc: 'Email address to receive follow-up reminders.' },
  MORNING_REMINDER_HOUR: { label: 'Morning Reminder Hour', desc: 'Hour (0–23) to send daily reminders.' },
  DUESTATUS_REFRESH_HOUR:{ label: 'Due Status Refresh',    desc: 'Hour (0–23) to recompute who is due.' },
  MONDAY_FOLLOWUPS_HOUR: { label: 'Monday Digest Hour',    desc: 'Hour (0–23) for Monday weekly digest.' },
  TIMEZONE:              { label: 'Timezone',              desc: 'e.g. America/Winnipeg' },
}
const DEFAULT_SETTINGS = {
  YOUR_NAME: 'Pastor',
  REMINDER_EMAIL: '',
  MORNING_REMINDER_HOUR: '8',
  DUESTATUS_REFRESH_HOUR: '6',
  MONDAY_FOLLOWUPS_HOUR: '7',
  TIMEZONE: 'America/Winnipeg',
}
const SETTINGS_ORDER = ['YOUR_NAME', 'REMINDER_EMAIL', 'MORNING_REMINDER_HOUR', 'DUESTATUS_REFRESH_HOUR', 'MONDAY_FOLLOWUPS_HOUR', 'TIMEZONE']

// ── Helpers ────────────────────────────────────────────────────────────────────

async function myPastorId() {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.id) throw new Error('Not authenticated')
  return user.id
}

function toIso(raw) {
  if (!raw) return null
  const s = String(raw).trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  const d = new Date(s)
  return isNaN(d.getTime()) ? null : d.toISOString().split('T')[0]
}

function fmtTs(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  return isNaN(d.getTime()) ? String(ts) : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function fmtDate(iso) {
  if (!iso) return ''
  const d = new Date(iso + 'T00:00:00')
  return isNaN(d.getTime()) ? String(iso) : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function todayIso() {
  return new Date().toISOString().split('T')[0]
}

// ── Contacts ──────────────────────────────────────────────────────────────────

// phone/email columns ship in migration 20261221000000. Until it's applied
// remotely, retry once without them so the CRM keeps working.
let hasContactDetailCols = true

function missingDetailCols(error) {
  return hasContactDetailCols && error && /column|phone|email/i.test(error.message) && /phone|email/i.test(error.message)
}

const CONTACT_BASE_COLS = 'id, full_name, role, fellowship, cadence_days, active, next_due_date, due_status, priority, notes'

async function getContacts() {
  const pid = await myPastorId()
  let res = await supabase
    .from('flock_contacts')
    .select(hasContactDetailCols ? `${CONTACT_BASE_COLS}, phone, email` : CONTACT_BASE_COLS)
    .eq('pastor_id', pid)
    .order('full_name')
  if (res.error && missingDetailCols(res.error)) {
    hasContactDetailCols = false
    res = await supabase.from('flock_contacts').select(CONTACT_BASE_COLS).eq('pastor_id', pid).order('full_name')
  }
  if (res.error) throw new Error(res.error.message)
  return (res.data || []).map(c => ({
    id: c.id,
    name: c.full_name,
    role: c.role || '',
    fellowship: c.fellowship || '',
    phone: c.phone || '',
    email: c.email || '',
    cadenceDays: c.cadence_days,
    active: c.active !== false,
    nextDueDate: c.next_due_date || '',
    dueStatus: c.due_status || '',
    priority: c.priority || '',
    notes: c.notes || '',
  }))
}

function contactDetailFields({ phone, email }) {
  if (!hasContactDetailCols) return {}
  return { phone: (phone || '').trim() || null, email: (email || '').trim() || null }
}

async function addContact({ name, role, fellowship, priority, cadenceDays, phone, email }) {
  const row = {
    full_name: name,
    role: role || null,
    fellowship: fellowship || null,
    priority: priority || null,
    cadence_days: parseInt(cadenceDays, 10) || 28,
    ...contactDetailFields({ phone, email }),
  }
  let res = await supabase.from('flock_contacts').insert(row).select('id').single()
  if (res.error && missingDetailCols(res.error)) {
    hasContactDetailCols = false
    const { phone: _p, email: _e, ...legacy } = row
    res = await supabase.from('flock_contacts').insert(legacy).select('id').single()
  }
  if (res.error) throw new Error(res.error.message)
  return { success: true, personId: res.data.id }
}

async function updateContact({ personId, name, role, fellowship, phone, email }) {
  if (!personId) throw new Error('Missing person id')
  if (!String(name || '').trim()) throw new Error('Name is required')
  const patch = {
    full_name: String(name).trim(),
    role: (role || '').trim() || null,
    fellowship: (fellowship || '').trim() || null,
    ...contactDetailFields({ phone, email }),
  }
  let res = await supabase.from('flock_contacts').update(patch).eq('id', personId)
  if (res.error && missingDetailCols(res.error)) {
    hasContactDetailCols = false
    const { phone: _p, email: _e, ...legacy } = patch
    res = await supabase.from('flock_contacts').update(legacy).eq('id', personId)
  }
  if (res.error) throw new Error(res.error.message)
  return { success: true }
}

async function updateCadence({ personId, cadenceDays }) {
  const n = parseInt(cadenceDays, 10)
  if (!n || n < 1) throw new Error('Invalid cadence value')
  const pid = await myPastorId()

  const { data: contact } = await supabase
    .from('flock_contacts')
    .select('last_successful_contact')
    .eq('pastor_id', pid)
    .eq('id', personId)
    .single()

  const patch = { cadence_days: n }
  if (contact?.last_successful_contact) {
    const base = new Date(contact.last_successful_contact)
    const nextDue = new Date(base.getTime() + n * 86400000)
    const nextIso = nextDue.toISOString().split('T')[0]
    patch.next_due_date = nextIso
    patch.due_status = nextIso < todayIso() ? 'Overdue' : 'On Track'
  }

  const { error } = await supabase.from('flock_contacts').update(patch).eq('id', personId)
  if (error) throw new Error(error.message)
  return { success: true }
}

async function setContactActive({ personId, active }) {
  const isActive = active === true || active === 'true'
  const { error } = await supabase.from('flock_contacts').update({ active: isActive }).eq('id', personId)
  if (error) throw new Error(error.message)
  return { success: true }
}

// ── Interactions ──────────────────────────────────────────────────────────────

async function getInteractions({ personId }) {
  const pid = await myPastorId()
  const { data, error } = await supabase
    .from('flock_interactions')
    .select('id, interacted_at, result, outcome_type, summary, next_action, next_action_datetime, meeting_id')
    .eq('pastor_id', pid)
    .eq('contact_id', personId)
    .order('interacted_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data || []).map(i => ({
    id: i.id,
    timestamp: fmtTs(i.interacted_at),
    result: i.result || '',
    outcome: i.outcome_type || '',
    summary: i.summary || '',
    nextAction: i.next_action || 'None',
    nextDt: i.next_action_datetime ? fmtTs(i.next_action_datetime) : '',
    nextActionDateTimeRaw: i.next_action_datetime || null,
    meetingId: i.meeting_id || null,
  }))
}

async function saveInteraction({ personId, fullName, result, summary, nextAction, nextActionDateTime, meetingId, interactedAt }) {
  const { data: interaction, error: intErr } = await supabase
    .from('flock_interactions')
    .insert({
      contact_id: personId || null,
      contact_name: fullName || '',
      result: result || '',
      summary: summary || '',
      next_action: nextAction || 'None',
      next_action_datetime: nextActionDateTime || null,
      interacted_at: interactedAt || new Date().toISOString(),
      meeting_id: meetingId || null,
    })
    .select('id')
    .single()
  if (intErr) throw new Error(intErr.message)

  // Update contact's cadence tracking fields
  if (personId) {
    const now = new Date().toISOString()
    const isReached = result === 'Reached'
    let patch = { last_attempt: now }
    if (isReached) {
      const { data: contact } = await supabase
        .from('flock_contacts')
        .select('cadence_days')
        .eq('id', personId)
        .single()
      const cadence = contact?.cadence_days || 28
      const nextDue = new Date(Date.now() + cadence * 86400000)
      const nextIso = nextDue.toISOString().split('T')[0]
      patch = { last_attempt: now, last_successful_contact: now, next_due_date: nextIso, due_status: 'On Track' }
    }
    await supabase.from('flock_contacts').update(patch).eq('id', personId)
  }

  return { success: true, interactionId: interaction.id }
}

async function updateInteraction({ interactionId, result, summary, nextAction, nextActionDateTime }) {
  if (!interactionId) throw new Error('interactionId is required')
  const patch = {}
  if (result !== undefined) patch.result = result || ''
  if (summary !== undefined) patch.summary = summary || ''
  if (nextAction !== undefined) patch.next_action = nextAction || 'None'
  if (nextActionDateTime !== undefined) patch.next_action_datetime = nextActionDateTime || null

  const { error } = await supabase
    .from('flock_interactions')
    .update(patch)
    .eq('id', interactionId)
  if (error) throw new Error(error.message)
  return { success: true }
}

async function searchInteractions({ query }) {
  if (!query || String(query).trim().length < 2) return { results: [], total: 0 }
  // Strip characters that PostgREST parses as .or() filter syntax.
  const q = String(query).trim().replace(/[,()"]/g, ' ').trim()
  if (q.length < 2) return { results: [], total: 0 }
  const pid = await myPastorId()
  const { data, error } = await supabase
    .from('flock_interactions')
    .select('id, contact_id, contact_name, interacted_at, result, outcome_type, summary, next_action')
    .eq('pastor_id', pid)
    .or(`summary.ilike.%${q}%,contact_name.ilike.%${q}%`)
    .order('interacted_at', { ascending: false })
    .limit(50)
  if (error) throw new Error(error.message)
  const results = (data || []).map(r => ({
    interactionId: r.id,
    personId: r.contact_id || '',
    personName: r.contact_name || '',
    timestamp: fmtTs(r.interacted_at),
    result: r.result || '',
    outcome: r.outcome_type || '',
    summary: r.summary || '',
    nextAction: r.next_action || 'None',
  }))
  return { results, total: results.length }
}

// ── Todos ─────────────────────────────────────────────────────────────────────

async function getTodos() {
  const pid = await myPastorId()
  const { data, error } = await supabase
    .from('flock_todos')
    .select('id, contact_id, contact_name, text, due_date, done, completed_at, created_at')
    .eq('pastor_id', pid)
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  const todos = (data || []).map(t => ({
    id: t.id,
    personId: t.contact_id || 'manual',
    personName: t.contact_name || 'My Tasks',
    text: t.text,
    dueDate: fmtDate(t.due_date),
    dueDateIso: t.due_date || '',
    done: t.done || false,
    createdAt: t.created_at ? new Date(t.created_at).toLocaleDateString() : '',
  }))
  return { todos }
}

async function saveTodos({ interactionId, personId, personName, todos }) {
  if (!todos || !todos.length) return { success: true }
  const rows = todos.map(t => ({
    contact_id: !personId || personId === 'manual' ? null : personId,
    contact_name: personName || 'My Tasks',
    interaction_id: interactionId && !String(interactionId).startsWith('manual') ? interactionId : null,
    text: t.text || '',
    due_date: toIso(t.dueDate) || null,
  }))
  const { error } = await supabase.from('flock_todos').insert(rows)
  if (error) throw new Error(error.message)
  return { success: true }
}

async function updateTodo({ todoId, done }) {
  const isDone = done === true || done === 'true'
  const patch = { done: isDone, completed_at: isDone ? new Date().toISOString() : null }
  const { error } = await supabase.from('flock_todos').update(patch).eq('id', todoId)
  if (error) throw new Error(error.message)
  return { success: true }
}

async function updateTodoText({ todoId, text }) {
  const { error } = await supabase.from('flock_todos').update({ text }).eq('id', todoId)
  if (error) throw new Error(error.message)
  return { success: true }
}

async function updateTodoDueDate({ todoId, dueDate }) {
  const { error } = await supabase.from('flock_todos').update({ due_date: toIso(dueDate) || null }).eq('id', todoId)
  if (error) throw new Error(error.message)
  return { success: true }
}

async function updateTodoAssignee({ todoId, personId, personName }) {
  const { error } = await supabase
    .from('flock_todos')
    .update({
      contact_id: !personId || personId === 'manual' ? null : personId,
      contact_name: personName || 'My Tasks',
    })
    .eq('id', todoId)
  if (error) throw new Error(error.message)
  return { success: true }
}

async function deleteTodo({ todoId }) {
  const pid = await myPastorId()
  const { error } = await supabase.from('flock_todos').delete().eq('pastor_id', pid).eq('id', todoId)
  if (error) throw new Error(error.message)
  return { success: true }
}

// ── Settings ──────────────────────────────────────────────────────────────────

async function getSettings() {
  const pid = await myPastorId()
  const { data, error } = await supabase.from('flock_settings').select('key, val').eq('pastor_id', pid)
  if (error) throw new Error(error.message)

  const byKey = {}
  ;(data || []).forEach(s => { byKey[s.key] = s.val })

  // Seed any missing keys (upsert with ignoreDuplicates so concurrent requests are safe)
  const missing = SETTINGS_ORDER.filter(k => !(k in byKey))
  if (missing.length) {
    const rows = missing.map(k => ({ key: k, val: DEFAULT_SETTINGS[k] || '' }))
    const { error: seedErr } = await supabase.from('flock_settings').upsert(rows, { onConflict: 'pastor_id,key', ignoreDuplicates: true })
    if (!seedErr) missing.forEach(k => { byKey[k] = DEFAULT_SETTINGS[k] || '' })
  }

  return SETTINGS_ORDER.map(key => ({
    key,
    label: SETTINGS_META[key]?.label || key,
    desc: SETTINGS_META[key]?.desc || '',
    val: byKey[key] ?? DEFAULT_SETTINGS[key] ?? '',
  }))
}

async function saveSetting({ key, val }) {
  const { error } = await supabase
    .from('flock_settings')
    .upsert({ key, val }, { onConflict: 'pastor_id,key' })
  if (error) throw new Error(error.message)
  return { success: true }
}

// ── Home panel aggregates ─────────────────────────────────────────────────────

async function quickStats() {
  const pid = await myPastorId()
  const today = todayIso()
  const weekAhead = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0]

  const [totalRes, todayRes, overdueRes, weekRes] = await Promise.all([
    supabase.from('flock_contacts').select('*', { count: 'exact', head: true }).eq('pastor_id', pid).eq('active', true),
    supabase.from('flock_contacts').select('*', { count: 'exact', head: true }).eq('pastor_id', pid).eq('active', true).eq('next_due_date', today),
    supabase.from('flock_contacts').select('*', { count: 'exact', head: true }).eq('pastor_id', pid).eq('active', true).lt('next_due_date', today),
    supabase.from('flock_contacts').select('*', { count: 'exact', head: true }).eq('pastor_id', pid).eq('active', true).gte('next_due_date', today).lte('next_due_date', weekAhead),
  ])

  return {
    today: todayRes.count || 0,
    callbacks: overdueRes.count || 0,
    week: weekRes.count || 0,
    total: totalRes.count || 0,
  }
}

async function duePeople() {
  const pid = await myPastorId()
  const today = todayIso()
  const baseCols = 'id, full_name, next_due_date, due_status, fellowship'
  const query = (cols) => supabase
    .from('flock_contacts')
    .select(cols)
    .eq('pastor_id', pid)
    .eq('active', true)
    .lte('next_due_date', today)
    .order('next_due_date')
    .limit(20)
  let res = await query(hasContactDetailCols ? `${baseCols}, phone, email` : baseCols)
  if (res.error && missingDetailCols(res.error)) {
    hasContactDetailCols = false
    res = await query(baseCols)
  }
  if (res.error) throw new Error(res.error.message)
  return {
    due: (res.data || []).map(p => ({
      id: p.id,
      name: p.full_name,
      status: p.due_status || 'Overdue',
      phone: p.phone || null,
      email: p.email || null,
      fellowship: p.fellowship || '',
    })),
  }
}

// ── Router — drop-in replacement for callFlockAPI ─────────────────────────────

export async function callFlockCRM(action, params = {}) {
  switch (action) {
    case 'people':
    case 'getPeopleWithCadence':
      return getContacts()

    case 'getInteractions':
      return getInteractions(params)

    case 'saveInteraction': {
      const p = JSON.parse(params.payload || '{}')
      return saveInteraction({
        personId: p.personId,
        fullName: p.fullName || p.personName || '',
        result: p.result || 'Reached',
        summary: p.summary || p.notes || '',
        nextAction: p.nextAction || 'None',
        nextActionDateTime: p.nextActionDateTime || p.dateTime || null,
        meetingId: p.meetingId || null,
        interactedAt: p.interactedAt || null,
      })
    }

    case 'updateInteraction': {
      const p = JSON.parse(params.payload || '{}')
      return updateInteraction({
        interactionId: p.interactionId,
        result: p.result,
        summary: p.summary,
        nextAction: p.nextAction,
        nextActionDateTime: p.nextActionDateTime,
      })
    }

    case 'saveTodos': {
      const p = JSON.parse(params.payload || '{}')
      return saveTodos(p)
    }

    case 'getTodos':
      return getTodos()

    case 'updateTodo':
      return updateTodo(params)

    case 'updateTodoText':
      return updateTodoText(params)

    case 'updateTodoDueDate':
      return updateTodoDueDate(params)

    case 'updateTodoAssignee':
      return updateTodoAssignee(params)

    case 'deleteTodo':
      return deleteTodo(params)

    case 'addPerson': {
      const p = JSON.parse(params.payload || '{}')
      return addContact(p)
    }

    case 'updatePerson': {
      const p = JSON.parse(params.payload || '{}')
      return updateContact(p)
    }

    case 'saveCadence':
      return updateCadence(params)

    case 'setActive':
      return setContactActive(params)

    case 'searchInteractions':
      return searchInteractions(params)

    case 'getSettings':
      return getSettings()

    case 'saveSetting':
      return saveSetting(params)

    case 'quickStats':
      return quickStats()

    case 'duePeople':
      return duePeople()

    default:
      throw new Error(`Unknown Flock CRM action: ${action}`)
  }
}
