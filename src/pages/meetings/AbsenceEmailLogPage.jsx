import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

const PRIMARY = '#4C2A92'
const BORDER = '#EDE8DC'
const TEXT = '#2D2A22'
const MUTED = '#9E9488'
const BG = '#F4F1EA'

export default function AbsenceEmailLogPage() {
  const [logs, setLogs] = useState([])
  const [meetings, setMeetings] = useState([])
  const [selectedMeeting, setSelectedMeeting] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    loadLogs()
    loadMeetings()
  }, [])

  async function loadLogs() {
    setLoading(true)
    setError(null)
    try {
      const { data, error: fetchErr } = await supabase
        .from('absence_email_log')
        .select('id, recipient_name, email, meeting_name, sent_at, status')
        .order('sent_at', { ascending: false })
        .limit(100)

      if (fetchErr) throw fetchErr
      setLogs(data ?? [])
    } catch (err) {
      setError(err.message ?? 'Failed to load logs')
      setLogs([])
    } finally {
      setLoading(false)
    }
  }

  async function loadMeetings() {
    try {
      const { data, error: fetchErr } = await supabase
        .from('absence_email_log')
        .select('meeting_name')
        .distinct()
        .order('meeting_name', { ascending: true })
        .limit(50)

      if (fetchErr) throw fetchErr
      const uniqueMeetings = [...new Set((data ?? []).map((row) => row.meeting_name).filter(Boolean))]
      setMeetings(uniqueMeetings)
    } catch (err) {
      console.error('Failed to load meetings:', err)
    }
  }

  const filteredLogs = selectedMeeting
    ? logs.filter((log) => log.meeting_name === selectedMeeting)
    : logs

  function formatDate(isoString) {
    if (!isoString) return '—'
    try {
      return new Date(isoString).toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    } catch {
      return isoString
    }
  }

  function getStatusBadge(status) {
    if (status === 'failed') {
      return { bg: '#FEF0ED', fg: '#C94830', label: 'Failed' }
    }
    if (status === 'sent') {
      return { bg: '#EEF6F1', fg: '#2D8653', label: 'Sent' }
    }
    return { bg: '#F4F1EA', fg: '#9E9488', label: status ?? 'Unknown' }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div style={{ padding: '16px 24px', background: '#FFFFFF', borderBottom: `1px solid ${BORDER}`, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: TEXT }}>Meetings</span>
          <span style={{ color: '#D8D3C9' }}>/</span>
          <span style={{ fontSize: 13, fontWeight: 600, color: TEXT }}>Absence Email Send Log</span>
        </div>
        <div>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: TEXT }}>Absence Email Send Log</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: MUTED }}>View history of absence notification emails sent to members.</p>
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'auto', padding: '16px 24px', background: BG }}>
        {/* Filter */}
        <div style={{ marginBottom: 20 }}>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: TEXT, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '.06em' }}>
            Filter by Meeting
          </label>
          <select
            value={selectedMeeting}
            onChange={(e) => setSelectedMeeting(e.target.value)}
            style={{
              border: `1px solid ${BORDER}`,
              borderRadius: 9,
              padding: '8px 11px',
              fontSize: 13,
              color: TEXT,
              background: 'white',
              fontFamily: 'inherit',
              cursor: 'pointer',
              outline: 'none',
              minWidth: 200,
            }}
          >
            <option value="">All meetings</option>
            {meetings.map((meeting) => (
              <option key={meeting} value={meeting}>
                {meeting}
              </option>
            ))}
          </select>
        </div>

        {/* Error */}
        {error ? (
          <div style={{ background: '#FEF0ED', border: `1px solid #F5C4B8`, borderRadius: 12, padding: '16px', color: '#C94830', fontSize: 13 }}>
            {error}
          </div>
        ) : null}

        {/* Loading */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '48px', color: MUTED, fontSize: 13 }}>Loading logs...</div>
        ) : filteredLogs.length === 0 ? (
          <div style={{ background: '#FFFFFF', border: `1px solid ${BORDER}`, borderRadius: 16, padding: '36px 24px', textAlign: 'center', color: MUTED, fontSize: 13 }}>
            No absence emails found{selectedMeeting ? ` for ${selectedMeeting}` : ''}.
          </div>
        ) : (
          <div style={{ border: `1px solid ${BORDER}`, borderRadius: 12, overflow: 'hidden', background: '#FFFFFF' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#F9F7F3', borderBottom: `1px solid ${BORDER}` }}>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: '.06em' }}>Recipient Name</th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: '.06em' }}>Email</th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: '.06em' }}>Meeting</th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: '.06em' }}>Sent At</th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: '.06em' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredLogs.map((log) => {
                  const statusBadge = getStatusBadge(log.status)
                  return (
                    <tr key={log.id} style={{ borderBottom: `1px solid ${BG}` }}>
                      <td style={{ padding: '12px 16px', fontSize: 13, color: TEXT, fontWeight: 600 }}>{log.recipient_name}</td>
                      <td style={{ padding: '12px 16px', fontSize: 13, color: MUTED, fontFamily: 'monospace' }}>{log.email}</td>
                      <td style={{ padding: '12px 16px', fontSize: 13, color: TEXT }}>{log.meeting_name}</td>
                      <td style={{ padding: '12px 16px', fontSize: 13, color: MUTED }}>{formatDate(log.sent_at)}</td>
                      <td style={{ padding: '12px 16px' }}>
                        <span
                          style={{
                            display: 'inline-block',
                            fontSize: 11,
                            fontWeight: 700,
                            padding: '4px 10px',
                            borderRadius: 4,
                            background: statusBadge.bg,
                            color: statusBadge.fg,
                          }}
                        >
                          {statusBadge.label}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
