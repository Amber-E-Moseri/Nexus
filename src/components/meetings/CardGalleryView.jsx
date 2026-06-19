import { LayoutGrid } from 'lucide-react'
import MeetingCard from './MeetingCard'

export default function CardGalleryView({
  meetings,
  selectedMeeting,
  onSelectMeeting,
  title = 'Meetings',
  emptyMessage = 'No meetings found',
  showAttendance = false,
}) {
  if (!meetings || meetings.length === 0) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 12,
          padding: '40px 24px',
          color: '#9E9488',
          textAlign: 'center',
        }}
      >
        <LayoutGrid size={32} opacity={0.5} aria-hidden="true" />
        <div style={{ fontSize: 14 }}>{emptyMessage}</div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: 16 }}>
      {/* Header */}
      <div>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1C1C1C' }}>
          {title}
        </h2>
        <p style={{ margin: '4px 0 0', fontSize: 13, color: '#7E7D78' }}>
          {meetings.length} meeting{meetings.length !== 1 ? 's' : ''}
        </p>
      </div>

      {/* Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: 16,
          alignContent: 'start',
        }}
        role="grid"
        aria-label={title}
      >
        {meetings.map((meeting) => (
          <div key={meeting.id} role="presentation">
            <MeetingCard
              meeting={meeting}
              isSelected={selectedMeeting?.id === meeting.id}
              onSelect={onSelectMeeting}
              showAttendance={showAttendance}
            />
          </div>
        ))}
      </div>
    </div>
  )
}
