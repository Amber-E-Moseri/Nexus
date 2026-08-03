import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../../hooks/useAuth'
import { supabase } from '../../../lib/supabase'

const MEETING_SELECT = `
  meeting_id,
  linked_at,
  linked_by,
  meeting:meetings!meeting_id(id, title, date, meeting_type, department:department_id(name))
`

function formatMeetingType(type) {
  if (!type) return ''
  return type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

// canEdit should be true only for sprint owner, manager, or super_admin/dept_lead.
// All users can view linked meetings, but only those with canEdit can link/unlink.
export default function SprintMeetingsPanel({ sprintId, canEdit }) {
  const { profile } = useAuth()
  const [links, setLinks] = useState([])
  const [loading, setLoading] = useState(true)
  const [showSearch, setShowSearch] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [linking, setLinking] = useState(null)
  const searchRef = useRef(null)
  const debounceRef = useRef(null)

  async function loadLinks() {
    const { data } = await supabase
      .from('sprint_meetings')
      .select(MEETING_SELECT)
      .eq('sprint_id', sprintId)
      .order('linked_at', { ascending: false })
    setLinks(data ?? [])
    setLoading(false)
  }

  useEffect(() => { loadLinks() }, [sprintId])

  useEffect(() => {
    if (showSearch) {
      setTimeout(() => searchRef.current?.focus(), 50)
      doSearch('')
    } else {
      setQuery('')
      setResults([])
    }
  }, [showSearch])

  async function doSearch(q) {
    setSearching(true)
    // Exclude meetings already linked
    const linkedIds = links.map((l) => l.meeting_id)
    let qb = supabase
      .from('meetings')
      .select('id, title, date, meeting_type, department:department_id(name)')
      .order('date', { ascending: false })
      .limit(20)

    if (q.trim()) qb = qb.ilike('title', `%${q.trim()}%`)

    const { data } = await qb
    const filtered = (data ?? []).filter((m) => !linkedIds.includes(m.id))
    setResults(filtered)
    setSearching(false)
  }

  function handleQueryChange(e) {
    const val = e.target.value
    setQuery(val)
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => doSearch(val), 250)
  }

  async function linkMeeting(meeting) {
    if (!profile?.id) return
    setLinking(meeting.id)
    const { error } = await supabase.from('sprint_meetings').insert({
      sprint_id: sprintId,
      meeting_id: meeting.id,
      linked_by: profile.id,
    })
    setLinking(null)
    if (!error) {
      setShowSearch(false)
      loadLinks()
    }
  }

  async function unlinkMeeting(meetingId) {
    await supabase
      .from('sprint_meetings')
      .delete()
      .eq('sprint_id', sprintId)
      .eq('meeting_id', meetingId)
    loadLinks()
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <h2 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
          Linked Meetings
        </h2>
        {canEdit && !showSearch && (
          <button
            type="button"
            onClick={() => setShowSearch(true)}
            style={{
              fontSize: 12,
              fontWeight: 600,
              padding: '5px 12px',
              borderRadius: 8,
              background: 'none',
              border: '1px solid var(--border)',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
            }}
          >
            + Link meeting
          </button>
        )}
      </div>

      {showSearch && (
        <div style={{ marginBottom: 12, position: 'relative' }}>
          <input
            ref={searchRef}
            type="text"
            value={query}
            onChange={handleQueryChange}
            placeholder="Search meetings by title…"
            style={{
              width: '100%',
              padding: '8px 12px',
              fontSize: 13,
              border: '1px solid var(--border)',
              borderRadius: 10,
              outline: 'none',
              boxSizing: 'border-box',
              background: 'var(--surface)',
              color: 'var(--text-primary)',
            }}
          />
          <button
            type="button"
            onClick={() => setShowSearch(false)}
            style={{
              position: 'absolute',
              right: 10,
              top: '50%',
              transform: 'translateY(-50%)',
              background: 'none',
              border: 'none',
              fontSize: 16,
              cursor: 'pointer',
              color: 'var(--text-tertiary)',
              lineHeight: 1,
            }}
          >
            ×
          </button>

          {(results.length > 0 || searching) && (
            <div style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              right: 0,
              zIndex: 50,
              background: 'white',
              border: '1px solid var(--border)',
              borderRadius: 10,
              boxShadow: '0 4px 16px rgba(0,0,0,0.10)',
              marginTop: 4,
              maxHeight: 280,
              overflowY: 'auto',
            }}>
              {searching && (
                <div style={{ padding: '10px 14px', fontSize: 12, color: 'var(--text-tertiary)' }}>Searching…</div>
              )}
              {!searching && results.length === 0 && (
                <div style={{ padding: '10px 14px', fontSize: 12, color: 'var(--text-tertiary)' }}>No meetings found</div>
              )}
              {results.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  disabled={linking === m.id}
                  onClick={() => linkMeeting(m)}
                  style={{
                    display: 'block',
                    width: '100%',
                    textAlign: 'left',
                    padding: '10px 14px',
                    background: 'none',
                    border: 'none',
                    borderBottom: '1px solid var(--border)',
                    cursor: 'pointer',
                    opacity: linking === m.id ? 0.5 : 1,
                  }}
                >
                  <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>{m.title}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>
                    {m.date ? new Date(m.date + 'T00:00:00').toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' }) : 'No date'}
                    {m.meeting_type ? ` · ${formatMeetingType(m.meeting_type)}` : ''}
                    {m.department?.name ? ` · ${m.department.name}` : ''}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {loading && (
        <div style={{ fontSize: 12, color: 'var(--text-tertiary)', padding: '8px 0' }}>Loading…</div>
      )}

      {!loading && links.length === 0 && !showSearch && (
        <div style={{ fontSize: 13, color: 'var(--text-tertiary)', padding: '12px 0' }}>
          No meetings linked yet.{canEdit ? ' Click "+ Link meeting" to attach a meeting to this sprint.' : ''}
        </div>
      )}

      {links.map((l) => {
        const m = l.meeting
        if (!m) return null
        return (
          <div
            key={l.meeting_id}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '10px 0',
              borderBottom: '1px solid var(--border)',
            }}
          >
            <div style={{ minWidth: 0 }}>
              <Link
                to={`/meetings/${m.id}`}
                style={{ fontSize: 13, fontWeight: 500, color: 'var(--accent)', textDecoration: 'none' }}
              >
                {m.title}
              </Link>
              <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>
                {m.date ? new Date(m.date + 'T00:00:00').toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' }) : 'No date'}
                {m.meeting_type ? ` · ${formatMeetingType(m.meeting_type)}` : ''}
                {m.department?.name ? ` · ${m.department.name}` : ''}
              </div>
            </div>
            {canEdit && (
              <button
                type="button"
                onClick={() => unlinkMeeting(l.meeting_id)}
                title="Unlink meeting"
                style={{
                  marginLeft: 12,
                  flexShrink: 0,
                  background: 'none',
                  border: 'none',
                  fontSize: 16,
                  cursor: 'pointer',
                  color: 'var(--text-tertiary)',
                  padding: '2px 6px',
                  borderRadius: 6,
                }}
              >
                ×
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}
