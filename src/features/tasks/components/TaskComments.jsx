import { useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../../../hooks/useAuth'
import { formatRelativeDate } from '../../../lib/dateUtils'
import { recordActivity } from '../../../lib/activityFeed'
import { createComment, deleteComment, getTaskComments } from '../lib/tasks'
import { createMentionNotifications } from '../../notifications'
import { supabase } from '../../../lib/supabase'

function formatRelativeTime(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return formatRelativeDate(dateStr)
}

function getMentionLabel(name = '') {
  return (name.split(' ')[0] ?? name).replace(/[^a-zA-Z0-9._-]/g, '')
}

function buildMentionMarkup(text, members) {
  const tokens = text.split(/(@[A-Za-z0-9._-]+)/g)
  if (tokens.length === 1) return text

  const lookup = new Map(members.map((member) => [`@${getMentionLabel(member.name)}`, member]))

  return tokens.map((token, index) => {
    const member = lookup.get(token)
    if (!member) return <span key={`${token}-${index}`}>{token}</span>

    return (
      <span key={`${token}-${index}`} style={{ color: 'var(--accent)', fontWeight: 600 }}>
        {token}
      </span>
    )
  })
}

function getCaretCoordinates(textarea, caretPosition) {
  const div = document.createElement('div')
  const style = window.getComputedStyle(textarea)
  const properties = [
    'boxSizing', 'width', 'height', 'overflowX', 'overflowY',
    'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
    'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
    'fontStyle', 'fontVariant', 'fontWeight', 'fontStretch', 'fontSize',
    'fontSizeAdjust', 'lineHeight', 'fontFamily', 'textAlign', 'textTransform',
    'textIndent', 'textDecoration', 'letterSpacing', 'wordSpacing',
  ]

  div.style.position = 'absolute'
  div.style.visibility = 'hidden'
  div.style.whiteSpace = 'pre-wrap'
  div.style.wordWrap = 'break-word'

  properties.forEach((prop) => {
    div.style[prop] = style[prop]
  })

  div.textContent = textarea.value.slice(0, caretPosition)
  const span = document.createElement('span')
  span.textContent = textarea.value.slice(caretPosition) || '.'
  div.appendChild(span)
  document.body.appendChild(div)

  const textareaRect = textarea.getBoundingClientRect()
  const coordinates = {
    left: textareaRect.left + span.offsetLeft - textarea.scrollLeft,
    top: textareaRect.top + span.offsetTop - textarea.scrollTop + Number.parseFloat(style.lineHeight || '20'),
  }

  document.body.removeChild(div)
  return coordinates
}

export default function TaskComments({ taskId }) {
  const { profile } = useAuth()
  const [comments, setComments] = useState([])
  const [task, setTask] = useState(null)
  const [members, setMembers] = useState([])
  const [body, setBody] = useState('')
  const [mentions, setMentions] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deleteError, setDeleteError] = useState(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerQuery, setPickerQuery] = useState('')
  const [pickerIndex, setPickerIndex] = useState(0)
  const [pickerPosition, setPickerPosition] = useState({ left: 0, top: 0 })
  const [activeMentionRange, setActiveMentionRange] = useState(null)
  const inputRef = useRef(null)

  useEffect(() => {
    let active = true

    async function load() {
      const [{ data: commentRows }, { data: taskRow }] = await Promise.all([
        getTaskComments(taskId).then((data) => ({ data })).catch(() => ({ data: [] })),
        supabase
          .from('tasks')
          .select('id, title, department_id, sprint_id, assignee_id, created_by')
          .eq('id', taskId)
          .maybeSingle(),
      ])

      if (!active) return

      setComments(commentRows ?? [])
      setTask(taskRow ?? null)

      // Load all users for @mentions (can mention anyone in any department)
      const { data: allUsers } = await supabase
        .from('users')
        .select('id, name, avatar_url, role, department_id')
        .order('name')

      if (active) {
        setMembers(allUsers ?? [])
      }

      if (active) setLoading(false)
    }

    load()

    return () => {
      active = false
    }
  }, [taskId])

  const filteredMembers = useMemo(() => {
    const value = pickerQuery.trim().toLowerCase()
    if (!value) return members
    return members.filter((member) => getMentionLabel(member.name).toLowerCase().startsWith(value))
  }, [members, pickerQuery])

  function syncMentions(nextBody) {
    setMentions((current) => current.filter((entry) => nextBody.includes(`@${entry.label}`)))
  }

  function updateMentionPicker(textarea, nextBody, caretPosition) {
    const beforeCaret = nextBody.slice(0, caretPosition)
    const match = beforeCaret.match(/(^|\s)@([A-Za-z0-9._-]*)$/)

    if (!match) {
      setPickerOpen(false)
      setActiveMentionRange(null)
      setPickerQuery('')
      return
    }

    const mentionStart = beforeCaret.lastIndexOf('@')
    setActiveMentionRange({ start: mentionStart, end: caretPosition })
    setPickerQuery(match[2] ?? '')
    setPickerIndex(0)
    setPickerPosition(getCaretCoordinates(textarea, caretPosition))
    setPickerOpen(true)
  }

  function handleBodyChange(event) {
    const nextBody = event.target.value
    const caretPosition = event.target.selectionStart ?? nextBody.length
    setBody(nextBody)
    syncMentions(nextBody)
    updateMentionPicker(event.target, nextBody, caretPosition)
  }

  function insertMention(member) {
    if (!inputRef.current || !activeMentionRange) return

    const label = getMentionLabel(member.name)
    const token = `@${label} `
    const before = body.slice(0, activeMentionRange.start)
    const after = body.slice(activeMentionRange.end)
    const nextBody = `${before}${token}${after}`

    setBody(nextBody)
    setMentions((current) => {
      const next = current.filter((entry) => entry.id !== member.id)
      return [...next, { id: member.id, label, name: member.name }]
    })
    setPickerOpen(false)
    setPickerQuery('')
    setActiveMentionRange(null)

    requestAnimationFrame(() => {
      const caret = before.length + token.length
      inputRef.current.focus()
      inputRef.current.setSelectionRange(caret, caret)
    })
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (!body.trim()) return
    setSaving(true)
    try {
      const comment = await createComment(taskId, body, profile.id, profile.id)
      const assignedUserId = mentions[0]?.id ?? null
      const assignedAt = assignedUserId ? new Date().toISOString() : null

      const { data: updatedComment, error } = await supabase
        .from('task_comments')
        .update({
          assigned_to: assignedUserId,
          assigned_at: assignedAt,
          mentions: mentions.map((entry) => entry.id),
        })
        .eq('id', comment.id)
        .select(`
          id,
          body,
          created_at,
          assigned_to,
          assigned_at,
          resolved_by,
          resolved_at,
          mentions,
          author:users!author_id(id, name, avatar_url),
          assigned_user:users!assigned_to(id, name, avatar_url, role),
          resolved_user:users!resolved_by(id, name, avatar_url)
        `)
        .single()

      if (error) throw error

      setComments((prev) => [...prev, updatedComment])

      if (assignedUserId) {
        void recordActivity('comment_assigned', {
          task_id: taskId,
          comment_id: updatedComment.id,
          assigned_to: assignedUserId,
          actor_id: profile.id,
          task_title: task?.title ?? null,
          body_preview: updatedComment.body.slice(0, 100),
        })
      }

      // Create @mention notifications
      void createMentionNotifications(
        profile.id,
        profile.name,
        body,
        taskId,
        task?.title ?? 'a task'
      )

      setBody('')
      setMentions([])
      setPickerOpen(false)
      inputRef.current?.focus()
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(commentId) {
    setDeleteError(null)
    const index = comments.findIndex((comment) => comment.id === commentId)
    const removed = comments[index]
    setComments((prev) => prev.filter((comment) => comment.id !== commentId))
    try {
      await deleteComment(commentId)
    } catch (err) {
      setComments((prev) => {
        const next = [...prev]
        next.splice(index, 0, removed)
        return next
      })
      setDeleteError(err?.message ?? 'Failed to delete comment. Please try again.')
    }
  }

  async function handleResolve(commentId) {
    const resolvedAt = new Date().toISOString()
    const resolverName = profile?.name ?? 'You'

    setComments((prev) => prev.map((comment) => (
      comment.id === commentId
        ? {
            ...comment,
            resolved_at: resolvedAt,
            resolved_by: profile.id,
            resolved_user: { id: profile.id, name: resolverName, avatar_url: profile?.avatar_url ?? null },
          }
        : comment
    )))

    const { error } = await supabase
      .from('task_comments')
      .update({ resolved_by: profile.id, resolved_at: resolvedAt })
      .eq('id', commentId)

    if (error) {
      setComments((prev) => prev.map((comment) => (
        comment.id === commentId
          ? { ...comment, resolved_at: null, resolved_by: null, resolved_user: null }
          : comment
      )))
      setDeleteError(error.message)
    }
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
          {comments.map((comment) => {
            const canResolve = !comment.resolved_at && (
              comment.assigned_to === profile?.id
              || comment.author?.id === profile?.id
              || task?.assignee_id === profile?.id
              || task?.created_by === profile?.id
            )

            return (
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
                    {buildMentionMarkup(comment.body, members)}
                  </div>

                  {comment.assigned_user && !comment.resolved_at ? (
                    <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span
                        style={{
                          borderRadius: 999,
                          background: 'var(--accent-light)',
                          color: 'var(--accent)',
                          fontSize: 11,
                          fontWeight: 600,
                          padding: '2px 8px',
                        }}
                      >
                        Assigned to {comment.assigned_user.name}
                      </span>
                      {canResolve ? (
                        <button
                          type="button"
                          onClick={() => handleResolve(comment.id)}
                          style={{
                            fontSize: 11,
                            fontWeight: 600,
                            color: 'var(--accent)',
                            border: 'none',
                            background: 'none',
                            cursor: 'pointer',
                            padding: 0,
                          }}
                        >
                          Resolve
                        </button>
                      ) : null}
                    </div>
                  ) : null}

                  {comment.resolved_at ? (
                    <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-tertiary)' }}>
                      Resolved by {comment.resolved_user?.name ?? 'Unknown'} on {formatRelativeDate(comment.resolved_at, { includeTime: true })}
                    </div>
                  ) : null}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {deleteError ? (
        <div
          style={{
            marginBottom: 10,
            padding: '8px 12px',
            background: '#FEF2F2',
            border: '1px solid #FECACA',
            borderRadius: 8,
            fontSize: 12,
            color: '#991B1B',
          }}
        >
          {deleteError}
        </div>
      ) : null}

      <form onSubmit={handleSubmit} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', position: 'relative' }}>
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
        <div style={{ flex: 1, position: 'relative' }}>
          <textarea
            ref={inputRef}
            value={body}
            onChange={handleBodyChange}
            onKeyDown={(event) => {
              if (pickerOpen && filteredMembers.length > 0) {
                if (event.key === 'ArrowDown') {
                  event.preventDefault()
                  setPickerIndex((current) => (current + 1) % filteredMembers.length)
                  return
                }
                if (event.key === 'ArrowUp') {
                  event.preventDefault()
                  setPickerIndex((current) => (current - 1 + filteredMembers.length) % filteredMembers.length)
                  return
                }
                if (event.key === 'Enter') {
                  event.preventDefault()
                  insertMention(filteredMembers[pickerIndex])
                  return
                }
                if (event.key === 'Escape') {
                  event.preventDefault()
                  setPickerOpen(false)
                  return
                }
              }

              if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) handleSubmit(event)
            }}
            placeholder="Add a comment… (Ctrl+Enter to send)"
            rows={2}
            style={{
              width: '100%',
              fontSize: 13, padding: '7px 10px', resize: 'vertical',
              border: '1px solid var(--border)', borderRadius: 8, outline: 'none',
              lineHeight: 1.5, color: 'var(--text-primary)', background: 'white',
            }}
            onFocus={(event) => { event.target.style.borderColor = 'var(--accent)' }}
            onBlur={(event) => { event.target.style.borderColor = 'var(--border)' }}
          />

          {pickerOpen && filteredMembers.length > 0 ? (
            <div
              style={{
                position: 'fixed',
                top: pickerPosition.top + 4,
                left: pickerPosition.left,
                width: 260,
                background: 'white',
                border: '1px solid var(--border)',
                borderRadius: 10,
                boxShadow: '0 10px 30px rgba(14,14,30,0.12)',
                zIndex: 80,
                overflow: 'hidden',
              }}
            >
              {filteredMembers.map((member, index) => (
                <button
                  key={member.id}
                  type="button"
                  onMouseDown={(event) => {
                    event.preventDefault()
                    insertMention(member)
                  }}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '9px 10px',
                    border: 'none',
                    background: index === pickerIndex ? 'var(--accent-light)' : 'white',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <div
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: '50%',
                      background: 'var(--accent)',
                      color: '#fff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 11,
                      fontWeight: 600,
                      flexShrink: 0,
                    }}
                  >
                    {member.name?.charAt(0)?.toUpperCase() ?? '?'}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-primary)' }}>{member.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{member.role?.replace('_', ' ') ?? 'member'}</div>
                  </div>
                </button>
              ))}
            </div>
          ) : null}
        </div>
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
