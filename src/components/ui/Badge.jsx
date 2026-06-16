const TONE_MAP = {
  on_track:    { bg: 'var(--status-done-bg)',     text: 'var(--status-done-text)',     dot: 'var(--sage)' },
  at_risk:     { bg: 'var(--status-review-bg)',   text: 'var(--status-review-text)',   dot: 'var(--amber)' },
  off_track:   { bg: 'var(--status-blocked-bg)',  text: 'var(--status-blocked-text)',  dot: 'var(--coral)' },
  planning:    { bg: 'var(--status-backlog-bg)',   text: 'var(--status-backlog-text)',  dot: 'var(--text-tertiary)' },
  active:      { bg: 'var(--status-done-bg)',     text: 'var(--status-done-text)',     dot: 'var(--sage)' },
  completed:   { bg: 'var(--status-progress-bg)', text: 'var(--status-progress-text)', dot: '#1E40AF' },
  archived:    { bg: 'var(--status-backlog-bg)',   text: 'var(--status-backlog-text)',  dot: 'var(--text-tertiary)' },
  backlog:     { bg: 'var(--status-backlog-bg)',   text: 'var(--status-backlog-text)',  dot: 'var(--text-tertiary)' },
  in_progress: { bg: 'var(--status-progress-bg)', text: 'var(--status-progress-text)', dot: '#1E40AF' },
  review:      { bg: 'var(--status-review-bg)',   text: 'var(--status-review-text)',   dot: 'var(--amber)' },
  done:        { bg: 'var(--status-done-bg)',     text: 'var(--status-done-text)',     dot: 'var(--sage)' },
  blocked:     { bg: 'var(--status-blocked-bg)',  text: 'var(--status-blocked-text)',  dot: 'var(--coral)' },
  urgent:      { bg: 'var(--prio-urgent-bg)',     text: 'var(--prio-urgent-text)',     dot: 'var(--coral)' },
  high:        { bg: 'var(--prio-high-bg)',       text: 'var(--prio-high-text)',       dot: 'var(--amber)' },
  medium:      { bg: 'var(--prio-medium-bg)',     text: 'var(--prio-medium-text)',     dot: '#1E40AF' },
  low:         { bg: 'var(--prio-low-bg)',        text: 'var(--prio-low-text)',        dot: 'var(--text-tertiary)' },
}

export default function Badge({ tone = 'backlog', dot = false, children }) {
  const colours = TONE_MAP[tone] ?? TONE_MAP.backlog

  return (
    <span
      style={{
        background: colours.bg,
        color: colours.text,
      }}
      className="inline-flex items-center gap-1 rounded-full px-2.25 py-0.75 text-[10.5px] font-bold leading-none tracking-[.04em]"
    >
      {dot && (
        <span
          className="h-1.25 w-1.25 rounded-full shrink-0"
          style={{ background: colours.dot }}
        />
      )}
      {children}
    </span>
  )
}
