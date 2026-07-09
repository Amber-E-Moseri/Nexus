import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useNotifications } from './NotificationsContext'
import { supabase } from '../lib/supabase'

const InboxCountContext = createContext(null)

export function InboxCountProvider({ children }) {
  const { user } = useAuth()
  const { unreadCount: notificationCount } = useNotifications()
  const [assignedCommentCount, setAssignedCommentCount] = useState(0)

  // Only count assigned task comments separately; use NotificationsContext for
  // notifications so we don't duplicate the realtime subscription.
  //
  // BLW-09: the count follows a realtime subscription on the user's assigned
  // comments instead of a 60s polling interval, so the badge reflects actual
  // inbox changes as they happen (and no query fires when nothing changed).
  useEffect(() => {
    if (!user?.id) {
      setAssignedCommentCount(0)
      return
    }

    let active = true

    async function refreshAssignedComments() {
      const { count } = await supabase
        .from('task_comments')
        .select('id', { count: 'exact', head: true })
        .eq('assigned_to', user.id)
        .is('resolved_at', null)

      if (active) {
        setAssignedCommentCount(count ?? 0)
      }
    }

    refreshAssignedComments().catch(() => {
      if (active) setAssignedCommentCount(0)
    })

    const channel = supabase
      .channel(`inbox-assigned-comments-${user.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'task_comments', filter: `assigned_to=eq.${user.id}` },
        () => {
          refreshAssignedComments().catch(() => {})
        },
      )
      .subscribe()

    return () => {
      active = false
      supabase.removeChannel(channel)
    }
  }, [user?.id])

  const inboxCount = assignedCommentCount + (notificationCount ?? 0)
  const value = useMemo(() => ({ inboxCount }), [assignedCommentCount, notificationCount])

  return <InboxCountContext.Provider value={value}>{children}</InboxCountContext.Provider>
}

export function useInboxCount() {
  const context = useContext(InboxCountContext)
  if (!context) throw new Error('useInboxCount must be used inside InboxCountProvider')
  return context
}
