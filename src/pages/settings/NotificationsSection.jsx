import { NOTIFICATION_TYPES } from '../../lib/notifications'

const ORDERED_TYPES = [
  'task_assigned',
  'task_comment',
  'mention',
  'meeting_created',
  'event_approved',
  'event_rejected',
  'task_due_soon',
]

function Toggle({ checked, onClick }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onClick}
      className={[
        'relative h-6 w-10 rounded-full transition',
        checked ? 'bg-[#2E8B57]' : 'bg-[#D7D0C6]',
      ].join(' ')}
    >
      <span
        className={[
          'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition',
          checked ? 'left-[18px]' : 'left-0.5',
        ].join(' ')}
      />
    </button>
  )
}

export default function NotificationsSection({ prefs, role, onTogglePref }) {
  return (
    <section className="max-w-[640px] rounded-3xl border border-[var(--border)] bg-white shadow-[var(--card-shadow)]">
      <div className="border-b border-[var(--border)] px-5 py-4">
        <h3 className="text-xl font-semibold text-[var(--text-primary)]">Notification Preferences</h3>
      </div>

      {ORDERED_TYPES
        .map((type) => {
          const current = prefs[type] ?? { in_app: true, email: true }
          const enabled = current.in_app || current.email

          return (
            <div key={type} className="flex items-center justify-between gap-4 border-b border-[var(--border)] px-5 py-4 last:border-b-0">
              <div>
                <div className="text-base font-semibold text-[var(--text-primary)]">
                  {NOTIFICATION_TYPES[type]?.label ?? type}
                </div>
                <div className="mt-1 text-sm text-[var(--text-secondary)]">
                  {NOTIFICATION_TYPES[type]?.description ?? 'Toggle this notification on or off.'}
                </div>
              </div>

              <Toggle checked={enabled} onClick={() => onTogglePref(type)} />
            </div>
          )
        })}
    </section>
  )
}
