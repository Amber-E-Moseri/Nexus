import { useState } from 'react'
import { CalendarClock, Sparkles, ChevronDown, ChevronUp, X } from 'lucide-react'
import { askNovaOrchestrate } from '../lib/novaApi'
import NovaMarkdown from './NovaMarkdown'
import SourceChip from './SourceChip'
import ExtractionReview from './ExtractionReview'
import { supabase } from '../../../lib/supabase'

// Creates a task from a Nova proposal. Resolves owner name → user_id via DB lookup.
async function createTaskFromProposal(proposal, meetingId, departmentId) {
  let assigneeId = null

  if (proposal.owner_name) {
    const { data } = await supabase
      .from('users')
      .select('id')
      .ilike('name', `%${proposal.owner_name}%`)
      .limit(1)
      .maybeSingle()
    assigneeId = data?.id ?? null
  }

  // Find the "To Do" status for this department
  const { data: statusRow } = await supabase
    .from('task_status_definitions')
    .select('id')
    .eq('legacy_key', 'to_do')
    .eq('is_org_status', true)
    .maybeSingle()

  const { error } = await supabase.from('tasks').insert({
    title: proposal.title,
    assignee_id: assigneeId,
    due_date: proposal.due_date || null,
    priority: proposal.priority || 'medium',
    department_id: departmentId,
    status_id: statusRow?.id ?? null,
    source_meeting_id: meetingId,
  })

  if (error) throw new Error(error.message)
}

// Saves a decision to the meeting_minutes for this meeting.
// If no minutes record exists yet, creates one in draft state.
async function saveDecisionToMeeting(decision, meetingId) {
  const { data: existingMinutes } = await supabase
    .from('meeting_minutes')
    .select('id')
    .eq('meeting_id', meetingId)
    .maybeSingle()

  if (existingMinutes) {
    // Append to the summary field as a note (decisions are recorded in segments)
    const { data: minutes } = await supabase
      .from('meeting_minutes')
      .select('summary')
      .eq('id', existingMinutes.id)
      .single()

    const updatedSummary = minutes?.summary
      ? `${minutes.summary}\n\n**Decision:** ${decision.text}`
      : `**Decision:** ${decision.text}`

    const { error } = await supabase
      .from('meeting_minutes')
      .update({ summary: updatedSummary })
      .eq('id', existingMinutes.id)

    if (error) throw new Error(error.message)
  } else {
    // Create a minimal draft minutes record
    const { error } = await supabase.from('meeting_minutes').insert({
      meeting_id: meetingId,
      summary: `**Decision:** ${decision.text}`,
      status: 'draft',
    })
    if (error) throw new Error(error.message)
  }
}

export default function NovaMeetingPanel({ meetingId, meetingTitle, departmentId }) {
  const [mode, setMode] = useState(null) // null | 'prep' | 'extract'
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  async function run(intent) {
    if (loading) return
    setMode(intent)
    setResult(null)
    setError(null)
    setLoading(true)

    try {
      const response = await askNovaOrchestrate({
        intent,
        message: intent === 'meeting_prep'
          ? `Prepare me for the meeting: ${meetingTitle}`
          : `Extract decisions and action items from meeting: ${meetingTitle}`,
        context: { meetingId },
      })
      setResult(response)
    } catch (err) {
      setError(err?.message || 'Nova could not process that request.')
    } finally {
      setLoading(false)
    }
  }

  function close() {
    setMode(null)
    setResult(null)
    setError(null)
  }

  const isOpen = mode !== null && (loading || result || error)

  return (
    <div style={{ marginBottom: 16 }}>
      {/* Trigger buttons */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button
          type="button"
          onClick={() => mode === 'prep' && isOpen ? close() : run('meeting_prep')}
          disabled={loading}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '6px 12px', borderRadius: 20,
            background: mode === 'prep' && isOpen ? 'var(--accent)' : 'transparent',
            border: `1px solid ${mode === 'prep' && isOpen ? 'var(--accent)' : 'var(--border)'}`,
            color: mode === 'prep' && isOpen ? '#fff' : 'var(--accent)',
            fontSize: 12, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading && mode !== 'prep' ? 0.5 : 1,
            transition: 'all 0.12s',
          }}
        >
          <CalendarClock size={13} />
          Prepare with Nova
          {mode === 'prep' && isOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        </button>

        <button
          type="button"
          onClick={() => mode === 'extract' && isOpen ? close() : run('meeting_extract')}
          disabled={loading}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '6px 12px', borderRadius: 20,
            background: mode === 'extract' && isOpen ? 'var(--accent)' : 'transparent',
            border: `1px solid ${mode === 'extract' && isOpen ? 'var(--accent)' : 'var(--border)'}`,
            color: mode === 'extract' && isOpen ? '#fff' : 'var(--accent)',
            fontSize: 12, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading && mode !== 'extract' ? 0.5 : 1,
            transition: 'all 0.12s',
          }}
        >
          <Sparkles size={13} />
          Extract Decisions
          {mode === 'extract' && isOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        </button>
      </div>

      {/* Result panel */}
      {isOpen && (
        <div style={{
          marginTop: 12, padding: 16,
          background: 'var(--surface-secondary)',
          border: '1px solid var(--border-light)',
          borderRadius: 10,
          position: 'relative',
        }}>
          <button
            type="button"
            onClick={close}
            style={{
              position: 'absolute', top: 10, right: 10,
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--text-tertiary)', padding: 4,
            }}
          >
            <X size={14} />
          </button>

          {/* Loading state */}
          {loading && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-secondary)', fontSize: 13 }}>
              <Sparkles size={14} style={{ animation: 'spin 1.2s linear infinite', color: 'var(--accent)' }} />
              {mode === 'meeting_prep' ? 'Preparing your brief…' : 'Extracting decisions…'}
            </div>
          )}

          {/* Error */}
          {error && !loading && (
            <div style={{ fontSize: 13, color: 'var(--color-error, #DC2626)' }}>{error}</div>
          )}

          {/* Prep result — markdown */}
          {result && mode === 'meeting_prep' && !loading && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
                Meeting Brief — {meetingTitle}
              </div>
              <NovaMarkdown content={result.answer} />
              {result.sources?.length > 0 && (
                <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {result.sources.map((s) => (
                    <SourceChip key={`${s.type}-${s.id}`} source={s} />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Extract result — ExtractionReview */}
          {result && mode === 'meeting_extract' && !loading && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
                Nova Extractions — {meetingTitle}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>{result.answer}</div>
              {result.metadata?.proposals && (
                <ExtractionReview
                  proposals={result.metadata.proposals}
                  saving={saving}
                  onCreateTask={async (task) => {
                    setSaving(true)
                    try {
                      await createTaskFromProposal(task, meetingId, departmentId)
                    } finally {
                      setSaving(false)
                    }
                  }}
                  onSaveDecision={async (decision) => {
                    setSaving(true)
                    try {
                      await saveDecisionToMeeting(decision, meetingId)
                    } finally {
                      setSaving(false)
                    }
                  }}
                />
              )}
            </div>
          )}
        </div>
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
