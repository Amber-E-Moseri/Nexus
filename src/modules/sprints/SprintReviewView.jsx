import { useState, useEffect } from 'react'
import { getSprintReview } from '../../lib/sprints'
import SprintReviewForm from './SprintReviewForm'

export default function SprintReviewView({ sprint, canEdit, onArchived }) {
  const [review, setReview] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadReview() {
      try {
        const data = await getSprintReview(sprint.id)
        setReview(data)
      } catch (err) {
        console.error('Failed to load review:', err)
      } finally {
        setLoading(false)
      }
    }
    loadReview()
  }, [sprint.id])

  if (loading) {
    return <div className="p-6 text-sm text-[var(--text-tertiary)]">Loading review…</div>
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-[var(--border)] px-5 py-4">
        <h2 className="text-lg font-semibold text-[var(--text-primary)]">Sprint Review</h2>
      </div>
      <div className="flex-1 overflow-auto px-5 py-4">
        <SprintReviewForm
          sprint={sprint}
          review={review}
          canManage={canEdit}
          onSaved={() => setReview(null)}
          onArchived={onArchived}
        />
      </div>
    </div>
  )
}
