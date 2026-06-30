// useTaskFeedSubscriptions
// Manages a user's per-space task iCal feed tokens (my_tasks / followed_tasks).
// Tokens live in task_feed_subscriptions and are created on demand via the
// get_or_create_task_feed_token RPC (wrapped by getOrCreateTaskFeedToken).

import { useState, useCallback, useEffect } from 'react'
import { supabase } from '../../../lib/supabase'
import { getOrCreateTaskFeedToken } from '../../calendar/lib/calendar'

export function useTaskFeedSubscriptions(userId, spaceId) {
  const [subscriptions, setSubscriptions] = useState([])
  const [myTasksToken, setMyTasksToken] = useState(null)
  const [followedTasksToken, setFollowedTasksToken] = useState(null)
  const [loading, setLoading] = useState(false)
  const [myTasksLoading, setMyTasksLoading] = useState(false)
  const [followedTasksLoading, setFollowedTasksLoading] = useState(false)
  const [error, setError] = useState(null)

  // Fetch any tokens that already exist for this user + space.
  const getSubscriptions = useCallback(async () => {
    if (!userId || !spaceId) return
    setLoading(true)
    setError(null)
    try {
      const { data, error: err } = await supabase
        .from('task_feed_subscriptions')
        .select('id, feed_type, token, created_at')
        .eq('user_id', userId)
        .eq('space_id', spaceId)

      if (err) throw err

      const rows = data ?? []
      setSubscriptions(rows)
      setMyTasksToken(rows.find((s) => s.feed_type === 'my_tasks')?.token ?? null)
      setFollowedTasksToken(rows.find((s) => s.feed_type === 'followed_tasks')?.token ?? null)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [userId, spaceId])

  useEffect(() => {
    getSubscriptions()
  }, [getSubscriptions])

  // Create the token for a feed type if it doesn't exist yet, returning it.
  // `followed_tasks` currently maps to "created by me in this space" because the
  // schema does not yet have a dedicated task-follow relationship.
  const getOrCreateToken = useCallback(
    async (feedType) => {
      if (!userId || !spaceId) throw new Error('Missing user or space')

      const setFeedLoading = feedType === 'my_tasks' ? setMyTasksLoading : setFollowedTasksLoading
      setFeedLoading(true)
      setError(null)

      try {
        const token = await getOrCreateTaskFeedToken(userId, spaceId, feedType)

        setSubscriptions((prev) =>
          prev.some((s) => s.feed_type === feedType)
            ? prev.map((s) => (s.feed_type === feedType ? { ...s, token } : s))
            : [...prev, { id: token, feed_type: feedType, token, created_at: new Date().toISOString() }],
        )
        if (feedType === 'my_tasks') setMyTasksToken(token)
        else setFollowedTasksToken(token)

        return token
      } catch (e) {
        setError(e.message)
        throw e
      } finally {
        setFeedLoading(false)
      }
    },
    [userId, spaceId],
  )

  return {
    subscriptions,
    myTasksToken,
    followedTasksToken,
    loading,
    myTasksLoading,
    followedTasksLoading,
    error,
    getSubscriptions,
    getOrCreateToken,
    refresh: getSubscriptions,
  }
}
