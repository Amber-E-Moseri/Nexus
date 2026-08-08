import { Suspense, useState } from 'react'
import { Outlet } from 'react-router-dom'
import { SprintsProvider } from '../../features/sprints/SprintsContext'
import { EventConfigProvider } from '../../features/registration/EventConfigContext'
import { usePrefetchRoutes } from '../../hooks/usePrefetchRoutes'
import PageSpinner from '../ui/PageSpinner'
import NotificationPermissionPrompt from '../notifications/NotificationPermissionPrompt'
import { NovaChat } from '../../features/nova'
import BirthdayOverlay from '../ui/BirthdayOverlay'
import RegionalUpdatesPopup from '../ui/RegionalUpdatesPopup'
import Sidebar from './Sidebar'
import TopBar from './TopBar'

export default function Shell() {
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false)
  usePrefetchRoutes()

  return (
    <SprintsProvider>
      <EventConfigProvider>
        <div className="flex h-screen overflow-hidden bg-[var(--bg-app)]">
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
                <Sidebar isMobileDrawer />
              </div>
            </>
          )}

          <div className="flex flex-1 flex-col overflow-hidden bg-[var(--bg-app)]">
            <TopBar onOpenMobileMenu={() => setMobileDrawerOpen(!mobileDrawerOpen)} />
            <main className="flex-1 overflow-y-auto overflow-x-hidden bg-[var(--bg-app)] pt-[22px] pb-[60px] px-4 md:px-[26px]">
              <NotificationPermissionPrompt />
              <Suspense fallback={<PageSpinner />}>
                <Outlet />
              </Suspense>
            </main>
          </div>
        </div>
        <NovaChat />
        <BirthdayOverlay />
        <RegionalUpdatesPopup />
      </EventConfigProvider>
    </SprintsProvider>
  )
}
