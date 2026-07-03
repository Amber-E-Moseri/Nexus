import { useState, useEffect } from 'react'
import { createSprintGoal, getSprintGoals, updateSprintGoal, deleteSprintGoal } from '../lib/sprints'
import { useAuth } from '../../../hooks/useAuth'

export default function SprintGoalsPanel({ sprintId, departmentId }) {
  const { profile } = useAuth()
  const [goals, setGoals] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    targetValue: 100,
    currentValue: 0,
    dueDate: '',
    status: 'not_started',
  })
  const [saving, setSaving] = useState(false)
  const [editingGoalId, setEditingGoalId] = useState(null)

  useEffect(() => {
    loadGoals()
  }, [sprintId])

  async function loadGoals() {
    try {
      setLoading(true)
      setError(null)
      const data = await getSprintGoals(sprintId)
      setGoals(data)
    } catch (err) {
      console.error('Failed to load goals:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!formData.title.trim()) {
      setError('Goal title is required')
      return
    }

    try {
      setSaving(true)
      setError(null)

      if (editingGoalId) {
        await updateSprintGoal(editingGoalId, formData)
        setEditingGoalId(null)
      } else {
        await createSprintGoal(sprintId, formData, profile.id)
      }

      setFormData({
        title: '',
        description: '',
        targetValue: 100,
        currentValue: 0,
        dueDate: '',
        status: 'not_started',
      })
      setShowForm(false)
      await loadGoals()
    } catch (err) {
      console.error('Failed to save goal:', err)
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(goalId) {
    if (!window.confirm('Delete this goal?')) return

    try {
      setSaving(true)
      setError(null)
      await deleteSprintGoal(goalId)
      await loadGoals()
    } catch (err) {
      console.error('Failed to delete goal:', err)
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  function handleEdit(goal) {
    setFormData({
      title: goal.title,
      description: goal.description || '',
      targetValue: goal.target_value,
      currentValue: goal.current_value,
      dueDate: goal.due_date || '',
      status: goal.status,
    })
    setEditingGoalId(goal.id)
    setShowForm(true)
  }

  function getStatusColor(status) {
    const colors = {
      not_started: '#9CA3AF',
      on_track: '#10B981',
      at_risk: '#F59E0B',
      behind: '#EF4444',
      completed: '#3B82F6',
    }
    return colors[status] || '#9CA3AF'
  }

  const progressPercent = goals.reduce((sum, goal) => sum + (goal.current_value / goal.target_value) * 100, 0) / (goals.length || 1)

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h3 style={styles.title}>Sprint Goals</h3>
        <button
          onClick={() => setShowForm(!showForm)}
          style={{
            ...styles.button,
            backgroundColor: showForm ? '#EF4444' : '#3B82F6',
          }}
        >
          {showForm ? 'Cancel' : '+ Add Goal'}
        </button>
      </div>

      {error && <div style={styles.error}>{error}</div>}

      {showForm && (
        <form onSubmit={handleSubmit} style={styles.form}>
          <input
            type="text"
            placeholder="Goal title"
            value={formData.title}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            style={styles.input}
            disabled={saving}
          />

          <textarea
            placeholder="Goal description (optional)"
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            style={{ ...styles.input, minHeight: '60px' }}
            disabled={saving}
          />

          <div style={styles.formRow}>
            <div style={styles.formGroup}>
              <label style={styles.label}>Target Value</label>
              <input
                type="number"
                value={formData.targetValue}
                onChange={(e) => setFormData({ ...formData, targetValue: parseInt(e.target.value) || 0 })}
                style={styles.input}
                disabled={saving}
              />
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>Current Value</label>
              <input
                type="number"
                value={formData.currentValue}
                onChange={(e) => setFormData({ ...formData, currentValue: parseInt(e.target.value) || 0 })}
                style={styles.input}
                disabled={saving}
              />
            </div>
          </div>

          <div style={styles.formRow}>
            <div style={styles.formGroup}>
              <label style={styles.label}>Due Date</label>
              <input
                type="date"
                value={formData.dueDate}
                onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                style={styles.input}
                disabled={saving}
              />
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>Status</label>
              <select
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                style={styles.input}
                disabled={saving}
              >
                <option value="not_started">Not Started</option>
                <option value="on_track">On Track</option>
                <option value="at_risk">At Risk</option>
                <option value="behind">Behind</option>
                <option value="completed">Completed</option>
              </select>
            </div>
          </div>

          <button
            type="submit"
            disabled={saving}
            style={{
              ...styles.button,
              backgroundColor: saving ? '#D1D5DB' : '#10B981',
              cursor: saving ? 'not-allowed' : 'pointer',
            }}
          >
            {saving ? 'Saving...' : editingGoalId ? 'Update Goal' : 'Create Goal'}
          </button>
        </form>
      )}

      {loading && <div style={styles.loading}>Loading goals...</div>}

      {!loading && goals.length === 0 && !showForm && (
        <div style={styles.empty}>No goals yet. Click "Add Goal" to create one.</div>
      )}

      {goals.length > 0 && (
        <div style={styles.goalsList}>
          <div style={styles.progressBar}>
            <div
              style={{
                width: `${Math.min(progressPercent, 100)}%`,
                height: '4px',
                backgroundColor: '#3B82F6',
                transition: 'width 0.3s ease',
              }}
            />
          </div>
          <div style={styles.progressText}>{Math.round(progressPercent)}% Overall Progress</div>

          {goals.map((goal) => (
            <div key={goal.id} style={styles.goalCard}>
              <div style={styles.goalHeader}>
                <h4 style={styles.goalTitle}>{goal.title}</h4>
                <span
                  style={{
                    ...styles.statusBadge,
                    backgroundColor: getStatusColor(goal.status),
                  }}
                >
                  {goal.status.replace('_', ' ')}
                </span>
              </div>

              {goal.description && <p style={styles.goalDescription}>{goal.description}</p>}

              <div style={styles.goalMeta}>
                <div>
                  Progress: {goal.current_value} / {goal.target_value}
                </div>
                {goal.due_date && <div>Due: {new Date(goal.due_date).toLocaleDateString()}</div>}
              </div>

              <div style={styles.goalActions}>
                <button
                  onClick={() => handleEdit(goal)}
                  style={{ ...styles.smallButton, color: '#3B82F6' }}
                  disabled={saving}
                >
                  Edit
                </button>
                <button
                  onClick={() => handleDelete(goal.id)}
                  style={{ ...styles.smallButton, color: '#EF4444' }}
                  disabled={saving}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

const styles = {
  container: {
    padding: '20px',
    backgroundColor: '#F9FAFB',
    borderRadius: '8px',
    marginBottom: '20px',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '16px',
  },
  title: {
    fontSize: '16px',
    fontWeight: '600',
    margin: 0,
  },
  button: {
    padding: '8px 16px',
    borderRadius: '6px',
    border: 'none',
    color: 'white',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer',
    transition: 'opacity 0.2s',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    marginBottom: '16px',
    padding: '16px',
    backgroundColor: 'white',
    borderRadius: '6px',
    border: '1px solid #E5E7EB',
  },
  input: {
    padding: '8px 12px',
    borderRadius: '6px',
    border: '1px solid #E5E7EB',
    fontSize: '14px',
    fontFamily: 'inherit',
  },
  formRow: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '12px',
  },
  formGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  label: {
    fontSize: '12px',
    fontWeight: '500',
    color: '#6B7280',
  },
  error: {
    padding: '12px',
    borderRadius: '6px',
    backgroundColor: '#FEE2E2',
    color: '#DC2626',
    fontSize: '14px',
    marginBottom: '12px',
  },
  loading: {
    padding: '16px',
    textAlign: 'center',
    color: '#6B7280',
    fontSize: '14px',
  },
  empty: {
    padding: '16px',
    textAlign: 'center',
    color: '#9CA3AF',
    fontSize: '14px',
  },
  goalsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  progressBar: {
    height: '4px',
    backgroundColor: '#E5E7EB',
    borderRadius: '2px',
    overflow: 'hidden',
    marginBottom: '8px',
  },
  progressText: {
    fontSize: '12px',
    color: '#6B7280',
    marginBottom: '12px',
  },
  goalCard: {
    padding: '12px',
    backgroundColor: 'white',
    borderRadius: '6px',
    border: '1px solid #E5E7EB',
  },
  goalHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'start',
    marginBottom: '8px',
  },
  goalTitle: {
    margin: 0,
    fontSize: '14px',
    fontWeight: '500',
    flex: 1,
  },
  statusBadge: {
    padding: '2px 8px',
    borderRadius: '4px',
    color: 'white',
    fontSize: '11px',
    fontWeight: '600',
    textTransform: 'capitalize',
    whiteSpace: 'nowrap',
    marginLeft: '8px',
  },
  goalDescription: {
    margin: '0 0 8px 0',
    fontSize: '13px',
    color: '#6B7280',
  },
  goalMeta: {
    display: 'flex',
    gap: '16px',
    fontSize: '12px',
    color: '#9CA3AF',
    marginBottom: '8px',
  },
  goalActions: {
    display: 'flex',
    gap: '8px',
  },
  smallButton: {
    padding: '4px 8px',
    border: 'none',
    backgroundColor: 'transparent',
    fontSize: '12px',
    fontWeight: '500',
    cursor: 'pointer',
  },
}
