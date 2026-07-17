import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import { getOrgUsers } from '../lib/ownerMatching'

const FS = {
  navy:    '#18122E',
  purple:  '#4C2A92',
  sage:    '#2D8653',
  sageL:   'rgba(45,134,83,.12)',
  border:  '#E5DDD0',
  borderL: '#EDE8DC',
  surface: '#FFFFFF',
  bg:      'rgba(24,18,46,.45)',
  text:    '#1C1C1C',
  muted:   '#7A6F5E',
  xmuted:  '#B0A89A',
}

export default function MeetingShareModal({ meetingId, attendees = [], allowedViewers = [], excludeUserIds = [], onClose, onChange }) {
  const [orgUsers, setOrgUsers] = useState([])
  const [loadingUsers, setLoadingUsers] = useState(true)
  const [search, setSearch] = useState('')
  const [busyId, setBusyId] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    getOrgUsers()
      .then((users) => { if (!cancelled) setOrgUsers(users) })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoadingUsers(false) })
    return () => { cancelled = true }
  }, [])

  const excludeSet = useMemo(() => new Set(excludeUserIds.filter(Boolean)), [excludeUserIds])
  const attendeeIds = useMemo(() => new Set(attendees.map((a) => a.id)), [attendees])

  const visibleAttendees = attendees.filter((a) => a.id && !excludeSet.has(a.id))
  const otherMembers = orgUsers.filter((u) => {
    if (excludeSet.has(u.id) || attendeeIds.has(u.id)) return false
    if (!search.trim()) return true
    return u.name?.toLowerCase().includes(search.trim().toLowerCase())
  })

  async function toggleShare(userId) {
    const next = allowedViewers.includes(userId)
      ? allowedViewers.filter((id) => id !== userId)
      : [...allowedViewers, userId]
    setBusyId(userId)
    setError('')
    const { error: updateErr } = await supabase
      .from('meetings')
      .update({ allowed_viewers: next })
      .eq('id', meetingId)
    setBusyId(null)
    if (updateErr) { setError(updateErr.message); return }
    onChange?.(next)
  }

  function Row({ id, name }) {
    const shared = allowedViewers.includes(id)
    return (
      <div key={id} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'8px 10px', borderRadius:8, border:`1px solid ${FS.borderL}`, marginBottom:6 }}>
        <span style={{ fontSize:13, color: FS.text, fontWeight:600 }}>{name || 'Unknown'}</span>
        <button
          type="button"
          onClick={() => toggleShare(id)}
          disabled={busyId === id}
          style={{
            padding:'5px 12px',
            borderRadius:999,
            border: shared ? 'none' : `1px solid ${FS.border}`,
            background: shared ? FS.sageL : FS.surface,
            color: shared ? FS.sage : FS.muted,
            fontFamily:'inherit',
            fontSize:11,
            fontWeight:700,
            cursor: busyId === id ? 'wait' : 'pointer',
            opacity: busyId === id ? 0.6 : 1,
          }}
        >
          {shared ? '✓ Shared' : 'Share'}
        </button>
      </div>
    )
  }

  return (
    <div style={{ position:'fixed', inset:0, background: FS.bg, display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000, padding:16 }} onClick={onClose}>
      <div style={{ background: FS.surface, borderRadius:14, width:'100%', maxWidth:420, maxHeight:'80vh', display:'flex', flexDirection:'column', boxShadow:'0 12px 40px rgba(0,0,0,.25)' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ padding:'16px 18px', borderBottom:`1px solid ${FS.borderL}`, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div style={{ fontSize:14, fontWeight:800, color: FS.navy }}>Share this private meeting</div>
          <button type="button" onClick={onClose} style={{ border:'none', background:'transparent', fontSize:16, color: FS.muted, cursor:'pointer', lineHeight:1 }}>✕</button>
        </div>

        <div style={{ padding:'14px 18px', overflowY:'auto', flex:1 }}>
          {error && (
            <div style={{ marginBottom:12, padding:'8px 12px', borderRadius:8, background:'#FEE8E6', color:'#C73B2B', fontSize:12 }}>{error}</div>
          )}

          {visibleAttendees.length > 0 && (
            <div style={{ marginBottom:16 }}>
              <div style={{ fontSize:10.5, fontWeight:700, letterSpacing:'.06em', textTransform:'uppercase', color: FS.muted, marginBottom:8 }}>Attendees</div>
              {visibleAttendees.map((a) => <Row key={a.id} id={a.id} name={a.name} />)}
            </div>
          )}

          <div>
            <div style={{ fontSize:10.5, fontWeight:700, letterSpacing:'.06em', textTransform:'uppercase', color: FS.muted, marginBottom:8 }}>All members</div>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search people…"
              style={{ width:'100%', padding:'8px 10px', border:`1px solid ${FS.border}`, borderRadius:8, fontSize:13, fontFamily:'inherit', marginBottom:10, boxSizing:'border-box' }}
            />
            {loadingUsers ? (
              <div style={{ fontSize:12, color: FS.xmuted, textAlign:'center', padding:'12px 0' }}>Loading members…</div>
            ) : otherMembers.length === 0 ? (
              <div style={{ fontSize:12, color: FS.xmuted, textAlign:'center', padding:'12px 0' }}>No matches</div>
            ) : (
              otherMembers.map((u) => <Row key={u.id} id={u.id} name={u.name} />)
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
