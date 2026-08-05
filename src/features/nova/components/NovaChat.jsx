import { useEffect, useRef, useState } from 'react'
import { Sparkles, X, ArrowUp, ThumbsUp, ThumbsDown, LoaderCircle, RotateCcw, Eraser } from 'lucide-react'
import { askNova, submitNovaFeedback } from '../lib/novaApi'
import NovaMarkdown from './NovaMarkdown'

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

export default function NovaChat() {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const scrollRef = useRef(null)
  const inputRef = useRef(null)
  const idCounter = useRef(0)

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [messages, open])

  // Land the user straight in the input instead of making them click twice
  // (open the panel, then click the box) every time they open Nova.
  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  function nextId() {
    idCounter.current += 1
    return idCounter.current
  }

  async function sendQuestion(question, { novaMsgId, userMsgId } = {}) {
    setSending(true)
    if (novaMsgId == null) {
      userMsgId = nextId()
      novaMsgId = nextId()
      setMessages((prev) => [
        ...prev,
        { id: userMsgId, role: 'user', text: question },
        { id: novaMsgId, role: 'nova', text: '', question, track: null, logId: null, feedback: null, streaming: true, error: false },
      ])
    } else {
      // Retry: reuse the existing bubble instead of appending a duplicate pair.
      setMessages((prev) =>
        prev.map((m) => (m.id === novaMsgId ? { ...m, text: '', streaming: true, error: false } : m)),
      )
    }

    try {
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
    if (!question || sending) return
    setInput('')
    await sendQuestion(question)
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
        style={{ background: 'var(--accent)', color: 'var(--amber)', zIndex: 'var(--z-chat-widget)' }}
      >
        {open ? <X size={20} /> : <Sparkles size={20} />}
      </button>

      {open ? (
        <div
          className="fixed bottom-[76px] right-5 flex h-[580px] w-[380px] max-w-[calc(100vw-40px)] max-h-[calc(100vh-96px)] flex-col overflow-hidden rounded-[16px] border shadow-[var(--shadow-lg)]"
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

          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
            {messages.map((m) =>
                m.role === 'user' ? (
                  <div key={m.id} className="flex justify-end">
                    <div
                      className="max-w-[85%] rounded-[12px] rounded-br-[4px] px-3 py-2 text-[12.5px]"
                      style={{ background: 'var(--accent)', color: 'var(--amber)' }}
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
                    {!m.streaming && !m.error ? (
                      <FeedbackButtons message={m} onFeedback={handleFeedback} />
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
                placeholder="Ask Nova..."
                rows={1}
                disabled={sending}
                className="max-h-24 flex-1 resize-none bg-transparent text-[12.5px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-tertiary)]"
              />
              <button
                type="button"
                onClick={handleSend}
                disabled={sending || !input.trim()}
                aria-label="Send"
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-opacity disabled:opacity-40"
                style={{ background: 'var(--accent)', color: 'var(--amber)' }}
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
