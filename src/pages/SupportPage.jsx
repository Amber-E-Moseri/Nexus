import { useState, useEffect, useCallback } from 'react'
import { Plus, Send, ChevronLeft, Ticket, Clock, CheckCircle, AlertCircle, Loader2, MessageSquare } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { createNotification } from '../features/notifications/lib/notifications'
import { FONT_BODY, FONT_HEADING } from '../lib/fonts'

async function notifySuperAdmins(type, payload) {
  const { data: admins } = await supabase
    .from('users')
    .select('id')
    .eq('role', 'super_admin')
  for (const admin of admins ?? []) {
    createNotification(admin.id, type, payload).catch(() => {})
  }
}

const CATEGORIES = [
  { value: 'support', label: 'General Support', color: '#6366f1', bg: '#eef2ff' },
  { value: 'task_request', label: 'Task Request', color: '#0891b2', bg: '#ecfeff' },
  { value: 'bug', label: 'Bug Report', color: '#dc2626', bg: '#fef2f2' },
  { value: 'feature_request', label: 'Feature Request', color: '#16a34a', bg: '#f0fdf4' },
]

const PRIORITIES = [
  { value: 'low', label: 'Low' },
  { value: 'normal', label: 'Normal' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' },
]

const STATUS_META = {
  open: { label: 'Open', color: '#d97706', bg: '#fffbeb', icon: Clock },
  in_progress: { label: 'In Progress', color: '#2563eb', bg: '#eff6ff', icon: Loader2 },
  resolved: { label: 'Resolved', color: '#16a34a', bg: '#f0fdf4', icon: CheckCircle },
  closed: { label: 'Closed', color: '#6b7280', bg: '#f9fafb', icon: CheckCircle },
}

function catMeta(value) {
  return CATEGORIES.find((c) => c.value === value) ?? CATEGORIES[0]
}

function StatusBadge({ status }) {
  const m = STATUS_META[status] ?? STATUS_META.open
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 600, color: m.color, background: m.bg }}>
      {status === 'in_progress' ? <Loader2 size={10} /> : <m.icon size={10} />}
      {m.label}
    </span>
  )
}

function CatBadge({ category }) {
  const m = catMeta(category)
  return (
    <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 600, color: m.color, background: m.bg }}>
      {m.label}
    </span>
  )
}

function TicketThread({ ticket, currentUserId, onStatusChange }) {
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
    const channel = supabase
      .channel(`ticket_replies_${ticket.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'support_ticket_replies', filter: `ticket_id=eq.${ticket.id}` }, loadReplies)
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [ticket.id, loadReplies])

  async function send() {
    if (!body.trim()) return
    setSending(true)
    await supabase.from('support_ticket_replies').insert({ ticket_id: ticket.id, author_id: currentUserId, body: body.trim() })
    setBody('')
    setSending(false)
  }

  const allMessages = [
    { id: '__initial__', author: ticket.submitter, body: ticket.description, created_at: ticket.created_at, isInitial: true },
    ...replies,
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <div style={{ flex: 1 }}>
          <h2 style={{ fontFamily: FONT_HEADING, fontWeight: 700, fontSize: 17, color: 'var(--ink-1)', marginBottom: 6 }}>{ticket.title}</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <StatusBadge status={ticket.status} />
            <CatBadge category={ticket.category} />
            <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>
              Submitted {new Date(ticket.created_at).toLocaleDateString()}
            </span>
          </div>
        </div>
      </div>

      {loading ? (
        <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--ink-3)', fontSize: 13 }}>Loading…</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
          {allMessages.map((msg) => {
            const isMe = msg.author?.id === currentUserId
            return (
              <div key={msg.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', flexDirection: isMe ? 'row-reverse' : 'row' }}>
                <div style={{
                  width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                  background: isMe ? '#4C2A92' : '#e5e7eb',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 12, fontWeight: 700, color: isMe ? '#fff' : '#374151',
                  overflow: 'hidden',
                }}>
                  {msg.author?.avatar_url
                    ? <img src={msg.author.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : (msg.author?.full_name?.[0] ?? '?')}
                </div>
                <div style={{ maxWidth: '80%' }}>
                  <div style={{ fontSize: 11, color: 'var(--ink-3)', marginBottom: 3, textAlign: isMe ? 'right' : 'left' }}>
                    {msg.isInitial ? 'You' : (msg.author?.full_name ?? 'Unknown')} · {new Date(msg.created_at).toLocaleString()}
                  </div>
                  <div style={{
                    padding: '10px 14px',
                    borderRadius: isMe ? '16px 4px 16px 16px' : '4px 16px 16px 16px',
                    background: isMe ? '#4C2A92' : '#f3f4f6',
                    color: isMe ? '#fff' : 'var(--ink-1)',
                    fontSize: 13.5,
                    lineHeight: 1.55,
                    whiteSpace: 'pre-wrap',
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
            placeholder="Reply… (Ctrl+Enter to send)"
            rows={3}
            style={{
              flex: 1, resize: 'none', padding: '10px 12px', borderRadius: 10,
              border: '1px solid var(--border-1)', fontFamily: FONT_BODY, fontSize: 13,
              color: 'var(--ink-1)', outline: 'none',
            }}
          />
          <button
            type="button"
            onClick={send}
            disabled={sending || !body.trim()}
            style={{
              padding: '10px 16px', borderRadius: 10, border: 'none', cursor: sending || !body.trim() ? 'not-allowed' : 'pointer',
              background: sending || !body.trim() ? '#e5e7eb' : '#4C2A92',
              color: sending || !body.trim() ? '#9ca3af' : '#fff',
              display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600,
            }}
          >
            <Send size={14} />
            Send
          </button>
        </div>
      )}
    </div>
  )
}

function NewTicketForm({ userId, userName, onCreated }) {
  const [form, setForm] = useState({ title: '', description: '', category: 'support', priority: 'normal' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  async function submit(e) {
    e.preventDefault()
    if (!form.title.trim() || !form.description.trim()) return
    setSaving(true)
    setError(null)
    const { error: err } = await supabase.from('support_tickets').insert({
      title: form.title.trim(),
      description: form.description.trim(),
      category: form.category,
      priority: form.priority,
      submitted_by: userId,
    })
    if (err) { setError(err.message); setSaving(false); return }
    notifySuperAdmins('support_ticket_submitted', {
      title: form.title.trim(),
      category: form.category,
      submitter_name: userName,
      link: '/admin/tickets',
    })
    onCreated()
  }

  return (
    <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 6 }}>Type of request</label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {CATEGORIES.map((c) => (
            <button
              key={c.value}
              type="button"
              onClick={() => setForm((f) => ({ ...f, category: c.value }))}
              style={{
                padding: '6px 14px', borderRadius: 99, border: '2px solid',
                borderColor: form.category === c.value ? c.color : 'transparent',
                background: form.category === c.value ? c.bg : '#f3f4f6',
                color: form.category === c.value ? c.color : 'var(--ink-2)',
                fontFamily: FONT_BODY, fontSize: 13, fontWeight: 600, cursor: 'pointer',
              }}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 6 }}>Title <span style={{ color: '#dc2626' }}>*</span></label>
        <input
          value={form.title}
          onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          placeholder="Brief summary of your request"
          required
          style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border-1)', fontFamily: FONT_BODY, fontSize: 13, color: 'var(--ink-1)', outline: 'none', boxSizing: 'border-box' }}
        />
      </div>

      <div>
        <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 6 }}>Description <span style={{ color: '#dc2626' }}>*</span></label>
        <textarea
          value={form.description}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          placeholder="Describe the issue or request in detail. Include steps to reproduce if it's a bug."
          required
          rows={5}
          style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border-1)', fontFamily: FONT_BODY, fontSize: 13, color: 'var(--ink-1)', outline: 'none', resize: 'vertical', boxSizing: 'border-box' }}
        />
      </div>

      <div>
        <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 6 }}>Priority</label>
        <select
          value={form.priority}
          onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}
          style={{ padding: '9px 12px', borderRadius: 10, border: '1px solid var(--border-1)', fontFamily: FONT_BODY, fontSize: 13, color: 'var(--ink-1)', background: '#fff', cursor: 'pointer' }}
        >
          {PRIORITIES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
        </select>
      </div>

      {error && <p style={{ fontSize: 12, color: '#dc2626' }}>{error}</p>}

      <div style={{ display: 'flex', gap: 10 }}>
        <button
          type="submit"
          disabled={saving || !form.title.trim() || !form.description.trim()}
          style={{
            padding: '10px 20px', borderRadius: 10, border: 'none',
            background: saving ? '#e5e7eb' : '#4C2A92',
            color: saving ? '#9ca3af' : '#fff',
            fontFamily: FONT_BODY, fontSize: 13, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer',
          }}
        >
          {saving ? 'Submitting…' : 'Submit Request'}
        </button>
      </div>
    </form>
  )
}

export default function SupportPage() {
  const { user, profile } = useAuth()
  const [view, setView] = useState('list') // 'list' | 'new' | 'ticket'
  const [tickets, setTickets] = useState([])
  const [selected, setSelected] = useState(null)
  const [loading, setLoading] = useState(true)

  const loadTickets = useCallback(async () => {
    const { data } = await supabase
      .from('support_tickets')
      .select('*, submitter:users!support_tickets_submitted_by_fkey(id, full_name, avatar_url)')
      .order('created_at', { ascending: false })
    setTickets(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    loadTickets()
    const channel = supabase
      .channel('my_support_tickets')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'support_tickets' }, loadTickets)
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [loadTickets])

  function openTicket(t) { setSelected(t); setView('ticket') }

  const activeTickets = tickets.filter((t) => t.status !== 'closed' && t.status !== 'resolved')
  const resolvedTickets = tickets.filter((t) => t.status === 'closed' || t.status === 'resolved')

  return (
    <div style={{ background: 'var(--bg-app)', minHeight: '100vh', fontFamily: FONT_BODY }}>
      <div style={{ maxWidth: 760, margin: '0 auto', padding: '32px 24px' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {(view === 'new' || view === 'ticket') && (
              <button type="button" onClick={() => { setView('list'); setSelected(null) }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, color: 'var(--ink-2)', fontSize: 13, padding: 0 }}>
                <ChevronLeft size={16} /> Back
              </button>
            )}
            <div>
              <h1 style={{ fontFamily: FONT_HEADING, fontWeight: 700, fontSize: 22, color: 'var(--ink-1)', letterSpacing: '-0.02em' }}>
                {view === 'new' ? 'New Request' : view === 'ticket' ? 'Request Detail' : 'Help & Support'}
              </h1>
              {view === 'list' && (
                <p style={{ fontSize: 13, color: 'var(--ink-3)', marginTop: 2 }}>
                  Submit requests, report bugs, or ask for help. Your admin will respond in-app.
                </p>
              )}
            </div>
          </div>
          {view === 'list' && (
            <button type="button" onClick={() => setView('new')}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', background: '#4C2A92', color: '#fff', border: 'none', borderRadius: 10, fontFamily: FONT_BODY, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
              <Plus size={14} /> New Request
            </button>
          )}
        </div>

        <div style={{ background: '#fff', borderRadius: 16, border: '1px solid var(--border-1)', padding: 28, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
          {view === 'new' && (
            <NewTicketForm userId={user?.id} userName={profile?.full_name ?? 'A team member'} onCreated={() => { loadTickets(); setView('list') }} />
          )}

          {view === 'ticket' && selected && (
            <TicketThread ticket={selected} currentUserId={user?.id} />
          )}

          {view === 'list' && (
            loading ? (
              <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--ink-3)', fontSize: 13 }}>Loading your requests…</div>
            ) : tickets.length === 0 ? (
              <div style={{ padding: '48px 0', textAlign: 'center' }}>
                <Ticket size={32} style={{ color: 'var(--ink-3)', margin: '0 auto 12px' }} />
                <p style={{ fontSize: 14, color: 'var(--ink-2)', fontWeight: 600 }}>No requests yet</p>
                <p style={{ fontSize: 13, color: 'var(--ink-3)', marginTop: 4 }}>
                  Have a question or need something? Submit your first request.
                </p>
                <button type="button" onClick={() => setView('new')} style={{ marginTop: 16, padding: '8px 18px', background: '#4C2A92', color: '#fff', border: 'none', borderRadius: 10, fontFamily: FONT_BODY, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                  Submit a Request
                </button>
              </div>
            ) : (
              <div>
                {activeTickets.length > 0 && (
                  <>
                    <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Active</p>
                    <TicketList tickets={activeTickets} onOpen={openTicket} />
                  </>
                )}
                {resolvedTickets.length > 0 && (
                  <div style={{ marginTop: activeTickets.length ? 24 : 0 }}>
                    <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Resolved / Closed</p>
                    <TicketList tickets={resolvedTickets} onOpen={openTicket} />
                  </div>
                )}
              </div>
            )
          )}
        </div>
      </div>
    </div>
  )
}

function TicketList({ tickets, onOpen }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {tickets.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => onOpen(t)}
          style={{
            display: 'flex', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left',
            padding: '12px 14px', borderRadius: 10, border: '1px solid transparent',
            background: 'transparent', cursor: 'pointer', fontFamily: FONT_BODY,
            transition: 'background 0.1s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-app)'; e.currentTarget.style.borderColor = 'var(--border-1)' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'transparent' }}
        >
          <AlertCircle size={16} style={{ color: catMeta(t.category).color, flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink-1)', marginBottom: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {t.title}
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <CatBadge category={t.category} />
              <StatusBadge status={t.status} />
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--ink-3)', flexShrink: 0 }}>
            <MessageSquare size={11} />
            <span>{new Date(t.updated_at).toLocaleDateString()}</span>
          </div>
        </button>
      ))}
    </div>
  )
}
