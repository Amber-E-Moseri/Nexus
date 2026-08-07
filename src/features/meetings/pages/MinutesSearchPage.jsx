import { useState, useCallback, useEffect, useRef } from 'react'
import { FileSearch, Search } from 'lucide-react'
import { useAuth } from '../../../hooks/useAuth'
import { useToast } from '../../../context/ToastContext'
import MinutesCard from '../components/MinutesCard'
import MeetingMinutesViewer from '../components/MeetingMinutesViewer'
import { searchMinutesBlocks } from '../lib/meetings'

export default function MinutesSearchPage({ departmentId, meetingType, readOnly = false, profileId, isSuperAdmin = false }) {
  const { profile } = useAuth()
  const { showToast } = useToast()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [searched, setSearched] = useState(false)
  const debounceRef = useRef(null)
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

  const search = useCallback(async (value, scope, nextMeetingType) => {
    if (!value.trim()) { setResults([]); setSearched(false); return }
    setLoading(true)
    setError(null)
    try {
      setResults(await searchMinutesBlocks(value, scope, nextMeetingType))
      setSearched(true)
    } catch (searchError) {
      setError(searchError.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!query.trim()) { setResults([]); setSearched(false); return undefined }
    debounceRef.current = setTimeout(() => search(query, departmentId, meetingType), 300)
    return () => clearTimeout(debounceRef.current)
  }, [query, departmentId, meetingType, search])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {viewerMeeting && (
        <MeetingMinutesViewer
          meetingId={viewerMeeting.id}
          initialMeeting={viewerMeeting}
          searchQuery={query}
          currentUser={profile}
          exportPdf={exportMinutesPdf}
          onViewMeetingLog={() => {
            setViewerMeeting(null)
          }}
          onClose={() => setViewerMeeting(null)}
        />
      )}
      <div style={{ position: 'relative', maxWidth: 620 }}>
        <Search size={15} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary, #B0A696)', pointerEvents: 'none' }} />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search meeting minutes"
          autoFocus
          style={{
            width: '100%',
            padding: '12px 42px 12px 40px',
            border: 'none',
            borderRadius: 10,
            fontSize: 14,
            fontFamily: 'inherit',
            color: 'var(--text-primary, #1C1610)',
            background: '#F9F8F6',
            outline: 'none',
            boxSizing: 'border-box',
            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.08)',
            transition: 'all 0.2s ease'
          }}
          onFocus={(e) => {
            e.currentTarget.style.background = '#FFFFFF'
            e.currentTarget.style.boxShadow = '0 2px 8px rgba(76, 42, 146, 0.12), 0 1px 3px rgba(0, 0, 0, 0.08)'
          }}
          onBlur={(e) => {
            e.currentTarget.style.background = '#F9F8F6'
            e.currentTarget.style.boxShadow = '0 1px 3px rgba(0, 0, 0, 0.08)'
          }}
        />
        {loading && <span style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', fontSize: 11, color: 'var(--text-secondary, #7A6F5E)', fontWeight: 600 }}>Searching…</span>}
      </div>

      {error && <div style={{ fontSize: 13, color: '#C4383A' }}>Search failed: {error}</div>}
      {searched && !loading && results.length === 0 && (
        <div style={{ padding: '44px 0', textAlign: 'center' }}>
          <div style={{ width: 42, height: 42, borderRadius: 8, background: '#F1EEF6', color: '#4C2A92', display: 'grid', placeItems: 'center', margin: '0 auto 10px' }}><FileSearch size={20} /></div>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary, #1C1610)' }}>No matching minutes</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary, #7A6F5E)', marginTop: 5 }}>Try a different keyword or adjust the department scope.</div>
        </div>
      )}
      {results.length > 0 && (
        <>
          <div style={{ fontSize: 12, color: 'var(--text-secondary, #7A6F5E)', fontWeight: 600 }}>{results.length} result{results.length === 1 ? '' : 's'}{results.length === 30 ? ' (showing top 30)' : ''}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {results.map((result) => (
              <MinutesCard
                key={result.id}
                meeting={result}
                snippet={(result.notes_text || '').substring(0, 120)}
                readOnly={readOnly}
                canNavigate={result.created_by === profileId}
                showMeetingLink={isSuperAdmin}
                onOpenViewer={setViewerMeeting}
              />
            ))}
          </div>
        </>
      )}
      {!searched && !loading && <div style={{ padding: '36px 0', textAlign: 'center', color: 'var(--text-secondary, #7A6F5E)', fontSize: 13 }}>Search the meeting notes available to you.</div>}
    </div>
  )
}
