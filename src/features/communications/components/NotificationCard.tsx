import { Notification } from '../../../hooks/useNotifications'

interface NotificationCardProps {
  notification: Notification
  onRead: (id: string) => void
}

export function NotificationCard({ notification, onRead }: NotificationCardProps) {
  const isUnread = !notification.read_at

  // Priority color for left border
  const priorityColors = {
    urgent: 'border-l-red-500',
    high: 'border-l-orange-400',
    normal: 'border-l-blue-500',
    low: 'border-l-gray-300',
  }

  const borderColor = priorityColors[notification.priority as keyof typeof priorityColors] || 'border-l-blue-500'

  // Background: light blue for unread, white for read
  const backgroundColor = isUnread ? 'bg-blue-50' : 'bg-white'

  // Handle click to mark as read
  const handleClick = () => {
    onRead(notification.id)
    if (notification.action_url) {
      window.location.href = notification.action_url
    }
  }

  // Format date
  const sentDate = new Date(notification.sent_at)
  const today = new Date()
  const isToday = sentDate.toDateString() === today.toDateString()
  const timeStr = sentDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  const dateStr = isToday ? timeStr : sentDate.toLocaleDateString([], { month: 'short', day: 'numeric' })

  return (
    <div
      onClick={handleClick}
      className={`
        p-3 border-l-4 cursor-pointer transition-colors
        ${borderColor} ${backgroundColor} hover:bg-gray-50
      `}
    >
      <div className="flex gap-3">
        {/* Icon (if present) */}
        {notification.icon_url && (
          <img
            src={notification.icon_url}
            alt=""
            className="flex-shrink-0 w-10 h-10 rounded-lg object-cover"
          />
        )}

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Title */}
          <h3 className="font-semibold text-sm text-gray-900 truncate">
            {notification.title}
          </h3>

          {/* Body (truncate to 2 lines) */}
          <p className="text-sm text-gray-600 line-clamp-2 mt-1">
            {notification.body_html
              ? notification.body_html.replace(/<[^>]*>/g, '') // Strip HTML tags for preview
              : notification.body}
          </p>

          {/* Meta: date + action button */}
          <div className="flex justify-between items-center mt-2 text-xs text-gray-500">
            <span>{dateStr}</span>
            {notification.action_url && (
              <span className="text-blue-600 hover:underline font-medium">
                View
              </span>
            )}
          </div>
        </div>

        {/* Unread indicator (dot) */}
        {isUnread && (
          <div className="flex-shrink-0 w-2 h-2 rounded-full bg-blue-500 mt-2" />
        )}
      </div>
    </div>
  )
}
