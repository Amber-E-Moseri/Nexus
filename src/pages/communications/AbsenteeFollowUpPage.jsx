import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { FONT_HEADING } from '../../lib/fonts'
import {
  resolveAbsentRecipients,
  defaultAbsenceEmail,
} from '../../features/meetings/lib/absentee-recipients'
import { Users, ChevronRight, History, Send } from 'lucide-react'

const PRIMARY = 'var(--purple-700)'
const BORDER = 'var(--border-1)'
const TEXT = 'var(--ink-1)'
const MUTED = 'var(--ink-3)'
const BG = 'var(--surface-sub)'

const VARIABLE_HINT = '{{name}} inserts each member’s name.'

function formatDate(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function AbsenteeFollowUpPage() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [reports, setReports] = useState([])
  const [roster, setRoster] = useState([])
  const [selected, setSelected] = useState(null)
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [skipped, setSkipped] = useState(() => new Set())
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState(null)

  useEffect(() => {
    let active = true
    async function load() {
      setLoading(true)
      const [reportsRes, rosterRes] = await Promise.all([
        supabase
          .from('meeting_attendance_reports')
          .select('id, label, report_date, absent_count, absent_names, subgroup_filter, created_at')
          .order('created_at', { ascending: false })
          .limit(30),
        supabase
          .from('expected_attendees')
          .select('full_name, email')
          .eq('active', true)
          .not('email', 'is', null),
      ])
      if (!active) return
      const withAbsentees = (reportsRes.data ?? []).filter(
        (r) => Array.isArray(r.absent_names) && r.absent_names.length > 0,
      )
      setReports(withAbsentees)
      setRoster(rosterRes.data ?? [])
      setLoading(false)
    }
    load()
    return () => { active = false }
  }, [])

  // All resolvable recipients for the selected report (absent names that matched
  // a roster row with an email). The edge function re-validates this server-side.
  const recipients = useMemo(
    () => (selected ? resolveAbsentRecipients(selected.absent_names, roster) : []),
    [selected, roster],
  )

  const activeRecipients = recipients.filter((r) => !skipped.has(r.email))

  function selectReport(report) {
    setSelected(report)
    setSkipped(new Set())
    setResult(null)
    const defaults = defaultAbsenceEmail(report.label ?? 'our last meeting')
    setSubject(defaults.subject)
    setBody(defaults.body)
  }

  function toggleSkip(email) {
    setSkipped((prev) => {
      const next = new Set(prev)
      if (next.has(email)) next.delete(email)
      else next.add(email)
      return next
    })
  }

  async function handleSend() {
    if (!selected || activeRecipients.length === 0) return
    setSending(true)
    setResult(null)
    try {
      const { data, error } = await supabase.functions.invoke('send-absence-emails', {
        body: {
          report_id: selected.id,
          recipients: activeRecipients,
          subject,
          body_template: body,
          meeting_label: selected.label,
        },
      })
      if (error) throw error
      setResult({ tone: 'success', ...data })
    } catch (err) {
      setResult({ tone: 'error', message: err.message })
    } finally {
      setSending(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '16px 24px 14px', background: '#FFFFFF', borderBottom: `1px solid ${BORDER}`, flexShrink: 0, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <h1 style={{ fontFamily: FONT_HEADING, margin: 0, fontSize: 20, fontWeight: 800, color: TEXT }}>Absentee follow-up</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: MUTED }}>
            Email members who missed a meeting, straight from an attendance report.
          </p>
        </div>
        <button
          type="button"
          onClick={() => navigate('/meetings/absence-email-log')}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: `1px solid ${BORDER}`, background: '#FFFFFF', color: PRIMARY, borderRadius: 9, padding: '8px 14px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}
        >
          <History size={14} /> Send history
        </button>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '16px 24px', background: BG }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 48, color: MUTED, fontSize: 13 }}>Loading...</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(260px, 340px) 1fr', gap: 16, alignItems: 'start', maxWidth: 1100 }}>
            {/* Report picker */}
            <div style={{ background: '#FFFFFF', border: `1px solid ${BORDER}`, borderRadius: 16, overflow: 'hidden' }}>
              <div style={{ padding: '14px 18px', borderBottom: `1px solid ${BORDER}`, fontSize: 14, fontWeight: 800, color: TEXT }}>
                Recent reports
              </div>
              {reports.length === 0 ? (
                <div style={{ padding: '28px 18px', textAlign: 'center', color: MUTED, fontSize: 13 }}>
                  No attendance reports with absentees yet.
                </div>
              ) : (
                reports.map((report) => {
                  const isActive = selected?.id === report.id
                  return (
                    <button
                      key={report.id}
                      type="button"
                      onClick={() => selectReport(report)}
                      style={{ width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 10, padding: '12px 18px', borderBottom: `1px solid ${BG}`, background: isActive ? 'var(--purple-tint, #F3EFFA)' : '#FFFFFF', border: 'none', borderLeft: isActive ? `3px solid ${PRIMARY}` : '3px solid transparent', cursor: 'pointer' }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: TEXT, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {report.label || 'Untitled report'}
                        </div>
                        <div style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>
                          {formatDate(report.report_date || report.created_at)} · {report.absent_names.length} absent
                        </div>
                      </div>
                      <ChevronRight size={15} style={{ color: MUTED, flexShrink: 0 }} />
                    </button>
                  )
                })
              )}
            </div>

            {/* Composer */}
            <div style={{ background: '#FFFFFF', border: `1px solid ${BORDER}`, borderRadius: 16, padding: selected ? 20 : 0, minHeight: 200 }}>
              {!selected ? (
                <div style={{ padding: '48px 24px', textAlign: 'center', color: MUTED, fontSize: 13 }}>
                  <Users size={26} style={{ color: 'var(--border-2, #D8D3C9)', marginBottom: 10 }} />
                  <div>Select a report to compose a follow-up email.</div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 800, color: TEXT }}>{selected.label}</div>
                    <div style={{ fontSize: 12, color: MUTED, marginTop: 3 }}>
                      {recipients.length} of {selected.absent_names.length} absentees have an email on file
                      {recipients.length < selected.absent_names.length ? ' (others will be skipped)' : ''}.
                    </div>
                  </div>

                  <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 13, fontWeight: 600, color: TEXT }}>
                    Subject
                    <input
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      style={{ border: `1px solid ${BORDER}`, borderRadius: 9, padding: '9px 12px', fontSize: 13, outline: 'none', fontFamily: 'inherit' }}
                    />
                  </label>

                  <label style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 13, fontWeight: 600, color: TEXT }}>
                    Message
                    <textarea
                      value={body}
                      onChange={(e) => setBody(e.target.value)}
                      rows={6}
                      style={{ border: `1px solid ${BORDER}`, borderRadius: 9, padding: '9px 12px', fontSize: 13, outline: 'none', fontFamily: 'inherit', resize: 'vertical' }}
                    />
                    <span style={{ fontSize: 11.5, color: MUTED, fontWeight: 500 }}>{VARIABLE_HINT}</span>
                  </label>

                  {/* Recipient checklist */}
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: TEXT, marginBottom: 8 }}>
                      Recipients ({activeRecipients.length})
                    </div>
                    {recipients.length === 0 ? (
                      <div style={{ fontSize: 13, color: MUTED, padding: '12px 0' }}>
                        None of the absentees have an email address on file.
                      </div>
                    ) : (
                      <div style={{ border: `1px solid ${BORDER}`, borderRadius: 10, overflow: 'hidden', maxHeight: 220, overflowY: 'auto' }}>
                        {recipients.map((r) => {
                          const isSkipped = skipped.has(r.email)
                          return (
                            <label key={r.email} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderBottom: `1px solid ${BG}`, cursor: 'pointer', opacity: isSkipped ? 0.5 : 1 }}>
                              <input type="checkbox" checked={!isSkipped} onChange={() => toggleSkip(r.email)} style={{ accentColor: PRIMARY }} />
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 13, fontWeight: 600, color: TEXT }}>{r.name}</div>
                                <div style={{ fontSize: 12, color: MUTED }}>{r.email}</div>
                              </div>
                            </label>
                          )
                        })}
                      </div>
                    )}
                  </div>

                  {result ? (
                    <div style={{ borderRadius: 10, padding: '10px 14px', fontSize: 13, fontWeight: 600, background: result.tone === 'success' ? 'var(--accent-green-tint)' : 'var(--accent-red-tint)', color: result.tone === 'success' ? 'var(--accent-green-text)' : 'var(--accent-red-text)' }}>
                      {result.tone === 'success'
                        ? `Sent to ${result.sent} member${result.sent !== 1 ? 's' : ''}${result.skipped ? `, ${result.skipped} skipped` : ''}${result.failed ? `, ${result.failed} failed` : ''}.`
                        : `Failed to send: ${result.message}`}
                    </div>
                  ) : null}

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                    <button
                      type="button"
                      onClick={handleSend}
                      disabled={sending || activeRecipients.length === 0 || !subject.trim()}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 7, border: 'none', background: PRIMARY, color: '#FFFFFF', borderRadius: 9, padding: '9px 18px', fontSize: 13, fontWeight: 700, cursor: sending || activeRecipients.length === 0 || !subject.trim() ? 'not-allowed' : 'pointer', opacity: sending || activeRecipients.length === 0 || !subject.trim() ? 0.6 : 1 }}
                    >
                      <Send size={14} /> {sending ? 'Sending...' : `Send to ${activeRecipients.length}`}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
