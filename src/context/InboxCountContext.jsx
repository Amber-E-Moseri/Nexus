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
  useEffect(() => {
    let active = true
    let intervalId

    async function refreshAssignedComments() {
      if (!user?.id) {
        if (active) setAssignedCommentCount(0)
        return
      }

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

    intervalId = window.setInterval(() => {
      refreshAssignedComments().catch(() => {})
    }, 60000)

    return () => {
      active = false
      window.clearInterval(intervalId)
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
