import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { createComment, deleteComment, getTaskComments } from '../../lib/tasks'

function formatRelativeTime(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return new Date(dateStr).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })
}

export default function TaskComments({ taskId }) {
  const { profile } = useAuth()
  const [comments, setComments] = useState([])
  const [body, setBody] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const inputRef = useRef(null)

  useEffect(() => {
    let active = true

    getTaskComments(taskId)
      .then((data) => {
        if (active) setComments(data)
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [taskId])

  async function handleSubmit(event) {
    event.preventDefault()
    if (!body.trim()) return
    setSaving(true)
    try {
      const comment = await createComment(taskId, body, profile.id)
      setComments((prev) => [...prev, comment])
      setBody('')
      inputRef.current?.focus()
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(commentId) {
    await deleteComment(commentId)
    setComments((prev) => prev.filter((comment) => comment.id !== commentId))
  }

  return (
    <div>
      <div
        style={{
          fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)',
          textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10,
        }}
      >
        Comments {comments.length > 0 && `(${comments.length})`}
      </div>

      {loading ? (
        <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Loading...</div>
      ) : comments.length === 0 ? (
        <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 10 }}>
          No comments yet.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 12 }}>
          {comments.map((comment) => (
            <div key={comment.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <div
                style={{
                  width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                  background: 'var(--accent)', color: '#fff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: 600,
                }}
              >
                {comment.author?.name?.charAt(0)?.toUpperCase() ?? '?'}
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 3 }}>
                  <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-primary)' }}>
                    {comment.author?.name ?? 'Unknown'}
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                    {formatRelativeTime(comment.created_at)}
                  </span>
                  {comment.author?.id === profile?.id && (
                    <button
                      type="button"
                      onClick={() => handleDelete(comment.id)}
                      style={{
                        marginLeft: 'auto', fontSize: 11, color: 'var(--text-tertiary)',
                        background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                      }}
                    >
                      Delete
                    </button>
                  )}
                </div>
                <div
                  style={{
                    fontSize: 13, color: 'var(--text-secondary)',
                    lineHeight: 1.55, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                  }}
                >
                  {comment.body}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
        <div
          style={{
            width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
            background: 'var(--accent)', color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 11, fontWeight: 600, marginTop: 1,
          }}
        >
          {profile?.name?.charAt(0)?.toUpperCase() ?? '?'}
        </div>
        <textarea
          ref={inputRef}
          value={body}
          onChange={(event) => setBody(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) handleSubmit(event)
          }}
          placeholder="Add a comment… (Ctrl+Enter to send)"
          rows={2}
          style={{
            flex: 1, fontSize: 13, padding: '7px 10px', resize: 'vertical',
            border: '1px solid var(--border)', borderRadius: 8, outline: 'none',
            lineHeight: 1.5, color: 'var(--text-primary)', background: 'white',
          }}
          onFocus={(event) => { event.target.style.borderColor = 'var(--accent)' }}
          onBlur={(event) => { event.target.style.borderColor = 'var(--border)' }}
        />
        <button
          type="submit"
          disabled={saving || !body.trim()}
          style={{
            padding: '7px 14px', fontSize: 12, fontWeight: 500,
            borderRadius: 8, border: 'none', cursor: 'pointer',
            background: 'var(--accent)', color: '#fff',
            opacity: saving || !body.trim() ? 0.5 : 1,
            marginTop: 1,
          }}
        >
          {saving ? '…' : 'Send'}
        </button>
      </form>
    </div>
  )
}
