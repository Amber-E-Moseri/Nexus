import { Calendar, FileText, Clock } from 'lucide-react'
import GlowCard from '../ui/GlowCard'

const TYPE_COLORS = {
  general: { bg: 'var(--purple-tint)', text: 'var(--purple-700)', border: '#DDD6FE' },
  team: { bg: 'var(--accent-blue-tint)', text: 'var(--accent-blue-text)', border: '#BFDBFE' },
  media: { bg: 'var(--accent-yellow-tint)', text: 'var(--accent-yellow-text)', border: '#FEE4A8' },
  department: { bg: 'var(--accent-green-tint)', text: 'var(--accent-green-text)', border: '#BBF7D0' },
}

const STATUS_LABELS = {
  scheduled: 'Scheduled',
  in_progress: 'In Progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
}

const STATUS_TONES = {
  scheduled: { bg: 'var(--accent-blue-tint)', text: 'var(--accent-blue-text)' },
  in_progress: { bg: 'var(--accent-yellow-tint)', text: 'var(--accent-yellow-text)' },
  completed: { bg: 'var(--accent-green-tint)', text: 'var(--accent-green-text)' },
  cancelled: { bg: 'var(--accent-red-tint)', text: 'var(--accent-red-text)' },
}

function getInitials(name = '') {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part.charAt(0).toUpperCase()).join('') || '?'
}

export default function MeetingCard({
  meeting,
  isSelected = false,
  onSelect,
  onClick,
  showAttendance = false,
}) {
  const typeColor = TYPE_COLORS[meeting.meeting_type] || TYPE_COLORS.general
  const statusTone = STATUS_TONES[meeting.status] ?? STATUS_TONES.scheduled
  const meetingDate = new Date(meeting.date)
  const isUpcoming = meetingDate > new Date()

  const formattedDate = meetingDate.toLocaleDateString('en-CA', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })

  const formattedTime = meetingDate.toLocaleTimeString('en-CA', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })

  const attendance = meeting.attendance || []
  const present = attendance.filter((a) => a.status === 'present' && a.attendee?.name)
  const absentCount = attendance.filter((a) => a.status === 'absent').length

  return (
    <GlowCard
      variant="primary"
      borderRadius={12}
      glowIntensity={isSelected ? 0 : 0.7}
      edgeSensitivity={40}
    >
      <button
        type="button"
        onClick={() => {
          onSelect?.(meeting)
          onClick?.()
        }}
        aria-pressed={isSelected}
        aria-label={`${meeting.title}, ${formattedDate}${isSelected ? ', selected' : ''}`}
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          padding: 16,
          borderRadius: 12,
          border: isSelected ? `2px solid ${typeColor.text}` : 'none',
          background: 'transparent',
          boxShadow: 'none',
          cursor: 'pointer',
          transition: 'all 0.2s ease',
          textAlign: 'left',
          minHeight: 200,
          width: '100%',
        }}
        onMouseEnter={(e) => {
          if (!isSelected) {
            e.currentTarget.style.transform = 'translateY(-2px)'
          }
        }}
        onMouseLeave={(e) => {
          if (!isSelected) {
            e.currentTarget.style.transform = 'translateY(0)'
          }
        }}
      >
      {/* Type + status badges */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            width: 'fit-content',
            padding: '4px 8px',
            borderRadius: 6,
            background: typeColor.bg,
            color: typeColor.text,
            fontSize: 12,
            fontWeight: 600,
            textTransform: 'capitalize',
          }}
        >
          <div
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: typeColor.text,
            }}
            aria-hidden="true"
          />
          {meeting.meeting_type || 'General'}
        </div>
        <div
          style={{
            padding: '4px 8px',
            borderRadius: 999,
            background: statusTone.bg,
            color: statusTone.text,
            fontSize: 10.5,
            fontWeight: 700,
          }}
        >
          {STATUS_LABELS[meeting.status] ?? STATUS_LABELS.scheduled}
        </div>
      </div>

      {/* Title */}
      <div style={{ flex: 1 }}>
        <h3
          style={{
            margin: 0,
            fontSize: 16,
            fontWeight: 700,
            color: 'var(--ink-1)',
            lineHeight: 1.3,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {meeting.title}
        </h3>
      </div>

      {/* Meta Info */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          paddingTop: 8,
          borderTop: `1px solid ${typeColor.border}`,
          fontSize: 13,
          color: 'var(--ink-3)',
        }}
      >
        {/* Date & Time */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Calendar size={16} aria-hidden="true" />
          <span>
            {formattedDate}
            {formattedTime !== '12:00 AM' && ` • ${formattedTime}`}
          </span>
        </div>

        {/* Status indicator */}
        {isUpcoming && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--accent-green-text)' }}>
            <Clock size={16} aria-hidden="true" />
            <span>Upcoming</span>
          </div>
        )}

        {/* Attendance */}
        {showAttendance && (present.length > 0 || absentCount > 0) && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {present.length > 0 && (
              <div style={{ display: 'flex' }}>
                {present.slice(0, 4).map((entry, idx) => (
                  <div
                    key={entry.attendee?.id ?? idx}
                    title={entry.attendee?.name}
                    style={{
                      width: 20, height: 20, borderRadius: '50%',
                      background: 'var(--purple-tint)', color: 'var(--purple-700)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 9, fontWeight: 700,
                      border: '1.5px solid white',
                      marginLeft: idx === 0 ? 0 : -6,
                    }}
                  >
                    {getInitials(entry.attendee?.name)}
                  </div>
                ))}
                {present.length > 4 && (
                  <div
                    style={{
                      width: 20, height: 20, borderRadius: '50%',
                      background: 'var(--surface-sub)', color: 'var(--ink-2)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 9, fontWeight: 700,
                      border: '1.5px solid white',
                      marginLeft: -6,
                    }}
                  >
                    +{present.length - 4}
                  </div>
                )}
              </div>
            )}
            {absentCount > 0 && (
              <span
                style={{
                  fontSize: 10.5, fontWeight: 700,
                  color: 'var(--accent-red-text)', background: 'var(--accent-red-tint)',
                  borderRadius: 999, padding: '2px 7px',
                }}
              >
                {absentCount} absent
              </span>
            )}
          </div>
        )}

        {/* Notes indicator */}
        {meeting.minutes && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--purple-700)' }}>
            <FileText size={16} aria-hidden="true" />
            <span>Has notes</span>
          </div>
        )}
      </div>
      </button>
    </GlowCard>
  )
}
