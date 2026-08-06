import { useState, useEffect, useCallback } from 'react'
import { FileText, LoaderCircle } from 'lucide-react'
import { useAuth } from '../../../hooks/useAuth'
import { useToast } from '../../../context/ToastContext'
import MinutesCard from '../components/MinutesCard'
import MeetingMinutesViewer from '../components/MeetingMinutesViewer'
import { getMeetingsWithMinutes } from '../lib/meetings'

const PAGE_SIZE = 20

export default function MinutesTimelinePage({ departmentId, meetingType, readOnly = false, profileId, isSuperAdmin = false }) {
  const { profile } = useAuth()
  const { showToast } = useToast()
  const [meetings, setMeetings] = useState([])
  const [totalCount, setTotalCount] = useState(0)
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [viewerMeeting, setViewerMeeting] = useState(null)

  const exportMinutesPdf = async () => {
    if (!viewerMeeting) return
    try {
      const { generateMinutesPDF, generateMinutesPDFFilename } = await import('../../../lib/meetings/pdfGeneration')
      const splitLines = (text) => (text || '')
        .split('\n')
        .map((line) => line.replace(/^[•\-*]\s*/, '').trim())
        .filter(Boolean)
      const notesPlainText = viewerMeeting?.notes_text || viewerMeeting?.minutes || ''
      const blob = await generateMinutesPDF({
        summary: viewerMeeting?.meeting_notes || notesPlainText,
        decisions: splitLines(viewerMeeting?.decisions || ''),
        nextSteps: splitLines(viewerMeeting?.next_steps || ''),
        detailedNotes: notesPlainText,
        actionItems: [],
        openItems: [],
        agenda: [],
        attendees: (viewerMeeting?.meeting_attendance || []).map((a) => ({
          name: a.attendee?.name || 'Unknown',
          status: a.status || 'present',
        })),
      }, viewerMeeting)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = generateMinutesPDFFilename(viewerMeeting)
      a.click()
      URL.revokeObjectURL(url)
      showToast('Minutes PDF downloaded', { tone: 'success' })
    } catch (err) {
      showToast(`PDF export failed: ${err.message}`, { tone: 'error' })
    }
  }

  const load = useCallback(async (nextPage, nextDepartmentId, nextMeetingType) => {
    setLoading(true)
    setError(null)
    try {
      const result = await getMeetingsWithMinutes(nextDepartmentId, { page: nextPage, pageSize: PAGE_SIZE, meetingType: nextMeetingType })
      setMeetings((current) => nextPage === 0 ? result.meetings : [...current, ...result.meetings])
      setTotalCount(result.totalCount)
    } catch (loadError) {
      setError(loadError.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    setPage(0)
    setMeetings([])
    load(0, departmentId, meetingType)
  }, [departmentId, meetingType, load])

  const hasMore = meetings.length < totalCount

  if (loading && meetings.length === 0) {
    return (
      <div style={{ minHeight: 160, display: 'grid', placeItems: 'center', color: 'var(--text-secondary, #7A6F5E)', fontSize: 13 }}>
        <LoaderCircle size={18} />
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ padding: '24px 0', color: '#C4383A', fontSize: 13 }}>
        Failed to load minutes: {error}
      </div>
    )
  }

  if (meetings.length === 0) {
    return (
      <div style={{ minHeight: 300, display: 'grid', placeItems: 'center', textAlign: 'center' }}>
        <div>
          <div style={{ width: 44, height: 44, borderRadius: 8, background: '#F1EEF6', color: '#4C2A92', display: 'grid', placeItems: 'center', margin: '0 auto 12px' }}>
            <FileText size={21} />
          </div>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary, #1C1610)' }}>No meeting minutes yet</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary, #7A6F5E)', marginTop: 5 }}>Meeting notes you can access will appear here.</div>
        </div>
      </div>
    )
  }

  function handleLoadMore() {
    const nextPage = page + 1
    setPage(nextPage)
    load(nextPage, departmentId, meetingType)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {viewerMeeting && (
        <MeetingMinutesViewer
          meetingId={viewerMeeting.id}
          initialMeeting={viewerMeeting}
          searchQuery=""
          currentUser={profile}
          exportPdf={exportMinutesPdf}
          onViewMeetingLog={() => {
            setViewerMeeting(null)
          }}
          onClose={() => setViewerMeeting(null)}
        />
      )}
      {meetings.map((meeting) => (
        <MinutesCard
          key={meeting.id}
          meeting={meeting}
          snippet={(meeting.notes_text || '').substring(0, 120)}
          readOnly={readOnly}
          canNavigate={meeting.created_by === profileId}
          showMeetingLink={isSuperAdmin}
          onOpenViewer={setViewerMeeting}
        />
      ))}
      {hasMore && (
        <button
          onClick={handleLoadMore}
          disabled={loading}
          style={{ padding: '10px 20px', border: '1px solid var(--border, #E9E4D8)', borderRadius: 7, background: '#FFFFFF', color: 'var(--text-primary, #1C1610)', fontFamily: 'inherit', fontSize: 13, fontWeight: 600, cursor: loading ? 'wait' : 'pointer', opacity: loading ? 0.6 : 1, alignSelf: 'center', marginTop: 4 }}
        >
          {loading ? 'Loading' : 'Load more (' + (totalCount - meetings.length) + ' remaining)'}
        </button>
      )}
    </div>
  )
}
