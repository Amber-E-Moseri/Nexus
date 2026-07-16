import { useState, useEffect, useCallback } from 'react'
import { Send, Ticket, ChevronLeft, Filter } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { createNotification } from '../features/notifications/lib/notifications'
import { FONT_BODY, FONT_HEADING } from '../lib/fonts'

const CATEGORIES = [
  { value: 'support', label: 'General Support', color: '#6366f1', bg: '#eef2ff' },
  { value: 'task_request', label: 'Task Request', color: '#0891b2', bg: '#ecfeff' },
  { value: 'bug', label: 'Bug Report', color: '#dc2626', bg: '#fef2f2' },
  { value: 'feature_request', label: 'Feature Request', color: '#16a34a', bg: '#f0fdf4' },
]

const STATUSES = [
  { value: 'open', label: 'Open', color: '#d97706', bg: '#fffbeb' },
  { value: 'in_progress', label: 'In Progress', color: '#2563eb', bg: '#eff6ff' },
  { value: 'resolved', label: 'Resolved', color: '#16a34a', bg: '#f0fdf4' },
  { value: 'closed', label: 'Closed', color: '#6b7280', bg: '#f9fafb' },
]

const PRIORITIES = ['low', 'normal', 'high', 'urgent']
const PRIORITY_COLOR = { low: '#6b7280', normal: '#2563eb', high: '#d97706', urgent: '#dc2626' }

function catMeta(v) { return CATEGORIES.find((c) => c.value === v) ?? CATEGORIES[0] }
function statusMeta(v) { return STATUSES.find((s) => s.value === v) ?? STATUSES[0] }

function Badge({ label, color, bg }) {
  return (
    <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 600, color, background: bg }}>
      {label}
    </span>
  )
}

function TicketThread({ ticket, currentUserId, onUpdate }) {
  const [replies, setReplies] = useState([])
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(true)

  const loadReplies = useCallback(async () => {
    const { data } = await supabase
      .from('support_ticket_replies')
      .select('*, author:users(id, full_name, avatar_url)')
      .eq('ticket_id', ticket.id)
      .order('created_at', { ascending: true })
    setReplies(data ?? [])
    setLoading(false)
  }, [ticket.id])

  useEffect(() => {
    loadReplies()
    const ch = supabase
      .channel(`admin_ticket_replies_${ticket.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'support_ticket_replies', filter: `ticket_id=eq.${ticket.id}` }, loadReplies)
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [ticket.id, loadReplies])

  async function send() {
    if (!body.trim()) return
    setSending(true)
    await supabase.from('support_ticket_replies').insert({ ticket_id: ticket.id, author_id: currentUserId, body: body.trim() })
    // auto-move to in_progress when admin first replies and ticket is open
    if (ticket.status === 'open') {
      await supabase.from('support_tickets').update({ status: 'in_progress' }).eq('id', ticket.id)
      onUpdate()
    }
    // notify submitter (unless admin is replying to their own ticket)
    if (ticket.submitted_by !== currentUserId) {
      createNotification(ticket.submitted_by, 'support_ticket_reply', {
        title: ticket.title,
        ticket_id: ticket.id,
        link: '/support',
      }).catch(() => {})
    }
    setBody('')
    setSending(false)
  }

  async function setStatus(status) {
    await supabase.from('support_tickets').update({ status }).eq('id', ticket.id)
    onUpdate()
  }

  const allMessages = [
    { id: '__initial__', author: ticket.submitter, body: ticket.description, created_at: ticket.created_at, isInitial: true },
    ...replies,
  ]

  const sm = statusMeta(ticket.status)
  const cm = catMeta(ticket.category)

  return (
    <div>
      {/* Ticket header */}
      <div style={{ marginBottom: 20, paddingBottom: 16, borderBottom: '1px solid var(--border-1)' }}>
        <h2 style={{ fontFamily: FONT_HEADING, fontWeight: 700, fontSize: 17, color: 'var(--ink-1)', marginBottom: 8 }}>{ticket.title}</h2>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
          <Badge label={sm.label} color={sm.color} bg={sm.bg} />
          <Badge label={cm.label} color={cm.color} bg={cm.bg} />
          <span style={{ fontSize: 11, color: PRIORITY_COLOR[ticket.priority] ?? '#6b7280', fontWeight: 700, textTransform: 'uppercase' }}>
            {ticket.priority}
          </span>
          <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>
            from {ticket.submitter?.full_name ?? 'Unknown'} · {new Date(ticket.created_at).toLocaleDateString()}
          </span>
        </div>

        {/* Status actions */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {STATUSES.filter((s) => s.value !== ticket.status).map((s) => (
            <button key={s.value} type="button" onClick={() => setStatus(s.value)}
              style={{ padding: '4px 12px', borderRadius: 99, border: `1px solid ${s.color}`, background: 'transparent', color: s.color, fontFamily: FONT_BODY, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
              → {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Thread */}
      {loading ? (
        <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--ink-3)', fontSize: 13 }}>Loading…</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
          {allMessages.map((msg) => {
            const isAdmin = msg.author?.id === currentUserId
            return (
              <div key={msg.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', flexDirection: isAdmin ? 'row-reverse' : 'row' }}>
                <div style={{
                  width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                  background: isAdmin ? '#4C2A92' : '#e5e7eb',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 12, fontWeight: 700, color: isAdmin ? '#fff' : '#374151',
                  overflow: 'hidden',
                }}>
                  {msg.author?.avatar_url
                    ? <img src={msg.author.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : (msg.author?.full_name?.[0] ?? '?')}
                </div>
                <div style={{ maxWidth: '80%' }}>
                  <div style={{ fontSize: 11, color: 'var(--ink-3)', marginBottom: 3, textAlign: isAdmin ? 'right' : 'left' }}>
                    {msg.author?.full_name ?? 'Unknown'}{msg.isInitial ? ' (submitter)' : ''} · {new Date(msg.created_at).toLocaleString()}
                  </div>
                  <div style={{
                    padding: '10px 14px',
                    borderRadius: isAdmin ? '16px 4px 16px 16px' : '4px 16px 16px 16px',
                    background: isAdmin ? '#4C2A92' : '#f3f4f6',
                    color: isAdmin ? '#fff' : 'var(--ink-1)',
                    fontSize: 13.5, lineHeight: 1.55, whiteSpace: 'pre-wrap',
                  }}>
                    {msg.body}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {ticket.status !== 'closed' && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', borderTop: '1px solid var(--border-1)', paddingTop: 16 }}>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) send() }}
            placeholder="Reply to user… (Ctrl+Enter to send)"
            rows={3}
            style={{
              flex: 1, resize: 'none', padding: '10px 12px', borderRadius: 10,
              border: '1px solid var(--border-1)', fontFamily: FONT_BODY, fontSize: 13,
              color: 'var(--ink-1)', outline: 'none',
            }}
          />
          <button type="button" onClick={send} disabled={sending || !body.trim()}
            style={{
              padding: '10px 16px', borderRadius: 10, border: 'none',
              cursor: sending || !body.trim() ? 'not-allowed' : 'pointer',
              background: sending || !body.trim() ? '#e5e7eb' : '#4C2A92',
              color: sending || !body.trim() ? '#9ca3af' : '#fff',
              display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600,
            }}>
            <Send size={14} /> Reply
          </button>
        </div>
      )}
    </div>
  )
}

export default function SupportTicketsAdminPage() {
  const { user } = useAuth()
  const [tickets, setTickets] = useState([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)
  const [filterStatus, setFilterStatus] = useState('open')
  const [filterCat, setFilterCat] = useState('all')

  const loadTickets = useCallback(async () => {
    const { data } = await supabase
      .from('support_tickets')
      .select('*, submitter:users!submitted_by(id, name, avatar_url, department_id)')
      .order('created_at', { ascending: false })
    setTickets(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    loadTickets()
    const ch = supabase
      .channel('admin_support_tickets')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'support_tickets' }, loadTickets)
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [loadTickets])

  function handleUpdate() {
    loadTickets()
    // refresh selected ticket data
    if (selected) {
      setSelected((prev) => tickets.find((t) => t.id === prev?.id) ?? prev)
    }
  }

  useEffect(() => {
    if (selected) {
      const fresh = tickets.find((t) => t.id === selected.id)
      if (fresh) setSelected(fresh)
    }
  }, [tickets]) // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = tickets.filter((t) => {
    if (filterStatus !== 'all' && t.status !== filterStatus) return false
    if (filterCat !== 'all' && t.category !== filterCat) return false
    return true
  })

  const openCount = tickets.filter((t) => t.status === 'open').length

  return (
    <div style={{ display: 'flex', height: '100vh', background: 'var(--bg-app)', fontFamily: FONT_BODY, overflow: 'hidden' }}>
      {/* Left panel — ticket list */}
      <div style={{ width: 340, flexShrink: 0, borderRight: '1px solid var(--border-1)', display: 'flex', flexDirection: 'column', background: '#fff' }}>
        <div style={{ padding: '20px 18px 12px', borderBottom: '1px solid var(--border-1)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
            <h1 style={{ fontFamily: FONT_HEADING, fontWeight: 700, fontSize: 18, color: 'var(--ink-1)', letterSpacing: '-0.02em' }}>
              Support Tickets
            </h1>
            {openCount > 0 && (
              <span style={{ padding: '1px 7px', borderRadius: 99, background: '#fef2f2', color: '#dc2626', fontSize: 11, fontWeight: 700 }}>
                {openCount} open
              </span>
            )}
          </div>
          <p style={{ fontSize: 12, color: 'var(--ink-3)' }}>Requests from team members</p>
        </div>

        {/* Filters */}
        <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border-1)', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {[{ value: 'all', label: 'All' }, ...STATUSES].map((s) => (
              <button key={s.value} type="button" onClick={() => setFilterStatus(s.value)}
                style={{
                  padding: '3px 10px', borderRadius: 99, border: 'none', cursor: 'pointer', fontFamily: FONT_BODY, fontSize: 11, fontWeight: 600,
                  background: filterStatus === s.value ? '#4C2A92' : '#f3f4f6',
                  color: filterStatus === s.value ? '#fff' : 'var(--ink-2)',
                }}>
                {s.label}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            <button type="button" onClick={() => setFilterCat('all')}
              style={{ padding: '3px 10px', borderRadius: 99, border: 'none', cursor: 'pointer', fontFamily: FONT_BODY, fontSize: 11, fontWeight: 600, background: filterCat === 'all' ? '#4C2A92' : '#f3f4f6', color: filterCat === 'all' ? '#fff' : 'var(--ink-2)' }}>
              All types
            </button>
            {CATEGORIES.map((c) => (
              <button key={c.value} type="button" onClick={() => setFilterCat(c.value)}
                style={{ padding: '3px 10px', borderRadius: 99, border: 'none', cursor: 'pointer', fontFamily: FONT_BODY, fontSize: 11, fontWeight: 600, background: filterCat === c.value ? c.color : '#f3f4f6', color: filterCat === c.value ? '#fff' : 'var(--ink-2)' }}>
                {c.label}
              </button>
            ))}
          </div>
        </div>

        {/* List */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loading ? (
            <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--ink-3)', fontSize: 13 }}>Loading…</div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: '40px 20px', textAlign: 'center' }}>
              <Ticket size={28} style={{ color: 'var(--ink-3)', margin: '0 auto 8px' }} />
              <p style={{ fontSize: 13, color: 'var(--ink-3)' }}>No tickets match this filter</p>
            </div>
          ) : (
            filtered.map((t) => {
              const sm = statusMeta(t.status)
              const cm = catMeta(t.category)
              const isSelected = selected?.id === t.id
              return (
                <button key={t.id} type="button" onClick={() => setSelected(t)}
                  style={{
                    display: 'block', width: '100%', textAlign: 'left', padding: '14px 18px',
                    borderBottom: '1px solid var(--border-1)', background: isSelected ? '#f5f0ff' : 'transparent',
                    borderLeft: isSelected ? '3px solid #4C2A92' : '3px solid transparent',
                    cursor: 'pointer', fontFamily: FONT_BODY, transition: 'background 0.1s',
                  }}
                  onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = '#fafafa' }}
                  onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = 'transparent' }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                    <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-1)', margin: 0, flex: 1, paddingRight: 8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {t.title}
                    </p>
                    <span style={{ fontSize: 10, color: PRIORITY_COLOR[t.priority] ?? '#6b7280', fontWeight: 700, textTransform: 'uppercase', flexShrink: 0 }}>
                      {t.priority}
                    </span>
                  </div>
                  <p style={{ fontSize: 11.5, color: 'var(--ink-3)', margin: '0 0 6px' }}>
                    {t.submitter?.full_name ?? 'Unknown'} · {new Date(t.created_at).toLocaleDateString()}
                  </p>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <span style={{ padding: '2px 7px', borderRadius: 99, fontSize: 10, fontWeight: 600, color: sm.color, background: sm.bg }}>{sm.label}</span>
                    <span style={{ padding: '2px 7px', borderRadius: 99, fontSize: 10, fontWeight: 600, color: cm.color, background: cm.bg }}>{cm.label}</span>
                  </div>
                </button>
              )
            })
          )}
        </div>
      </div>

      {/* Right panel — thread */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '28px 32px' }}>
        {selected ? (
          <TicketThread
            key={selected.id}
            ticket={selected}
            currentUserId={user?.id}
            onUpdate={handleUpdate}
          />
        ) : (
          <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12 }}>
            <Ticket size={40} style={{ color: 'var(--ink-3)' }} />
            <p style={{ fontSize: 14, color: 'var(--ink-3)' }}>Select a ticket to view the conversation</p>
          </div>
        )}
      </div>
    </div>
  )
}
