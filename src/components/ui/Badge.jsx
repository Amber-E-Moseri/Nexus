const TONE_MAP = {
  on_track: { bg: 'var(--status-done-bg)', text: 'var(--status-done-text)' },
  at_risk: { bg: 'var(--status-review-bg)', text: 'var(--status-review-text)' },
  off_track: { bg: 'var(--status-blocked-bg)', text: 'var(--status-blocked-text)' },
  planning: { bg: 'var(--status-backlog-bg)', text: 'var(--status-backlog-text)' },
  active: { bg: 'var(--status-done-bg)', text: 'var(--status-done-text)' },
  completed: { bg: 'var(--status-progress-bg)', text: 'var(--status-progress-text)' },
  archived: { bg: 'var(--status-backlog-bg)', text: 'var(--status-backlog-text)' },
  backlog: { bg: 'var(--status-backlog-bg)', text: 'var(--status-backlog-text)' },
  in_progress: { bg: 'var(--status-progress-bg)', text: 'var(--status-progress-text)' },
  review: { bg: 'var(--status-review-bg)', text: 'var(--status-review-text)' },
  done: { bg: 'var(--status-done-bg)', text: 'var(--status-done-text)' },
  blocked: { bg: 'var(--status-blocked-bg)', text: 'var(--status-blocked-text)' },
  urgent: { bg: 'var(--prio-urgent-bg)', text: 'var(--prio-urgent-text)' },
  high: { bg: 'var(--prio-high-bg)', text: 'var(--prio-high-text)' },
  medium: { bg: 'var(--prio-medium-bg)', text: 'var(--prio-medium-text)' },
  low: { bg: 'var(--prio-low-bg)', text: 'var(--prio-low-text)' },
}

export default function Badge({ tone = 'backlog', children }) {
  const colours = TONE_MAP[tone] ?? TONE_MAP.backlog

  return (
    <span
      style={{
        background: colours.bg,
        color: colours.text,
        boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.18)',
      }}
      className="inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold leading-none"
    >
      {children}
    </span>
  )
}
