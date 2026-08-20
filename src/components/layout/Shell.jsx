import { lazy, Suspense, useState } from 'react'
import { Outlet } from 'react-router-dom'
import { SprintsProvider } from '../../features/sprints/SprintsContext'
import { EventConfigProvider } from '../../features/registration/EventConfigContext'
import PageSpinner from '../ui/PageSpinner'
import NotificationPermissionPrompt from '../notifications/NotificationPermissionPrompt'
import RegionalUpdatesPopup from '../ui/RegionalUpdatesPopup'
import Sidebar from './Sidebar'
import TopBar from './TopBar'

const NovaChat = lazy(() => import('../../features/nova').then(m => ({ default: m.NovaChat })))
const BirthdayOverlay = lazy(() => import('../ui/BirthdayOverlay'))

export default function Shell() {
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false)

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
        <Suspense fallback={null}>
          <NovaChat />
        </Suspense>
        <Suspense fallback={null}>
          <BirthdayOverlay />
        </Suspense>
        <RegionalUpdatesPopup />
      </EventConfigProvider>
    </SprintsProvider>
  )
}
