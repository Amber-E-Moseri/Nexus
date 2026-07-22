import { useState, useEffect } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { createSprintGoal, getSprintGoals, updateSprintGoal, deleteSprintGoal } from '../lib/sprints'
import { useAuth } from '../../../hooks/useAuth'

const DEFAULT_FORM_DATA = {
  title: '',
  description: '',
  targetValue: 100,
  currentValue: 0,
  dueDate: '',
  status: 'not_started',
}

const goalFormInputStyle = {
  width: '100%',
  fontSize: 13,
  padding: '9px 10px',
  border: '1px solid var(--border)',
  borderRadius: 8,
  outline: 'none',
  background: 'white',
  color: 'var(--text-primary)',
  boxSizing: 'border-box',
}

const goalFormTextareaStyle = {
  ...goalFormInputStyle,
  resize: 'vertical',
  lineHeight: 1.6,
}

const goalFormLabelStyle = {
  display: 'block',
  marginBottom: 6,
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--text-secondary)',
}

export default function SprintGoalsPanel({ sprintId, departmentId }) {
  const { profile } = useAuth()
  const [goals, setGoals] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [formData, setFormData] = useState(DEFAULT_FORM_DATA)
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

      setFormData(DEFAULT_FORM_DATA)
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
    setError(null)
    setShowForm(true)
  }

  function openCreateForm() {
    setEditingGoalId(null)
    setFormData(DEFAULT_FORM_DATA)
    setError(null)
    setShowForm(true)
  }

  function closeForm() {
    setShowForm(false)
    setEditingGoalId(null)
    setFormData(DEFAULT_FORM_DATA)
    setError(null)
  }

  function getStatusColor(status) {
    const colors = {
      not_started: '#9E9488',
      on_track: '#2E7D32',
      at_risk: '#E8A020',
      behind: '#C94830',
      completed: '#4C2A92',
    }
    return colors[status] || '#9E9488'
  }

  const progressPercent = goals.reduce((sum, goal) => sum + (goal.current_value / goal.target_value) * 100, 0) / (goals.length || 1)

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h3 style={styles.title}>Sprint Goals</h3>
        <button onClick={openCreateForm} style={{ ...styles.button, backgroundColor: '#4C2A92' }}>
          + Add Goal
        </button>
      </div>

      {error && !showForm && <div style={styles.error}>{error}</div>}

      <Dialog.Root open={showForm} onOpenChange={(open) => { if (!open) closeForm() }}>
        <Dialog.Portal>
          <Dialog.Overlay
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(12, 14, 24, 0.48)',
              backdropFilter: 'blur(2px)',
              zIndex: 40,
            }}
          />
          <Dialog.Content
            aria-describedby={undefined}
            style={{
              position: 'fixed',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              width: 'min(520px, 94vw)',
              maxHeight: '90vh',
              overflow: 'hidden',
              borderRadius: 18,
              background: 'white',
              boxShadow: '0 24px 64px rgba(14,14,30,0.22)',
              zIndex: 50,
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 20px', borderBottom: '1px solid var(--border)' }}>
              <Dialog.Title style={{ margin: 0, fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>
                {editingGoalId ? 'Edit goal' : 'Add goal'}
              </Dialog.Title>
              <Dialog.Close
                type="button"
                aria-label="Close"
                style={{ border: 'none', background: 'transparent', fontSize: 20, color: 'var(--text-tertiary)', cursor: 'pointer' }}
              >
                ×
              </Dialog.Close>
            </div>

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
              <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
                {error ? (
                  <div style={{ marginBottom: 14, borderRadius: 10, background: 'var(--coral-light)', padding: '10px 12px', fontSize: 12, color: 'var(--coral-dark)' }}>
                    {error}
                  </div>
                ) : null}

                <div>
                  <label style={goalFormLabelStyle}>Title</label>
                  <input
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    placeholder="Goal title"
                    style={goalFormInputStyle}
                    disabled={saving}
                  />
                </div>

                <div style={{ marginTop: 14 }}>
                  <label style={goalFormLabelStyle}>Description</label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Goal description (optional)"
                    rows={3}
                    style={goalFormTextareaStyle}
                    disabled={saving}
                  />
                </div>

                <div style={{ display: 'grid', gap: 14, gridTemplateColumns: '1fr 1fr', marginTop: 14 }}>
                  <div>
                    <label style={goalFormLabelStyle}>Target value</label>
                    <input
                      type="number"
                      value={formData.targetValue}
                      onChange={(e) => setFormData({ ...formData, targetValue: parseInt(e.target.value) || 0 })}
                      style={goalFormInputStyle}
                      disabled={saving}
                    />
                  </div>
                  <div>
                    <label style={goalFormLabelStyle}>Current value</label>
                    <input
                      type="number"
                      value={formData.currentValue}
                      onChange={(e) => setFormData({ ...formData, currentValue: parseInt(e.target.value) || 0 })}
                      style={goalFormInputStyle}
                      disabled={saving}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gap: 14, gridTemplateColumns: '1fr 1fr', marginTop: 14 }}>
                  <div>
                    <label style={goalFormLabelStyle}>Due date</label>
                    <input
                      type="date"
                      value={formData.dueDate}
                      onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                      style={goalFormInputStyle}
                      disabled={saving}
                    />
                  </div>
                  <div>
                    <label style={goalFormLabelStyle}>Status</label>
                    <select
                      value={formData.status}
                      onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                      style={goalFormInputStyle}
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
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, borderTop: '1px solid var(--border)', background: 'var(--surface-secondary)', padding: '14px 20px' }}>
                <Dialog.Close
                  type="button"
                  style={{ borderRadius: 8, border: '1px solid var(--border)', background: 'white', padding: '8px 14px', fontSize: 13, color: 'var(--text-secondary)', cursor: 'pointer' }}
                >
                  Cancel
                </Dialog.Close>
                <button
                  type="submit"
                  disabled={saving}
                  style={{
                    borderRadius: 8,
                    border: 'none',
                    background: 'var(--accent, #4C2A92)',
                    padding: '8px 16px',
                    fontSize: 13,
                    fontWeight: 600,
                    color: 'white',
                    cursor: saving ? 'not-allowed' : 'pointer',
                    opacity: saving ? 0.7 : 1,
                  }}
                >
                  {saving ? 'Saving…' : editingGoalId ? 'Update goal' : 'Create goal'}
                </button>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

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
                backgroundColor: '#4C2A92',
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
                  style={{ ...styles.smallButton, color: '#4C2A92' }}
                  disabled={saving}
                >
                  Edit
                </button>
                <button
                  onClick={() => handleDelete(goal.id)}
                  style={{ ...styles.smallButton, color: '#C94830' }}
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
    backgroundColor: 'var(--surface-secondary, #F4F1EA)',
    borderRadius: '20px',
    marginBottom: '20px',
    border: '1px solid var(--border, #EDE8DC)',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '16px',
  },
  title: {
    fontSize: '16px',
    fontWeight: '700',
    margin: 0,
    color: 'var(--text-primary, #2D2A22)',
    fontFamily: 'DM Sans, system-ui, sans-serif',
  },
  button: {
    padding: '8px 16px',
    borderRadius: '8px',
    border: 'none',
    color: 'white',
    fontSize: '13px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.12s',
    fontFamily: 'DM Sans, system-ui, sans-serif',
  },
  error: {
    padding: '12px',
    borderRadius: '8px',
    backgroundColor: '#FFE5E5',
    color: '#C94830',
    fontSize: '14px',
    marginBottom: '12px',
  },
  loading: {
    padding: '16px',
    textAlign: 'center',
    color: 'var(--text-secondary, #7A6F5E)',
    fontSize: '14px',
  },
  empty: {
    padding: '16px',
    textAlign: 'center',
    color: 'var(--text-tertiary, #9E9488)',
    fontSize: '14px',
  },
  goalsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  progressBar: {
    height: '4px',
    backgroundColor: 'var(--border, #EDE8DC)',
    borderRadius: '2px',
    overflow: 'hidden',
    marginBottom: '8px',
  },
  progressText: {
    fontSize: '12px',
    color: 'var(--text-secondary, #7A6F5E)',
    marginBottom: '12px',
  },
  goalCard: {
    padding: '12px',
    backgroundColor: 'white',
    borderRadius: '12px',
    border: '1px solid var(--border, #EDE8DC)',
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
    color: 'var(--text-secondary, #7A6F5E)',
  },
  goalMeta: {
    display: 'flex',
    gap: '16px',
    fontSize: '12px',
    color: 'var(--text-tertiary, #9E9488)',
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
