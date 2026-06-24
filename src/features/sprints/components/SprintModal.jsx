import * as Dialog from '@radix-ui/react-dialog'
import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../../../hooks/useAuth'
import { createSprint, updateSprint, getDepartments, createSprintTeam } from '../lib/sprints'

const inputStyle = {
  width: '100%',
  fontSize: 13,
  padding: '8px 10px',
  border: '1px solid var(--border)',
  borderRadius: 8,
  outline: 'none',
  background: 'white',
  color: 'var(--text-primary)',
}

const labelStyle = {
  display: 'block',
  fontSize: 11,
  fontWeight: 600,
  color: 'var(--text-secondary)',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  marginBottom: 6,
}

export default function SprintModal({ mode = 'create', sprint = null, initialDepartmentId = null, onSaved, onClose }) {
  const { profile } = useAuth()
  const [name, setName] = useState(sprint?.name ?? '')
  const [goal, setGoal] = useState(sprint?.goal ?? '')
  const [description, setDescription] = useState(sprint?.description ?? '')
  const [startDate, setStartDate] = useState(sprint?.start_date ?? '')
  const [endDate, setEndDate] = useState(sprint?.end_date ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [template, setTemplate] = useState('custom')
  const [selectedDepts, setSelectedDepts] = useState([])
  const [depts, setDepts] = useState([])
  const [deptsLoading, setDeptsLoading] = useState(false)
  const titleRef = useRef(null)

  useEffect(() => {
    titleRef.current?.focus()
  }, [])

  useEffect(() => {
    if (mode === 'create') {
      setDeptsLoading(true)
      getDepartments()
        .then(setDepts)
        .catch((err) => {
          console.error('Failed to load departments:', err)
          setDepts([])
        })
        .finally(() => setDeptsLoading(false))
    }
  }, [mode])

  async function handleSave() {
    if (!name.trim()) {
      setError('Sprint name is required.')
      titleRef.current?.focus()
      return
    }

    if ((template === 'single' || template === 'multi') && selectedDepts.length === 0) {
      setError('Please select at least one department')
      return
    }

    setSaving(true)
    setError(null)

    const payload = {
      name: name.trim(),
      goal: goal.trim() || null,
      description: description.trim() || null,
      start_date: startDate || null,
      end_date: endDate || null,
      department_id: template === 'single' ? selectedDepts[0] : null,
    }

    try {
      let saved
      if (mode === 'create') {
        saved = await createSprint(payload, profile.id)

        // Auto-create teams based on template
        if (template === 'single' && selectedDepts.length > 0) {
          const deptName = depts.find((d) => d.id === selectedDepts[0])?.name
          await createSprintTeam(
            saved.id,
            deptName,
            `${deptName} team for ${name.trim()}`,
            profile.id,
          )
        } else if (template === 'multi' && selectedDepts.length > 0) {
          for (const deptId of selectedDepts) {
            const deptName = depts.find((d) => d.id === deptId)?.name
            await createSprintTeam(
              saved.id,
              deptName,
              `${deptName} team for ${name.trim()}`,
              profile.id,
            )
          }
        }
      } else {
        saved = await updateSprint(sprint.id, payload)
      }

      onSaved?.(saved)
      onClose()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog.Root open onOpenChange={(open) => { if (!open) onClose() }}>
      <Dialog.Portal>
        <Dialog.Overlay
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(14,14,30,0.45)',
            backdropFilter: 'blur(2px)',
            zIndex: 40,
          }}
        />
        <Dialog.Content
          style={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: 'min(640px, 95vw)',
            maxHeight: '90vh',
            background: 'white',
            borderRadius: 16,
            boxShadow: '0 24px 64px rgba(14,14,30,0.22)',
            display: 'flex',
            flexDirection: 'column',
            zIndex: 50,
            overflow: 'hidden',
          }}
          aria-describedby={undefined}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
            <Dialog.Title style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
              {mode === 'create' ? 'New sprint' : 'Edit sprint'}
            </Dialog.Title>
            <Dialog.Close
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', fontSize: 20, lineHeight: 1, padding: '2px 6px', borderRadius: 6 }}
              aria-label="Close"
            >
              ×
            </Dialog.Close>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
            {error ? (
              <div style={{ marginBottom: 14, padding: '8px 12px', borderRadius: 8, background: 'var(--coral-light)', color: 'var(--coral-dark)', fontSize: 13 }}>
                {error}
              </div>
            ) : null}

            {mode === 'create' ? (
              <>
                <fieldset style={{ marginBottom: 14, border: '1px solid var(--border)', borderRadius: 8, padding: '12px' }}>
                  <legend style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', paddingLeft: 2, paddingRight: 6 }}>
                    Sprint Scope
                  </legend>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
                      <input
                        type="radio"
                        name="template"
                        value="single"
                        checked={template === 'single'}
                        onChange={(e) => {
                          setTemplate(e.target.value)
                          setSelectedDepts([])
                        }}
                        style={{ cursor: 'pointer' }}
                      />
                      <span>Single Department</span>
                    </label>

                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
                      <input
                        type="radio"
                        name="template"
                        value="multi"
                        checked={template === 'multi'}
                        onChange={(e) => {
                          setTemplate(e.target.value)
                          setSelectedDepts([])
                        }}
                        style={{ cursor: 'pointer' }}
                      />
                      <span>Multi-Dept Collaboration</span>
                    </label>

                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
                      <input
                        type="radio"
                        name="template"
                        value="custom"
                        checked={template === 'custom'}
                        onChange={(e) => {
                          setTemplate(e.target.value)
                          setSelectedDepts([])
                        }}
                        style={{ cursor: 'pointer' }}
                      />
                      <span>Custom (no auto-teams)</span>
                    </label>
                  </div>
                </fieldset>

                {(template === 'single' || template === 'multi') && (
                  <div style={{ marginBottom: 14, background: 'var(--surface-secondary)', borderRadius: 8, padding: 12, border: '1px solid var(--border)' }}>
                    <label style={labelStyle}>
                      {template === 'single' ? 'Select Department' : 'Select Departments'}
                    </label>

                    {deptsLoading ? (
                      <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Loading departments…</div>
                    ) : template === 'single' ? (
                      <select
                        value={selectedDepts[0] || ''}
                        onChange={(e) => setSelectedDepts(e.target.value ? [e.target.value] : [])}
                        style={inputStyle}
                      >
                        <option value="">-- Choose department --</option>
                        {depts.map((dept) => (
                          <option key={dept.id} value={dept.id}>
                            {dept.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {depts.map((dept) => (
                          <label key={dept.id} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
                            <input
                              type="checkbox"
                              checked={selectedDepts.includes(dept.id)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedDepts([...selectedDepts, dept.id])
                                } else {
                                  setSelectedDepts(selectedDepts.filter((id) => id !== dept.id))
                                }
                              }}
                              style={{ cursor: 'pointer' }}
                            />
                            <span>{dept.name}</span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </>
            ) : null}

            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>Name *</label>
              <input
                ref={titleRef}
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Healing Streams"
                style={{ ...inputStyle, fontSize: 15, padding: '10px 12px' }}
              />
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>Goal</label>
              <textarea
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                rows={3}
                placeholder="What is this sprint trying to achieve?"
                style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.6 }}
              />
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                placeholder="Context, scope, and operating notes"
                style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.6 }}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={labelStyle}>Start date</label>
                <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>End date</label>
                <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} style={inputStyle} />
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '14px 20px', borderTop: '1px solid var(--border)', background: 'var(--surface-secondary)' }}>
            <Dialog.Close
              style={{ fontSize: 13, padding: '7px 16px', borderRadius: 8, cursor: 'pointer', background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
            >
              Cancel
            </Dialog.Close>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              style={{ fontSize: 13, fontWeight: 500, padding: '7px 20px', borderRadius: 8, cursor: 'pointer', background: 'var(--accent)', color: 'white', border: 'none', opacity: saving ? 0.7 : 1 }}
            >
              {saving ? 'Saving…' : mode === 'create' ? 'Create sprint' : 'Save changes'}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
