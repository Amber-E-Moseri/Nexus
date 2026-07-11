import { AnimatePresence, motion } from 'framer-motion'
import { Bell, Check, Circle, Trash2, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { formatRelativeDate } from '../lib/dateUtils'
import { getTaskById } from '../features/tasks/lib/tasks'
import { formatNotificationMessage, NOTIFICATION_TYPES } from '../features/notifications/lib/notifications'
import { supabase } from '../lib/supabase'
import TaskModal from '../features/tasks/components/TaskModal'
import { useAuth } from '../hooks/useAuth'
import { FONT_BODY, FONT_HEADING, FONT_MONO } from '../lib/fonts'

const FILTERS = ['All', 'Unread']

const listStagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.045, delayChildren: 0.04 } },
}

const rowEnter = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 420, damping: 34 } },
}

function groupByRecency(items) {
  const startOfToday = new Date()
  startOfToday.setHours(0, 0, 0, 0)
  const today = items.filter((item) => new Date(item.created_at) >= startOfToday)
  const earlier = items.filter((item) => new Date(item.created_at) < startOfToday)
  return [
    { label: 'Today', items: today },
    { label: 'Earlier', items: earlier },
  ].filter((group) => group.items.length > 0)
}

function GroupHeader({ children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '18px 0 8px' }}>
      <span
        style={{
          fontFamily: FONT_HEADING,
          fontSize: 11.5,
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
          color: 'var(--ink-3)',
          flexShrink: 0,
        }}
      >
        {children}
      </span>
      <span style={{ flex: 1, height: 1, background: 'var(--border-1)' }} />
    </div>
  )
}

function typeIcon(type) {
  const def = NOTIFICATION_TYPES[type]
  if (!def) return '🔔'
  return def.icon
}

function InboxRow({ item, isSelected, isLast, onOpen, onMarkRead, onMarkUnread, onDelete }) {
  const [hovered, setHovered] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <motion.div
      variants={rowEnter}
      role="button"
      tabIndex={0}
      onClick={() => onOpen(item)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(item) } }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); setMenuOpen(false) }}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '12px 14px',
        cursor: 'pointer',
        background: isSelected
          ? 'var(--purple-tint)'
          : hovered ? 'var(--surface-sub)' : 'var(--surface-card)',
        borderBottom: isLast ? 'none' : '1px solid var(--border-1)',
        borderLeft: isSelected ? '3px solid var(--purple-700)' : '3px solid transparent',
        transition: 'background 0.13s',
        textAlign: 'left',
        position: 'relative',
      }}
    >
      {/* Unread dot */}
      <div style={{ width: 8, height: 8, flexShrink: 0 }}>
        {!item.read && (
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--purple-600)' }} />
        )}
      </div>

      {/* Icon */}
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: 10,
          flexShrink: 0,
          background: 'var(--purple-tint)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 14,
        }}
      >
        {typeIcon(item.type)}
      </div>

      <div style={{ minWidth: 0, flex: 1 }}>
        <div
          style={{
            fontFamily: FONT_BODY,
            fontSize: 13,
            fontWeight: item.read ? 500 : 600,
            color: item.read ? 'var(--ink-2)' : 'var(--ink-1)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {item.title}
        </div>
        {item.description ? (
          <div
            style={{
              marginTop: 2,
              fontFamily: FONT_BODY,
              fontSize: 12,
              color: 'var(--ink-3)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {item.description}
          </div>
        ) : null}
        <div style={{ marginTop: 3, fontFamily: FONT_MONO, fontSize: 10.5, color: 'var(--ink-3)' }}>
          {formatRelativeDate(item.created_at, { includeTime: true })}
        </div>
      </div>

      {/* Hover actions */}
      <AnimatePresence>
        {hovered && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.1 }}
            style={{ display: 'flex', gap: 4, flexShrink: 0 }}
            onClick={(e) => e.stopPropagation()}
          >
            {item.read ? (
              <button
                type="button"
                title="Mark as unread"
                onClick={(e) => { e.stopPropagation(); onMarkUnread(item) }}
                style={actionBtnStyle()}
              >
                <Circle size={13} />
              </button>
            ) : (
              <button
                type="button"
                title="Mark as read"
                onClick={(e) => { e.stopPropagation(); onMarkRead(item) }}
                style={actionBtnStyle()}
              >
                <Check size={13} />
              </button>
            )}
            <button
              type="button"
              title="Delete"
              onClick={(e) => { e.stopPropagation(); onDelete(item) }}
              style={actionBtnStyle(true)}
            >
              <Trash2 size={13} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

function actionBtnStyle(danger = false) {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 28,
    height: 28,
    borderRadius: 7,
    border: '1px solid var(--border-2)',
    background: 'var(--surface-card)',
    color: danger ? 'var(--red-500, #ef4444)' : 'var(--ink-2)',
    cursor: 'pointer',
    padding: 0,
  }
}

function DetailPanel({ item, onClose, onMarkRead, onMarkUnread, onDelete }) {
  const def = NOTIFICATION_TYPES[item.type] ?? { label: item.type, icon: '🔔' }

  return (
    <motion.div
      key={item.id}
      initial={{ opacity: 0, x: 16 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 16 }}
      transition={{ type: 'spring', stiffness: 380, damping: 34 }}
      style={{
        width: 340,
        flexShrink: 0,
        borderRadius: 16,
        border: '1px solid var(--border-1)',
        background: 'var(--surface-card)',
        padding: '20px 20px 24px',
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        alignSelf: 'flex-start',
        position: 'sticky',
        top: 80,
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 22 }}>{def.icon}</span>
          <div>
            <div style={{ fontFamily: FONT_HEADING, fontSize: 14, fontWeight: 700, color: 'var(--ink-1)' }}>
              {def.label}
            </div>
            <div style={{ fontFamily: FONT_MONO, fontSize: 11, color: 'var(--ink-3)', marginTop: 2 }}>
              {formatRelativeDate(item.created_at, { includeTime: true })}
            </div>
          </div>
        </div>
        <button type="button" onClick={onClose} style={{ ...actionBtnStyle(), border: 'none', background: 'transparent' }}>
          <X size={14} />
        </button>
      </div>

      {/* Body */}
      <div
        style={{
          fontFamily: FONT_BODY,
          fontSize: 13.5,
          color: 'var(--ink-1)',
          lineHeight: 1.6,
          background: 'var(--surface-sub)',
          borderRadius: 10,
          padding: '12px 14px',
        }}
      >
        {item.description || item.title}
      </div>

      {/* Raw payload for context (collapsed by default if long) */}
      {item.payload && Object.keys(item.payload).length > 0 && (
        <details style={{ fontFamily: FONT_MONO, fontSize: 11, color: 'var(--ink-3)' }}>
          <summary style={{ cursor: 'pointer', userSelect: 'none' }}>Payload</summary>
          <pre style={{ marginTop: 6, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
            {JSON.stringify(item.payload, null, 2)}
          </pre>
        </details>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
        {item.read ? (
          <button type="button" onClick={() => onMarkUnread(item)} style={detailActionStyle()}>
            <Circle size={14} /> Mark as unread
          </button>
        ) : (
          <button type="button" onClick={() => onMarkRead(item)} style={detailActionStyle()}>
            <Check size={14} /> Mark as read
          </button>
        )}
        <button type="button" onClick={() => onDelete(item)} style={detailActionStyle(true)}>
          <Trash2 size={14} /> Delete notification
        </button>
      </div>
    </motion.div>
  )
}

function detailActionStyle(danger = false) {
  return {
    display: 'flex',
    alignItems: 'center',
    gap: 7,
    padding: '8px 12px',
    borderRadius: 8,
    border: `1px solid ${danger ? 'var(--red-200, #fecaca)' : 'var(--border-1)'}`,
    background: danger ? 'var(--red-50, #fef2f2)' : 'var(--surface-sub)',
    color: danger ? 'var(--red-500, #ef4444)' : 'var(--ink-2)',
    fontFamily: FONT_BODY,
    fontSize: 12.5,
    fontWeight: 600,
    cursor: 'pointer',
    width: '100%',
    textAlign: 'left',
  }
}

export default function Inbox() {
  const { profile } = useAuth()
  const [filter, setFilter] = useState('All')
  const [notifications, setNotifications] = useState([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)
  const [taskModal, setTaskModal] = useState(null)

  useEffect(() => {
    if (!profile?.id) return
    let active = true

    async function loadInbox() {
      setLoading(true)
      try {
        const { data, error } = await supabase
          .from('notifications')
          .select('id, user_id, type, payload, read, created_at')
          .eq('user_id', profile.id)
          .order('created_at', { ascending: false })
          .limit(100)

        if (!active) return
        if (error) throw error

        const mapped = (data ?? []).map((n) => ({
          ...n,
          title: NOTIFICATION_TYPES[n.type]?.label ?? n.type,
          description: formatNotificationMessage(n),
        }))
        setNotifications(mapped)
      } catch (err) {
        console.error('Failed to load notifications:', err)
      } finally {
        if (active) setLoading(false)
      }
    }

    loadInbox()
    return () => { active = false }
  }, [profile?.id])

  const unreadCount = notifications.filter((n) => !n.read).length
  const filteredFeed = filter === 'Unread' ? notifications.filter((n) => !n.read) : notifications
  const groups = groupByRecency(filteredFeed)

  async function markAllRead() {
    const ids = notifications.filter((n) => !n.read).map((n) => n.id)
    if (!ids.length) return
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
    if (selected && !selected.read) setSelected((s) => ({ ...s, read: true }))
    await supabase.from('notifications').update({ read: true }).in('id', ids)
  }

  async function markItemRead(item) {
    if (item.read) return
    const updated = { ...item, read: true }
    setNotifications((prev) => prev.map((n) => n.id === item.id ? updated : n))
    if (selected?.id === item.id) setSelected(updated)
    await supabase.from('notifications').update({ read: true }).eq('id', item.id)
  }

  async function markItemUnread(item) {
    if (!item.read) return
    const updated = { ...item, read: false }
    setNotifications((prev) => prev.map((n) => n.id === item.id ? updated : n))
    if (selected?.id === item.id) setSelected(updated)
    await supabase.from('notifications').update({ read: false }).eq('id', item.id)
  }

  async function deleteItem(item) {
    setNotifications((prev) => prev.filter((n) => n.id !== item.id))
    if (selected?.id === item.id) setSelected(null)
    await supabase.from('notifications').delete().eq('id', item.id)
  }

  async function handleItemClick(item) {
    // Mark read + open detail panel
    if (!item.read) await markItemRead(item)
    else setNotifications((prev) => prev.map((n) => n.id === item.id ? { ...n, read: true } : n))
    setSelected((prev) => prev?.id === item.id ? null : { ...item, read: true })

    if (item.payload?.task_id) {
      const task = await getTaskById(item.payload.task_id)
      setTaskModal(task)
    }
  }

  return (
    <>
      <div style={{ fontFamily: FONT_BODY }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 18 }}>
          <div>
            <h1
              style={{
                fontFamily: FONT_HEADING,
                fontSize: 26,
                fontWeight: 700,
                letterSpacing: '-0.02em',
                color: 'var(--ink-1)',
                margin: 0,
              }}
            >
              Inbox
            </h1>
            <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--ink-2)' }}>
              {unreadCount} unread notification{unreadCount === 1 ? '' : 's'}
            </p>
          </div>

          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <motion.button
              type="button"
              onClick={markAllRead}
              disabled={unreadCount === 0}
              whileTap={unreadCount > 0 ? { scale: 0.96 } : undefined}
              style={{
                padding: '8px 14px',
                borderRadius: 10,
                border: '1px solid var(--border-1)',
                background: 'var(--surface-card)',
                color: 'var(--purple-700)',
                fontFamily: FONT_BODY,
                fontSize: 12.5,
                fontWeight: 600,
                cursor: unreadCount === 0 ? 'default' : 'pointer',
                opacity: unreadCount === 0 ? 0.5 : 1,
              }}
            >
              Mark all read
            </motion.button>
          </div>
        </div>

        {/* Filter pills */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          {FILTERS.map((option) => {
            const isActive = filter === option
            return (
              <button
                key={option}
                type="button"
                onClick={() => setFilter(option)}
                style={{
                  padding: '5px 14px',
                  borderRadius: 999,
                  border: `1px solid ${isActive ? 'var(--purple-700)' : 'var(--border-1)'}`,
                  background: isActive ? 'var(--purple-700)' : 'var(--surface-card)',
                  color: isActive ? '#FFFFFF' : 'var(--ink-2)',
                  fontFamily: FONT_BODY,
                  fontSize: 12.5,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {option}
              </button>
            )
          })}
        </div>

        {/* Body: list + detail panel side by side */}
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
          {/* List */}
          <div style={{ flex: 1, minWidth: 0 }}>
            {loading ? (
              <div
                style={{
                  padding: 28,
                  borderRadius: 16,
                  border: '1px solid var(--border-1)',
                  background: 'var(--surface-card)',
                  fontSize: 13,
                  color: 'var(--ink-3)',
                }}
              >
                Loading inbox…
              </div>
            ) : groups.length === 0 ? (
              <div
                style={{
                  padding: '40px 24px',
                  borderRadius: 16,
                  border: '1px dashed var(--border-2)',
                  background: 'var(--surface-card)',
                  textAlign: 'center',
                  fontSize: 13,
                  color: 'var(--ink-2)',
                }}
              >
                <Bell size={28} style={{ opacity: 0.3, marginBottom: 10 }} />
                <div>No notifications yet</div>
              </div>
            ) : (
              <motion.div variants={listStagger} initial="hidden" animate="show" key={filter}>
                {groups.map((group) => (
                  <div key={group.label}>
                    <GroupHeader>{group.label}</GroupHeader>
                    <div
                      style={{
                        borderRadius: 14,
                        border: '1px solid var(--border-1)',
                        background: 'var(--surface-card)',
                        boxShadow: '0 1px 3px rgba(28,22,16,.04)',
                        overflow: 'hidden',
                      }}
                    >
                      {group.items.map((item, index) => (
                        <InboxRow
                          key={item.id}
                          item={item}
                          isSelected={selected?.id === item.id}
                          isLast={index === group.items.length - 1}
                          onOpen={handleItemClick}
                          onMarkRead={markItemRead}
                          onMarkUnread={markItemUnread}
                          onDelete={deleteItem}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </motion.div>
            )}
          </div>

          {/* Detail panel */}
          <AnimatePresence>
            {selected && (
              <DetailPanel
                key={selected.id}
                item={selected}
                onClose={() => setSelected(null)}
                onMarkRead={markItemRead}
                onMarkUnread={markItemUnread}
                onDelete={deleteItem}
              />
            )}
          </AnimatePresence>
        </div>
      </div>

      {taskModal ? (
        <TaskModal
          mode="edit"
          task={taskModal}
          departmentId={taskModal.department_id}
          sprintId={taskModal.sprint_id}
          onClose={() => setTaskModal(null)}
          onSaved={setTaskModal}
          onDeleted={() => setTaskModal(null)}
        />
      ) : null}
    </>
  )
}
