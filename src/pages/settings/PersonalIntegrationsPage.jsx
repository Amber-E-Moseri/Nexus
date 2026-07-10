import UserIntegrationsManager from '../../features/user-integrations/components/UserIntegrationsManager'
import TaskCalendarSyncPanel from '../../features/user-integrations/components/TaskCalendarSyncPanel'

export default function PersonalIntegrationsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-[var(--text-primary)]">Personal Integrations</h1>
        <p className="mt-2 text-[var(--text-secondary)]">
          Connect your personal accounts and services to enhance your workflow
        </p>
      </div>

      <UserIntegrationsManager />
      <TaskCalendarSyncPanel />
    </div>
  )
}
