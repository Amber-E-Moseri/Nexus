import { useEffect, useState } from 'react'
import { AlertCircle, CheckSquare, Clock, ExternalLink, Home, Phone, Plus, RefreshCw, Search as SearchIcon, Settings as SettingsIcon, ShieldCheck, SlidersHorizontal, Sparkles, Trash2, UserPlus } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { FLOCK_CRM_CONFIG } from '../../lib/permissions'
import { callFlockCRM as callFlockAPI, flockCard, formatTimeAgo, FLOCK } from '../../lib/flockSupabase'
import FlockHistoryPanel from '../../components/flock/FlockHistoryPanel'
import FlockTodosPanel from '../../components/flock/FlockTodosPanel'
import FlockAddPersonPanel from '../../components/flock/FlockAddPersonPanel'
import FlockCadencePanel from '../../components/flock/FlockCadencePanel'
import FlockSearchPanel from '../../components/flock/FlockSearchPanel'
import FlockAiLogPanel from '../../components/flock/FlockAiLogPanel'
import FlockSettingsPanel from '../../components/flock/FlockSettingsPanel'

function StatTile({ label, value, tone, note }) {
  const tones = {
    violet: { fg: FLOCK.purple, bg: FLOCK.purpleTint },
    red: { fg: FLOCK.red, bg: FLOCK.redTint },
    green: { fg: FLOCK.green, bg: FLOCK.greenTint },
    sand: { fg: FLOCK.muted, bg: '#F2F0F7' },
  }
  const palette = tones[tone] ?? tones.violet

  return (
    <div style={flockCard({ padding: '18px', background: palette.bg, borderColor: 'transparent' })}>
      <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: FLOCK.muted, fontFamily: FLOCK.fontBody }}>
        {label}
      </div>
      <div style={{ marginTop: '8px', fontSize: '40px', lineHeight: 1, fontWeight: 700, color: palette.fg, fontFamily: FLOCK.fontHead }}>
        {value}
      </div>
      <div style={{ marginTop: '10px', fontSize: '12px', lineHeight: 1.5, color: FLOCK.muted, fontFamily: FLOCK.fontBody }}>
        {note}
      </div>
    </div>
  )
}

function DuePersonCard({ person, expanded, onExpand, onRefresh, todos = [] }) {
  const [isLogging, setIsLogging] = useState(false)
  const [callNote, setCallNote] = useState('')
  const [newTodo, setNewTodo] = useState('')

  const handleLogCall = async () => {
    if (!callNote.trim()) return
    try {
      setIsLogging(true)
      await callFlockAPI('saveInteraction', {
        payload: JSON.stringify({
          personId: person.id,
          result: 'Reached',
          notes: callNote,
          dateTime: new Date().toISOString(),
        }),
      })
      setCallNote('')
      onRefresh?.()
    } catch (err) {
      console.error('Failed to log call:', err)
    } finally {
      setIsLogging(false)
    }
  }

  const handleAddTodo = async () => {
    if (!newTodo.trim()) return
    try {
      await callFlockAPI('saveTodos', {
        payload: JSON.stringify({
          personId: person.id,
          todos: [{ text: newTodo, done: false }],
        }),
      })
      setNewTodo('')
      onRefresh?.()
    } catch (err) {
      console.error('Failed to add todo:', err)
    }
  }

  const personTodos = todos.filter((t) => t.personId === person.id) || []

  return (
    <div style={flockCard({ padding: '16px', cursor: 'pointer', fontFamily: FLOCK.fontBody })}>
      <div
        onClick={() => onExpand(!expanded)}
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', userSelect: 'none' }}
      >
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '14px', fontWeight: 700, color: FLOCK.text }}>{person.name || person.firstName}</div>
          <div style={{ fontSize: '12px', color: FLOCK.muted, marginTop: '4px' }}>
            <span style={{ fontFamily: FLOCK.fontMono }}>{person.phone || 'No phone'}</span> {person.email ? `• ${person.email}` : ''}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {personTodos.length > 0 && (
            <div style={{ fontSize: '11px', color: FLOCK.green, fontWeight: 700, background: FLOCK.greenTint, padding: '4px 8px', borderRadius: '6px' }}>
              {personTodos.length} todo{personTodos.length !== 1 ? 's' : ''}
            </div>
          )}
          <div style={{ fontSize: '11px', color: FLOCK.red, fontWeight: 700 }}>
            {person.status === 'Call Back' ? 'Callback Due' : person.status}
          </div>
          <div style={{ color: FLOCK.muted, fontSize: '16px' }}>
            {expanded ? '▼' : '▶'}
          </div>
        </div>
      </div>

      {expanded && (
        <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: `1px solid ${FLOCK.border}`, display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              type="text"
              placeholder="Log call note..."
              value={callNote}
              onChange={(e) => setCallNote(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleLogCall()}
              style={{
                flex: 1,
                padding: '8px 12px',
                border: `1px solid ${FLOCK.border}`,
                borderRadius: '8px',
                fontSize: '12px',
                fontFamily: FLOCK.fontBody,
              }}
            />
            <button
              type="button"
              onClick={handleLogCall}
              disabled={isLogging || !callNote.trim()}
              style={{
                padding: '8px 14px',
                background: FLOCK.purple,
                color: '#FFFFFF',
                border: 'none',
                borderRadius: '8px',
                fontSize: '12px',
                fontWeight: 700,
                cursor: isLogging ? 'wait' : 'pointer',
                opacity: isLogging || !callNote.trim() ? 0.6 : 1,
                fontFamily: FLOCK.fontBody,
              }}
            >
              Log Call
            </button>
          </div>

          {personTodos.length > 0 && (
            <div style={{ display: 'grid', gap: '8px' }}>
              <div style={{ fontSize: '12px', fontWeight: 700, color: FLOCK.text }}>Open Todos</div>
              {personTodos.map((todo) => (
                <div key={todo.id} style={{ padding: '10px 12px', background: FLOCK.surface, borderRadius: '6px', display: 'flex', gap: '10px', alignItems: 'center' }}>
                  <input
                    type="checkbox"
                    checked={todo.done || false}
                    onChange={async (e) => {
                      try {
                        await callFlockAPI('updateTodo', { todoId: todo.id, done: e.target.checked ? 'true' : 'false' })
                        onRefresh?.()
                      } catch (err) {
                        console.error('Failed to update todo:', err)
                      }
                    }}
                    style={{ cursor: 'pointer' }}
                  />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '12px', color: FLOCK.text, textDecoration: todo.done ? 'line-through' : 'none' }}>
                      {todo.text}
                    </div>
                    {todo.dueDate && (
                      <div style={{ fontSize: '11px', color: FLOCK.muted, marginTop: '2px', fontFamily: FLOCK.fontMono }}>
                        Due: {new Date(todo.dueDate).toLocaleDateString()}
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await callFlockAPI('deleteTodo', { todoId: todo.id })
                        onRefresh?.()
                      } catch (err) {
                        console.error('Failed to delete todo:', err)
                      }
                    }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: FLOCK.muted, padding: '4px' }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              type="text"
              placeholder="Add new todo..."
              value={newTodo}
              onChange={(e) => setNewTodo(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleAddTodo()}
              style={{
                flex: 1,
                padding: '8px 12px',
                border: `1px solid ${FLOCK.border}`,
                borderRadius: '8px',
                fontSize: '12px',
                fontFamily: FLOCK.fontBody,
              }}
            />
            <button
              type="button"
              onClick={handleAddTodo}
              disabled={!newTodo.trim()}
              style={{
                padding: '8px 14px',
                background: FLOCK.green,
                color: '#FFFFFF',
                border: 'none',
                borderRadius: '8px',
                fontSize: '12px',
                fontWeight: 700,
                cursor: !newTodo.trim() ? 'not-allowed' : 'pointer',
                opacity: !newTodo.trim() ? 0.6 : 1,
              }}
            >
              <Plus size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function HomePanel({ onLogCall }) {
  const { role } = useAuth()
  const [stats, setStats] = useState({ today: 0, overdue: 0, week: 0, total: 0 })
  const [duePeople, setDuePeople] = useState([])
  const [todos, setTodos] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [lastUpdated, setLastUpdated] = useState(null)
  const [expandedPerson, setExpandedPerson] = useState(null)

  const fetchData = async () => {
    if (!FLOCK_CRM_CONFIG.enabled || !FLOCK_CRM_CONFIG.checkAccess(role)) return

    try {
      setLoading(true)
      const [statsRes, duePeopleRes, todosRes] = await Promise.all([
        callFlockAPI('quickStats'),
        callFlockAPI('duePeople'),
        callFlockAPI('getTodos'),
      ])

      setStats({
        today: Number(statsRes.today ?? 0),
        overdue: Number(statsRes.callbacks ?? 0),
        week: Number(statsRes.week ?? 0),
        total: Number(statsRes.total ?? 0),
      })

      setDuePeople((duePeopleRes.due || []).slice(0, 20))
      setTodos(todosRes.todos || [])
      setLastUpdated(new Date())
      setError(null)
    } catch (nextError) {
      console.error('Flock API error:', nextError)
      setError(nextError.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
    const timer = setInterval(fetchData, 60000)
    return () => clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role])

  return (
    <div style={{ display: 'grid', gap: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
        <button
          type="button"
          onClick={onLogCall}
          style={{
            border: 'none',
            borderRadius: '10px',
            padding: '8px 14px',
            background: FLOCK.purple,
            color: '#FFFFFF',
            fontSize: '13px',
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontFamily: FLOCK.fontBody,
          }}
        >
          <Sparkles size={14} />
          Log a Call
        </button>
        <button
          type="button"
          onClick={fetchData}
          style={{
            border: `1px solid ${FLOCK.borderStrong}`,
            borderRadius: '10px',
            padding: '8px 14px',
            background: FLOCK.card,
            color: FLOCK.text,
            fontSize: '13px',
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontFamily: FLOCK.fontBody,
          }}
        >
          <RefreshCw size={14} />
          Refresh
        </button>
      </div>

      {error && (
        <div style={{ ...flockCard({ padding: '16px 18px', background: FLOCK.redTint, borderColor: 'transparent' }), color: FLOCK.red, display: 'flex', gap: '10px', alignItems: 'flex-start', fontFamily: FLOCK.fontBody }}>
          <AlertCircle size={16} style={{ marginTop: '2px', flexShrink: 0 }} />
          <div>
            <div style={{ fontSize: '13px', fontWeight: 700 }}>Unable to load Flock data</div>
            <div style={{ marginTop: '4px', fontSize: '13px' }}>{error}</div>
          </div>
        </div>
      )}

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '14px' }}>
        <StatTile label="Due Today" value={loading ? '-' : stats.today} tone="violet" note="People who need same-day contact." />
        <StatTile label="Overdue" value={loading ? '-' : stats.overdue} tone="red" note="Callbacks past their target follow-up window." />
        <StatTile label="This Week" value={loading ? '-' : stats.week} tone="green" note="Active ministry load scheduled this week." />
        <StatTile label="Tracked" value={loading ? '-' : stats.total} tone="sand" note="Total records currently under pastoral tracking." />
      </section>

      {!error && (
        <div style={{ fontSize: '12px', color: FLOCK.muted, fontFamily: FLOCK.fontBody }}>
          Live metrics updated {lastUpdated ? formatTimeAgo(lastUpdated) : 'just now'}.
        </div>
      )}

      <section>
        <h2 style={{ fontSize: '18px', fontWeight: 700, color: FLOCK.text, margin: '0 0 16px', fontFamily: FLOCK.fontHead }}>
          Follow-up Queue ({duePeople.length})
        </h2>
        <div style={{ display: 'grid', gap: '12px' }}>
          {loading ? (
            <div style={{ ...flockCard({ padding: '24px' }), textAlign: 'center', color: FLOCK.muted, fontFamily: FLOCK.fontBody }}>
              Loading follow-ups...
            </div>
          ) : duePeople.length > 0 ? (
            duePeople.map((person) => (
              <DuePersonCard
                key={person.id}
                person={person}
                expanded={expandedPerson === person.id}
                onExpand={(isExpanded) => setExpandedPerson(isExpanded ? person.id : null)}
                onRefresh={fetchData}
                todos={todos}
              />
            ))
          ) : (
            <div style={{ ...flockCard({ padding: '24px' }), textAlign: 'center', color: FLOCK.muted, fontFamily: FLOCK.fontBody }}>
              No one is due for follow-up right now.
            </div>
          )}
        </div>
      </section>
    </div>
  )
}

const TABS = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'ai-log', label: 'Log a Call', icon: Sparkles },
  { id: 'history', label: 'Past Notes', icon: Clock },
  { id: 'todos', label: 'To-Dos', icon: CheckSquare },
  { id: 'add', label: 'Add Person', icon: UserPlus },
  { id: 'cadence', label: 'People Settings', icon: SlidersHorizontal },
  { id: 'search', label: 'Search', icon: SearchIcon },
  { id: 'settings', label: 'Settings', icon: SettingsIcon },
]

export default function FlockCRMPage() {
  const { role } = useAuth()
  const [activeTab, setActiveTab] = useState('home')
  const [historyPreselect, setHistoryPreselect] = useState(null)

  const openPersonHistory = (personId) => {
    setHistoryPreselect(personId)
    setActiveTab('history')
  }

  const renderPanel = () => {
    switch (activeTab) {
      case 'ai-log':
        return <FlockAiLogPanel />
      case 'history':
        return <FlockHistoryPanel preselectId={historyPreselect} />
      case 'todos':
        return <FlockTodosPanel />
      case 'add':
        return <FlockAddPersonPanel />
      case 'cadence':
        return <FlockCadencePanel />
      case 'search':
        return <FlockSearchPanel onOpenPerson={openPersonHistory} />
      case 'settings':
        return <FlockSettingsPanel />
      case 'home':
      default:
        return <HomePanel onLogCall={() => setActiveTab('ai-log')} />
    }
  }

  if (!FLOCK_CRM_CONFIG.enabled) {
    return (
      <div style={{ padding: '24px', textAlign: 'center', fontFamily: FLOCK.fontBody }}>
        <h2>Flock CRM Unavailable</h2>
        <p>Flock CRM is not currently enabled.</p>
      </div>
    )
  }

  if (!FLOCK_CRM_CONFIG.checkAccess(role)) {
    return (
      <div style={{ padding: '24px', textAlign: 'center', fontFamily: FLOCK.fontBody }}>
        <h2>Access Denied</h2>
        <p>You do not have permission to access Flock CRM.</p>
      </div>
    )
  }

  const canOpenExternal = Boolean(FLOCK_CRM_CONFIG.appUrl)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', minHeight: '100%', fontFamily: FLOCK.fontBody }}>
      <section
        style={flockCard({
          padding: '24px',
          background: `radial-gradient(circle at top left, ${FLOCK.purpleTint} 0%, ${FLOCK.surface} 45%, ${FLOCK.card} 100%)`,
        })}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '18px', flexWrap: 'wrap' }}>
          <div style={{ maxWidth: '760px' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '6px 10px', borderRadius: '999px', background: FLOCK.purpleTint, color: FLOCK.purple, fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              <ShieldCheck size={12} />
              Pastoral Operations
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '14px' }}>
              <div style={{ width: '44px', height: '44px', borderRadius: '14px', background: FLOCK.purple, display: 'grid', placeItems: 'center', color: '#FFFFFF' }}>
                <Phone size={20} />
              </div>
              <h1 style={{ margin: 0, fontSize: '30px', fontWeight: 700, color: FLOCK.text, fontFamily: FLOCK.fontHead }}>Flock CRM</h1>
            </div>
          </div>

          <button
            type="button"
            onClick={() => window.open(FLOCK_CRM_CONFIG.appUrl, '_blank', 'noopener,noreferrer')}
            disabled={!canOpenExternal}
            style={{
              border: `1px solid ${FLOCK.borderStrong}`,
              borderRadius: '12px',
              padding: '12px 16px',
              background: FLOCK.card,
              color: FLOCK.text,
              fontSize: '13px',
              fontWeight: 600,
              cursor: canOpenExternal ? 'pointer' : 'not-allowed',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              opacity: canOpenExternal ? 1 : 0.55,
              fontFamily: FLOCK.fontBody,
            }}
          >
            <ExternalLink size={14} />
            Open Full CRM
          </button>
        </div>

        <nav style={{ display: 'flex', gap: '6px', marginTop: '20px', flexWrap: 'wrap' }}>
          {TABS.map((tab) => {
            const Icon = tab.icon
            const isActive = tab.id === activeTab
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '7px',
                  padding: '9px 15px',
                  borderRadius: '999px',
                  border: `1px solid ${isActive ? 'transparent' : FLOCK.border}`,
                  background: isActive ? FLOCK.purple : FLOCK.card,
                  color: isActive ? '#FFFFFF' : FLOCK.muted,
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontFamily: FLOCK.fontBody,
                }}
              >
                <Icon size={14} />
                {tab.label}
              </button>
            )
          })}
        </nav>
      </section>

      <div>{renderPanel()}</div>
    </div>
  )
}
