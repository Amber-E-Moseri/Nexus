import * as Dialog from '@radix-ui/react-dialog'
import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { ACTION_LABELS, TRIGGER_LABELS, createAutomation, updateAutomation } from '../../lib/automations'
import { listTaskStatuses } from '../../lib/taskStatuses'

const INPUT_CLASS =
  'w-full rounded-xl border border-[var(--border)] bg-white px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]'

const CONDITION_FIELDS = ['task.status', 'task.priority', 'task.department', 'task.assignee']
const CONDITION_OPERATORS = ['equals', 'not equals', 'is empty', 'is not empty']
const SPRINT_STATUSES = ['planning', 'active', 'completed', 'review', 'archived']

function createEmptyCondition() {
  return { id: crypto.randomUUID(), field: 'task.status', operator: 'equals', value: '' }
}

function createEmptyAction() {
  return { id: crypto.randomUUID(), type: 'notify_user', config: { user_id: '', message: '' } }
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
  if (triggerType === 'task_status_changed') {
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
    seed?.department_id ?? departmentId ?? departments[0]?.id ?? '',
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
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const scopedUsers = useMemo(
    () => users.filter((user) => user.status === 'active' || user.status == null),
    [users],
  )

  useEffect(() => {
    setSelectedDepartmentId(seed?.department_id ?? departmentId ?? departments[0]?.id ?? '')
  }, [seed?.department_id, departmentId, departments])

  useEffect(() => {
    if (!selectedDepartmentId) {
      setTaskStatuses([])
      return
    }

    listTaskStatuses({ departmentId: selectedDepartmentId }).then(setTaskStatuses).catch(() => setTaskStatuses([]))
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

    if (!selectedDepartmentId) {
      setError('Select a space for this automation.')
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
          className="fixed left-1/2 top-1/2 z-50 flex max-h-[90vh] w-[min(760px,94vw)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl bg-white shadow-[0_24px_64px_rgba(14,14,30,0.22)]"
          aria-describedby={undefined}
        >
          <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
            <Dialog.Title className="text-sm font-semibold text-[var(--text-primary)]">
              {automation ? 'Edit automation' : 'New automation'}
            </Dialog.Title>
            <Dialog.Close aria-label="Close dialog" className="rounded-lg px-2 py-1 text-[var(--text-tertiary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"><span aria-hidden="true">×</span></Dialog.Close>
          </div>

          <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5">
            {error ? (
              <div className="rounded-xl border px-3 py-2 text-sm" style={{ borderColor: 'var(--coral)', background: 'var(--coral-light)', color: 'var(--coral-dark)' }}>{error}</div>
            ) : null}

            <section className="space-y-3">
              <div className="flex items-center justify-between gap-3">
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
                value={selectedDepartmentId}
                onChange={(event) => setSelectedDepartmentId(event.target.value)}
                className={INPUT_CLASS}
                disabled={Boolean(departmentId && departments.length <= 1)}
              >
                <option value="">Select space</option>
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

            <section className="space-y-3">
              <div>
                <h3 className="text-sm font-semibold text-[var(--text-primary)]">Trigger</h3>
                <p className="text-sm text-[var(--text-secondary)]">Choose what starts the automation.</p>
              </div>
              <select
                value={triggerType}
                onChange={(event) => handleTriggerTypeChange(event.target.value)}
                className={INPUT_CLASS}
              >
                {Object.entries(TRIGGER_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>

              {triggerType === 'task_status_changed' ? (
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
            </section>

            <section className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-[var(--text-primary)]">Conditions</h3>
                  <p className="text-sm text-[var(--text-secondary)]">Optional filters. Add up to three.</p>
                </div>
                <button
                  type="button"
                  disabled={conditions.length >= 3}
                  onClick={() => setConditions((current) => [...current, createEmptyCondition()])}
                  className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] disabled:opacity-50"
                >
                  + Add condition
                </button>
              </div>

              {conditions.length === 0 ? (
                <div className="rounded-xl bg-[var(--surface-secondary)] px-3 py-3 text-sm text-[var(--text-secondary)]">
                  No conditions. The trigger alone will qualify the rule.
                </div>
              ) : null}

              {conditions.map((condition, index) => (
                <div key={condition.id} className="grid gap-3 rounded-xl border border-[var(--border)] p-3 md:grid-cols-[1.3fr_1fr_1fr_auto]">
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
            </section>

            <section className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-[var(--text-primary)]">Actions</h3>
                  <p className="text-sm text-[var(--text-secondary)]">At least one action is required. Add up to five.</p>
                </div>
                <button
                  type="button"
                  disabled={actions.length >= 5}
                  onClick={() => setActions((current) => [...current, createEmptyAction()])}
                  className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] disabled:opacity-50"
                >
                  + Add action
                </button>
              </div>

              {actions.map((action, index) => (
                <div key={action.id} className="space-y-3 rounded-xl border border-[var(--border)] p-3">
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

                  {action.type === 'notify_user' ? (
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

                  {action.type === 'create_task' ? (
                    <div className="grid gap-3 md:grid-cols-3">
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
                        value={action.config?.department_id ?? departmentId ?? ''}
                        onChange={(event) => updateAction(index, (current) => ({
                          ...current,
                          config: { ...current.config, department_id: event.target.value },
                        }))}
                        className={INPUT_CLASS}
                      >
                        <option value="">Department</option>
                        {departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}
                      </select>
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
            </section>
          </div>

          <div className="flex justify-end gap-2 border-t border-[var(--border)] bg-[var(--surface-secondary)] px-5 py-4">
            <Dialog.Close className="rounded-xl border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--text-secondary)]">
              Cancel
            </Dialog.Close>
            <button
              type="button"
              disabled={saving || !selectedDepartmentId}
              onClick={handleSave}
              className="rounded-xl bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              {saving ? 'Saving…' : automation ? 'Save changes' : 'Create automation'}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
