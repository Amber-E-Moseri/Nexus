import { useEffect, useRef, useState } from 'react'
import { Sparkles, X, ArrowUp, ThumbsUp, ThumbsDown, LoaderCircle, RotateCcw, Eraser, ChevronRight, FolderKanban, HelpCircle, Sun, CalendarClock, BarChart3 } from 'lucide-react'
import { askNova, askNovaOrchestrate, submitNovaFeedback } from '../lib/novaApi'
import NovaMarkdown from './NovaMarkdown'
import SourceChip from './SourceChip'
import ConfirmAction from './ConfirmAction'

function MeetingConfirmCard({ meeting, onConfirm, onCancel }) {
  const dateStr = meeting.date
    ? new Date(meeting.date).toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : null
  return (
    <div style={{
      marginTop: 8, border: '1px solid var(--border-light)',
      borderLeft: '3px solid var(--accent)', borderRadius: 8,
      overflow: 'hidden', fontSize: 12,
    }}>
      <div style={{ padding: '8px 12px', background: 'var(--surface-secondary)', borderBottom: '1px solid var(--border-light)', display: 'flex', alignItems: 'center', gap: 6 }}>
        <CalendarClock size={13} style={{ color: 'var(--accent)', flexShrink: 0 }} />
        <span style={{ fontWeight: 700, color: 'var(--text-secondary)' }}>Confirm meeting</span>
      </div>
      <div style={{ padding: '10px 12px' }}>
        <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>{meeting.title}</div>
        {dateStr && <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 10 }}>{dateStr}</div>}
        <div style={{ display: 'flex', gap: 7 }}>
          <button type="button" onClick={onConfirm} style={{
            padding: '5px 14px', borderRadius: 20, fontWeight: 700, fontSize: 11,
            background: 'var(--accent)', color: '#fff', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
          }}>Yes, prepare this</button>
          <button type="button" onClick={onCancel} style={{
            padding: '5px 14px', borderRadius: 20, fontWeight: 600, fontSize: 11,
            background: 'transparent', color: 'var(--text-secondary)',
            border: '1px solid var(--border-light)', cursor: 'pointer', fontFamily: 'inherit',
          }}>Wrong meeting</button>
        </div>
      </div>
    </div>
  )
}

const INTENT_CHIPS = [
  { intent: 'daily_brief', label: 'Daily Brief', Icon: Sun, defaultMessage: 'Give me my daily brief.' },
  { intent: 'meeting_prep', label: 'Meeting Prep', Icon: CalendarClock, defaultMessage: 'Prepare me for my next meeting.' },
  { intent: 'project_analysis', label: 'Project Analysis', Icon: FolderKanban, defaultMessage: 'Analyze my current sprint or tasks for risks.' },
  { intent: 'report', label: 'Report', Icon: BarChart3, defaultMessage: 'Generate a department overview report.' },
  { intent: 'ask', label: 'Ask Nexus', Icon: HelpCircle, defaultMessage: '' },
]

// Infer intent from message text when no chip is selected (or wrong one is).
function inferIntent(text) {
  const t = text.toLowerCase()
  if (/\b(daily brief|my day|due today|what'?s? (on )?today|today'?s tasks?|sprint today)\b/.test(t)) return 'daily_brief'
  if (/\b(prepare|prep|brief(ing)?|before (the |my )?meeting)\b/.test(t)) return 'meeting_prep'
if (/\b(report|overview|summary|recap|department (status|update))\b/.test(t)) return 'report'
  if (/\b(analyz|risk|sprint (status|health)|project (status|analysis)|bottleneck)\b/.test(t)) return 'project_analysis'
  return null
}

const RELATED_QUESTIONS = {
  sprint: [
    'What is a sprint?',
    'Can I be in more than one sprint at the same time?',
    'How do I view my sprint tasks?',
  ],
  task: [
    'How do I create a task?',
    'How do I assign a task to someone?',
    'What are task statuses?',
  ],
  calendar: [
    'How do I add an event to the ministry calendar?',
    'How do I RSVP to a calendar event?',
  ],
}

// fetch() throws a bare "Failed to fetch" TypeError for CORS blocks, DNS
// failures, and dropped connections alike — none of that is meaningful to a
// user, and showing it verbatim (as the very first shipped version did) just
// reads as broken. Map it to something a non-technical user can act on.
function friendlyErrorMessage(err) {
  if (err?.name === 'TypeError' && /fetch/i.test(err?.message ?? '')) {
    return "Couldn't reach Nova — check your connection and try again."
  }
  return err?.message || "Nova couldn't answer that — please try again."
}

const TRACK_LABELS = {
  kb: 'from the knowledge base',
  live_data: 'from your tasks',
  unanswered: null,
}

function TrackBadge({ track }) {
  const label = TRACK_LABELS[track]
  if (!label) return null
  return (
    <span className="mt-1 inline-block text-[10.5px] font-semibold uppercase tracking-[0.05em] text-[var(--text-tertiary)]">
      {label}
    </span>
  )
}

function RelatedQuestions({ question, onQuestionClick }) {
  const lowerQuestion = (question || '').toLowerCase()
  let topic = null
  if (lowerQuestion.includes('sprint')) topic = 'sprint'
  else if (lowerQuestion.includes('task')) topic = 'task'
  else if (lowerQuestion.includes('calendar') || lowerQuestion.includes('event')) topic = 'calendar'

  const suggestions = topic ? RELATED_QUESTIONS[topic] || [] : []
  if (!suggestions.length) return null

  return (
    <div className="mt-3 pt-2 border-t" style={{ borderColor: 'var(--border-light)' }}>
      <div className="text-[11px] font-semibold text-[var(--text-tertiary)] mb-2">Related:</div>
      <div className="flex flex-col gap-1.5">
        {suggestions.map((q) => (
          <button
            key={q}
            type="button"
            onClick={() => onQuestionClick(q)}
            className="flex items-center gap-1 text-left text-[11px] text-[var(--accent)] hover:underline transition-colors"
          >
            <ChevronRight size={12} />
            {q}
          </button>
        ))}
      </div>
    </div>
  )
}

function FeedbackButtons({ message, onFeedback }) {
  if (!message.logId) return null
  return (
    <div className="mt-1.5 flex items-center gap-1">
      <button
        type="button"
        aria-label="Helpful"
        onClick={() => onFeedback(message.id, 'up')}
        className="rounded-md p-1 transition-colors hover:bg-[var(--surface-secondary)]"
        style={{ color: message.feedback === 'up' ? 'var(--accent)' : 'var(--text-tertiary)' }}
      >
        <ThumbsUp size={13} />
      </button>
      <button
        type="button"
        aria-label="Not helpful"
        onClick={() => onFeedback(message.id, 'down')}
        className="rounded-md p-1 transition-colors hover:bg-[var(--surface-secondary)]"
        style={{ color: message.feedback === 'down' ? 'var(--coral)' : 'var(--text-tertiary)' }}
      >
        <ThumbsDown size={13} />
      </button>
    </div>
  )
}

function IntentChips({ selected, onSelect }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {INTENT_CHIPS.map(({ intent, label, Icon }) => {
        const active = selected === intent
        return (
          <button
            key={intent}
            type="button"
            onClick={() => onSelect(active ? null : intent)}
            className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-[11px] font-semibold transition-colors hover:scale-105"
            style={{
              background: active ? 'var(--accent)' : 'var(--surface-secondary)',
              color: active ? '#fff' : 'var(--text-secondary)',
              border: `1px solid ${active ? 'var(--accent)' : 'var(--border-light)'}`,
            }}
          >
            <Icon size={11} />
            {label}
          </button>
        )
      })}
    </div>
  )
}

function SourceRow({ sources }) {
  if (!sources?.length) return null
  return (
    <div className="mt-1.5 flex flex-wrap gap-1">
      {sources.map((source) => (
        <SourceChip key={`${source.type}-${source.id}`} source={source} />
      ))}
    </div>
  )
}

export default function NovaChat() {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [selectedIntent, setSelectedIntent] = useState(null)
  const scrollRef = useRef(null)
  const inputRef = useRef(null)
  const idCounter = useRef(0)

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [messages, open])

  // Inject greeting when panel opens for the first time
  useEffect(() => {
    if (open && messages.length === 0) {
      setMessages([{
        id: nextId(),
        role: 'nova',
        text: "Hi, I'm Nova, your Nexus assistant. Ask me how-to questions about Nexus, or what's due in your sprint today.",
        track: null,
        logId: null,
        feedback: null,
        streaming: false,
        error: false,
        showIntents: true,
      }])
    }
  }, [open])

  // Land the user straight in the input instead of making them click twice
  // (open the panel, then click the box) every time they open Nova.
  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  function nextId() {
    idCounter.current += 1
    return idCounter.current
  }

  async function sendQuestion(question, { novaMsgId, userMsgId, intent, context } = {}) {
    setSending(true)
    // If no chip is selected (or chip is 'ask'), try to infer from the message.
    const inferred = (!selectedIntent || selectedIntent === 'ask') ? inferIntent(question) : null
    const resolvedIntent = intent ?? inferred ?? selectedIntent
    // Sync the chip highlight to the inferred intent so users see what mode fired.
    if (inferred && inferred !== selectedIntent) setSelectedIntent(inferred)
    if (novaMsgId == null) {
      userMsgId = nextId()
      novaMsgId = nextId()
      setMessages((prev) => [
        ...prev,
        { id: userMsgId, role: 'user', text: question },
        { id: novaMsgId, role: 'nova', text: '', question, intent: resolvedIntent, sources: [], track: null, logId: null, feedback: null, streaming: true, error: false },
      ])
    } else {
      setMessages((prev) =>
        prev.map((m) => (m.id === novaMsgId ? { ...m, text: '', sources: [], streaming: true, error: false } : m)),
      )
    }

    try {
      if (resolvedIntent) {
        // Nova-orchestrate: JSON response, no streaming.
        const response = await askNovaOrchestrate({ intent: resolvedIntent, message: question, context })
        setMessages((prev) =>
          prev.map((m) =>
            m.id === novaMsgId
              ? { ...m, text: response.answer, sources: response.sources ?? [], proposedAction: response.proposedAction ?? null, pendingMeeting: response.metadata?.pendingMeeting ?? null, streaming: false }
              : m,
          ),
        )
      } else {
        // Legacy nova-chat: SSE streaming (KB + 2-tool path).
        await askNova(question, {
          onText: (chunk) => {
            setMessages((prev) =>
              prev.map((m) => (m.id === novaMsgId ? { ...m, text: m.text + chunk } : m)),
            )
          },
          onDone: ({ track, logId }) => {
            setMessages((prev) =>
              prev.map((m) => (m.id === novaMsgId ? { ...m, track, logId, streaming: false } : m)),
            )
          },
        })
      }
    } catch (err) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === novaMsgId ? { ...m, text: friendlyErrorMessage(err), error: true, streaming: false } : m,
        ),
      )
    } finally {
      setSending(false)
    }
  }

  async function handleSend() {
    const question = input.trim()
    if (sending) return
    // For intent chips that have a default message (e.g. daily_brief), allow
    // sending with an empty input by using the chip's default.
    const chipDefault = selectedIntent
      ? (INTENT_CHIPS.find((c) => c.intent === selectedIntent)?.defaultMessage ?? '')
      : ''
    const effectiveQuestion = question || chipDefault
    if (!effectiveQuestion) return
    setInput('')
    await sendQuestion(effectiveQuestion)
  }

  function handleRetry(message) {
    if (sending) return
    sendQuestion(message.question, { novaMsgId: message.id })
  }

  function handleNewChat() {
    setMessages([])
    setInput('')
    inputRef.current?.focus()
  }

  async function handleFeedback(messageId, feedback) {
    const message = messages.find((m) => m.id === messageId)
    if (!message?.logId) return
    setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, feedback } : m)))
    try {
      await submitNovaFeedback(message.logId, feedback)
    } catch {
      // Non-critical — the UI already reflects the click; a failed write just
      // means it won't show up in the admin review queue this time.
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? 'Close Nova' : 'Ask Nova'}
        className="fixed bottom-5 right-5 flex h-12 w-12 items-center justify-center rounded-full shadow-[var(--shadow-lg)] transition-transform hover:scale-105"
        style={{ background: 'var(--accent)', color: '#fff', zIndex: 'var(--z-chat-widget)' }}
      >
        {open ? <X size={20} /> : <Sparkles size={20} />}
      </button>

      {open ? (
        <div
          className="fixed bottom-[76px] right-5 flex h-[450px] w-[340px] max-w-[calc(100vw-40px)] max-h-[calc(100vh-96px)] flex-col overflow-hidden rounded-[16px] border shadow-[var(--shadow-lg)]"
          style={{ background: 'var(--surface)', borderColor: 'var(--border)', zIndex: 'var(--z-chat-widget)' }}
        >
          <div
            className="flex items-center gap-2 border-b px-4 py-3"
            style={{ borderColor: 'var(--border-light)', background: 'var(--surface-secondary)' }}
          >
            <Sparkles size={16} style={{ color: 'var(--accent)' }} />
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-bold text-[var(--text-primary)]">Nova</div>
              <div className="truncate text-[10.5px] text-[var(--text-secondary)]">
                Ask how-to questions, or "what's due today in my sprint"
              </div>
            </div>
            {messages.length > 0 ? (
              <button
                type="button"
                onClick={handleNewChat}
                aria-label="Start a new conversation"
                title="New chat"
                className="flex shrink-0 items-center gap-1 rounded-[8px] px-2 py-1 text-[10.5px] font-semibold text-[var(--text-tertiary)] transition-colors hover:bg-[var(--surface-tertiary)] hover:text-[var(--text-primary)]"
              >
                <Eraser size={12} />
                New
              </button>
            ) : null}
          </div>

          <div
            className="border-b px-4 py-2"
            style={{ borderColor: 'var(--border-light)', background: 'var(--surface)' }}
          >
            <IntentChips selected={selectedIntent} onSelect={setSelectedIntent} />
          </div>

          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
            {messages.map((m) =>
              m.role === 'user' ? (
                <div key={m.id} className="flex justify-end">
                  <div
                    className="max-w-[85%] rounded-[12px] rounded-br-[4px] px-3 py-2 text-[12.5px]"
                    style={{ background: 'var(--accent)', color: '#fff' }}
                  >
                    {m.text}
                  </div>
                </div>
              ) : (
                <div key={m.id} className="flex flex-col items-start">
                  <div
                    className="max-w-[92%] rounded-[12px] rounded-bl-[4px] px-3 py-2"
                    style={{
                      background: m.error ? 'var(--coral-light)' : 'var(--surface-secondary)',
                      color: m.error ? 'var(--coral)' : 'var(--text-primary)',
                    }}
                  >
                    {m.error ? (
                      <span className="text-[12.5px]">{m.text}</span>
                    ) : m.text ? (
                      <NovaMarkdown text={m.text} />
                    ) : m.streaming ? (
                      <LoaderCircle size={13} className="animate-spin" style={{ color: 'var(--text-tertiary)' }} />
                    ) : null}
                  </div>
                  {m.error ? (
                    <button
                      type="button"
                      onClick={() => handleRetry(m)}
                      disabled={sending}
                      className="ml-1 mt-1 flex items-center gap-1 text-[11px] font-semibold transition-colors disabled:opacity-50"
                      style={{ color: 'var(--accent)' }}
                    >
                      <RotateCcw size={11} />
                      Retry
                    </button>
                  ) : null}
                  {!m.streaming && !m.error ? (
                    <div className="ml-1 flex items-center gap-2">
                      <TrackBadge track={m.track} />
                    </div>
                  ) : null}
                  {!m.streaming && !m.error && m.sources?.length > 0 ? (
                    <div className="ml-1 mt-1">
                      <SourceRow sources={m.sources} />
                    </div>
                  ) : null}
                  {!m.streaming && !m.error && m.question && !m.intent ? (
                    <div className="ml-1 mt-2">
                      <RelatedQuestions question={m.question} onQuestionClick={sendQuestion} />
                    </div>
                  ) : null}
                  {!m.streaming && !m.error ? (
                    <FeedbackButtons message={m} onFeedback={handleFeedback} />
                  ) : null}
                  {!m.streaming && !m.error && m.pendingMeeting ? (
                    <div className="ml-1 mt-1" style={{ maxWidth: '92%', width: '100%' }}>
                      <MeetingConfirmCard
                        meeting={m.pendingMeeting}
                        onConfirm={() => {
                          setMessages((prev) => prev.map((msg) => msg.id === m.id ? { ...msg, pendingMeeting: null } : msg))
                          sendQuestion(`Prepare meeting: ${m.pendingMeeting.title}`, {
                            intent: 'meeting_prep',
                            context: { meetingId: m.pendingMeeting.id, confirmed: true },
                          })
                        }}
                        onCancel={() => {
                          setMessages((prev) => prev.map((msg) => msg.id === m.id ? { ...msg, pendingMeeting: null } : msg))
                        }}
                      />
                    </div>
                  ) : null}
                  {!m.streaming && !m.error && m.proposedAction ? (
                    <div className="ml-1 mt-2" style={{ maxWidth: '92%', width: '100%' }}>
                      <ConfirmAction
                        proposal={m.proposedAction}
                        onComplete={(r) => {
                          if (r.success) {
                            setMessages((prev) =>
                              prev.map((msg) => msg.id === m.id ? { ...msg, proposedAction: null } : msg),
                            )
                          }
                        }}
                      />
                    </div>
                  ) : null}
                </div>
              ),
            )}
          </div>

          <div className="border-t p-3" style={{ borderColor: 'var(--border-light)' }}>
            <div
              className="flex items-end gap-2 rounded-[10px] border px-2.5 py-2"
              style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
            >
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={selectedIntent === 'daily_brief' ? 'Press send for your daily brief...' : selectedIntent === 'project_analysis' ? 'Or ask about a specific sprint...' : 'Ask Nova...'}
                rows={1}
                disabled={sending}
                className="max-h-24 flex-1 resize-none bg-transparent text-[12.5px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-tertiary)]"
              />
              <button
                type="button"
                onClick={handleSend}
                disabled={sending || (!input.trim() && !(selectedIntent && INTENT_CHIPS.find((c) => c.intent === selectedIntent)?.defaultMessage))}
                aria-label="Send"
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-opacity disabled:opacity-40"
                style={{ background: 'var(--accent)', color: '#fff' }}
              >
                {sending ? <LoaderCircle size={13} className="animate-spin" /> : <ArrowUp size={14} />}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
