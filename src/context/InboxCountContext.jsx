import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'

const InboxCountContext = createContext(null)

export function InboxCountProvider({ children }) {
  const { user } = useAuth()
  const [inboxCount, setInboxCount] = useState(0)

  useEffect(() => {
    let active = true
    let intervalId

    async function refreshBadge() {
      if (!user?.id) {
        if (active) setInboxCount(0)
        return
      }

      const [{ count: assignedCount }, { count: notifCount }] = await Promise.all([
        supabase
          .from('task_comments')
          .select('id', { count: 'exact', head: true })
          .eq('assigned_to', user.id)
          .is('resolved_at', null),
        supabase
          .from('notifications')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .eq('read', false),
      ])

      if (active) {
        setInboxCount((assignedCount ?? 0) + (notifCount ?? 0))
      }
    }

    refreshBadge().catch(() => {
      if (active) setInboxCount(0)
    })

    intervalId = window.setInterval(() => {
      refreshBadge().catch(() => {})
    }, 60000)

    if (!user?.id) {
      return () => {
        active = false
        window.clearInterval(intervalId)
      }
    }

    const channel = supabase
      .channel(`inbox-badge-${user.id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${user.id}`,
      }, () => {
        refreshBadge().catch(() => {})
      })
      .subscribe()

    return () => {
      active = false
      window.clearInterval(intervalId)
      supabase.removeChannel(channel)
    }
  }, [user?.id])

  const value = useMemo(() => ({ inboxCount }), [inboxCount])

  return <InboxCountContext.Provider value={value}>{children}</InboxCountContext.Provider>
}

export function useInboxCount() {
  const context = useContext(InboxCountContext)
  if (!context) throw new Error('useInboxCount must be used inside InboxCountProvider')
  return context
}
