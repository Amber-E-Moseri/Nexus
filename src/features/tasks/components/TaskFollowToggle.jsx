import { useEffect, useState } from 'react'
import { followTask, isFollowingTask, unfollowTask } from '../lib/followers'

export default function TaskFollowToggle({ taskId, userId }) {
  const [following, setFollowing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    isFollowingTask(taskId, userId)
      .then((result) => {
        if (!cancelled) setFollowing(result)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [taskId, userId])

  async function toggle() {
    if (busy || loading) return
    setBusy(true)
    const next = !following
    try {
      if (next) {
        await followTask(taskId, userId)
      } else {
        await unfollowTask(taskId, userId)
      }
      setFollowing(next)
    } finally {
      setBusy(false)
    }
  }

  if (loading) return null

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 5,
        fontSize: 12,
        fontWeight: 500,
        padding: '5px 10px',
        borderRadius: 999,
        border: '1px solid var(--border-1)',
        background: following ? 'var(--surface-selected, #EEF1FF)' : 'white',
        color: following ? 'var(--accent, #4F46E5)' : 'var(--text-secondary)',
        cursor: busy ? 'default' : 'pointer',
        opacity: busy ? 0.6 : 1,
      }}
    >
      {following ? '★ Following' : '☆ Follow'}
    </button>
  )
}
