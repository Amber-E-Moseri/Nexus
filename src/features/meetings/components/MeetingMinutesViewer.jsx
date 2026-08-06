import { useEffect, useState, useRef } from 'react'
import { X, Download, Eye, Printer } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../../lib/supabase'
import { useToast } from '../../../context/ToastContext'
import { canViewMeetingLog } from '../lib/meetingPermissions'

// Highlights all occurrences of `query` in `text` with <mark> spans.
// Returns an array of React nodes.
function Highlight({ text, query }) {
  if (!query || !text) return text || null
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const parts = text.split(new RegExp(`(${escaped})`, 'gi'))
  return parts.map((part, i) =>
    part.toLowerCase() === query.toLowerCase()
      ? <mark key={i} style={{ background: '#FDE68A', borderRadius: 2, padding: '0 1px' }}>{part}</mark>
      : part
  )
}

// Renders a block of markdown-ish text (headings, bullets, plain) with highlights.
function NotesBlock({ text, query }) {
  if (!text?.trim()) return null
  return (
    <div style={{ fontSize: 13, lineHeight: 1.75, color: '#1C1C1C' }}>
      {text.split('\n').map((raw, i) => {
        const line = raw.trim()
        if (!line) return <div key={i} style={{ height: 8 }} />
        const isHeading = /^#{1,6}\s/.test(line)
        const isBullet = /^[•\-*]\s/.test(line)
        const cleaned = line.replace(/^#{1,6}\s*/, '').replace(/\*\*/g, '')

        if (isHeading) return (
          <div key={i} style={{ fontSize: 14, fontWeight: 800, color: '#4C2A92', marginTop: 16, marginBottom: 4 }}>
            <Highlight text={cleaned} query={query} />
          </div>
        )
        if (isBullet) return (
          <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 3 }}>
            <span style={{ color: '#4C2A92', marginTop: 2, flexShrink: 0 }}>•</span>
            <span><Highlight text={cleaned.replace(/^[•\-*]\s*/, '')} query={query} /></span>
          </div>
        )
        return (
          <p key={i} style={{ margin: '0 0 6px' }}>
            <Highlight text={cleaned} query={query} />
          </p>
        )
      })}
    </div>
  )
}

function SectionHeader({ children }) {
  return (
    <div style={{
      background: '#4C2A92',
      color: '#fff',
      fontSize: 10,
      fontWeight: 800,
      letterSpacing: '.1em',
      textTransform: 'uppercase',
      padding: '5px 12px',
      borderRadius: 4,
      marginTop: 24,
      marginBottom: 12,
    }}>
      {children}
    </div>
  )
}

export default function MeetingMinutesViewer({ meetingId, initialMeeting, searchQuery = '', onClose, currentUser = null, exportPdf = null, onViewMeetingLog = null }) {
  const navigate = useNavigate()
  const { showToast } = useToast()
  const [meeting, setMeeting] = useState(initialMeeting || null)
  const [agenda, setAgenda] = useState([])
  const [loading, setLoading] = useState(!initialMeeting)
  const [exporting, setExporting] = useState(false)
  const overlayRef = useRef(null)

  const authorized = canViewMeetingLog({ user: currentUser, meeting })

  async function handleInternalExport() {
    if (!meeting) return
    setExporting(true)
    try {
      const { generateMinutesPDF, generateMinutesPDFFilename } = await import('../../../lib/meetings/pdfGeneration')
      const splitLines = (text) => (text || '').split('\n').map((l) => l.replace(/^[•\-*]\s*/, '').trim()).filter(Boolean)
      const notesPlainText = meeting.notes_text || meeting.minutes || ''
      const blob = await generateMinutesPDF({
        summary: meeting.meeting_notes || notesPlainText,
        decisions: splitLines(meeting.decisions || ''),
        nextSteps: splitLines(meeting.next_steps || ''),
        detailedNotes: notesPlainText,
        actionItems: meeting.extraction_result?.action_items ?? [],
        openItems: meeting.extraction_result?.open_items ?? [],
        agenda: [],
        attendees: (meeting.meeting_attendance || []).map((a) => ({
          name: a.attendee?.name || 'Unknown',
          status: a.status || 'present',
        })),
      }, meeting)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = generateMinutesPDFFilename(meeting)
      a.click()
      URL.revokeObjectURL(url)
      showToast('Minutes PDF downloaded', { tone: 'success' })
    } catch (err) {
      showToast(`PDF export failed: ${err.message}`, { tone: 'error' })
    } finally {
      setExporting(false)
    }
  }

  const handleExport = exportPdf ?? handleInternalExport

  useEffect(() => {
    if (!meetingId) return
    let cancelled = false
    setLoading(true)

    Promise.all([
      supabase
        .from('meetings')
        .select('*, meeting_attendance(status, attendee:users(id, name))')
        .eq('id', meetingId)
        .single(),
      supabase
        .from('agendas')
        .select('agenda_items(title, mins, sort_order)')
        .eq('meeting_id', meetingId)
        .maybeSingle(),
    ]).then(([mtgRes, agendaRes]) => {
      if (cancelled) return
      if (mtgRes.data) setMeeting(mtgRes.data)
      const items = agendaRes.data?.agenda_items ?? []
      setAgenda(items.slice().sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)))
      setLoading(false)
    })

    return () => { cancelled = true }
  }, [meetingId])

  // Close on Escape
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  // Add print styles to hide action buttons
  useEffect(() => {
    const style = document.createElement('style')
    style.textContent = `
      @media print {
        /* Hide the action buttons when printing */
        [data-minutes-actions] {
          display: none !important;
        }
      }
    `
    document.head.appendChild(style)
    return () => style.remove()
  }, [])

  const q = searchQuery.trim()

  const dateStr = meeting?.date
    ? new Date(meeting.date).toLocaleDateString('en-CA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
    : ''
  const timeStr = meeting?.date
    ? new Date(meeting.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : ''
  const typeLabel = (meeting?.meeting_type || 'General').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())

  const attendance = meeting?.meeting_attendance ?? []
  const present = attendance.filter(a => a.status === 'present')
  const absent = attendance.filter(a => a.status !== 'present')

  const extraction = meeting?.extraction_result ?? {}
  const decisions = extraction.decisions ?? []
  const actionItems = extraction.action_items ?? []
  const openItems = extraction.open_items ?? []
  const notesText = meeting?.notes_text || meeting?.minutes || ''
  const summaryText = meeting?.summary || ''

  return (
    <div
      ref={overlayRef}
      onClick={(e) => { if (e.target === overlayRef.current) onClose() }}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(14, 10, 28, 0.65)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        padding: '32px 16px 32px',
        overflowY: 'auto',
      }}
    >
      <div style={{
        width: '100%', maxWidth: 780,
        background: '#FAFAF8',
        borderRadius: 12,
        boxShadow: '0 24px 64px rgba(0,0,0,.35)',
        overflow: 'hidden',
        position: 'relative',
        marginBottom: 32,
      }}>

        {/* Action buttons header */}
        <div data-minutes-actions style={{
          position: 'absolute', top: 14, right: 14, zIndex: 10,
          display: 'flex', gap: 8, alignItems: 'center',
        }}>
          {/* Print */}
          <button
            onClick={() => window.print()}
            title="Print minutes"
            style={{
              width: 30, height: 30, borderRadius: '50%',
              border: 'none', background: 'rgba(255,255,255,.15)',
              color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', transition: 'background .2s',
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,.25)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,255,255,.15)'}
          >
            <Printer size={14} strokeWidth={2.5} />
          </button>

          {/* Download PDF */}
          {meeting && (
            <button
              onClick={handleExport}
              disabled={exporting}
              title="Download PDF"
              style={{
                width: 30, height: 30, borderRadius: '50%',
                border: 'none', background: 'rgba(255,255,255,.15)',
                color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: exporting ? 'wait' : 'pointer', transition: 'background .2s',
                opacity: exporting ? 0.6 : 1,
              }}
              onMouseEnter={(e) => !exporting && (e.currentTarget.style.background = 'rgba(255,255,255,.25)')}
              onMouseLeave={(e) => !exporting && (e.currentTarget.style.background = 'rgba(255,255,255,.15)')}
            >
              <Download size={14} strokeWidth={2.5} />
            </button>
          )}

          {/* View Meeting Log (authorized only) */}
          {authorized && (
            <button
              onClick={() => {
                onClose()
                if (onViewMeetingLog) {
                  onViewMeetingLog()
                } else if (meetingId) {
                  navigate(`/meetings/${meetingId}`)
                }
              }}
              title="View full meeting log"
              style={{
                height: 30, paddingX: 10, paddingLeft: 10, paddingRight: 10,
                borderRadius: 999,
                border: 'none', background: 'rgba(255,255,255,.25)',
                color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                gap: 6,
                cursor: 'pointer', transition: 'background .2s',
                fontSize: 12, fontWeight: 600,
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,.35)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,255,255,.25)'}
            >
              <Eye size={14} strokeWidth={2.5} />
              <span style={{ fontSize: 11 }}>Log</span>
            </button>
          )}

          {/* Close */}
          <button
            onClick={onClose}
            title="Close"
            style={{
              width: 30, height: 30, borderRadius: '50%',
              border: 'none', background: 'rgba(255,255,255,.15)',
              color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', transition: 'background .2s',
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,.25)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,255,255,.15)'}
          >
            <X size={16} strokeWidth={2.5} />
          </button>
        </div>

        {loading && !meeting ? (
          <div style={{ padding: '80px 0', textAlign: 'center', color: '#7A6F5E', fontSize: 13 }}>
            Loading minutes…
          </div>
        ) : meeting ? (
          <>
            {/* ── HEADER ── */}
            <div style={{
              background: 'linear-gradient(100deg, #4C2A92 60%, #1E0E3E)',
              padding: '28px 28px 22px',
            }}>
              <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '.1em', color: 'rgba(200,185,240,.7)', textTransform: 'uppercase', marginBottom: 8 }}>
                CONFIDENTIAL — BLW CAN NEXUS
              </div>
              <div style={{ fontSize: 22, fontWeight: 900, color: '#fff', lineHeight: 1.25, marginBottom: 8 }}>
                <Highlight text={meeting.title} query={q} />
              </div>
              <div style={{ fontSize: 12, color: 'rgba(220,210,245,.75)', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <span>{dateStr}</span>
                {timeStr && <span>· {timeStr}</span>}
                <span>· {typeLabel} meeting</span>
              </div>
            </div>

            {/* ── BODY ── */}
            <div style={{ padding: '0 28px 36px' }}>

              {/* Attendance */}
              {attendance.length > 0 && (
                <>
                  <SectionHeader>Attendance</SectionHeader>
                  {present.length > 0 && (
                    <div style={{ marginBottom: 10 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#2D8653', marginBottom: 6 }}>
                        Present ({present.length})
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {present.map((a, i) => {
                          const name = a.attendee?.name || '?'
                          return (
                            <span key={i} style={{ padding: '3px 10px', borderRadius: 999, background: '#ECF9F1', color: '#2D8653', fontSize: 12, fontWeight: 600 }}>
                              <Highlight text={name} query={q} />
                            </span>
                          )
                        })}
                      </div>
                    </div>
                  )}
                  {absent.length > 0 && (
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#C94830', marginBottom: 6 }}>
                        Absent ({absent.length})
                      </div>
                      <div style={{ fontSize: 12, color: '#7A6F5E' }}>
                        {absent.map(a => a.attendee?.name || '?').join('  ·  ')}
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* Agenda */}
              {agenda.length > 0 && (
                <>
                  <SectionHeader>Agenda</SectionHeader>
                  <ol style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {agenda.map((item, i) => (
                      <li key={i} style={{ fontSize: 13, color: '#1C1C1C' }}>
                        <span style={{ fontWeight: 600 }}><Highlight text={item.title} query={q} /></span>
                        {item.mins && <span style={{ color: '#7A6F5E', fontSize: 11, marginLeft: 8 }}>{item.mins} min</span>}
                      </li>
                    ))}
                  </ol>
                </>
              )}

              {/* Minutes / Discussion */}
              {notesText.trim() && (
                <>
                  <SectionHeader>Meeting Minutes</SectionHeader>
                  <NotesBlock text={notesText} query={q} />
                </>
              )}

              {/* Summary (only if no rich notes) */}
              {!notesText.trim() && summaryText.trim() && (
                <>
                  <SectionHeader>Summary / Transcript</SectionHeader>
                  <NotesBlock text={summaryText.substring(0, 3000)} query={q} />
                </>
              )}

              {/* Decisions */}
              {decisions.length > 0 && (
                <>
                  <SectionHeader>Decisions Made</SectionHeader>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {decisions.map((d, i) => (
                      <div key={i} style={{ background: '#F3EDFD', border: '1px solid rgba(76,42,146,.15)', borderRadius: 6, padding: '10px 14px', fontSize: 13 }}>
                        <span style={{ fontWeight: 800, color: '#4C2A92', marginRight: 10 }}>{i + 1}.</span>
                        <Highlight text={typeof d === 'string' ? d : d.text || d.decision || ''} query={q} />
                      </div>
                    ))}
                  </div>
                </>
              )}

              {/* Action Items */}
              {actionItems.length > 0 && (
                <>
                  <SectionHeader>Action Items ({actionItems.length})</SectionHeader>
                  <div style={{ border: '1px solid #E5DDD0', borderRadius: 8, overflow: 'hidden' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', background: '#1E0E3E', padding: '8px 14px', gap: 16 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: '#fff', letterSpacing: '.08em' }}>ACTION</div>
                      <div style={{ fontSize: 10, fontWeight: 700, color: '#fff', letterSpacing: '.08em', width: 110 }}>OWNER</div>
                      <div style={{ fontSize: 10, fontWeight: 700, color: '#fff', letterSpacing: '.08em', width: 80 }}>DUE</div>
                    </div>
                    {actionItems.map((item, i) => (
                      <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', padding: '9px 14px', gap: 16, background: i % 2 === 0 ? '#FAFAF8' : '#fff', borderTop: '1px solid #E5DDD0' }}>
                        <div style={{ fontSize: 13, color: '#1C1C1C', borderLeft: '2px solid #4C2A92', paddingLeft: 10 }}>
                          <Highlight text={item.title || item.action || ''} query={q} />
                        </div>
                        <div style={{ fontSize: 12, color: '#7A6F5E', width: 110 }}>
                          <Highlight text={item.owner || 'TBD'} query={q} />
                        </div>
                        <div style={{ fontSize: 12, color: '#7A6F5E', width: 80 }}>
                          {item.due_date
                            ? new Date(item.due_date + 'T00:00:00').toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })
                            : '—'}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {/* Open Items */}
              {openItems.length > 0 && (
                <>
                  <SectionHeader>Open Items</SectionHeader>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {openItems.map((item, i) => {
                      const typeMap = {
                        exploration: { bg: '#F3EDFD', color: '#4C2A92', label: 'Explore' },
                        decision_point: { bg: '#FFF8E6', color: '#B47814', label: 'Decision Needed' },
                        blocker: { bg: '#FEF0ED', color: '#C94830', label: 'Blocker' },
                        future_consideration: { bg: '#ECF9F1', color: '#2D8653', label: 'Follow Up' },
                      }
                      const style = typeMap[item.item_type] || typeMap.exploration
                      return (
                        <div key={i} style={{ background: style.bg, borderRadius: 6, padding: '10px 14px', fontSize: 13 }}>
                          <span style={{ fontSize: 10, fontWeight: 700, color: style.color, textTransform: 'uppercase', letterSpacing: '.06em', marginRight: 10 }}>
                            {style.label}
                          </span>
                          <Highlight text={item.item_text || ''} query={q} />
                        </div>
                      )
                    })}
                  </div>
                </>
              )}

              {/* Empty state */}
              {!notesText.trim() && !summaryText.trim() && decisions.length === 0 && actionItems.length === 0 && (
                <div style={{ padding: '48px 0', textAlign: 'center', color: '#7A6F5E', fontSize: 13 }}>
                  No notes recorded for this meeting.
                </div>
              )}
            </div>
          </>
        ) : (
          <div style={{ padding: '80px 0', textAlign: 'center', color: '#C4383A', fontSize: 13 }}>
            Failed to load meeting.
          </div>
        )}
      </div>
    </div>
  )
}
