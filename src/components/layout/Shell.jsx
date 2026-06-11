import { Outlet } from 'react-router-dom'
import { NotificationsProvider } from '../../context/NotificationsContext'
import { SprintsProvider } from '../../modules/sprints/SprintsContext'
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
            <main className="flex-1 overflow-y-auto bg-[var(--surface-secondary)] p-5">
              <Outlet />
            </main>
          </div>
        </div>
      </NotificationsProvider>
    </SprintsProvider>
  )
}
