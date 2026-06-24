import { useState } from 'react'
import { useNotifications } from '../../../hooks/useNotifications'
import { NotificationBell } from './NotificationBell'
import { NotificationCenter } from './NotificationCenter'

/**
 * NotificationBellWithDrawer
 *
 * Integrates NotificationBell (header icon) with NotificationCenter (slide-over drawer).
 * Manages open/close state and passes unread count to bell.
 *
 * Usage:
 * <NotificationBellWithDrawer />
 */
export function NotificationBellWithDrawer() {
  const { unreadCount } = useNotifications()
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)

  const handleToggle = () => {
    setIsDrawerOpen((prev) => !prev)
  }

  const handleClose = () => {
    setIsDrawerOpen(false)
  }

  return (
    <>
      <NotificationBell unreadCount={unreadCount} onClick={handleToggle} />
      <NotificationCenter isOpen={isDrawerOpen} onClose={handleClose} />
    </>
  )
}
