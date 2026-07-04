import { useEffect, useState } from 'react'
import { AlertCircle, ExternalLink, Phone, RefreshCw, ShieldCheck, Plus, Trash2 } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { FLOCK_CRM_CONFIG } from '../../lib/permissions'

const SURFACE = {
  card: {
    background: '#FFFFFF',
    border: '1px solid #E7DECF',
    borderRadius: '18px',
    boxShadow: '0 14px 34px rgba(28, 22, 16, 0.05)',
  },
  text: '#1C1610',
  muted: '#7A6F5E',
}

function shellCardStyle(extra = {}) {
  return { ...SURFACE.card, ...extra }
}

function formatTime(date) {
  if (!date) return 'never'
  const diffMs = Date.now() - date.getTime()
  const minutes = Math.floor(diffMs / 60000)
  if (minutes <= 0) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

async function callFlockAPI(action, params = {}) {
  if (!FLOCK_CRM_CONFIG.apiUrl) throw new Error('Flock API URL not configured')
  const url = new URL(FLOCK_CRM_CONFIG.apiUrl)
  url.searchParams.append('action', action)
  for (const [key, value] of Object.entries(params)) {
    if (value !== null && value !== undefined) {
      url.searchParams.append(key, typeof value === 'object' ? JSON.stringify(value) : value)
    }
  }
  const response = await fetch(url)
  if (!response.ok) throw new Error(`API error: ${response.statusText}`)
  return response.json()
}

function StatTile({ label, value, tone, note }) {
  const tones = {
    violet: { fg: '#4C2A92', bg: '#F3EEFF' },
    red: { fg: '#C94830', bg: '#FDEEEA' },
    green: { fg: '#2D8653', bg: '#ECF8F1' },
    sand: { fg: '#7A6F5E', bg: '#F5F0E7' },
  }
  const palette = tones[tone] ?? tones.violet

  return (
    <div style={shellCardStyle({ padding: '18px', background: palette.bg, borderColor: 'transparent' })}>
      <div style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: SURFACE.muted }}>
        {label}
      </div>
      <div style={{ marginTop: '8px', fontSize: '40px', lineHeight: 1, fontWeight: 900, color: palette.fg }}>
        {value}
      </div>
      <div style={{ marginTop: '10px', fontSize: '12px', lineHeight: 1.5, color: '#5F5549' }}>
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
    <div style={shellCardStyle({ padding: '16px', cursor: 'pointer' })}>
      <div
        onClick={() => onExpand(!expanded)}
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', userSelect: 'none' }}
      >
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '14px', fontWeight: 800, color: SURFACE.text }}>{person.name || person.firstName}</div>
          <div style={{ fontSize: '12px', color: SURFACE.muted, marginTop: '4px' }}>
            {person.phone || 'No phone'} {person.email ? `• ${person.email}` : ''}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {personTodos.length > 0 && (
            <div style={{ fontSize: '11px', color: '#2D8653', fontWeight: 800, background: '#ECF8F1', padding: '4px 8px', borderRadius: '6px' }}>
              {personTodos.length} todo{personTodos.length !== 1 ? 's' : ''}
            </div>
          )}
          <div style={{ fontSize: '11px', color: '#C94830', fontWeight: 800 }}>
            {person.status === 'Call Back' ? 'Callback Due' : person.status}
          </div>
          <div style={{ color: SURFACE.muted, fontSize: '16px' }}>
            {expanded ? '▼' : '▶'}
          </div>
        </div>
      </div>

      {expanded && (
        <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid #E7DECF', display: 'flex', flexDirection: 'column', gap: '12px' }}>
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
                border: '1px solid #E7DECF',
                borderRadius: '8px',
                fontSize: '12px',
              }}
            />
            <button
              type="button"
              onClick={handleLogCall}
              disabled={isLogging || !callNote.trim()}
              style={{
                padding: '8px 14px',
                background: '#4C2A92',
                color: '#FFFFFF',
                border: 'none',
                borderRadius: '8px',
                fontSize: '12px',
                fontWeight: 800,
                cursor: isLogging ? 'wait' : 'pointer',
                opacity: isLogging || !callNote.trim() ? 0.6 : 1,
              }}
            >
              Log Call
            </button>
          </div>

          {personTodos.length > 0 && (
            <div style={{ display: 'grid', gap: '8px' }}>
              <div style={{ fontSize: '12px', fontWeight: 800, color: SURFACE.text }}>Open Todos</div>
              {personTodos.map((todo) => (
                <div key={todo.id} style={{ padding: '10px 12px', background: '#FBF8F2', borderRadius: '6px', display: 'flex', gap: '10px', alignItems: 'center' }}>
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
                    <div style={{ fontSize: '12px', color: SURFACE.text, textDecoration: todo.done ? 'line-through' : 'none' }}>
                      {todo.text}
                    </div>
                    {todo.dueDate && (
                      <div style={{ fontSize: '11px', color: SURFACE.muted, marginTop: '2px' }}>
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
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: SURFACE.muted, padding: '4px' }}
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
                border: '1px solid #E7DECF',
                borderRadius: '8px',
                fontSize: '12px',
              }}
            />
            <button
              type="button"
              onClick={handleAddTodo}
              disabled={!newTodo.trim()}
              style={{
                padding: '8px 14px',
                background: '#2D8653',
                color: '#FFFFFF',
                border: 'none',
                borderRadius: '8px',
                fontSize: '12px',
                fontWeight: 800,
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

export default function FlockCRMPage() {
  const { role } = useAuth()
  const [stats, setStats] = useState({ today: 0, overdue: 0, week: 0, total: 0 })
  const [duePeople, setDuePeople] = useState([])
  const [todos, setTodos] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [lastUpdated, setLastUpdated] = useState(null)
  const [expandedPerson, setExpandedPerson] = useState(null)

  const fetchData = async () => {
    if (!FLOCK_CRM_CONFIG.enabled || !FLOCK_CRM_CONFIG.checkAccess(role) || !FLOCK_CRM_CONFIG.apiUrl) return

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
  }, [role])


  if (!FLOCK_CRM_CONFIG.enabled) {
    return (
      <div style={{ padding: '24px', textAlign: 'center' }}>
        <h2>Flock CRM Unavailable</h2>
        <p>Flock CRM is not currently enabled.</p>
      </div>
    )
  }

  if (!FLOCK_CRM_CONFIG.checkAccess(role)) {
    return (
      <div style={{ padding: '24px', textAlign: 'center' }}>
        <h2>Access Denied</h2>
        <p>You do not have permission to access Flock CRM.</p>
      </div>
    )
  }

  const canOpenExternal = Boolean(FLOCK_CRM_CONFIG.appUrl)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', minHeight: '100%' }}>
      <section
        style={shellCardStyle({
          padding: '24px',
          background: 'radial-gradient(circle at top left, #F8F2E8 0%, #FBF8F2 40%, #FFFFFF 100%)',
        })}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '18px', flexWrap: 'wrap' }}>
          <div style={{ maxWidth: '760px' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '6px 10px', borderRadius: '999px', background: '#F1E8FF', color: '#4C2A92', fontSize: '11px', fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              <ShieldCheck size={12} />
              Pastoral Operations
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '14px' }}>
              <div style={{ width: '44px', height: '44px', borderRadius: '14px', background: '#4C2A92', display: 'grid', placeItems: 'center', color: '#FFFFFF' }}>
                <Phone size={20} />
              </div>
              <h1 style={{ margin: 0, fontSize: '30px', fontWeight: 900, color: SURFACE.text }}>Flock CRM</h1>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={fetchData}
              style={{
                border: '1px solid #D8CEBC',
                borderRadius: '12px',
                padding: '12px 16px',
                background: '#FFFFFF',
                color: SURFACE.text,
                fontSize: '13px',
                fontWeight: 800,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <RefreshCw size={14} />
              Refresh
            </button>
            <button
              type="button"
              onClick={() => window.open(FLOCK_CRM_CONFIG.appUrl, '_blank', 'noopener,noreferrer')}
              disabled={!canOpenExternal}
              style={{
                border: '1px solid #D8CEBC',
                borderRadius: '12px',
                padding: '12px 16px',
                background: '#FBF8F2',
                color: SURFACE.text,
                fontSize: '13px',
                fontWeight: 800,
                cursor: canOpenExternal ? 'pointer' : 'not-allowed',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                opacity: canOpenExternal ? 1 : 0.55,
              }}
            >
              <ExternalLink size={14} />
              Open Full CRM
            </button>
          </div>
        </div>
      </section>

      {error && (
        <div style={{ ...shellCardStyle({ padding: '16px 18px', background: '#FDEEEA', borderColor: 'transparent' }), color: '#A63D2A', display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
          <AlertCircle size={16} style={{ marginTop: '2px', flexShrink: 0 }} />
          <div>
            <div style={{ fontSize: '13px', fontWeight: 800 }}>Unable to load Flock data</div>
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
        <div style={{ fontSize: '12px', color: SURFACE.muted }}>
          Live metrics updated {lastUpdated ? formatTime(lastUpdated) : 'just now'}.
        </div>
      )}

      <section>
        <h2 style={{ fontSize: '18px', fontWeight: 800, color: SURFACE.text, margin: '0 0 16px' }}>
          Follow-up Queue ({duePeople.length})
        </h2>
        <div style={{ display: 'grid', gap: '12px' }}>
          {loading ? (
            <div style={{ ...shellCardStyle({ padding: '24px' }), textAlign: 'center', color: SURFACE.muted }}>
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
            <div style={{ ...shellCardStyle({ padding: '24px' }), textAlign: 'center', color: SURFACE.muted }}>
              No one is due for follow-up right now.
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
