import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { getNotifications, getUnreadCount, markAllAsRead, markAsRead, sendBrowserPushNotification, formatNotificationMessage, NOTIFICATION_TYPES } from '../features/notifications'
import { supabase } from '../lib/supabase'

const NotificationsContext = createContext(null)

export function NotificationsProvider({ children }) {
  const { user } = useAuth()
  const [notifications, setNotifications] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [isOpen, setIsOpen] = useState(false)

  const loadNotifications = useCallback(async () => {
    if (!user) {
      setNotifications([])
      setUnreadCount(0)
      setLoading(false)
      return
    }

    try {
      setLoading(true)
      const [notifs, count] = await Promise.all([getNotifications(user.id), getUnreadCount(user.id)])
      setNotifications(notifs)
      setUnreadCount(count)
    } catch (err) {
      console.error('Failed to load notifications:', err)
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    loadNotifications()
  }, [loadNotifications])

  useEffect(() => {
    if (!user) return undefined

    const channel = supabase
      .channel(`notifications-realtime-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          setNotifications((prev) => [payload.new, ...prev])
          setUnreadCount((prev) => prev + 1)
          // Fire desktop alert if browser permission granted.
          // Use new Notification() directly — avoids the serviceWorker.ready hang
          // that occurs when the SW isn't active (dev mode, first load, etc.).
          try {
            if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
              const notif = payload.new
              const def = NOTIFICATION_TYPES[notif.type]
              const title = def?.label ?? 'BLW CAN NEXUS'
              const body = formatNotificationMessage(notif)
              // eslint-disable-next-line no-new
              new Notification(title, { body, tag: notif.type, icon: '/logo.png' })
            }
          } catch (_) {}
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          // Re-fetch the authoritative count any time a notification is updated
          // (e.g. marked read/unread from the Inbox page directly).
          getUnreadCount(user.id)
            .then((count) => setUnreadCount(count))
            .catch(() => {})
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          getUnreadCount(user.id)
            .then((count) => setUnreadCount(count))
            .catch(() => {})
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [user])

  const handleMarkAsRead = useCallback(async (id) => {
    await markAsRead(id)
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)))
    setUnreadCount((prev) => Math.max(0, prev - 1))
  }, [])

  const handleMarkAllAsRead = useCallback(async () => {
    await markAllAsRead(user.id)
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
    setUnreadCount(0)
  }, [user])

  const value = useMemo(() => ({
    notifications,
    unreadCount,
    loading,
    isOpen,
    setIsOpen,
    markAsRead: handleMarkAsRead,
    markAllAsRead: handleMarkAllAsRead,
    reload: loadNotifications,
  }), [notifications, unreadCount, loading, isOpen, handleMarkAsRead, handleMarkAllAsRead, loadNotifications])

  return (
    <NotificationsContext.Provider value={value}>
      {children}
    </NotificationsContext.Provider>
  )
}

export function useNotifications() {
  const ctx = useContext(NotificationsContext)
  if (!ctx) throw new Error('useNotifications must be inside NotificationsProvider')
  return ctx
}
