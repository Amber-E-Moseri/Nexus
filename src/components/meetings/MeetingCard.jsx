import { Calendar, Users, FileText, Clock } from 'lucide-react'

const TYPE_COLORS = {
  general: { bg: '#F3E8FF', text: '#4C2A92', border: '#DDD6FE' },
  team: { bg: '#EFF6FF', text: '#1B72E8', border: '#BFDBFE' },
  media: { bg: '#FFFBEB', text: '#E8A020', border: '#FEE4A8' },
  department: { bg: '#ECFDF5', text: '#16A34A', border: '#BBF7D0' },
}

export default function MeetingCard({
  meeting,
  isSelected = false,
  onSelect,
  onClick,
  showAttendance = false,
}) {
  const typeColor = TYPE_COLORS[meeting.meeting_type] || TYPE_COLORS.general
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

  const attendanceCount = meeting.attendance?.length || 0

  return (
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
        border: isSelected ? `2px solid ${typeColor.text}` : `1px solid ${typeColor.border}`,
        background: 'white',
        boxShadow: isSelected ? `0 0 0 3px ${typeColor.bg}` : '0 1px 3px rgba(0,0,0,0.08)',
        cursor: 'pointer',
        transition: 'all 0.2s ease',
        textAlign: 'left',
        minHeight: 200,
      }}
      onMouseEnter={(e) => {
        if (!isSelected) {
          e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.12)'
          e.currentTarget.style.transform = 'translateY(-2px)'
        }
      }}
      onMouseLeave={(e) => {
        if (!isSelected) {
          e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.08)'
          e.currentTarget.style.transform = 'translateY(0)'
        }
      }}
    >
      {/* Type Badge */}
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          width: 'fit-content',
          paddingLeft: 8,
          paddingRight: 8,
          paddingTop: 4,
          paddingBottom: 4,
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

      {/* Title */}
      <div style={{ flex: 1 }}>
        <h3
          style={{
            margin: 0,
            fontSize: 16,
            fontWeight: 700,
            color: '#1C1C1C',
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
          color: '#7E7D78',
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#16A34A' }}>
            <Clock size={16} aria-hidden="true" />
            <span>Upcoming</span>
          </div>
        )}

        {/* Attendance */}
        {showAttendance && attendanceCount > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Users size={16} aria-hidden="true" />
            <span>
              {attendanceCount} attendee{attendanceCount !== 1 ? 's' : ''}
            </span>
          </div>
        )}

        {/* Notes indicator */}
        {meeting.minutes && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#4C2A92' }}>
            <FileText size={16} aria-hidden="true" />
            <span>Has notes</span>
          </div>
        )}
      </div>
    </button>
  )
}
