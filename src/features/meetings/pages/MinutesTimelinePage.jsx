import { useState, useEffect, useCallback } from 'react'
import MinutesCard from '../components/MinutesCard'
import { getMeetingsWithMinutes } from '../lib/meetings'

const PAGE_SIZE = 20

export default function MinutesTimelinePage({ departmentId }) {
  const [meetings, setMeetings] = useState([])
  const [totalCount, setTotalCount] = useState(0)
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async (pg, deptId) => {
    setLoading(true)
    setError(null)
    try {
      const result = await getMeetingsWithMinutes(deptId, { page: pg, pageSize: PAGE_SIZE })
      if (pg === 0) {
        setMeetings(result.meetings)
      } else {
        setMeetings(prev => [...prev, ...result.meetings])
      }
      setTotalCount(result.totalCount)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    setPage(0)
    setMeetings([])
    load(0, departmentId)
  }, [departmentId, load])

  function loadMore() {
    const next = page + 1
    setPage(next)
    load(next, departmentId)
  }

  const hasMore = meetings.length < totalCount

  if (loading && meetings.length === 0) {
    return (
      <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--text-secondary, #7A6F5E)', fontSize: 13 }}>
        Loading minutes…
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ padding: '24px 0', color: '#F06449', fontSize: 13 }}>
        Failed to load minutes: {error}
      </div>
    )
  }

  if (meetings.length === 0) {
    return (
      <div style={{ padding: '48px 0', textAlign: 'center' }}>
        <div style={{ fontSize: 32, marginBottom: 10 }}>📝</div>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary, #1C1610)' }}>No published minutes yet</div>
        <div style={{ fontSize: 12, color: 'var(--text-secondary, #7A6F5E)', marginTop: 4 }}>
          Meetings with notes set to Published will appear here.
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {meetings.map(m => (
        <MinutesCard
          key={m.id}
          meeting={m}
          snippet={(m.notes_text || '').substring(0, 120)}
        />
      ))}
      {hasMore && (
        <button
          onClick={loadMore}
          disabled={loading}
          style={{
            padding: '10px 20px',
            border: '1px solid var(--border, #E9E4D8)',
            borderRadius: 8,
            background: 'var(--surface, #FFFFFF)',
            color: 'var(--text-primary, #1C1610)',
            fontFamily: 'inherit',
            fontSize: 13,
            fontWeight: 600,
            cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.6 : 1,
            alignSelf: 'center',
            marginTop: 4,
          }}
        >
          {loading ? 'Loading…' : `Load more (${totalCount - meetings.length} remaining)`}
        </button>
      )}
    </div>
  )
}
