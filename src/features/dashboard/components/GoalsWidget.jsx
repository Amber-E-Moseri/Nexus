import { useEffect, useState } from 'react'
import { useAuth } from '../../../hooks/useAuth'
import { supabase } from '../../../lib/supabase'

const STATUS_COLORS = {
  not_started: { bg: '#F5F4F1', text: '#6B6560', label: 'Not Started' },
  on_track: { bg: '#EBF7F1', text: '#2D8653', label: 'On Track' },
  at_risk: { bg: '#FEF8E7', text: '#C47E0A', label: 'At Risk' },
  behind: { bg: '#FEF0ED', text: '#C94830', label: 'Behind' },
  completed: { bg: '#F0F0F0', text: '#6B6560', label: 'Completed' },
}

function ProgressRing({ percent, size = 80 }) {
  const radius = (size - 4) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference * (1 - percent / 100)

  let strokeColor = '#9E9488'
  if (percent === 100) strokeColor = '#2D8653'
  else if (percent >= 80) strokeColor = '#4C2A92'
  else if (percent >= 50) strokeColor = '#C47E0A'
  else strokeColor = '#C94830'

  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#EDE8DC" strokeWidth={3} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={strokeColor}
        strokeWidth={3}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        style={{ transition: 'stroke-dashoffset 0.3s' }}
      />
      <text x="50%" y="50%" textAnchor="middle" dy="0.3em" fontSize="16" fontWeight="700" fill={strokeColor}>
        {Math.round(percent)}%
      </text>
    </svg>
  )
}

export default function GoalsWidget({ departmentId }) {
  const [goals, setGoals] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!departmentId) {
      setLoading(false)
      return
    }

    let active = true
    setLoading(true)

    supabase
      .from('goals')
      .select('id, title, description, target_value, current_value, due_date, status, owner:owner_id(id, name)')
      .eq('department_id', departmentId)
      .eq('status', 'not_completed')
      .order('due_date', { ascending: true, nullsFirst: false })
      .then(({ data, error }) => {
        if (!active) return
        if (error) throw error
        setGoals(data ?? [])
      })
      .catch(() => {
        if (active) setGoals([])
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => { active = false }
  }, [departmentId])

  if (loading) return <div style={{ fontSize: 12.5, color: '#9E9488' }}>Loading…</div>
  if (goals.length === 0) return (
    <div style={{ fontSize: 13, color: '#9E9488', padding: '20px 0', textAlign: 'center' }}>No active goals</div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {goals.map((goal) => {
        const percent = goal.target_value ? Math.min(100, Math.round((goal.current_value / goal.target_value) * 100)) : 0
        const colors = STATUS_COLORS[goal.status] || STATUS_COLORS.not_started
        const dueDate = goal.due_date ? new Date(goal.due_date).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' }) : '—'

        return (
          <div key={goal.id} style={{
            display: 'flex',
            gap: 12,
            padding: '12px',
            border: '1px solid var(--border)',
            borderRadius: 10,
            background: 'white',
          }}>
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
              <ProgressRing percent={percent} size={72} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#2D2A22', marginBottom: 4 }}>
                {goal.title}
              </div>
              {goal.description && (
                <div style={{ fontSize: 11, color: '#9E9488', marginBottom: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {goal.description}
                </div>
              )}
              <div style={{ fontSize: 11, color: '#9E9488', marginBottom: 4 }}>
                {goal.current_value} / {goal.target_value} · Due {dueDate}
              </div>
              <div style={{
                fontSize: 10,
                fontWeight: 600,
                padding: '2px 8px',
                borderRadius: 4,
                background: colors.bg,
                color: colors.text,
                display: 'inline-block',
              }}>
                {colors.label}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
