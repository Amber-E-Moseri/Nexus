import { useEffect, useMemo, useState } from 'react'
import Badge from '../../../components/ui/Badge'
import { advanceSprintStatus, saveSprintReview } from '../lib/sprints'
import { useAuth } from '../../../hooks/useAuth'

const FIELDS = [
  ['goals_achieved', 'Goals Achieved'],
  ['outstanding_items', 'Outstanding Work'],
  ['lessons_learned', 'Lessons Learned'],
  ['wins_testimonies', 'Wins / Testimonies'],
  ['recommendations', 'Recommendations'],
  ['final_decisions', 'Final Decisions'],
]

export default function SprintReviewForm({ sprint, review, canManage, onSaved, onArchived }) {
  const { profile } = useAuth()
  const [form, setForm] = useState({
    goals_achieved: '',
    outstanding_items: '',
    lessons_learned: '',
    wins_testimonies: '',
    recommendations: '',
    final_decisions: '',
  })
  const [saving, setSaving] = useState(false)
  const [archiving, setArchiving] = useState(false)
  const [savedReview, setSavedReview] = useState(review)

  useEffect(() => {
    setSavedReview(review)
    setForm({
      goals_achieved: review?.goals_achieved ?? '',
      outstanding_items: review?.outstanding_items ?? '',
      lessons_learned: review?.lessons_learned ?? '',
      wins_testimonies: review?.wins_testimonies ?? '',
      recommendations: review?.recommendations ?? '',
      final_decisions: review?.final_decisions ?? '',
    })
  }, [review])

  const canArchive = useMemo(() => Boolean(savedReview?.completed_at) && sprint.status === 'review', [savedReview, sprint.status])

  async function handleSave() {
    setSaving(true)
    try {
      const saved = await saveSprintReview(sprint.id, form, profile.id)
      setSavedReview(saved)
      await onSaved?.()
    } finally {
      setSaving(false)
    }
  }

  async function handleArchive() {
    setArchiving(true)
    try {
      await advanceSprintStatus(sprint.id, 'archived')
      await onArchived?.()
    } finally {
      setArchiving(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-[20px] border border-[var(--border)] bg-white p-5 shadow-[var(--card-shadow)]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-lg font-semibold text-[var(--text-primary)]">{sprint.name}</div>
            <div className="mt-1 max-w-2xl text-sm text-[var(--text-secondary)]">{sprint.goal || 'No goal set.'}</div>
          </div>
          <Badge tone={sprint.status}>{sprint.status}</Badge>
        </div>
      </div>

      <div className="rounded-[20px] border border-[var(--border)] bg-white p-5 shadow-[var(--card-shadow)]">
        <div className="mb-4 text-sm font-semibold text-[var(--text-primary)]">Sprint Review</div>
        <div className="grid gap-4 md:grid-cols-2">
          {FIELDS.map(([key, label]) => (
            <div key={key}>
              <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-secondary)]">
                {label}
              </label>
              <textarea
                rows={4}
                value={form[key]}
                disabled={!canManage || sprint.status === 'archived'}
                onChange={(e) => setForm((prev) => ({ ...prev, [key]: e.target.value }))}
                className="w-full rounded-xl border border-[var(--border)] bg-white px-3 py-2.5 text-sm text-[var(--text-primary)] disabled:bg-[var(--surface-secondary)]"
              />
            </div>
          ))}
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          {canManage && sprint.status !== 'archived' ? (
            <button type="button" onClick={handleSave} disabled={saving} className="rounded-xl bg-[var(--accent)] px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50">
              {saving ? 'Saving…' : 'Save Review'}
            </button>
          ) : null}

          {sprint.status === 'review' ? (
            <button
              type="button"
              onClick={handleArchive}
              disabled={!canArchive || archiving || !canManage}
              className="rounded-xl border border-[var(--border)] bg-white px-4 py-2.5 text-sm font-medium text-[var(--text-primary)] disabled:opacity-50"
            >
              {archiving ? 'Archiving…' : 'Archive Sprint'}
            </button>
          ) : null}

          {sprint.status === 'archived' ? (
            <div className="text-sm text-[var(--status-done-text)]">Sprint archived.</div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
