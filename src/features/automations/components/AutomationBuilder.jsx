import * as Dialog from '@radix-ui/react-dialog'
import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../../../hooks/useAuth'
import { ACTION_LABELS, TRIGGER_LABELS, createAutomation, updateAutomation } from '../lib/automations'
import { listTaskStatuses } from '../../../lib/taskStatuses'
import { getLists } from '../../spaces/lib/spaces'
import { FONT_BODY, FONT_HEADING, FONT_MONO } from '../../../lib/fonts'

const INPUT_CLASS =
  'w-full rounded-xl border border-[var(--border-1)] bg-white px-3 py-2 text-sm text-[var(--ink-1)] outline-none focus:border-[var(--purple-500)]'

// Visual step chain (WHEN → IF → THEN) for the builder. Presentation only —
// all trigger/condition/action state and handlers are unchanged.
const STEP_STYLES = {
  trigger:   { chip: 'WHEN', chipBg: 'var(--purple-tint)',        chipText: 'var(--purple-700)',        edge: 'var(--purple-500)' },
  condition: { chip: 'IF',   chipBg: 'var(--accent-yellow-tint)', chipText: 'var(--accent-yellow-text)', edge: 'var(--accent-yellow)' },
  action:    { chip: 'THEN', chipBg: 'var(--accent-green-tint)',  chipText: 'var(--accent-green-text)',  edge: 'var(--accent-green)' },
}

function StepCard({ kind, title, description, headerRight, children }) {
  const step = STEP_STYLES[kind]
  return (
    <section
      className="flex flex-col gap-3 rounded-[14px] border border-[var(--border-1)] bg-white p-4"
      style={{
        borderLeft: `3px solid ${step.edge}`,
      }}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <span
            style={{
              fontFamily: FONT_MONO,
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '.08em',
              background: step.chipBg,
              color: step.chipText,
              borderRadius: 6,
              padding: '3px 8px',
              marginTop: 2,
              flexShrink: 0,
            }}
          >
            {step.chip}
          </span>
          <div>
            <h3 style={{ margin: 0, fontFamily: FONT_HEADING, fontSize: 14, fontWeight: 600, color: 'var(--ink-1)' }}>{title}</h3>
            <p style={{ margin: '2px 0 0', fontSize: 12.5, color: 'var(--ink-2)' }}>{description}</p>
          </div>
        </div>
        {headerRight}
      </div>
      {children}
    </section>
  )
}

function StepConnector() {
  return (
    <div aria-hidden="true" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 40, margin: '4px 0' }}>
      <span style={{ width: 2, height: 14, background: 'var(--border-2)' }} />
      <span style={{ width: 0, height: 0, borderLeft: '5px solid transparent', borderRight: '5px solid transparent', borderTop: '6px solid var(--border-2)' }} />
    </div>
  )
}

function AddStepButton({ label, disabled, onClick }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      style={{
        border: '1px dashed var(--purple-500)',
        color: 'var(--purple-700)',
        background: 'transparent',
        borderRadius: 8,
        padding: '6px 12px',
        fontSize: 12,
        fontWeight: 600,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.45 : 1,
        whiteSpace: 'nowrap',
        flexShrink: 0,
        transition: 'background .12s',
      }}
      onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.background = 'var(--purple-tint)' }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
    >
      {label}
    </button>
  )
}

const CONDITION_FIELDS = ['task.status', 'task.priority', 'task.department', 'task.assignee', 'task.list_id']
const CONDITION_OPERATORS = ['equals', 'not equals', 'is empty', 'is not empty']
const SPRINT_STATUSES = ['planning', 'active', 'completed', 'review', 'archived']

function createEmptyCondition() {
  return { id: crypto.randomUUID(), field: 'task.status', operator: 'equals', value: '' }
}

function createEmptyAction() {
  return { id: crypto.randomUUID(), type: 'send_notification', config: { user_id: '', message: '' } }
}

function normalizeConditions(value) {
  return Array.isArray(value)
    ? value.map((condition) => ({ id: crypto.randomUUID(), ...condition }))
    : []
}

function normalizeActions(value) {
  return Array.isArray(value) && value.length > 0
    ? value.map((action) => ({ id: crypto.randomUUID(), ...action }))
    : [createEmptyAction()]
}

function validateWebhookUrl(url) {
  if (!url?.trim()) {
    return { valid: false, error: 'Webhook URL is required' }
  }

  let parsedUrl

  try {
    parsedUrl = new URL(url)
  } catch {
    return { valid: false, error: 'Webhook URL must be a valid URL' }
  }

  if (parsedUrl.protocol !== 'https:') {
    return { valid: false, error: 'Webhook URLs must use https://' }
  }

  const hostname = parsedUrl.hostname.toLowerCase()

  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '0.0.0.0') {
    return { valid: false, error: 'Webhook URL cannot target localhost' }
  }

  if (
    /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)
    || /^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostname)
    || /^169\.254\.\d{1,3}\.\d{1,3}$/.test(hostname)
    || /^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/.test(hostname)
  ) {
    return { valid: false, error: 'Webhook URL cannot target a private network address' }
  }

  return { valid: true, error: null }
}

function normalizeTriggerConfig(triggerType, currentConfig = {}) {
  if (triggerType === 'task_status_change') {
    return {
      from_status: currentConfig.from_status ?? '',
      to_status: currentConfig.to_status ?? '',
    }
  }

  if (triggerType === 'api_task_received') {
    return { source_name: currentConfig.source_name ?? '' }
  }

  if (triggerType === 'sprint_status_changed') {
    return { status: currentConfig.status ?? '' }
  }

  if (triggerType === 'delegated_task_due_soon') {
    return { days_before: currentConfig.days_before ?? 1 }
  }

  if (triggerType === 'task_moved_list') {
    return { to_list_id: currentConfig.to_list_id ?? '' }
  }

  if (triggerType === 'task_inactive') {
    return { days_inactive: currentConfig.days_inactive ?? 7 }
  }

  return {}
}

export default function AutomationBuilder({
  automation = null,
  initialValues = null,
  departmentId,
  users,
  departments,
  onSaved,
  onClose,
}) {
  const seed = automation ?? initialValues ?? null
  const { profile } = useAuth()
  const [selectedDepartmentId, setSelectedDepartmentId] = useState(
    seed?.department_id ?? departmentId ?? null,
  )
  const [name, setName] = useState(seed?.name ?? '')
  const [description, setDescription] = useState(seed?.description ?? '')
  const [enabled, setEnabled] = useState(seed?.enabled ?? true)
  const [triggerType, setTriggerType] = useState(seed?.trigger_type ?? 'manual')
  const [triggerConfig, setTriggerConfig] = useState(
    normalizeTriggerConfig(seed?.trigger_type ?? 'manual', seed?.trigger_config ?? {}),
  )
  const [conditions, setConditions] = useState(normalizeConditions(seed?.conditions))
  const [actions, setActions] = useState(normalizeActions(seed?.actions))
  const [taskStatuses, setTaskStatuses] = useState([])
  const [lists, setLists] = useState([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const scopedUsers = useMemo(
    () => users.filter((user) => user.status === 'active' || user.status == null),
    [users],
  )

  useEffect(() => {
    setSelectedDepartmentId(seed?.department_id ?? departmentId ?? null)
  }, [seed?.department_id, departmentId, departments])

  useEffect(() => {
    if (!selectedDepartmentId) {
      setTaskStatuses([])
      return
    }

    listTaskStatuses({ departmentId: selectedDepartmentId }).then(setTaskStatuses).catch(() => setTaskStatuses([]))
  }, [selectedDepartmentId])

  useEffect(() => {
    if (!selectedDepartmentId) {
      setLists([])
      return
    }

    getLists(selectedDepartmentId).then(setLists).catch(() => setLists([]))
  }, [selectedDepartmentId])

  function handleTriggerTypeChange(nextType) {
    setTriggerType(nextType)
    setTriggerConfig(normalizeTriggerConfig(nextType))
  }

  function updateCondition(index, key, value) {
    setConditions((current) => current.map((condition, position) => (
      position === index ? { ...condition, [key]: value } : condition
    )))
  }

  function updateAction(index, updater) {
    setActions((current) => current.map((action, position) => (
      position === index ? updater(action) : action
    )))
  }

  async function handleSave() {
    if (!name.trim()) {
      setError('Automation name is required.')
      return
    }

    for (const action of actions) {
      if (action.type === 'post_webhook') {
        const validation = validateWebhookUrl(action.config?.url)
        if (!validation.valid) {
          setError(validation.error)
          return
        }
      }
    }

    if (actions.length === 0) {
      setError('Add at least one action.')
      return
    }

    setSaving(true)
    setError('')

    const payload = {
      name: name.trim(),
      description: description.trim() || null,
      department_id: selectedDepartmentId,
      trigger_type: triggerType,
      trigger_config: triggerConfig,
      conditions,
      actions,
      enabled,
      created_by: automation?.created_by ?? profile.id,
    }

    try {
      const saved = automation
        ? await updateAutomation(automation.id, payload)
        : await createAutomation(payload)

      onSaved(saved)
      onClose()
    } catch (nextError) {
      setError(nextError.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog.Root open onOpenChange={(open) => { if (!open) onClose() }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-50 flex max-h-[calc(100vh-16px)] w-[calc(100vw-16px)] max-w-[760px] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-[20px] border border-[var(--border-1)] bg-white shadow-[0_24px_64px_rgba(14,14,30,0.22)] sm:max-h-[90vh] sm:w-[min(760px,94vw)] sm:rounded-2xl"
          style={{ fontFamily: FONT_BODY }}
          aria-describedby={undefined}
        >
          <div className="flex items-center justify-between border-b border-[var(--border-1)] px-4 py-4 sm:px-5">
            <Dialog.Title className="text-sm" style={{ fontFamily: FONT_HEADING, fontWeight: 600, color: 'var(--ink-1)' }}>
              {automation ? 'Edit automation' : 'New automation'}
            </Dialog.Title>
            <Dialog.Close aria-label="Close dialog" className="rounded-lg px-2 py-1 text-[var(--text-tertiary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"><span aria-hidden="true">×</span></Dialog.Close>
          </div>

          <div className="flex-1 space-y-6 overflow-y-auto px-4 py-5 sm:px-5">
            {error ? (
              <div className="rounded-xl border px-3 py-2 text-sm" style={{ borderColor: 'var(--coral)', background: 'var(--coral-light)', color: 'var(--coral-dark)' }}>{error}</div>
            ) : null}

            <section className="space-y-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-[var(--text-primary)]">Details</h3>
                  <p className="text-sm text-[var(--text-secondary)]">Name the rule and decide whether it is active.</p>
                </div>
                <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                  <input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />
                  Enabled
                </label>
              </div>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                className={INPUT_CLASS}
                placeholder="Birthday sheet intake"
              />
              <select
                value={selectedDepartmentId ?? ''}
                onChange={(event) => setSelectedDepartmentId(event.target.value || null)}
                className={INPUT_CLASS}
                disabled={Boolean(departmentId && departments.length <= 1)}
              >
                <option value="">All Spaces (org-wide)</option>
                {departments.map((department) => (
                  <option key={department.id} value={department.id}>{department.name}</option>
                ))}
              </select>
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                className={`${INPUT_CLASS} min-h-[96px] resize-y`}
                placeholder="Describe when this rule is supposed to fire."
              />
            </section>

            <div style={{ display: 'flex', flexDirection: 'column' }}>
            <StepCard kind="trigger" title="Trigger" description="Choose what starts the automation.">
              <select
                value={triggerType}
                onChange={(event) => handleTriggerTypeChange(event.target.value)}
                className={INPUT_CLASS}
              >
                {Object.entries(TRIGGER_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>

              {triggerType === 'task_status_change' ? (
                <div className="grid gap-3 md:grid-cols-2">
                  <select
                    value={triggerConfig.from_status ?? ''}
                    onChange={(event) => setTriggerConfig((current) => ({ ...current, from_status: event.target.value }))}
                    className={INPUT_CLASS}
                  >
                    <option value="">From status</option>
                    {taskStatuses.map((status) => <option key={status.id} value={status.id}>{status.name}</option>)}
                  </select>
                  <select
                    value={triggerConfig.to_status ?? ''}
                    onChange={(event) => setTriggerConfig((current) => ({ ...current, to_status: event.target.value }))}
                    className={INPUT_CLASS}
                  >
                    <option value="">To status</option>
                    {taskStatuses.map((status) => <option key={status.id} value={status.id}>{status.name}</option>)}
                  </select>
                </div>
              ) : null}

              {triggerType === 'api_task_received' ? (
                <input
                  value={triggerConfig.source_name ?? ''}
                  onChange={(event) => setTriggerConfig({ source_name: event.target.value })}
                  className={INPUT_CLASS}
                  placeholder="Source name filter (optional)"
                />
              ) : null}

              {triggerType === 'sprint_status_changed' ? (
                <select
                  value={triggerConfig.status ?? ''}
                  onChange={(event) => setTriggerConfig({ status: event.target.value })}
                  className={INPUT_CLASS}
                >
                  <option value="">New sprint status</option>
                  {SPRINT_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
                </select>
              ) : null}

              {triggerType === 'delegated_task_due_soon' ? (
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="grid gap-2 text-sm text-[var(--text-secondary)]">
                    <span>Days before due date</span>
                    <input
                      type="number"
                      min={0}
                      max={30}
                      value={triggerConfig.days_before ?? 1}
                      onChange={(event) => setTriggerConfig({ days_before: Number(event.target.value) })}
                      className={INPUT_CLASS}
                    />
                  </label>
                  <p className="text-xs text-[var(--text-secondary)] self-center">
                    Fires for tasks the automation's department created for someone else, exactly this many days before they're due.
                  </p>
                </div>
              ) : null}

              {triggerType === 'task_moved_list' ? (
                <select
                  value={triggerConfig.to_list_id ?? ''}
                  onChange={(event) => setTriggerConfig({ to_list_id: event.target.value })}
                  className={INPUT_CLASS}
                >
                  <option value="">Any list</option>
                  {lists.map((list) => <option key={list.id} value={list.id}>{list.name}</option>)}
                </select>
              ) : null}

              {triggerType === 'task_inactive' ? (
                <label className="grid gap-2 text-sm text-[var(--text-secondary)]">
                  <span>Days without activity</span>
                  <input
                    type="number"
                    min={1}
                    max={90}
                    value={triggerConfig.days_inactive ?? 7}
                    onChange={(event) => setTriggerConfig({ days_inactive: Number(event.target.value) })}
                    className={INPUT_CLASS}
                  />
                </label>
              ) : null}
            </StepCard>

            <StepConnector />

            <StepCard
              kind="condition"
              title="Conditions"
              description="Optional filters. Add up to three."
              headerRight={(
                <AddStepButton
                  label="+ Add condition"
                  disabled={conditions.length >= 3}
                  onClick={() => setConditions((current) => [...current, createEmptyCondition()])}
                />
              )}
            >
              {conditions.length === 0 ? (
                <div className="rounded-xl bg-[var(--surface-secondary)] px-3 py-3 text-sm text-[var(--text-secondary)]">
                  No conditions. The trigger alone will qualify the rule.
                </div>
              ) : null}

              {conditions.map((condition, index) => (
                <div key={condition.id} className="grid gap-3 rounded-xl border border-[var(--border-1)] bg-[var(--surface-sub)] p-3 md:grid-cols-[1.3fr_1fr_1fr_auto]">
                  <select value={condition.field} onChange={(event) => updateCondition(index, 'field', event.target.value)} className={INPUT_CLASS}>
                    {CONDITION_FIELDS.map((field) => <option key={field} value={field}>{field}</option>)}
                  </select>
                  <select value={condition.operator} onChange={(event) => updateCondition(index, 'operator', event.target.value)} className={INPUT_CLASS}>
                    {CONDITION_OPERATORS.map((operator) => <option key={operator} value={operator}>{operator}</option>)}
                  </select>
                  <input
                    value={condition.value ?? ''}
                    onChange={(event) => updateCondition(index, 'value', event.target.value)}
                    className={INPUT_CLASS}
                    placeholder="Value"
                    disabled={condition.operator === 'is empty' || condition.operator === 'is not empty'}
                  />
                  <button
                    type="button"
                    onClick={() => setConditions((current) => current.filter((_, position) => position !== index))}
                    className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)]"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </StepCard>

            <StepConnector />

            <StepCard
              kind="action"
              title="Actions"
              description="At least one action is required. Add up to five."
              headerRight={(
                <AddStepButton
                  label="+ Add action"
                  disabled={actions.length >= 5}
                  onClick={() => setActions((current) => [...current, createEmptyAction()])}
                />
              )}
            >
              {actions.map((action, index) => (
                <div key={action.id} className="space-y-3 rounded-xl border border-[var(--border-1)] bg-[var(--surface-sub)] p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-medium text-[var(--text-primary)]">
                      {ACTION_LABELS[action.type] ?? action.type}
                    </div>
                    {actions.length > 1 ? (
                      <button
                        type="button"
                        onClick={() => setActions((current) => current.filter((_, position) => position !== index))}
                        className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)]"
                      >
                        Remove
                      </button>
                    ) : null}
                  </div>

                  <select
                    value={action.type}
                    onChange={(event) =>
                      updateAction(index, () => ({
                        id: action.id,
                        type: event.target.value,
                        config: {},
                      }))
                    }
                    className={INPUT_CLASS}
                  >
                    {Object.entries(ACTION_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>

                  {action.type === 'send_notification' ? (
                    <div className="grid gap-3 md:grid-cols-2">
                      <select
                        value={action.config?.user_id ?? ''}
                        onChange={(event) => updateAction(index, (current) => ({
                          ...current,
                          config: { ...current.config, user_id: event.target.value },
                        }))}
                        className={INPUT_CLASS}
                      >
                        <option value="">Select user</option>
                        <option value="created_by">Task creator</option>
                        <option value="assigned_to">Task assignee</option>
                        {scopedUsers.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
                      </select>
                      <input
                        value={action.config?.message ?? ''}
                        onChange={(event) => updateAction(index, (current) => ({
                          ...current,
                          config: { ...current.config, message: event.target.value },
                        }))}
                        className={INPUT_CLASS}
                        placeholder="Notification message"
                      />
                    </div>
                  ) : null}

                  {action.type === 'update_task_status' ? (
                    <select
                      value={action.config?.status ?? ''}
                      onChange={(event) => updateAction(index, (current) => ({
                        ...current,
                        config: { ...current.config, status: event.target.value },
                      }))}
                      className={INPUT_CLASS}
                    >
                      <option value="">Select status</option>
                      {taskStatuses.map((status) => <option key={status.id} value={status.id}>{status.name}</option>)}
                    </select>
                  ) : null}

                  {action.type === 'assign_task' ? (
                    <select
                      value={action.config?.assignee_id ?? ''}
                      onChange={(event) => updateAction(index, (current) => ({
                        ...current,
                        config: { ...current.config, assignee_id: event.target.value },
                      }))}
                      className={INPUT_CLASS}
                    >
                      <option value="">Select assignee</option>
                      <option value="__creator__">Task creator</option>
                      {scopedUsers.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
                    </select>
                  ) : null}

                  {action.type === 'set_field' ? (
                    <div className="grid gap-3 md:grid-cols-2">
                      <select
                        value={action.config?.field ?? 'due_date'}
                        onChange={(event) => updateAction(index, (current) => ({
                          ...current,
                          config: { ...current.config, field: event.target.value },
                        }))}
                        className={INPUT_CLASS}
                      >
                        <option value="due_date">Due date</option>
                        <option value="start_date">Start date</option>
                      </select>
                      <label className="grid gap-2 text-sm text-[var(--text-secondary)]">
                        <span>Days from now</span>
                        <input
                          type="number"
                          value={action.config?.relative_days ?? 0}
                          onChange={(event) => updateAction(index, (current) => ({
                            ...current,
                            config: { ...current.config, relative_days: Number(event.target.value) },
                          }))}
                          className={INPUT_CLASS}
                        />
                      </label>
                    </div>
                  ) : null}

                  {action.type === 'clear_field' ? (
                    <select
                      value={action.config?.field ?? 'due_date'}
                      onChange={(event) => updateAction(index, (current) => ({
                        ...current,
                        config: { ...current.config, field: event.target.value },
                      }))}
                      className={INPUT_CLASS}
                    >
                      <option value="due_date">Due date</option>
                      <option value="start_date">Start date</option>
                      <option value="assignee_id">Assignee</option>
                    </select>
                  ) : null}

                  {action.type === 'move_to_list' ? (
                    <select
                      value={action.config?.list_id ?? ''}
                      onChange={(event) => updateAction(index, (current) => ({
                        ...current,
                        config: { ...current.config, list_id: event.target.value },
                      }))}
                      className={INPUT_CLASS}
                    >
                      <option value="">Select target list</option>
                      {lists.map((list) => <option key={list.id} value={list.id}>{list.name}</option>)}
                    </select>
                  ) : null}

                  {action.type === 'shift_dependent_dates' ? (
                    <p className="text-xs text-[var(--text-secondary)]">
                      No configuration needed — shifts every task that depends on this one by the same number of days this task's date just moved.
                    </p>
                  ) : null}

                  {action.type === 'create_task' ? (
                    <div className="space-y-2">
                      <div className="grid gap-3 md:grid-cols-2">
                        <input
                          value={action.config?.title ?? ''}
                          onChange={(event) => updateAction(index, (current) => ({
                            ...current,
                            config: { ...current.config, title: event.target.value },
                          }))}
                          className={INPUT_CLASS}
                          placeholder="Task title template"
                        />
                        <select
                          value={action.config?.assignee_id ?? ''}
                          onChange={(event) => updateAction(index, (current) => ({
                            ...current,
                            config: { ...current.config, assignee_id: event.target.value },
                          }))}
                          className={INPUT_CLASS}
                        >
                          <option value="">Assignee</option>
                          {scopedUsers.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
                        </select>
                      </div>
                      <p className="text-xs text-[var(--text-secondary)]">
                        Created in {departments.find((department) => department.id === selectedDepartmentId)?.name ?? 'this automation’s'} space — automations can only create tasks in their own department.
                      </p>
                    </div>
                  ) : null}

                  {action.type === 'send_email' ? (
                    <div className="grid gap-3 md:grid-cols-2">
                      <input
                        value={action.config?.to ?? ''}
                        onChange={(event) => updateAction(index, (current) => ({
                          ...current,
                          config: { ...current.config, to: event.target.value },
                        }))}
                        className={INPUT_CLASS}
                        placeholder="Recipient email"
                      />
                      <input
                        value={action.config?.subject ?? ''}
                        onChange={(event) => updateAction(index, (current) => ({
                          ...current,
                          config: { ...current.config, subject: event.target.value },
                        }))}
                        className={INPUT_CLASS}
                        placeholder="Email subject"
                      />
                    </div>
                  ) : null}

                  {action.type === 'post_webhook' ? (
                    <div className="space-y-3">
                      <input
                        value={action.config?.url ?? ''}
                        onChange={(event) => updateAction(index, (current) => ({
                          ...current,
                          config: { ...current.config, url: event.target.value },
                        }))}
                        className={INPUT_CLASS}
                        placeholder="https://example.com/webhook"
                      />
                      <textarea
                        value={action.config?.payload ?? ''}
                        onChange={(event) => updateAction(index, (current) => ({
                          ...current,
                          config: { ...current.config, payload: event.target.value },
                        }))}
                        className={`${INPUT_CLASS} min-h-[96px] resize-y font-mono text-xs`}
                        placeholder='{"task":"{{task.title}}"}'
                      />
                    </div>
                  ) : null}
                </div>
              ))}
            </StepCard>
            </div>
          </div>

          <div className="flex flex-col-reverse gap-2 border-t border-[var(--border-1)] bg-[var(--surface-sub)] px-4 py-4 sm:flex-row sm:justify-end sm:px-5">
            <Dialog.Close className="rounded-xl border border-[var(--border-1)] px-4 py-2 text-sm font-medium text-[var(--ink-2)]">
              Cancel
            </Dialog.Close>
            <button
              type="button"
              disabled={saving}
              onClick={handleSave}
              className="rounded-xl bg-[var(--purple-700)] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[var(--purple-600)] disabled:opacity-60"
            >
              {saving ? 'Saving…' : automation ? 'Save changes' : 'Create automation'}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
