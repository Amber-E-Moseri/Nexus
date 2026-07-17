import { useState, useRef, useEffect } from 'react'
import { supabase } from '../../../lib/supabase'

// ─── Helpers (exported for reuse) ────────────────────────────────────────────

export function addDays(n) {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return d
}
export function toISO(d) {
  return d.toISOString().slice(0, 10)
}
export function nextWeekday(targetDay) {
  const d = new Date()
  const diff = (targetDay - d.getDay() + 7) % 7 || 7
  d.setDate(d.getDate() + diff)
  return d
}
export function shortMonth(d) {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export const PRIORITY_COLORS = {
  urgent: '#EF4444',
  high:   '#F59E0B',
  medium: '#3B82F6',
  low:    '#9CA3AF',
}
export const PRIORITY_OPTIONS = [
  { value: 'urgent', label: 'Urgent', color: '#EF4444' },
  { value: 'high',   label: 'High',   color: '#F59E0B' },
  { value: 'medium', label: 'Normal', color: '#3B82F6' },
  { value: 'low',    label: 'Low',    color: '#9CA3AF' },
  { value: null,     label: 'Clear',  color: '#9CA3AF' },
]

// ─── Shared primitives ───────────────────────────────────────────────────────

export function FlagIcon({ color, size = 11 }) {
  return (
    <svg width={size} height={Math.round(size * 13 / 11)} viewBox="0 0 11 13" fill="none">
      <path d="M1 1v11M1 1.5h8.5L7 5l2.5 3.5H1" stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function Avatar({ name, size = 22, bg }) {
  const initials = (name ?? '').split(' ').slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('')
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: bg ?? 'var(--accent)', color: '#FFF',
      fontSize: Math.round(size * 0.4), fontWeight: 700,
      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    }}>
      {initials || '?'}
    </div>
  )
}

export function useOutsideClick(ref, cb) {
  useEffect(() => {
    function handler(e) {
      if (ref.current && !ref.current.contains(e.target)) cb()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [ref, cb])
}

// ─── Mini Calendar ───────────────────────────────────────────────────────────

export function MiniCalendar({ selected, onSelect }) {
  const today = new Date()
  const [year, setYear] = useState(selected ? new Date(selected + 'T00:00').getFullYear() : today.getFullYear())
  const [month, setMonth] = useState(selected ? new Date(selected + 'T00:00').getMonth() : today.getMonth())

  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const todayISO = toISO(today)
  const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']
  const cells = []
  for (let i = 0; i < firstDay; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)

  function nav(dir) {
    let m = month + dir, y = year
    if (m < 0) { m = 11; y-- }
    if (m > 11) { m = 0; y++ }
    setMonth(m); setYear(y)
  }

  const btnBase = { width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, cursor: 'pointer', border: 'none', background: 'transparent' }

  return (
    <div style={{ width: 220 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontWeight: 700, fontSize: 13 }}>{MONTHS[month]} {year}</span>
        <div style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
          <button onClick={() => { setMonth(today.getMonth()); setYear(today.getFullYear()) }} style={{ ...btnBase, fontSize: 11, color: 'var(--accent)', fontWeight: 600, width: 'auto', padding: '0 6px' }}>Today</button>
          <button onClick={() => nav(-1)} style={{ ...btnBase, color: 'var(--text-secondary)', fontSize: 14 }}>‹</button>
          <button onClick={() => nav(1)}  style={{ ...btnBase, color: 'var(--text-secondary)', fontSize: 14 }}>›</button>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 1, marginBottom: 2 }}>
        {['Su','Mo','Tu','We','Th','Fr','Sa'].map((d) => (
          <div key={d} style={{ textAlign: 'center', fontSize: 10, color: 'var(--text-tertiary)', fontWeight: 600, padding: '2px 0' }}>{d}</div>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 1 }}>
        {cells.map((day, i) => {
          if (!day) return <div key={`e${i}`} />
          const iso = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
          const isToday = iso === todayISO
          const isSelected = iso === selected
          return (
            <button key={iso} onClick={() => onSelect(iso)} style={{ ...btnBase, margin: '1px auto', color: isSelected ? '#FFF' : isToday ? 'var(--accent)' : 'var(--text-primary)', background: isSelected ? 'var(--accent)' : isToday ? 'rgba(76,42,146,0.08)' : 'transparent', fontWeight: isToday || isSelected ? 700 : 400 }}>
              {day}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ─── Recurring Panel ─────────────────────────────────────────────────────────

const RECUR_FREQ = ['Daily', 'Weekly', 'Monthly', 'Yearly', 'Custom']
const RECUR_TRIGGER = [
  { value: 'on_complete', label: 'On complete' },
  { value: 'on_due_date', label: 'On due date' },
  { value: 'on_schedule', label: 'On a schedule' },
]
const RECUR_STATUS = ['TO DO', 'IN PROGRESS', 'REVIEW', 'BLOCKED']

export function RecurringPanel({ initial = {}, onSave, onCancel }) {
  const [freq, setFreq] = useState(initial.frequency ?? 'Weekly')
  const [trigger, setTrigger] = useState(initial.trigger ?? 'on_complete')
  const [createNew, setCreateNew] = useState(initial.create_new_task ?? false)
  const [recurForever, setRecurForever] = useState(initial.recur_forever ?? true)
  const [updateStatus, setUpdateStatus] = useState(initial.update_status_to !== undefined && initial.update_status_to !== null)
  const [statusTo, setStatusTo] = useState(initial.update_status_to ?? 'TO DO')
  const [syncDue, setSyncDue] = useState(initial.sync_to_due_date ?? false)

  const selectStyle = { width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid #D5CCBE', fontSize: 12.5, color: 'var(--text-primary)', background: '#FFF', cursor: 'pointer', outline: 'none' }

  return (
    <div style={{ width: 220, borderRight: '1px solid #F0EBE3', padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>Recurring</span>
        <span style={{ fontSize: 16, color: 'var(--text-tertiary)', cursor: 'pointer', lineHeight: 1 }}>···</span>
      </div>
      <select value={freq} onChange={(e) => setFreq(e.target.value)} style={selectStyle}>
        {RECUR_FREQ.map((f) => <option key={f}>{f}</option>)}
      </select>
      <select value={trigger} onChange={(e) => setTrigger(e.target.value)} style={selectStyle}>
        {RECUR_TRIGGER.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
      </select>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, cursor: 'pointer', color: 'var(--text-primary)' }}>
        <input type="checkbox" checked={createNew} onChange={(e) => setCreateNew(e.target.checked)} style={{ accentColor: 'var(--accent)', cursor: 'pointer' }} />
        Create new task
      </label>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, cursor: 'pointer', color: 'var(--text-primary)' }}>
        <input type="checkbox" checked={recurForever} onChange={(e) => setRecurForever(e.target.checked)} style={{ accentColor: 'var(--accent)', cursor: 'pointer' }} />
        Recur forever
      </label>
      <div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, cursor: 'pointer', color: 'var(--text-primary)', marginBottom: 6 }}>
          <input type="checkbox" checked={updateStatus} onChange={(e) => setUpdateStatus(e.target.checked)} style={{ accentColor: 'var(--accent)', cursor: 'pointer' }} />
          Update status to:
        </label>
        {updateStatus && (
          <select value={statusTo} onChange={(e) => setStatusTo(e.target.value)} style={{ ...selectStyle, fontSize: 11.5 }}>
            {RECUR_STATUS.map((s) => <option key={s}>{s}</option>)}
          </select>
        )}
      </div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, cursor: 'pointer', color: 'var(--text-primary)', lineHeight: 1.3 }}>
        <input type="checkbox" checked={syncDue} onChange={(e) => setSyncDue(e.target.checked)} style={{ accentColor: 'var(--accent)', cursor: 'pointer', flexShrink: 0 }} />
        Sync recurrence to due date
      </label>
      <div style={{ display: 'flex', gap: 6, marginTop: 2 }}>
        <button onClick={onCancel} style={{ flex: 1, padding: '6px 0', borderRadius: 6, background: '#F5F0E8', color: 'var(--text-secondary)', border: 'none', fontSize: 12, cursor: 'pointer' }}>Cancel</button>
        <button
          onClick={() => onSave({ frequency: freq, trigger, create_new_task: createNew, recur_forever: recurForever, update_status_to: updateStatus ? statusTo : null, sync_to_due_date: syncDue })}
          style={{ flex: 1, padding: '6px 0', borderRadius: 6, background: 'var(--accent)', color: '#FFF', border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
        >Save</button>
      </div>
    </div>
  )
}

// ─── Due Date Picker Popover ─────────────────────────────────────────────────

/**
 * Props:
 *   taskId         – if provided, saves directly to DB on pick
 *   initialDate    – 'YYYY-MM-DD' string or ''
 *   initialTime    – 'HH:MM' string or ''
 *   initialRecurrence – object or null
 *   onSave(payload) – called with { due_date, due_time, recurrence? }
 *   onClose()
 */
export function DueDatePickerPopover({ taskId, initialDate, initialTime, initialRecurrence, onSave, onClose }) {
  const ref = useRef(null)
  const [date, setDate] = useState(initialDate ?? '')
  const [time, setTime] = useState(initialTime ?? '')
  const [showTime, setShowTime] = useState(!!initialTime)
  const [showRecurring, setShowRecurring] = useState(false)
  useOutsideClick(ref, onClose)

  const today = new Date()
  const thisWeekend = nextWeekday(6)
  const nextMon = nextWeekday(1)
  const nextWeekend = (() => { const d = new Date(nextMon); d.setDate(d.getDate() + 5); return d })()

  const shortcuts = [
    { label: 'Today',        date: toISO(today),       right: today.toLocaleDateString('en-US', { weekday: 'short' }) },
    { label: 'Tomorrow',     date: toISO(addDays(1)),  right: addDays(1).toLocaleDateString('en-US', { weekday: 'short' }) },
    { label: 'This weekend', date: toISO(thisWeekend), right: thisWeekend.toLocaleDateString('en-US', { weekday: 'short' }) },
    { label: 'Next week',    date: toISO(nextMon),     right: nextMon.toLocaleDateString('en-US', { weekday: 'short' }) },
    { label: 'Next weekend', date: toISO(nextWeekend), right: shortMonth(nextWeekend) },
    { label: '2 weeks',      date: toISO(addDays(14)), right: shortMonth(addDays(14)) },
    { label: '4 weeks',      date: toISO(addDays(28)), right: shortMonth(addDays(28)) },
  ]

  async function persist(payload) {
    if (taskId) {
      await supabase.from('tasks').update(payload).eq('id', taskId)
    }
    onSave(payload)
    onClose()
  }

  function pick(d, t) {
    persist({ due_date: d || null, due_time: (d && t) ? t : null })
  }

  function handleRecurringSave(recurrence) {
    persist({ due_date: date || null, due_time: (date && time) ? time : null, recurrence })
  }

  return (
    <div ref={ref} onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}
      style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, background: '#FFFFFF', border: '1px solid #E8E0D2', borderRadius: 12, boxShadow: '0 8px 30px rgba(28,22,16,0.14)', zIndex: 1000, display: 'flex', overflow: 'hidden', minWidth: 420 }}
    >
      {showRecurring ? (
        <RecurringPanel initial={initialRecurrence ?? {}} onSave={handleRecurringSave} onCancel={() => setShowRecurring(false)} />
      ) : (
        <div style={{ width: 190, borderRight: '1px solid #F0EBE3', padding: '8px 0', display: 'flex', flexDirection: 'column' }}>
          {shortcuts.map((s) => (
            <button key={s.label} onClick={() => { setDate(s.date); pick(s.date, time) }}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '7px 14px', background: date === s.date ? '#F5F0EA' : 'transparent', border: 'none', cursor: 'pointer', fontSize: 12.5, color: date === s.date ? 'var(--accent)' : 'var(--text-primary)', fontWeight: date === s.date ? 600 : 400, textAlign: 'left' }}
              onMouseEnter={(e) => { e.currentTarget.style.background = '#F9F7F3' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = date === s.date ? '#F5F0EA' : 'transparent' }}
            >
              <span>{s.label}</span>
              <span style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>{s.right}</span>
            </button>
          ))}
          <div style={{ borderTop: '1px solid #F0EBE3', marginTop: 4, paddingTop: 4 }}>
            <button onClick={() => setShowRecurring(true)}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '7px 14px', background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 12.5, color: initialRecurrence ? 'var(--accent)' : 'var(--text-secondary)', textAlign: 'left' }}
              onMouseEnter={(e) => { e.currentTarget.style.background = '#F9F7F3' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
            >
              <span>Set Recurring</span>
              <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>›</span>
            </button>
            <button onClick={() => pick('', '')}
              style={{ display: 'flex', alignItems: 'center', width: '100%', padding: '7px 14px', background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 12.5, color: 'var(--text-tertiary)', textAlign: 'left' }}
              onMouseEnter={(e) => { e.currentTarget.style.background = '#F9F7F3' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
            >
              Clear date
            </button>
          </div>
        </div>
      )}

      <div style={{ padding: 14 }}>
        <div style={{ display: 'flex', gap: 6, marginBottom: 10, alignItems: 'center' }}>
          <div style={{ flex: 1, padding: '5px 10px', borderRadius: 6, border: '1.5px solid var(--accent)', fontSize: 12, color: date ? 'var(--text-primary)' : 'var(--text-tertiary)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0, color: 'var(--accent)' }}>
              <rect x="1" y="3" width="14" height="12" rx="2" stroke="currentColor" strokeWidth="1.5" fill="none"/>
              <path d="M5 1v4M11 1v4M1 7h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
            {date ? new Date(date + 'T00:00').toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: '2-digit' }) : 'Due date'}
            {date && <button onClick={() => pick('', '')} style={{ marginLeft: 'auto', border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', fontSize: 14, lineHeight: 1, padding: 0 }}>×</button>}
          </div>
          {showTime ? (
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} onBlur={() => date && pick(date, time)} style={{ padding: '5px 8px', borderRadius: 6, border: '1px solid #D5CCBE', fontSize: 12, width: 90 }} />
          ) : (
            <button onClick={() => setShowTime(true)} style={{ fontSize: 11.5, color: 'var(--text-tertiary)', background: 'none', border: '1px solid #E0D8CC', borderRadius: 6, padding: '5px 8px', cursor: 'pointer', whiteSpace: 'nowrap' }}>Add time</button>
          )}
        </div>
        <MiniCalendar selected={date} onSelect={(d) => { setDate(d); pick(d, time) }} />
      </div>
    </div>
  )
}

// ─── Priority Picker Popover ─────────────────────────────────────────────────

export function PriorityPickerPopover({ current, onSelect, onClose }) {
  const ref = useRef(null)
  useOutsideClick(ref, onClose)
  return (
    <div ref={ref} onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}
      style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, background: '#FFFFFF', border: '1px solid #E8E0D2', borderRadius: 10, boxShadow: '0 8px 24px rgba(28,22,16,0.12)', zIndex: 1000, minWidth: 150, padding: '6px 0' }}
    >
      {PRIORITY_OPTIONS.map((p) => (
        <button key={p.value ?? 'clear'} onClick={() => { onSelect(p.value); onClose() }}
          style={{ display: 'flex', alignItems: 'center', gap: 9, width: '100%', padding: '7px 14px', background: current === p.value ? '#F5F0EA' : 'transparent', border: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--text-primary)', textAlign: 'left', fontWeight: current === p.value ? 600 : 400 }}
          onMouseEnter={(e) => { e.currentTarget.style.background = '#F9F7F3' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = current === p.value ? '#F5F0EA' : 'transparent' }}
        >
          {p.value ? (
            <svg width="13" height="15" viewBox="0 0 11 13" fill={p.color}>
              <path d="M1 1v11M1 1.5h8.5L7 5l2.5 3.5H1" stroke={p.color} strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          ) : (
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
              <circle cx="7" cy="7" r="6" stroke="#9CA3AF" strokeWidth="1.5"/>
              <line x1="3" y1="11" x2="11" y2="3" stroke="#9CA3AF" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          )}
          {p.label}
        </button>
      ))}
    </div>
  )
}

// ─── Assignee Picker Popover ─────────────────────────────────────────────────

function MemberRow({ member, selected, isMe, onToggle }) {
  const name = member.full_name ?? member.name ?? '?'
  const initials = name.split(' ').slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('')
  return (
    <button onClick={() => onToggle(member.id)}
      style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '6px 12px', background: selected ? '#F5F0EA' : 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left' }}
      onMouseEnter={(e) => { e.currentTarget.style.background = '#F9F7F3' }}
      onMouseLeave={(e) => { e.currentTarget.style.background = selected ? '#F5F0EA' : 'transparent' }}
    >
      <div style={{ width: 26, height: 26, borderRadius: '50%', background: isMe ? '#E91E8C' : 'var(--accent)', color: '#FFF', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        {initials.slice(0, 2)}
      </div>
      <span style={{ fontSize: 13, color: 'var(--text-primary)', flex: 1 }}>{name}</span>
      {selected && (
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <circle cx="7" cy="7" r="6" fill="var(--accent)"/>
          <path d="M4 7l2 2 4-4" stroke="#FFF" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      )}
    </button>
  )
}

function OtherMemberRow({ member }) {
  const name = member.full_name ?? member.name ?? '?'
  const initials = name.split(' ').slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('')
  return (
    <div
      title="Outside your department — mention or follow them on the task instead of assigning directly"
      style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '6px 12px', opacity: 0.5, cursor: 'default' }}
    >
      <div style={{ width: 26, height: 26, borderRadius: '50%', background: '#B0A696', color: '#FFF', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        {initials.slice(0, 2)}
      </div>
      <span style={{ fontSize: 13, color: 'var(--text-secondary)', flex: 1 }}>{name}</span>
    </div>
  )
}

// members = directly assignable pool (department, or org-wide for canAssignOrgWide
// roles). otherMembers, when passed, renders a separate "Others" section — org-wide,
// visible for search/context but not directly assignable via this control for scoped
// roles (assignment stays department-scoped; cross-department involvement goes through
// @mention/watch instead — see TaskComments.jsx).
export function AssigneePickerPopover({ currentIds = [], members = [], otherMembers = [], profile, onToggle, onClose }) {
  const ref = useRef(null)
  const [query, setQuery] = useState('')
  useOutsideClick(ref, onClose)

  const meId = profile?.id
  const filtered = members.filter((m) => !query || (m.full_name ?? m.name ?? '').toLowerCase().includes(query.toLowerCase()))
  const filteredOthers = otherMembers.filter((m) => !query || (m.full_name ?? m.name ?? '').toLowerCase().includes(query.toLowerCase()))

  return (
    <div ref={ref} onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}
      style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, background: '#FFFFFF', border: '1px solid #E8E0D2', borderRadius: 10, boxShadow: '0 8px 24px rgba(28,22,16,0.12)', zIndex: 1000, width: 240, overflow: 'hidden' }}
    >
      <div style={{ padding: '8px 10px', borderBottom: '1px solid #F0EBE3' }}>
        <input autoFocus placeholder="Search or enter email…" value={query} onChange={(e) => setQuery(e.target.value)}
          style={{ width: '100%', padding: '5px 8px', borderRadius: 6, border: '1px solid #D5CCBE', fontSize: 12, outline: 'none', boxSizing: 'border-box' }} />
      </div>
      <div style={{ maxHeight: 260, overflowY: 'auto', padding: '6px 0' }}>
        {currentIds.length > 0 && (
          <>
            <div style={{ padding: '2px 12px 4px', fontSize: 10, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Assignees</div>
            {members.filter((m) => currentIds.includes(m.id)).map((m) => (
              <MemberRow key={m.id} member={m} selected={true} isMe={m.id === meId} onToggle={onToggle} />
            ))}
          </>
        )}
        <div style={{ padding: '6px 12px 4px', fontSize: 10, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          {currentIds.length > 0 ? 'Members' : 'Assignees'}
        </div>
        {meId && !currentIds.includes(meId) && (
          <MemberRow member={{ id: meId, full_name: 'Me (' + (profile?.full_name ?? profile?.name ?? 'Me') + ')' }} selected={false} isMe={true} onToggle={() => onToggle(meId)} />
        )}
        {filtered.filter((m) => !currentIds.includes(m.id) && m.id !== meId).map((m) => (
          <MemberRow key={m.id} member={m} selected={false} isMe={false} onToggle={onToggle} />
        ))}
        {filteredOthers.length > 0 && (
          <>
            <div style={{ padding: '10px 12px 4px', fontSize: 10, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Others</div>
            {filteredOthers.filter((m) => !currentIds.includes(m.id) && m.id !== meId).map((m) => (
              <OtherMemberRow key={m.id} member={m} />
            ))}
          </>
        )}
      </div>
    </div>
  )
}
