import { useEffect, useMemo, useState } from 'react'
import { safeHref } from '../../lib/urlUtils'
import { supabase } from '../../lib/supabase'

const SPRINT_REVIEW_SELECT = `
  id, sprint_id, goals_achieved, outstanding_items, lessons_learned,
  wins_testimonies, recommendations, final_decisions, final_attachments,
  reviewed_at, completed_at, completed_by, created_at
`

const FIELDS = [
  ['goals_achieved', 'Goals Achieved'],
  ['outstanding_items', 'Outstanding Items'],
  ['lessons_learned', 'Lessons Learned'],
  ['wins_testimonies', 'Wins / Testimonies'],
  ['recommendations', 'Recommendations'],
  ['final_decisions', 'Final Decisions'],
]

export default function SprintReview({ sprint, canManage, onSaved }) {
  const [review, setReview] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [form, setForm] = useState({
    goals_achieved: '',
    outstanding_items: '',
    lessons_learned: '',
    wins_testimonies: '',
    recommendations: '',
    final_decisions: '',
    final_attachments: [],
  })
  const [attachmentName, setAttachmentName] = useState('')
  const [attachmentUrl, setAttachmentUrl] = useState('')

  const isReadOnly = sprint.status === 'archived'

  async function loadReview() {
    setLoading(true)
    setMessage('')
    try {
      const { data, error } = await supabase
        .from('sprint_reviews')
        .select(SPRINT_REVIEW_SELECT)
        .eq('sprint_id', sprint.id)
        .maybeSingle()

      if (error) throw error

      setReview(data)
      setForm({
        goals_achieved: data?.goals_achieved ?? '',
        outstanding_items: data?.outstanding_items ?? '',
        lessons_learned: data?.lessons_learned ?? '',
        wins_testimonies: data?.wins_testimonies ?? '',
        recommendations: data?.recommendations ?? '',
        final_decisions: data?.final_decisions ?? '',
        final_attachments: Array.isArray(data?.final_attachments) ? data.final_attachments : [],
      })
    } catch (nextError) {
      setMessage(nextError.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadReview()
  }, [sprint.id])

  const reviewedAt = review?.reviewed_at ?? review?.completed_at ?? null

  const formattedSections = useMemo(
    () =>
      FIELDS.map(([key, label]) => ({
        key,
        label,
        value: form[key],
      })),
    [form],
  )

  async function ensureReview() {
    const { data, error } = await supabase
      .from('sprint_reviews')
      .insert({
        sprint_id: sprint.id,
        final_attachments: [],
      })
      .select(SPRINT_REVIEW_SELECT)
      .single()

    if (error) throw error
    setReview(data)
    await loadReview()
  }

  async function saveReview(nextForm = form, extra = {}) {
    setSaving(true)
    setMessage('')
    try {
      const payload = {
        sprint_id: sprint.id,
        ...nextForm,
        ...extra,
      }

      const { data, error } = await supabase
        .from('sprint_reviews')
        .upsert(payload, { onConflict: 'sprint_id' })
        .select(SPRINT_REVIEW_SELECT)
        .single()

      if (error) throw error

      setReview(data)
      setForm({
        goals_achieved: data?.goals_achieved ?? '',
        outstanding_items: data?.outstanding_items ?? '',
        lessons_learned: data?.lessons_learned ?? '',
        wins_testimonies: data?.wins_testimonies ?? '',
        recommendations: data?.recommendations ?? '',
        final_decisions: data?.final_decisions ?? '',
        final_attachments: Array.isArray(data?.final_attachments) ? data.final_attachments : [],
      })
      setMessage('Saved')
      await onSaved?.()
    } catch (nextError) {
      setMessage(nextError.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleCompleteReview() {
    await saveReview(form, {
      reviewed_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
    })

    const { error } = await supabase
      .from('sprints')
      .update({ status: 'review' })
      .eq('id', sprint.id)

    if (error) {
      setMessage(error.message)
      return
    }

    await onSaved?.()
  }

  function addAttachment() {
    if (!attachmentName.trim() || !attachmentUrl.trim()) return
    const nextForm = {
      ...form,
      final_attachments: [
        ...form.final_attachments,
        { id: crypto.randomUUID(), name: attachmentName.trim(), url: attachmentUrl.trim() },
      ],
    }
    setAttachmentName('')
    setAttachmentUrl('')
    setForm(nextForm)
    saveReview(nextForm)
  }

  function removeAttachment(id) {
    const nextForm = {
      ...form,
      final_attachments: form.final_attachments.filter((item) => item.id !== id),
    }
    setForm(nextForm)
    saveReview(nextForm)
  }

  if (loading) {
    return <div className="rounded-[24px] border border-[var(--border)] bg-white px-5 py-6 text-sm text-[var(--text-secondary)] shadow-[var(--card-shadow)]">Loading review…</div>
  }

  if (!review) {
    return (
      <div className="rounded-[24px] border border-[var(--border)] bg-white p-5 shadow-[var(--card-shadow)]">
        <div className="text-lg font-semibold text-[var(--text-primary)]">Sprint Review</div>
        <p className="mt-2 text-sm text-[var(--text-secondary)]">No review exists for this sprint yet.</p>
        {!isReadOnly && canManage ? (
          <button type="button" onClick={ensureReview} className="mt-4 rounded-xl bg-[var(--accent)] px-4 py-2.5 text-sm font-medium text-white">
            Start Review
          </button>
        ) : null}
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {message ? <div className="rounded-2xl border border-[var(--border)] bg-white px-4 py-3 text-sm text-[var(--text-secondary)] shadow-[var(--card-shadow)]">{message}</div> : null}

      {isReadOnly ? (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-secondary)] px-4 py-3 text-sm text-[var(--text-secondary)]">
          Archived — read only
        </div>
      ) : null}

      <div className="space-y-4 rounded-[24px] border border-[var(--border)] bg-white p-5 shadow-[var(--card-shadow)]">
        {formattedSections.map((section) => (
          <div key={section.key}>
            <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-secondary)]">
              {section.label}
            </label>
            {isReadOnly ? (
              <div className="rounded-xl bg-[var(--surface-secondary)] px-3 py-3 text-sm text-[var(--text-primary)] whitespace-pre-wrap">
                {section.value || '—'}
              </div>
            ) : (
              <textarea
                rows={4}
                value={section.value}
                disabled={!canManage || saving}
                onChange={(event) => setForm((current) => ({ ...current, [section.key]: event.target.value }))}
                onBlur={() => saveReview()}
                className="w-full rounded-xl border border-[var(--border)] bg-white px-3 py-2.5 text-sm text-[var(--text-primary)]"
              />
            )}
          </div>
        ))}
      </div>

      <div className="rounded-[24px] border border-[var(--border)] bg-white p-5 shadow-[var(--card-shadow)]">
        <div className="mb-3 text-sm font-semibold text-[var(--text-primary)]">Final Attachments</div>
        <div className="space-y-3">
          {form.final_attachments.map((item) => (
            <div key={item.id} className="flex items-center gap-3 rounded-xl bg-[var(--surface-secondary)] px-3 py-2">
              <span>🔗</span>
              <a href={safeHref(item.url)} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 truncate text-sm text-[var(--accent)]">
                {item.name}
              </a>
              {!isReadOnly && canManage ? (
                <button type="button" onClick={() => removeAttachment(item.id)} className="text-sm text-[var(--text-tertiary)]">
                  ×
                </button>
              ) : null}
            </div>
          ))}
          {form.final_attachments.length === 0 ? <div className="text-sm text-[var(--text-tertiary)]">No final attachments yet.</div> : null}
        </div>

        {!isReadOnly && canManage ? (
          <div className="mt-4 rounded-2xl border border-[var(--border)] bg-[var(--surface-secondary)] p-4">
            <input value={attachmentName} onChange={(event) => setAttachmentName(event.target.value)} placeholder="Attachment label" className="mb-3 w-full rounded-xl border border-[var(--border)] bg-white px-3 py-2.5 text-sm" />
            <input value={attachmentUrl} onChange={(event) => setAttachmentUrl(event.target.value)} placeholder="https://..." className="w-full rounded-xl border border-[var(--border)] bg-white px-3 py-2.5 text-sm" />
            <button type="button" onClick={addAttachment} className="mt-3 rounded-xl bg-[var(--accent)] px-4 py-2.5 text-sm font-medium text-white">
              Attach link
            </button>
          </div>
        ) : null}
      </div>

      {!isReadOnly && canManage ? (
        <div className="flex flex-wrap gap-3">
          <button type="button" onClick={() => saveReview()} disabled={saving} className="rounded-xl border border-[var(--border)] bg-white px-4 py-2.5 text-sm font-medium text-[var(--text-primary)] disabled:opacity-50">
            {saving ? 'Saving…' : 'Save Review'}
          </button>
          <button type="button" onClick={handleCompleteReview} disabled={saving} className="rounded-xl bg-[var(--accent)] px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50">
            Complete Review
          </button>
          {reviewedAt ? <div className="flex items-center text-sm text-[var(--text-secondary)]">Reviewed {new Date(reviewedAt).toLocaleString('en-CA')}</div> : null}
        </div>
      ) : null}
    </div>
  )
}
