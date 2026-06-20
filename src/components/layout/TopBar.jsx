import { Bell, ChevronRight, LoaderCircle, Plus, Search } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { useInboxCount } from '../../context/InboxCountContext'
import { formatDueDate } from '../../lib/dateUtils'
import { getTaskById } from '../../lib/tasks'
import { supabase } from '../../lib/supabase'
import TaskModal from '../../modules/tasks/TaskModal'
import NotificationBell from '../../modules/notifications/NotificationBell'

const ROUTE_CRUMBS = {
  '/inbox': [['Inbox', '/inbox']],
  '/notifications': [['Notifications', '/notifications']],
  '/dashboard': [['Home', '/dashboard']],
  '/my-tasks': [['My Tasks', '/my-tasks']],
  '/calendar': [['Ministry Calendar', '/calendar']],
  '/flock': [['My Flock', '/flock']],
  '/meetings': [['Meetings', '/meetings']],
  '/spaces': [['Spaces', '/spaces']],
  '/sprints': [['Sprints', '/sprints']],
  '/automations': [['Automations', '/automations']],
  '/communications': [['Communications', '/communications']],
  '/settings': [['Settings', '/settings']],
  '/people/users': [['People', null], ['Users', '/people/users']],
  '/people/invitations': [['People', null], ['Invitations', '/people/invitations']],
  '/people/departments': [['People', null], ['Spaces', '/people/departments']],
  '/people/pastoral-assignments': [['People', null], ['Pastoral Assignments', '/people/pastoral-assignments']],
}

function useBreadcrumbs(pathname, search) {
  const [spaceName, setSpaceName] = useState('')
  const [sprintName, setSprintName] = useState('')
  const [folderName, setFolderName] = useState('')
  const [listName, setListName] = useState('')

  const params = useMemo(() => new URLSearchParams(search), [search])
  const listId = params.get('list')
  const folderId = params.get('folder')

  useEffect(() => {
    let active = true
    if (pathname.startsWith('/spaces/')) {
      const id = pathname.replace('/spaces/', '').split('/')[0]
      supabase.from('departments').select('name').eq('id', id).maybeSingle()
        .then(({ data }) => { if (active) setSpaceName(data?.name ?? 'Space') })
    } else {
      setSpaceName('')
    }
    if (pathname.startsWith('/sprints/')) {
      const id = pathname.replace('/sprints/', '').split('/')[0]
      supabase.from('sprints').select('name').eq('id', id).maybeSingle()
        .then(({ data }) => { if (active) setSprintName(data?.name ?? 'Sprint') })
    } else {
      setSprintName('')
    }
    return () => { active = false }
  }, [pathname])

  useEffect(() => {
    let active = true
    if (listId) {
      supabase.from('lists').select('name, folder_id').eq('id', listId).maybeSingle()
        .then(({ data }) => {
          if (!active) return
          setListName(data?.name ?? '')
          if (data?.folder_id) {
            supabase.from('folders').select('name').eq('id', data.folder_id).maybeSingle()
              .then(({ data: fd }) => { if (active) setFolderName(fd?.name ?? '') })
          } else {
            setFolderName('')
          }
        })
    } else if (folderId) {
      setListName('')
      supabase.from('folders').select('name').eq('id', folderId).maybeSingle()
        .then(({ data }) => { if (active) setFolderName(data?.name ?? '') })
    } else {
      setListName('')
      setFolderName('')
    }
    return () => { active = false }
  }, [listId, folderId])

  if (ROUTE_CRUMBS[pathname]) return ROUTE_CRUMBS[pathname]
  if (pathname.startsWith('/spaces/')) {
    const crumbs = [['Spaces', '/spaces'], [spaceName || 'Space', pathname]]
    if (folderName) crumbs.push([folderName, `${pathname}?folder=${folderId}`])
    if (listName) crumbs.push([listName, `${pathname}?list=${listId}`])
    return crumbs
  }
  if (pathname.startsWith('/sprints/')) return [['Sprints', '/sprints'], [sprintName || 'Sprint', pathname]]
  return [['BLW CAN NEXUS', '/dashboard']]
}

function ResultSection({ title, children }) {
  if (!children) return null

  return (
    <div className="border-t border-[var(--border-light)] first:border-t-0">
      <div className="px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-tertiary)]">
        {title}
      </div>
      <div className="pb-2">{children}</div>
    </div>
  )
}

export default function TopBar() {
  const { profile, signOut } = useAuth()
  const { inboxCount } = useInboxCount()
  const location = useLocation()
  const navigate = useNavigate()
  const crumbs = useBreadcrumbs(location.pathname, location.search)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState({ tasks: [], spaces: [], sprints: [], events: [] })
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchLoading, setSearchLoading] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const [taskModal, setTaskModal] = useState(null)
  const [showNewTaskModal, setShowNewTaskModal] = useState(false)
  const menuRef = useRef(null)
  const searchRef = useRef(null)
  const searchRequestRef = useRef(0)

  const initials = profile?.name
    ?.split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() ?? '?'

  useEffect(() => {
    function handler(event) {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setUserMenuOpen(false)
      }
      if (searchRef.current && !searchRef.current.contains(event.target)) {
        setSearchOpen(false)
      }
    }

    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  useEffect(() => {
    setSearchOpen(false)
    setQuery('')
    setResults({ tasks: [], spaces: [], sprints: [], events: [] })
    setActiveIndex(0)
  }, [location.pathname])

  useEffect(() => {
    const trimmed = query.trim()
    if (!trimmed) {
      setResults({ tasks: [], spaces: [], sprints: [], events: [] })
      setSearchLoading(false)
      setActiveIndex(0)
      return undefined
    }

    const timeoutId = setTimeout(() => {
      const requestId = searchRequestRef.current + 1
      searchRequestRef.current = requestId
      const pattern = `%${trimmed}%`
      setSearchLoading(true)

      Promise.all([
        supabase
          .from('tasks')
          .select('id, title, status, priority, department_id, sprint_id, due_date')
          .ilike('title', pattern)
          .eq('is_personal', false)
          .limit(5),
        supabase
          .from('departments')
          .select('id, name, color')
          .ilike('name', pattern)
          .limit(3),
        supabase
          .from('sprints')
          .select('id, name, status')
          .ilike('name', pattern)
          .neq('status', 'archived')  // SELECTOR FILTER: archived sprints excluded — users should not assign tasks to archived sprints
          .limit(3),
        supabase
          .from('calendar_events')
          .select('id, title, start_date, event_type')
          .ilike('title', pattern)
          .limit(3),
      ])
        .then(([tasksResult, spacesResult, sprintsResult, eventsResult]) => {
          if (searchRequestRef.current !== requestId) return
          setResults({
            tasks: tasksResult.error ? [] : (tasksResult.data ?? []),
            spaces: spacesResult.error ? [] : (spacesResult.data ?? []),
            sprints: sprintsResult.error ? [] : (sprintsResult.data ?? []),
            events: eventsResult.error ? [] : (eventsResult.data ?? []),
          })
          setSearchOpen(true)
          setActiveIndex(0)
        })
        .finally(() => {
          if (searchRequestRef.current === requestId) setSearchLoading(false)
        })
    }, 300)

    return () => clearTimeout(timeoutId)
  }, [query])

  const flatResults = useMemo(() => ([
    ...results.tasks.map((item) => ({ type: 'task', item })),
    ...results.spaces.map((item) => ({ type: 'space', item })),
    ...results.sprints.map((item) => ({ type: 'sprint', item })),
    ...results.events.map((item) => ({ type: 'event', item })),
  ]), [results])

  async function openTask(taskId) {
    const task = await getTaskById(taskId)
    setTaskModal(task)
    setSearchOpen(false)
  }

  async function handleResultSelect(result) {
    if (!result) return

    if (result.type === 'task') {
      await openTask(result.item.id)
      return
    }

    if (result.type === 'space') {
      navigate(`/spaces/${result.item.id}`)
      return
    }

    if (result.type === 'sprint') {
      navigate(`/sprints/${result.item.id}`)
      return
    }

    if (result.type === 'event') {
      navigate('/calendar', { state: { highlightedEventId: result.item.id } })
    }
  }

  function handleSearchKeyDown(event) {
    if (!searchOpen || flatResults.length === 0) {
      if (event.key === 'Escape') setSearchOpen(false)
      return
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveIndex((current) => (current + 1) % flatResults.length)
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex((current) => (current - 1 + flatResults.length) % flatResults.length)
    }

    if (event.key === 'Enter') {
      event.preventDefault()
      handleResultSelect(flatResults[activeIndex])
    }

    if (event.key === 'Escape') {
      event.preventDefault()
      setSearchOpen(false)
    }
  }

  function renderRow(result, index, title, subtitle) {
    return (
      <button
        key={`${result.type}-${result.item.id}`}
        type="button"
        onClick={() => handleResultSelect(result)}
        className={[
          'flex w-full items-start gap-3 px-3 py-2 text-left transition-colors',
          activeIndex === index ? 'bg-[var(--accent-light)]' : 'hover:bg-[var(--surface-secondary)]',
        ].join(' ')}
      >
        <span className="mt-0.5 text-xs font-semibold uppercase text-[var(--text-tertiary)]">
          {result.type === 'task' ? 'T' : result.type === 'space' ? 'S' : result.type === 'sprint' ? 'SP' : 'E'}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-[var(--text-primary)]">{title}</span>
          <span className="mt-0.5 block truncate text-xs text-[var(--text-secondary)]">{subtitle}</span>
        </span>
      </button>
    )
  }

  let rowIndex = -1
  const hasResults = flatResults.length > 0

  return (
    <>
      <header
        className="sticky top-0 z-10"
        style={{
          background: 'var(--topbar-bg)',
          borderBottom: '1px solid var(--topbar-border)',
        }}
      >
        <div className="flex h-[52px] items-center justify-between gap-4 px-5">
          <nav className="flex min-w-0 items-center gap-1 text-[12.5px]" aria-label="Breadcrumb">
            <span
              className="cursor-pointer font-semibold text-[var(--text-tertiary)] transition-colors hover:text-[var(--accent)]"
              onClick={() => navigate('/dashboard')}
            >
              BLW CAN NEXUS
            </span>
            {crumbs.map(([label, to], index) => (
              <span key={index} className="flex items-center gap-1">
                <ChevronRight size={12} className="text-[var(--text-tertiary)]" />
                {to && index < crumbs.length - 1 ? (
                  <span
                    className="cursor-pointer text-[var(--text-secondary)] transition-colors hover:text-[var(--accent)]"
                    onClick={() => navigate(to)}
                  >
                    {label}
                  </span>
                ) : (
                  <span className="font-semibold text-[var(--text-primary)]">{label}</span>
                )}
              </span>
            ))}
          </nav>

          <div className="mx-4 hidden max-w-xs flex-1 justify-center lg:flex">
            <div className="relative w-full" ref={searchRef}>
              <div
                className="flex w-full items-center gap-2 rounded-[10px] border bg-white px-3 py-1.5 text-[12.5px] text-[var(--text-secondary)] transition hover:border-[var(--accent)] hover:shadow-sm"
                style={{ borderColor: 'var(--border)' }}
              >
                <Search size={14} className="shrink-0 text-[var(--text-tertiary)]" />
                <input
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value)
                    setSearchOpen(true)
                  }}
                  onFocus={() => {
                    if (query.trim()) setSearchOpen(true)
                  }}
                  onKeyDown={handleSearchKeyDown}
                  placeholder="Search"
                  className="w-full bg-transparent text-[var(--text-primary)] outline-none placeholder:text-[var(--text-secondary)]"
                />
                {searchLoading ? <LoaderCircle size={14} className="shrink-0 animate-spin text-[var(--text-tertiary)]" /> : null}
                <kbd
                  className="rounded border px-1 py-0.5 font-mono text-[10px] text-[var(--text-tertiary)]"
                  style={{ borderColor: 'var(--border-light)', background: 'var(--surface-secondary)' }}
                >
                  Ctrl+K
                </kbd>
              </div>

              {searchOpen ? (
                <div
                  className="absolute left-0 right-0 top-[calc(100%+8px)] z-50 overflow-hidden rounded-[14px] border bg-white shadow-[var(--shadow-lg)]"
                  style={{ borderColor: 'var(--border)' }}
                >
                  {hasResults ? (
                    <>
                      <ResultSection title="Tasks">
                        {results.tasks.map((item) => {
                          rowIndex += 1
                          return renderRow(
                            { type: 'task', item },
                            rowIndex,
                            item.title,
                            `${item.priority ?? 'medium'} priority${item.due_date ? ` · due ${formatDueDate(item.due_date).label}` : ''}`,
                          )
                        })}
                      </ResultSection>

                      <ResultSection title="Spaces">
                        {results.spaces.map((item) => {
                          rowIndex += 1
                          return renderRow(
                            { type: 'space', item },
                            rowIndex,
                            item.name,
                            `Space${item.color ? ` · #${item.color}` : ''}`,
                          )
                        })}
                      </ResultSection>

                      <ResultSection title="Sprints">
                        {results.sprints.map((item) => {
                          rowIndex += 1
                          return renderRow(
                            { type: 'sprint', item },
                            rowIndex,
                            item.name,
                            item.status ?? 'active',
                          )
                        })}
                      </ResultSection>

                      <ResultSection title="Events">
                        {results.events.map((item) => {
                          rowIndex += 1
                          return renderRow(
                            { type: 'event', item },
                            rowIndex,
                            item.title,
                            `${item.event_type ?? 'event'}${item.start_date ? ` · ${new Date(item.start_date).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })}` : ''}`,
                          )
                        })}
                      </ResultSection>
                    </>
                  ) : query.trim() && !searchLoading ? (
                    <div className="px-4 py-5 text-sm text-[var(--text-secondary)]">
                      No results for "{query.trim()}"
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              className="hidden items-center gap-1.5 rounded-[8px] px-3 py-1.5 text-[12px] font-bold text-white transition sm:flex"
              style={{ background: 'var(--amber)' }}
              onClick={() => setShowNewTaskModal(true)}
            >
              <Plus size={14} />
              New Task
            </button>

            <NotificationBell />

            <button
              type="button"
              onClick={() => navigate('/inbox')}
              className="relative rounded-xl border border-[var(--border)] bg-[var(--surface-tertiary)] p-2 text-[var(--text-tertiary)] transition hover:text-[var(--text-primary)]"
              aria-label="Inbox"
            >
              <Bell size={16} />
              {inboxCount > 0 ? (
                <span
                  className="absolute -right-1 -top-1 rounded-full bg-[#C94830] px-1.5 py-0.5 text-[10px] font-bold text-white"
                >
                  {inboxCount}
                </span>
              ) : null}
            </button>

            <div className="relative" ref={menuRef}>
              <button
                type="button"
                onClick={() => setUserMenuOpen((value) => !value)}
                className="flex items-center gap-2 rounded-[10px] border px-2 py-1 transition hover:shadow-sm"
                style={{ borderColor: 'var(--border)', background: 'var(--surface-secondary)' }}
              >
                <div
                  className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full text-[10px] font-bold"
                  style={{ background: 'var(--accent)', color: 'var(--amber)' }}
                >
                  {initials}
                </div>
                <span className="hidden max-w-[100px] truncate text-[12px] font-semibold text-[var(--text-primary)] sm:block">
                  {profile?.name?.split(' ')[0]}
                </span>
              </button>

              {userMenuOpen ? (
                <div
                  className="absolute right-0 top-[calc(100%+6px)] z-50 w-[200px] overflow-hidden rounded-[12px] border"
                  style={{ background: 'var(--surface)', borderColor: 'var(--border)', boxShadow: 'var(--shadow-lg)' }}
                >
                  <div className="border-b px-3 py-2.5" style={{ borderColor: 'var(--border-light)' }}>
                    <div className="text-[12.5px] font-bold text-[var(--text-primary)]">{profile?.name}</div>
                    <div className="text-[10.5px] text-[var(--text-secondary)]">{profile?.email}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => { setUserMenuOpen(false); navigate('/settings') }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-[12.5px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-hover)]"
                  >
                    Settings
                  </button>
                  <div className="border-t" style={{ borderColor: 'var(--border-light)' }} />
                  <button
                    type="button"
                    onClick={signOut}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-[12.5px] font-medium transition-colors"
                    style={{ color: 'var(--coral)' }}
                    onMouseEnter={(event) => { event.currentTarget.style.background = 'var(--coral-light)' }}
                    onMouseLeave={(event) => { event.currentTarget.style.background = 'transparent' }}
                  >
                    Sign out
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </header>

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

      {showNewTaskModal ? (
        <TaskModal
          mode="create"
          onClose={() => setShowNewTaskModal(false)}
          onSaved={() => setShowNewTaskModal(false)}
        />
      ) : null}
    </>
  )
}
