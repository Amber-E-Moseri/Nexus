export default function LoadingSpinner({ label = 'Loading' }) {
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="h-10 w-10 animate-spin rounded-full border-[3px]" style={{ borderColor: 'var(--accent-light)', borderTopColor: 'var(--accent)' }} />
      <p className="text-sm text-[var(--text-secondary)]">{label}</p>
    </div>
  )
}
