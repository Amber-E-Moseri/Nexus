import { LoaderCircle, Search } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSearch } from '../../context/SearchContext'
import { formatDueDate } from '../../lib/dateUtils'
import { getTaskById } from '../../features/tasks'
import { supabase } from '../../lib/supabase'
import TaskModal from '../../features/tasks/components/TaskModal'

function ResultRow({ result, active, onClick }) {
  const [hov, setHov] = useState(false)
  const type = result.type
  const item = result.item

  let title = ''
  let subtitle = ''
  let icon = ''

  if (type === 'task') {
    icon = 'T'
    title = item.title
    subtitle = `${item.priority ?? 'medium'} priority${item.due_date ? ` · due ${formatDueDate(item.due_date).label}` : ''}`
  } else if (type === 'space') {
    icon = 'S'
    title = item.name
    subtitle = `Space${item.color ? ` · #${item.color}` : ''}`
  } else if (type === 'sprint') {
    icon = 'SP'
    title = item.name
    subtitle = item.status ?? 'active'
  } else {
    icon = 'E'
    title = item.title
    subtitle = `${item.event_type ?? 'event'}${item.start_date ? ` · ${new Date(item.start_date).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })}` : ''}`
  }

  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: 'flex', width: '100%', alignItems: 'flex-start', gap: 12,
        padding: '10px 20px', border: 'none', textAlign: 'left', cursor: 'pointer',
        background: active ? '#EDE8F8' : hov ? '#F4F1EA' : 'transparent',
        transition: 'background .1s',
      }}
    >
      <span style={{
        marginTop: 2, minWidth: 22, fontSize: 10, fontWeight: 700,
        textTransform: 'uppercase', color: '#7A6F5E', letterSpacing: '0.06em',
      }}>
        {icon}
      </span>
      <span style={{ minWidth: 0, flex: 1 }}>
        <span style={{ display: 'block', fontSize: 14, fontWeight: 500, color: '#1C1610', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {title}
        </span>
        <span style={{ display: 'block', fontSize: 12, color: '#7A6F5E', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {subtitle}
        </span>
      </span>
    </button>
  )
}

function Section({ title, children }) {
  if (!children?.length) return null
  return (
    <div style={{ borderTop: '1px solid #EDE8DC' }}>
      <div style={{ padding: '8px 20px 4px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#B0A696' }}>
        {title}
      </div>
      {children}
    </div>
  )
}

export default function SearchModal() {
  const { isSearchOpen, closeSearch } = useSearch()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState({ tasks: [], spaces: [], sprints: [], events: [] })
  const [loading, setLoading] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const [taskModal, setTaskModal] = useState(null)
  const inputRef = useRef(null)
  const requestRef = useRef(0)

  useEffect(() => {
    if (isSearchOpen) {
      setQuery('')
      setResults({ tasks: [], spaces: [], sprints: [], events: [] })
      setActiveIndex(0)
      setTimeout(() => inputRef.current?.focus(), 30)
    }
  }, [isSearchOpen])

  useEffect(() => {
    const trimmed = query.trim()
    if (!trimmed) {
      setResults({ tasks: [], spaces: [], sprints: [], events: [] })
      setLoading(false)
      setActiveIndex(0)
      return undefined
    }

    const id = ++requestRef.current
    const pattern = `%${trimmed}%`
    setLoading(true)

    const timer = setTimeout(() => {
      Promise.all([
        supabase.from('tasks').select('id, title, status, priority, department_id, sprint_id, due_date').ilike('title', pattern).eq('is_personal', false).limit(5),
        supabase.from('departments').select('id, name, color').ilike('name', pattern).limit(3),
        supabase.from('sprints').select('id, name, status').ilike('name', pattern).neq('status', 'archived').limit(3),
        supabase.from('calendar_events').select('id, title, start_date, event_type').ilike('title', pattern).is('deleted_at', null).limit(3),
      ]).then(([t, s, sp, e]) => {
        if (requestRef.current !== id) return
        setResults({
          tasks: t.error ? [] : (t.data ?? []),
          spaces: s.error ? [] : (s.data ?? []),
          sprints: sp.error ? [] : (sp.data ?? []),
          events: e.error ? [] : (e.data ?? []),
        })
        setActiveIndex(0)
      }).finally(() => {
        if (requestRef.current === id) setLoading(false)
      })
    }, 300)

    return () => clearTimeout(timer)
  }, [query])

  const flat = useMemo(() => ([
    ...results.tasks.map((item) => ({ type: 'task', item })),
    ...results.spaces.map((item) => ({ type: 'space', item })),
    ...results.sprints.map((item) => ({ type: 'sprint', item })),
    ...results.events.map((item) => ({ type: 'event', item })),
  ]), [results])

  async function selectResult(result) {
    if (!result) return
    if (result.type === 'task') {
      const task = await getTaskById(result.item.id)
      setTaskModal(task)
      return
    }
    if (result.type === 'space') navigate(`/spaces/${result.item.id}`)
    else if (result.type === 'sprint') navigate(`/sprints/${result.item.id}`)
    else if (result.type === 'event') navigate('/calendar', { state: { highlightedEventId: result.item.id } })
    closeSearch()
  }

  function handleKeyDown(e) {
    if (e.key === 'Escape') { e.preventDefault(); closeSearch(); return }
    if (flat.length === 0) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIndex((i) => (i + 1) % flat.length) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIndex((i) => (i - 1 + flat.length) % flat.length) }
    else if (e.key === 'Enter') { e.preventDefault(); selectResult(flat[activeIndex]) }
  }

  if (!isSearchOpen) return null

  let rowIdx = -1
  const hasResults = flat.length > 0
  const searched = query.trim()

  return (
    <>
      <div
        onClick={closeSearch}
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000 }}
      />
      <div
        style={{
          position: 'fixed', top: '18vh', left: '50%', transform: 'translateX(-50%)',
          width: `min(640px, 90vw)`, maxHeight: '70vh', overflowY: 'auto',
          background: '#fff', borderRadius: 12, zIndex: 1001,
          boxShadow: '0 20px 60px rgba(14,14,30,.22)',
        }}
        onKeyDown={handleKeyDown}
      >
        {/* Search input */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 20px', borderBottom: '1px solid #EDE8DC' }}>
          <Search size={18} style={{ color: '#7A6F5E', flexShrink: 0 }} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            aria-label="Search tasks, spaces, sprints, and events"
            placeholder="Search tasks, spaces, sprints, events…"
            style={{ flex: 1, border: 'none', outline: 'none', fontSize: 16, color: '#1C1610', fontFamily: 'inherit', background: 'transparent' }}
          />
          {loading ? (
            <LoaderCircle size={16} style={{ color: '#7A6F5E', flexShrink: 0, animation: 'spin 1s linear infinite' }} />
          ) : null}
        </div>

        {/* Results */}
        {hasResults ? (
          <>
            <Section title="Tasks">
              {results.tasks.map((item) => { rowIdx += 1; const ri = rowIdx; return <ResultRow key={item.id} result={{ type: 'task', item }} active={activeIndex === ri} onClick={() => selectResult({ type: 'task', item })} /> })}
            </Section>
            <Section title="Spaces">
              {results.spaces.map((item) => { rowIdx += 1; const ri = rowIdx; return <ResultRow key={item.id} result={{ type: 'space', item }} active={activeIndex === ri} onClick={() => selectResult({ type: 'space', item })} /> })}
            </Section>
            <Section title="Sprints">
              {results.sprints.map((item) => { rowIdx += 1; const ri = rowIdx; return <ResultRow key={item.id} result={{ type: 'sprint', item }} active={activeIndex === ri} onClick={() => selectResult({ type: 'sprint', item })} /> })}
            </Section>
            <Section title="Events">
              {results.events.map((item) => { rowIdx += 1; const ri = rowIdx; return <ResultRow key={item.id} result={{ type: 'event', item }} active={activeIndex === ri} onClick={() => selectResult({ type: 'event', item })} /> })}
            </Section>
          </>
        ) : searched && !loading ? (
          <div style={{ padding: '20px', fontSize: 13, color: '#7A6F5E' }}>No results for "{searched}"</div>
        ) : null}

        {/* Footer */}
        <div style={{ padding: '10px 20px', borderTop: hasResults || (searched && !loading) ? '1px solid #EDE8DC' : 'none', fontSize: 11, color: '#B0A696', display: 'flex', gap: 16 }}>
          <span><kbd style={{ fontFamily: 'monospace', background: '#F4F1EA', border: '1px solid #E9E4D8', borderRadius: 4, padding: '1px 5px' }}>ESC</kbd> to close</span>
          {flat.length > 0 ? <span><kbd style={{ fontFamily: 'monospace', background: '#F4F1EA', border: '1px solid #E9E4D8', borderRadius: 4, padding: '1px 5px' }}>↑↓</kbd> navigate · <kbd style={{ fontFamily: 'monospace', background: '#F4F1EA', border: '1px solid #E9E4D8', borderRadius: 4, padding: '1px 5px' }}>↵</kbd> open</span> : null}
        </div>
      </div>

      {taskModal ? (
        <TaskModal
          mode="edit"
          task={taskModal}
          departmentId={taskModal.department_id}
          sprintId={taskModal.sprint_id}
          onClose={() => { setTaskModal(null); closeSearch() }}
          onSaved={setTaskModal}
          onDeleted={() => { setTaskModal(null); closeSearch() }}
        />
      ) : null}
    </>
  )
}
