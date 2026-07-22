import * as Dialog from '@radix-ui/react-dialog'
import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../../../hooks/useAuth'
import {
  addSprintMember,
  createSprint,
  createSprintTeam,
  createSprintWithTemplate,
  getActiveUsers,
  getDepartments,
  updateSprint,
  updateSprintMember,
  updateSprintMemberTeams,
} from '../lib/sprints'

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

export default function SprintModal({ mode = 'create', sprint = null, initialDepartmentId = null, initialName = '', onSaved, onClose }) {
  const { profile } = useAuth()
  const [name, setName] = useState(sprint?.name ?? initialName ?? '')
  const [goal, setGoal] = useState(sprint?.goal ?? '')
  const [description, setDescription] = useState(sprint?.description ?? '')
  const [startDate, setStartDate] = useState(sprint?.start_date ?? '')
  const [endDate, setEndDate] = useState(sprint?.end_date ?? '')
  const [category, setCategory] = useState(sprint?.category ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [template, setTemplate] = useState(initialDepartmentId ? 'single' : 'custom')
  const [selectedDepts, setSelectedDepts] = useState(initialDepartmentId ? [initialDepartmentId] : [])
  const [depts, setDepts] = useState([])
  const [deptsLoading, setDeptsLoading] = useState(false)
  const [createdTeams, setCreatedTeams] = useState(null)
  const [success, setSuccess] = useState(false)
  const titleRef = useRef(null)
  const nameDirtyRef = useRef(false)

  async function createSprintTemplateFallback() {
    const departmentId = template === 'single' ? selectedDepts[0] : null
    const sprintPayload = {
      name: name.trim(),
      goal: goal.trim() || null,
      description: description.trim() || null,
      start_date: startDate || null,
      end_date: endDate || null,
      department_id: departmentId,
      category: category || null,
      sprint_type: template === 'single' ? 'single_dept' : 'multi_dept',
    }

    const sprintRecord = await createSprint(sprintPayload, profile.id, profile.role)
    const activeUsers = await getActiveUsers()
    const createdTeamsLocal = []

    for (const departmentIdValue of selectedDepts) {
      const department = depts.find((entry) => entry.id === departmentIdValue)
      if (!department) continue

      const team = await createSprintTeam(sprintRecord.id, {
        name: department.name,
        description: '',
        lead_user_id: null,
      })

      const members = activeUsers.filter(
        (user) => user.department_id === departmentIdValue && user.id !== profile.id,
      )

      for (const member of members) {
        await addSprintMember(sprintRecord.id, member.id, 'contributor', [team.id])
      }

      const creatorBelongsToTeam = activeUsers.some(
        (user) => user.id === profile.id && user.department_id === departmentIdValue,
      )

      if (creatorBelongsToTeam) {
        await updateSprintMemberTeams(sprintRecord.id, profile.id, [team.id])
      }

      createdTeamsLocal.push({
        id: team.id,
        name: team.name,
        member_count: members.length + (creatorBelongsToTeam ? 1 : 0),
      })
    }

    setCreatedTeams(createdTeamsLocal)
    setSuccess(true)

    return sprintRecord
  }

  useEffect(() => {
    titleRef.current?.focus()
  }, [])

  useEffect(() => {
    if (mode === 'create' && !sprint && !nameDirtyRef.current) {
      setName(initialName ?? '')
    }
  }, [initialName, mode, sprint])

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
    setSuccess(false)

    try {
      let saved
      if (mode === 'create') {
        if ((template === 'single' || template === 'multi') && selectedDepts.length > 0) {
          // Use new RPC that auto-populates members
          try {
            const result = await createSprintWithTemplate(
              name.trim(),
              goal.trim() || null,
              description.trim() || null,
              startDate || null,
              endDate || null,
              template === 'single' ? 'single_dept' : 'multi_dept',
              selectedDepts,
              profile.id
            )

            if (result) {
              if (category) {
                await updateSprint(result.sprint_id, { category })
              }
              saved = {
                id: result.sprint_id,
                name: name.trim(),
                goal: goal.trim() || null,
                description: description.trim() || null,
                start_date: startDate || null,
                end_date: endDate || null,
                status: 'planning',
                is_archived: false,
                created_by: profile.id,
                created_at: new Date().toISOString(),
                department_id: template === 'single' ? selectedDepts[0] : null,
                category: category || null,
              }
              setCreatedTeams(result.created_teams || [])
              setSuccess(true)
            }
          } catch (rpcError) {
            const message = String(rpcError?.message || '')
            if (!message.includes('column reference "sprint_id" is ambiguous')) {
              throw rpcError
            }

            saved = await createSprintTemplateFallback()
          }
        } else {
          // Custom template - no auto-creation
          const payload = {
            name: name.trim(),
            goal: goal.trim() || null,
            description: description.trim() || null,
            start_date: startDate || null,
            end_date: endDate || null,
            department_id: null,
            category: category || null,
            sprint_type: 'custom',
          }
          saved = await createSprint(payload, profile.id, profile.role)
          setSuccess(true)
        }
      } else {
        const payload = {
          name: name.trim(),
          goal: goal.trim() || null,
          description: description.trim() || null,
          start_date: startDate || null,
          end_date: endDate || null,
          category: category || null,
        }
        saved = await updateSprint(sprint.id, payload)
        setSuccess(true)
      }

      // Close modal after showing success message
      setTimeout(() => {
        onSaved?.(saved)
        onClose()
      }, 1500)
    } catch (err) {
      setError(err.message)
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
            {success && createdTeams ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'center', justifyContent: 'center', minHeight: '300px' }}>
                <div style={{ fontSize: 32, color: '#2D8653' }}>✓</div>
                <div style={{ textAlign: 'center' }}>
                  <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>
                    {name} created with {createdTeams.length} team{createdTeams.length !== 1 ? 's' : ''}
                  </h2>
                  {createdTeams.length > 0 && (
                    <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                      {createdTeams.map((team) => (
                        <div key={team.id} style={{ marginBottom: 6 }}>
                          • <strong>{team.name}</strong> ({team.member_count} member{team.member_count !== 1 ? 's' : ''} auto-added)
                        </div>
                      ))}
                    </div>
                  )}
                  <p style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 12 }}>
                    You can adjust members in the Teams panel.
                  </p>
                </div>
              </div>
            ) : (
              <>
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
              </>
            )}

            {!success && (
              <>
                <div style={{ marginBottom: 14 }}>
                  <label style={labelStyle}>Name *</label>
                  <input
                    ref={titleRef}
                    type="text"
                    value={name}
                    onChange={(e) => { nameDirtyRef.current = true; setName(e.target.value) }}
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

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
                  <div>
                    <label style={labelStyle}>Start date</label>
                    <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>End date</label>
                    <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} style={inputStyle} />
                  </div>
                </div>

                <div>
                  <label style={labelStyle}>Category</label>
                  <select value={category} onChange={(e) => setCategory(e.target.value)} style={inputStyle}>
                    <option value="">— None —</option>
                    <option value="group">Group</option>
                    <option value="regional">Regional</option>
                  </select>
                </div>
              </>
            )}
          </div>

          {!success && (
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
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
