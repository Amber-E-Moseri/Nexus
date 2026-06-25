import { useEffect, useState, useCallback, useRef } from 'react'
import { useAuth } from '../lib/auth' // Adjust path based on your auth hook
import { createClient } from '@supabase/supabase-js'

export interface Notification {
  id: string
  recipient_user_id: string
  type: 'broadcast' | 'direct' | 'system' | 'alert' | 'invite'
  title: string
  body: string
  body_html: string | null
  icon_url: string | null
  action_url: string | null
  priority: 'low' | 'normal' | 'high' | 'urgent'
  read_at: string | null
  dismissed_at: string | null
  sent_at: string
  created_at: string
  updated_at: string
}

interface UseNotificationsReturn {
  notifications: Notification[]
  unreadCount: number
  loading: boolean
  error: Error | null
  lastCheckedAt: Date | null
  isRealtimeConnected: boolean
  markAsRead: (ids: string[]) => Promise<void>
  refetch: () => Promise<void>
  loadMore: (cursor: string) => Promise<void>
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string
const PAGE_SIZE = 50
const POLLING_INTERVAL = 30000 // 30 seconds

export function useNotifications(): UseNotificationsReturn {
  const { user } = useAuth()

  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const [lastCheckedAt, setLastCheckedAt] = useState<Date | null>(null)
  const [isRealtimeConnected, setIsRealtimeConnected] = useState(true)

  const supabaseRef = useRef<ReturnType<typeof createClient> | null>(null)
  const realtimeChannelRef = useRef<any>(null)
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const realtimeTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Initialize Supabase client
  if (!supabaseRef.current && user?.session?.access_token) {
    supabaseRef.current = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: {
        headers: {
          Authorization: `Bearer ${user.session.access_token}`,
        },
      },
    })
  }

  // Fetch notifications
  const fetchNotifications = useCallback(async (cursor?: string) => {
    if (!supabaseRef.current || !user?.id) return

    try {
      let query = supabaseRef.current
        .from('app_notifications')
        .select('*')
        .eq('recipient_user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(PAGE_SIZE)

      if (cursor) {
        // Cursor pagination: fetch after this timestamp
        query = query.lt('created_at', cursor)
      }

      const { data, error: fetchError } = await query

      if (fetchError) {
        setError(fetchError)
        return
      }

      if (cursor) {
        // Load more: append to existing
        setNotifications((prev) => [...prev, ...(data ?? [])])
      } else {
        // Initial load: replace
        setNotifications(data ?? [])
      }

      setLastCheckedAt(new Date())
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Unknown error fetching notifications'))
    }
  }, [user?.id])

  // Fetch unread count
  const fetchUnreadCount = useCallback(async () => {
    if (!supabaseRef.current || !user?.id) return

    try {
      const { data, error: fetchError } = await supabaseRef.current
        .from('notification_read_state')
        .select('unread_count')
        .eq('user_id', user.id)
        .single()

      if (fetchError) {
        console.error('Error fetching unread count:', fetchError)
        return
      }

      setUnreadCount(data?.unread_count ?? 0)
    } catch (err) {
      console.error('Error fetching unread count:', err)
    }
  }, [user?.id])

  // Initial load
  useEffect(() => {
    if (!user?.id) {
      setLoading(false)
      return
    }

    setLoading(true)
    Promise.all([fetchNotifications(), fetchUnreadCount()]).finally(() => {
      setLoading(false)
    })
  }, [user?.id, fetchNotifications, fetchUnreadCount])

  // Subscribe to Realtime changes
  useEffect(() => {
    if (!supabaseRef.current || !user?.id) return

    const subscribe = async () => {
      try {
        // Clear any existing timeout that might trigger fallback to polling
        if (realtimeTimeoutRef.current) {
          clearTimeout(realtimeTimeoutRef.current)
        }

        const channel = supabaseRef.current!.channel(`notifications:${user.id}`)

        // Handle INSERT (new notifications)
        channel.on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'app_notifications',
            filter: `recipient_user_id=eq.${user.id}`,
          },
          (payload: any) => {
            const newNotification = payload.new as Notification
            setNotifications((prev) => [newNotification, ...prev])
            if (!newNotification.read_at) {
              setUnreadCount((prev) => prev + 1)
            }
            setIsRealtimeConnected(true)
          }
        )

        // Handle UPDATE (mark as read, dismiss)
        channel.on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'app_notifications',
            filter: `recipient_user_id=eq.${user.id}`,
          },
          (payload: any) => {
            const updated = payload.new as Notification
            const old = payload.old as Notification

            // Update notification in state
            setNotifications((prev) =>
              prev.map((n) => (n.id === updated.id ? updated : n))
            )

            // If marked as read, decrement unread count
            if (!old.read_at && updated.read_at) {
              setUnreadCount((prev) => Math.max(0, prev - 1))
            }

            setIsRealtimeConnected(true)
          }
        )

        // Handle connection status
        channel.on('system', { event: 'join' }, () => {
          setIsRealtimeConnected(true)
          if (realtimeTimeoutRef.current) {
            clearTimeout(realtimeTimeoutRef.current)
          }
        })

        channel.on('system', { event: 'leave' }, () => {
          // Start polling if Realtime disconnects
          startPolling()
        })

        channel.subscribe()
        realtimeChannelRef.current = channel

        // Set timeout: if no activity, fall back to polling
        realtimeTimeoutRef.current = setTimeout(() => {
          console.warn('Realtime timeout, falling back to polling')
          setIsRealtimeConnected(false)
          startPolling()
        }, 10000)
      } catch (err) {
        console.error('Error subscribing to Realtime:', err)
        setIsRealtimeConnected(false)
        startPolling()
      }
    }

    subscribe()

    return () => {
      if (realtimeChannelRef.current) {
        realtimeChannelRef.current.unsubscribe()
      }
      if (realtimeTimeoutRef.current) {
        clearTimeout(realtimeTimeoutRef.current)
      }
    }
  }, [user?.id])

  // Polling fallback
  const startPolling = useCallback(() => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current)
    }

    pollingIntervalRef.current = setInterval(() => {
      fetchNotifications()
      fetchUnreadCount()
    }, POLLING_INTERVAL)
  }, [fetchNotifications, fetchUnreadCount])

  // Stop polling when Realtime reconnects
  useEffect(() => {
    if (isRealtimeConnected && pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current)
      pollingIntervalRef.current = null
    }
  }, [isRealtimeConnected])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (realtimeChannelRef.current) {
        realtimeChannelRef.current.unsubscribe()
      }
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current)
      }
      if (realtimeTimeoutRef.current) {
        clearTimeout(realtimeTimeoutRef.current)
      }
    }
  }, [])

  // Mark notifications as read
  const markAsRead = useCallback(
    async (ids: string[]) => {
      if (!supabaseRef.current || ids.length === 0) return

      try {
        const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/mark-notification-read`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${user?.session?.access_token || ''}`,
          },
          body: JSON.stringify({ notification_ids: ids }),
        })

        if (!response.ok) {
          const data = await response.json()
          throw new Error(data.error || 'Failed to mark notifications as read')
        }

        const result = await response.json()
        setUnreadCount(result.unread_count ?? 0)

        // Update local state
        setNotifications((prev) =>
          prev.map((n) => (ids.includes(n.id) && !n.read_at ? { ...n, read_at: new Date().toISOString() } : n))
        )
      } catch (err) {
        console.error('Error marking notifications as read:', err)
        setError(err instanceof Error ? err : new Error('Failed to mark as read'))
      }
    },
    [user?.session?.access_token]
  )

  // Load more (pagination)
  const loadMore = useCallback(
    async (cursor: string) => {
      await fetchNotifications(cursor)
    },
    [fetchNotifications]
  )

  // Manual refetch
  const refetch = useCallback(async () => {
    setLoading(true)
    try {
      await Promise.all([fetchNotifications(), fetchUnreadCount()])
    } finally {
      setLoading(false)
    }
  }, [fetchNotifications, fetchUnreadCount])

  return {
    notifications,
    unreadCount,
    loading,
    error,
    lastCheckedAt,
    isRealtimeConnected,
    markAsRead,
    refetch,
    loadMore,
  }
}
