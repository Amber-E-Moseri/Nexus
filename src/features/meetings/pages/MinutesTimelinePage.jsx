import { useState, useEffect, useCallback } from 'react'
import { FileText, LoaderCircle } from 'lucide-react'
import MinutesCard from '../components/MinutesCard'
import { getMeetingsWithMinutes } from '../lib/meetings'

const PAGE_SIZE = 20

export default function MinutesTimelinePage({ departmentId }) {
  const [meetings, setMeetings] = useState([])
  const [totalCount, setTotalCount] = useState(0)
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async (nextPage, nextDepartmentId) => {
    setLoading(true)
    setError(null)
    try {
      const result = await getMeetingsWithMinutes(nextDepartmentId, { page: nextPage, pageSize: PAGE_SIZE })
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
    load(0, departmentId)
  }, [departmentId, load])

  const hasMore = meetings.length < totalCount

  if (loading && meetings.length === 0) {
    return <div style={{ minHeight: 160, display: 'grid', placeItems: 'center', color: 'var(--text-secondary, #7A6F5E)', fontSize: 13 }}><LoaderCircle size={18} /> </div>
  }

  if (error) {
    return <div style={{ padding: '24px 0', color: '#C4383A', fontSize: 13 }}>Failed to load minutes: {error}</div>
  }

  if (meetings.length === 0) {
    return (
      <div style={{ minHeight: 300, display: 'grid', placeItems: 'center', textAlign: 'center' }}>
        <div>
          <div style={{ width: 44, height: 44, borderRadius: 8, background: '#F1EEF6', color: '#4C2A92', display: 'grid', placeItems: 'center', margin: '0 auto 12px' }}><FileText size={21} /></div>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary, #1C1610)' }}>No published minutes yet</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary, #7A6F5E)', marginTop: 5 }}>Published meeting notes will appear here.</div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {meetings.map((meeting) => <MinutesCard key={meeting.id} meeting={meeting} snippet={(meeting.notes_text || '').substring(0, 120)} />)}
      {hasMore && (
        <button
          onClick={() => { const nextPage = page + 1; setPage(nextPage); load(nextPage, departmentId) }}
          disabled={loading}
          style={{ padding: '10px 20px', border: '1px solid var(--border, #E9E4D8)', borderRadius: 7, background: '#FFFFFF', color: 'var(--text-primary, #1C1610)', fontFamily: 'inherit', fontSize: 13, fontWeight: 600, cursor: loading ? 'wait' : 'pointer', opacity: loading ? 0.6 : 1, alignSelf: 'center', marginTop: 4 }}
        >
          {loading ? 'Loading' : `Load more (${totalCount - meetings.length} remaining)`}
        </button>
      )}
    </div>
  )
}
