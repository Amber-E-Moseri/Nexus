import { Suspense } from 'react'
import { Outlet } from 'react-router-dom'
import { NotificationsProvider } from '../../context/NotificationsContext'
import { SprintsProvider } from '../../modules/sprints/SprintsContext'
import PageSpinner from '../ui/PageSpinner'
import NotificationPermissionPrompt from '../notifications/NotificationPermissionPrompt'
import Sidebar from './Sidebar'
import TopBar from './TopBar'

export default function Shell() {
  return (
    <SprintsProvider>
      <NotificationsProvider>
        <div className="flex h-screen overflow-hidden bg-[var(--surface-secondary)]">
          <Sidebar />
          <div className="flex flex-1 flex-col overflow-hidden bg-[var(--surface-secondary)]">
            <TopBar />
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
