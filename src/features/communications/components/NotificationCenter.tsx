import { useState, useEffect } from 'react'
import { useNotifications, Notification } from '../../../hooks/useNotifications'
import { NotificationCard } from './NotificationCard'

interface NotificationCenterProps {
  isOpen: boolean
  onClose: () => void
}

export function NotificationCenter({ isOpen, onClose }: NotificationCenterProps) {
  const {
    notifications,
    unreadCount,
    loading,
    error,
    lastCheckedAt,
    isRealtimeConnected,
    markAsRead,
    refetch,
    loadMore,
  } = useNotifications()

  const [isLoadingMore, setIsLoadingMore] = useState(false)

  // Handle mark as read for a single notification
  const handleRead = async (id: string) => {
    await markAsRead([id])
  }

  // Handle load more button
  const handleLoadMore = async () => {
    if (notifications.length === 0) return

    setIsLoadingMore(true)
    const oldestNotification = notifications[notifications.length - 1]
    await loadMore(oldestNotification.created_at)
    setIsLoadingMore(false)
  }

  // Format last checked timestamp
  const formatLastChecked = () => {
    if (!lastCheckedAt) return 'loading...'
    const hours = lastCheckedAt.getHours().toString().padStart(2, '0')
    const minutes = lastCheckedAt.getMinutes().toString().padStart(2, '0')
    return `${hours}:${minutes}`
  }

  // Separate unread and read notifications
  const unreadNotifications = notifications.filter((n) => !n.read_at)
  const readNotifications = notifications.filter((n) => n.read_at)

  return (
    <>
      {/* Backdrop (dark overlay) */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 transition-opacity"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Slide-over drawer (from right) */}
      <div
        className={`
          fixed inset-y-0 right-0 w-full sm:w-96 bg-white shadow-lg z-40
          transform transition-transform duration-300 ease-in-out
          ${isOpen ? 'translate-x-0' : 'translate-x-full'}
        `}
      >
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-4 py-3 flex justify-between items-center z-10">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Notifications</h2>
            {unreadCount > 0 && (
              <span className="text-xs text-gray-500 mt-1">
                {unreadCount} unread
              </span>
            )}
          </div>

          {/* Close button */}
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            aria-label="Close notifications"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Content area */}
        <div className="flex flex-col flex-1 overflow-hidden">
          <div className="flex-1 overflow-y-auto px-4 py-3">
            {/* Loading state */}
            {loading && notifications.length === 0 && (
              <div className="flex justify-center items-center h-32 text-gray-400">
                <div className="animate-spin">
                  <svg className="w-6 h-6 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                    />
                  </svg>
                </div>
              </div>
            )}

            {/* Error state */}
            {error && (
              <div className="p-4 text-center text-red-500 bg-red-50 rounded-lg">
                <p className="text-sm font-medium">Failed to load notifications</p>
                <button
                  onClick={refetch}
                  className="text-xs text-red-600 hover:underline mt-2"
                >
                  Try again
                </button>
              </div>
            )}

            {/* Empty state */}
            {!loading && notifications.length === 0 && !error && (
              <div className="flex justify-center items-center h-32 text-gray-500">
                <div className="text-center">
                  <svg className="w-12 h-12 mx-auto mb-2 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
                    />
                  </svg>
                  <p className="text-sm">No notifications yet</p>
                </div>
              </div>
            )}

            {/* Unread notifications section */}
            {unreadNotifications.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wider mb-2 px-2">
                  Unread
                </h3>
                <div className="space-y-1">
                  {unreadNotifications.map((notification) => (
                    <NotificationCard
                      key={notification.id}
                      notification={notification}
                      onRead={handleRead}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Read notifications section (collapsible via CSS if needed) */}
            {readNotifications.length > 0 && (
              <div className="mt-4">
                <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wider mb-2 px-2">
                  Earlier
                </h3>
                <div className="space-y-1 opacity-75">
                  {readNotifications.map((notification) => (
                    <NotificationCard
                      key={notification.id}
                      notification={notification}
                      onRead={handleRead}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Footer: Load More + Status */}
          <div className="sticky bottom-0 bg-white border-t border-gray-200 px-4 py-3">
            {/* Status info */}
            <div className="text-xs text-gray-500 mb-3">
              {isRealtimeConnected ? (
                <span>Real-time updates enabled</span>
              ) : (
                <span>Last checked: {formatLastChecked()}</span>
              )}
            </div>

            {/* Load More button (only show if we have 50+ notifications) */}
            {notifications.length >= 50 && (
              <button
                onClick={handleLoadMore}
                disabled={isLoadingMore || loading}
                className={`
                  w-full px-4 py-2 text-sm font-medium rounded-lg
                  ${isLoadingMore || loading
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    : 'bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors'
                  }
                `}
              >
                {isLoadingMore ? 'Loading...' : 'Load More'}
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
