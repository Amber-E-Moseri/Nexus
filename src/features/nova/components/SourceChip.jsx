import { useNavigate } from 'react-router-dom'
import { FileText, CalendarCheck, Zap, Bell, Users, BarChart2 } from 'lucide-react'

const TYPE_META = {
  task: { Icon: FileText, label: 'Task' },
  meeting: { Icon: CalendarCheck, label: 'Meeting' },
  sprint: { Icon: Zap, label: 'Sprint' },
  notification: { Icon: Bell, label: 'Notification' },
  member: { Icon: Users, label: 'Member' },
  report: { Icon: BarChart2, label: 'Report' },
  minutes: { Icon: FileText, label: 'Minutes' },
}

export default function SourceChip({ source }) {
  const navigate = useNavigate()
  const meta = TYPE_META[source.type] ?? TYPE_META.task
  const { Icon } = meta

  function handleClick() {
    if (source.route) navigate(source.route)
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      title={source.excerpt ?? source.label}
      className="inline-flex items-center gap-1 rounded-[6px] border px-1.5 py-0.5 text-[10.5px] font-medium transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
      style={{
        borderColor: 'var(--border)',
        color: 'var(--text-secondary)',
        background: 'var(--surface)',
        maxWidth: '140px',
      }}
    >
      <Icon size={10} style={{ flexShrink: 0 }} />
      <span
        style={{
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {source.label}
      </span>
    </button>
  )
}
