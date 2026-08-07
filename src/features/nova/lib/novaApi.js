import { supabase } from '../../../lib/supabase'
import { processSSELines } from '../../../lib/meetings/sseParser'

/**
 * Calls the nova-chat edge function and streams the answer back.
 *
 * @param {string} question
 * @param {{ onText?: (chunk: string) => void, onDone?: (info: { track: string, logId: string|null }) => void, signal?: AbortSignal }} handlers
 * @returns {Promise<{ text: string, track: string, logId: string|null }>}
 */
export async function askNova(question, { onText, onDone, signal } = {}) {
  const session = (await supabase.auth.getSession()).data.session
  if (!session?.access_token) {
    throw new Error('Session expired. Please log in again.')
  }

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
  const response = await fetch(`${supabaseUrl}/functions/v1/nova-chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ question }),
    signal,
  })

  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(err.error || `Nova is unavailable right now (${response.status}).`)
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let text = ''
  let track = 'unanswered'
  let logId = null

  while (true) {
    const { value, done } = await reader.read()
    if (done) break

    const rawChunk = decoder.decode(value, { stream: true })
    const { updatedBuffer, events, error } = processSSELines(buffer, rawChunk)
    if (error === 'buffer_overflow') throw new Error('Nova response stream was corrupted. Please try again.')
    buffer = updatedBuffer

    for (const event of events) {
      if (event.text) {
        text += event.text
        onText?.(event.text)
      }
      if (event.done) {
        track = event.track ?? 'unanswered'
        logId = event.log_id ?? null
      }
    }
  }

  onDone?.({ track, logId })
  return { text, track, logId }
}

/**
 * Calls nova-orchestrate with a structured intent request.
 * Returns a NovaResponse: { answer, sources, intent, sessionId }.
 * @param {{ intent?: string, message: string, context?: object }} body
 * @returns {Promise<{ answer: string, sources: Array, intent: string, sessionId?: string }>}
 */
export async function askNovaOrchestrate(body) {
  const session = (await supabase.auth.getSession()).data.session
  if (!session?.access_token) {
    throw new Error('Session expired. Please log in again.')
  }

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
  const response = await fetch(`${supabaseUrl}/functions/v1/nova-orchestrate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(err.error || `Nova is unavailable right now (${response.status}).`)
  }

  return await response.json()
}

/** Records a thumbs up/down on a previously-answered question. */
export async function submitNovaFeedback(logId, feedback) {
  if (!logId) return
  const { error } = await supabase.from('nova_query_log').update({ feedback }).eq('id', logId)
  if (error) throw error
}
