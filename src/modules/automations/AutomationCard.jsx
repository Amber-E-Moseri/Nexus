import Badge from '../../components/ui/Badge'
import { TRIGGER_LABELS } from '../../lib/automations'

function formatTime(value) {
  if (!value) return 'Never'
  return new Date(value).toLocaleString('en-CA', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export default function AutomationCard({ automation, onToggle, onEdit, onDelete }) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-white p-4 shadow-[var(--card-shadow)]">
      <div className="flex items-start justify-between gap-3">
        <button type="button" onClick={() => onEdit(automation)} className="min-w-0 text-left">
          <div className="text-sm font-semibold text-[var(--text-primary)]">{automation.name}</div>
          <div className="mt-1 text-sm text-[var(--text-secondary)]">
            {automation.description || 'No description added yet.'}
          </div>
        </button>

        <button
          type="button"
          onClick={() => onToggle(automation)}
          className={`rounded-full px-3 py-1 text-xs font-semibold ${
            automation.enabled ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'
          }`}
        >
          {automation.enabled ? 'Enabled' : 'Disabled'}
        </button>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Badge tone="planning">{TRIGGER_LABELS[automation.trigger_type] ?? automation.trigger_type}</Badge>
        <span className="rounded-full bg-[var(--surface-secondary)] px-2.5 py-1 text-xs font-medium text-[var(--text-secondary)]">
          {automation.actions?.length ?? 0} {(automation.actions?.length ?? 0) === 1 ? 'action' : 'actions'}
        </span>
      </div>

      <div className="mt-4 grid gap-3 text-sm text-[var(--text-secondary)] sm:grid-cols-2">
        <div>Last fired: {formatTime(automation.last_fired_at)}</div>
        <div>Run count: {automation.fire_count ?? 0}</div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onEdit(automation)}
          className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)]"
        >
          Edit
        </button>
        <button
          type="button"
          onClick={() => onDelete(automation)}
          className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)]"
        >
          Delete
        </button>
      </div>
    </div>
  )
}
