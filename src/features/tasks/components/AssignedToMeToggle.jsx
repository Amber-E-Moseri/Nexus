import { User } from 'lucide-react'

export default function AssignedToMeToggle({ active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className="inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm font-medium shadow-[0_1px_2px_rgba(28,22,16,0.04)] transition-colors"
      style={{
        borderColor: active ? 'var(--accent)' : 'var(--border)',
        background: active ? 'var(--accent-light)' : 'white',
        color: active ? 'var(--accent)' : 'var(--text-primary)',
      }}
    >
      <User size={14} />
      <span>Assigned to me</span>
    </button>
  )
}
