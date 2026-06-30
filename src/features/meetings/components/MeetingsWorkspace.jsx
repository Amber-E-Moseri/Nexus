import { useState, useMemo } from 'react'
import { ChevronLeft } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useMeetings } from '../MeetingsContext'
import MeetingRecordTabs from './MeetingRecordTabs'
import LoadingSpinner from '../../../components/ui/LoadingSpinner'
import { useMediaQuery } from '../../../hooks/useMediaQuery'
import CardGalleryView from '../../../components/meetings/CardGalleryView'
import ViewToggle from '../../../components/meetings/ViewToggle'

const TYPE_CHIP_COLORS = {
  general: '#4C2A92',
  team: '#1B72E8',
  media: '#E8A020',
  department: '#16A34A',
}

function groupMeetingsByCategory(meetings) {
  const groups = {}
  meetings.forEach((meeting) => {
    const type = meeting.meeting_type || 'general'
    if (!groups[type]) groups[type] = []
    groups[type].push(meeting)
  })
  return groups
}

function RecordPane({ selectedMeeting, canManage, onStartLive, isMobile, onBack }) {
  const navigate = useNavigate()
  if (!selectedMeeting) {
    return (
      <div
        style={{
          flex: 1,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#9E9488',
          fontSize: 14,
        }}
      >
        Pick a meeting on the left, work the record on the right.
      </div>
    )
  }

  return (
    <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 12, paddingLeft: isMobile ? 12 : 0, paddingRight: isMobile ? 12 : 0, paddingTop: isMobile ? 12 : 0, borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 }}>
          {isMobile && onBack && (
            <button
              type="button"
              onClick={onBack}
              aria-label="Back to meetings list"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                minWidth: 44,
                height: 44,
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: '#1C1C1C',
                padding: 0,
              }}
            >
              <ChevronLeft size={24} aria-hidden="true" />
            </button>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1C1C1C' }}>
              {selectedMeeting.title}
            </h2>
            <div style={{ marginTop: 4, fontSize: 13, color: '#7E7D78' }}>
              {new Date(selectedMeeting.date).toLocaleDateString('en-CA', {
                weekday: isMobile ? 'short' : 'long',
                year: 'numeric',
                month: 'short',
                day: 'numeric',
              })}
              {!isMobile && (
                <>
                  {' • '}
                  {selectedMeeting.meeting_type}
                </>
              )}
            </div>
          </div>
        </div>
        {!isMobile && (
          <button
            type="button"
            onClick={() => navigate(`/meetings/${selectedMeeting.id}`)}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              paddingLeft: '10px', paddingRight: '10px', paddingTop: '6px', paddingBottom: '6px',
              borderRadius: 8, border: '1px solid var(--border)', background: 'transparent',
              cursor: 'pointer', fontSize: 12, fontWeight: 600, color: '#4C2A92', marginRight: 6,
            }}
          >
            ↗ Full view
          </button>
        )}
        {canManage && !isMobile && (
          <button
            type="button"
            onClick={() => onStartLive?.(selectedMeeting)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              paddingLeft: '12px',
              paddingRight: '12px',
              paddingTop: '8px',
              paddingBottom: '8px',
              borderRadius: 8,
              border: '1px solid #E5E5E4',
              background: 'white',
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 600,
              color: '#1C1C1C',
              flexShrink: 0,
            }}
          >
            <span
              style={{
                display: 'inline-block',
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: '#DC2626',
              }}
            />
            Start live
          </button>
        )}
      </div>
      <div style={{ flex: 1, overflowY: 'auto', marginTop: 12, paddingLeft: isMobile ? 12 : 0, paddingRight: isMobile ? 12 : 0 }}>
        <MeetingRecordTabs meeting={selectedMeeting} />
      </div>
    </div>
  )
}

function MeetingListItem({ meeting, isActive, onSelect, actionCount = 0 }) {
  const meetingDate = new Date(meeting.date)
  const formattedDate = meetingDate.toLocaleDateString('en-CA', {
    month: 'short',
    day: 'numeric',
  })

  return (
    <button
      type="button"
      onClick={() => onSelect(meeting)}
      style={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '12px 14px',
        background: isActive ? '#F3E8FF' : 'transparent',
        border: isActive ? '2px solid #4C2A92' : 'none',
        borderLeft: isActive ? 'none' : '2px solid transparent',
        borderRadius: 10,
        cursor: 'pointer',
        textAlign: 'left',
        transition: 'all 0.15s',
      }}
      onMouseEnter={(e) => {
        if (!isActive) e.currentTarget.style.background = '#FAFAF9'
      }}
      onMouseLeave={(e) => {
        if (!isActive) e.currentTarget.style.background = 'transparent'
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#1C1C1C', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {meeting.title}
        </div>
        <div
          style={{
            marginTop: 4,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 12,
            color: '#7E7D78',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          <span
            style={{
              display: 'inline-block',
              paddingX: '6px',
              borderRadius: 4,
              background: TYPE_CHIP_COLORS[meeting.meeting_type] || '#E5E5E4',
              color: 'white',
              fontSize: 11,
              fontWeight: 600,
              padding: '2px 6px',
            }}
          >
            {meeting.meeting_type ? meeting.meeting_type.charAt(0).toUpperCase() + meeting.meeting_type.slice(1) : 'General'}
          </span>
          <span>{formattedDate}</span>
        </div>
      </div>
      {actionCount > 0 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minWidth: 24,
            height: 24,
            borderRadius: 6,
            background: '#FED7AA',
            fontSize: 11,
            fontWeight: 700,
            color: '#92400E',
          }}
        >
          {actionCount}
        </div>
      )}
    </button>
  )
}

export default function MeetingsWorkspace({ onStartLive, canManage }) {
  const { meetings, loading } = useMeetings()
  const [selectedMeeting, setSelectedMeeting] = useState(null)
  const [activeType, setActiveType] = useState('all')
  const [viewMode, setViewMode] = useState('list')
  const isMobile = useMediaQuery('(max-width: 640px)')
  const isTablet = useMediaQuery('(max-width: 1024px)')

  const grouped = useMemo(() => groupMeetingsByCategory(meetings), [meetings])
  const allTypes = useMemo(() => Object.keys(grouped).sort(), [grouped])
  const filteredMeetings = useMemo(() => {
    if (activeType === 'all') return meetings
    return grouped[activeType] || []
  }, [grouped, activeType, meetings])

  // On mobile, show detail view when a meeting is selected
  const showListPane = !isMobile || !selectedMeeting
  const showDetailPane = !isMobile || selectedMeeting

  if (loading) {
    return (
      <div style={{ display: 'flex', minHeight: 300, alignItems: 'center', justifyContent: 'center' }}>
        <LoadingSpinner label="Loading meetings" />
      </div>
    )
  }

  const totalCount = filteredMeetings.length

  return (
    <div style={{ display: 'flex', gap: 0, height: '100%', overflow: 'hidden' }}>
      {/* Left pane - meeting list sidebar */}
      {showListPane && (
      <div
        style={{
          flex: isMobile ? 1 : '0 0 340px',
          overflowY: 'auto',
          borderRight: isMobile ? 'none' : '1px solid var(--border)',
          padding: '16px 0',
          background: 'white',
          display: showListPane ? 'flex' : 'none',
          flexDirection: 'column',
        }}
      >
        {/* Header with filters and view toggle */}
        <div style={{ paddingLeft: 16, paddingRight: 16, marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#1C1C1C' }}>
              Filter
            </h3>
            {!isMobile && <ViewToggle view={viewMode} onViewChange={setViewMode} />}
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 }} role="group" aria-label="Filter meetings by type">
            <button
              type="button"
              onClick={() => setActiveType('all')}
              aria-pressed={activeType === 'all'}
              style={{
                padding: '6px 14px',
                borderRadius: 999,
                border: activeType === 'all' ? 'none' : '1px solid var(--border)',
                background: activeType === 'all' ? 'var(--accent)' : 'white',
                color: activeType === 'all' ? 'white' : 'var(--text-primary)',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              All
            </button>
            {allTypes.map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setActiveType(type)}
                aria-pressed={activeType === type}
                style={{
                  padding: '6px 14px',
                  borderRadius: 999,
                  border: activeType === type ? 'none' : '1px solid var(--border)',
                  background: activeType === type ? 'var(--accent)' : 'white',
                  color: activeType === type ? 'white' : 'var(--text-primary)',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  textTransform: 'capitalize',
                }}
              >
                {type.charAt(0).toUpperCase() + type.slice(1)}
              </button>
            ))}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
            {totalCount} meeting{totalCount !== 1 ? 's' : ''}
          </div>
        </div>

        {/* Meeting list or card gallery */}
        {viewMode === 'list' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {filteredMeetings.length === 0 ? (
              <div style={{ padding: '20px 16px', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 13 }}>
                No meetings in this category
              </div>
            ) : (
              filteredMeetings
                .sort((a, b) => new Date(b.date) - new Date(a.date))
                .map((meeting) => (
                  <button
                    key={meeting.id}
                    type="button"
                    onClick={() => setSelectedMeeting(meeting)}
                    aria-pressed={selectedMeeting?.id === meeting.id}
                    aria-label={`${meeting.title}, ${new Date(meeting.date).toLocaleDateString('en-CA', { weekday: 'long', year: 'numeric', month: 'short', day: 'numeric' })}`}
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      background: selectedMeeting?.id === meeting.id ? '#F3E8FF' : 'transparent',
                      border: selectedMeeting?.id === meeting.id ? '2px solid var(--accent)' : 'none',
                      borderLeft: selectedMeeting?.id === meeting.id ? 'none' : 'none',
                      textAlign: 'left',
                      cursor: 'pointer',
                      transition: 'all 0.12s',
                      borderBottom: '1px solid var(--border)',
                    }}
                    onMouseEnter={(e) => {
                      if (selectedMeeting?.id !== meeting.id) e.currentTarget.style.background = '#FAFAF9'
                    }}
                    onMouseLeave={(e) => {
                      if (selectedMeeting?.id !== meeting.id) e.currentTarget.style.background = 'transparent'
                    }}
                  >
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                      {meeting.title}
                    </div>
                    <div style={{ marginTop: 4, display: 'flex', gap: 8, fontSize: 11, color: 'var(--text-secondary)' }}>
                      <span
                        style={{
                          display: 'inline-block',
                          padding: '2px 6px',
                          borderRadius: 4,
                          background: TYPE_CHIP_COLORS[meeting.meeting_type] || '#E5E5E4',
                          color: 'white',
                          fontSize: 10,
                          fontWeight: 600,
                        }}
                      >
                        {meeting.meeting_type?.charAt(0).toUpperCase() + meeting.meeting_type?.slice(1) || 'General'}
                      </span>
                      <span>
                        {new Date(meeting.date).toLocaleDateString('en-CA', {
                          month: 'short',
                          day: 'numeric',
                        })}
                      </span>
                    </div>
                  </button>
                ))
            )}
          </div>
        ) : (
          <CardGalleryView
            meetings={filteredMeetings.sort((a, b) => new Date(b.date) - new Date(a.date))}
            selectedMeeting={selectedMeeting}
            onSelectMeeting={setSelectedMeeting}
            title=""
            emptyMessage="No meetings in this category"
          />
        )}
      </div>
      )}

      {/* Right pane - meeting record */}
      {showDetailPane && (
      <RecordPane
        selectedMeeting={selectedMeeting}
        canManage={canManage}
        onStartLive={onStartLive}
        isMobile={isMobile}
        onBack={() => setSelectedMeeting(null)}
      />
      )}
    </div>
  )
}
