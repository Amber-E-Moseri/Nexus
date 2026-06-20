import { Suspense, useState } from 'react'
import { Outlet } from 'react-router-dom'
import { NotificationsProvider } from '../../context/NotificationsContext'
import { SprintsProvider } from '../../features/sprints/SprintsContext'
import PageSpinner from '../ui/PageSpinner'
import NotificationPermissionPrompt from '../notifications/NotificationPermissionPrompt'
import Sidebar from './Sidebar'
import TopBar from './TopBar'

export default function Shell() {
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false)

  return (
    <SprintsProvider>
      <NotificationsProvider>
        <div className="flex h-screen overflow-hidden bg-[var(--surface-secondary)]">
          {/* Desktop Sidebar */}
          <div className="hidden md:flex">
            <Sidebar />
          </div>

          {/* Mobile Drawer */}
          {mobileDrawerOpen && (
            <>
              {/* Backdrop */}
              <div
                className="fixed inset-0 z-40 bg-black/50 md:hidden"
                onClick={() => setMobileDrawerOpen(false)}
              />
              {/* Drawer */}
              <div className="fixed left-0 top-0 z-50 h-screen w-[222px] md:hidden">
                <Sidebar />
              </div>
            </>
          )}

          <div className="flex flex-1 flex-col overflow-hidden bg-[var(--surface-secondary)]">
            <TopBar onOpenMobileMenu={() => setMobileDrawerOpen(!mobileDrawerOpen)} />
            <main className="flex-1 overflow-y-auto bg-[var(--surface-secondary)] pt-[22px] px-[26px] pb-[60px]">
              <NotificationPermissionPrompt />
              <Suspense fallback={<PageSpinner />}>
                <Outlet />
              </Suspense>
            </main>
          </div>
        </div>
      </NotificationsProvider>
    </SprintsProvider>
  )
}
