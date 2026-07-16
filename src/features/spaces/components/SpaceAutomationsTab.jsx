import { useEffect, useMemo, useState } from 'react'
import { ACTION_LABELS, TRIGGER_LABELS, deleteAutomation, toggleAutomation, AutomationBuilder } from '../../automations'
import { AUTOMATION_TEMPLATES, TEMPLATE_CATEGORIES } from '../../automations/lib/automationTemplates'
import { formatRelativeDate } from '../../../lib/dateUtils'
import { supabase } from '../../../lib/supabase'

const RUN_STATUS_STYLES = {
  success: { label: 'Success', color: '#2D8653', background: '#E7F7EC' },
  error: { label: 'Error', color: '#C94830', background: '#FDECEC' },
  partial: { label: 'Partial', color: '#B7791F', background: '#FFF2D6' },
}

function getFirstActionLabel(actions) {
  if (!Array.isArray(actions) || actions.length === 0) return 'No action'
  return ACTION_LABELS[actions[0].type] ?? actions[0].type
}

function getLatestRun(runs) {
  return [...(runs ?? [])].sort((left, right) => new Date(right.ran_at ?? 0) - new Date(left.ran_at ?? 0))[0] ?? null
}

function getRunStatusKey(status) {
  if (status === 'failed') return 'error'
  return status ?? 'error'
}

function getRunStatusLabel(status) {
  const statusKey = getRunStatusKey(status)
  return RUN_STATUS_STYLES[statusKey]?.label ?? String(status ?? 'Unknown')
}

export default function SpaceAutomationsTab({ space, canManage }) {
  const [automations, setAutomations] = useState([])
  const [users, setUsers] = useState([])
  const [departments, setDepartments] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showBuilder, setShowBuilder] = useState(false)
  const [editingAutomation, setEditingAutomation] = useState(null)
  const [builderTemplate, setBuilderTemplate] = useState(null)

  const activeCount = useMemo(
    () => automations.filter((automation) => automation.enabled).length,
    [automations],
  )

  // Shared 12-template gallery (also used on the standalone /automations page) —
  // space-scoped automations reuse the same templates rather than a separate,
  // smaller local list.
  const templates = useMemo(
    () =>
      AUTOMATION_TEMPLATES.map((template) => ({
        id: template.id,
        label: template.name,
        category: template.category,
        description: template.description,
        values: {
          name: template.name,
          trigger_type: template.trigger_type,
          trigger_config: template.trigger_config,
          conditions: template.conditions,
          actions: template.actions,
        },
      })),
    [],
  )

  async function loadAutomations() {
    if (!space?.id) return

    setLoading(true)
    setError('')

    try {
      const [{ data, error: automationsError }, departmentsRes, usersRes] = await Promise.all([
        supabase
          .from('automations')
          .select(`
            id, name, trigger_type, trigger_config,
            conditions, actions, enabled, fire_count,
            last_fired_at,
            runs:automation_runs(
              id, status, ran_at
            )
          `)
          .eq('department_id', space.id)
          .order('created_at', { ascending: false }),
        supabase.from('departments').select('id, name').order('name'),
        supabase.from('users').select('id, name, department_id, status').order('name'),
      ])

      if (automationsError) throw automationsError
      if (departmentsRes.error) throw departmentsRes.error
      if (usersRes.error) throw usersRes.error

      setAutomations(data ?? [])
      setDepartments(departmentsRes.data ?? [])
      setUsers((usersRes.data ?? []).filter((user) => user.department_id === space.id || user.department_id == null))
    } catch (nextError) {
      setError(nextError.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAutomations()
  }, [space?.id])

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4 rounded-[24px] border border-[var(--border)] bg-white p-5 shadow-[var(--card-shadow)]">
        <div>
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">Automations</h2>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            {activeCount} of {automations.length} rules active in this space - trigger-and-action workflows scoped here.
          </p>
        </div>

        {canManage ? (
          <button
            type="button"
            onClick={() => {
              setEditingAutomation(null)
              setBuilderTemplate(null)
              setShowBuilder(true)
            }}
            className="rounded-xl bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white"
          >
            + New Automation
          </button>
        ) : null}
      </div>

      {error ? (
        <div className="rounded-2xl border px-4 py-3 text-sm" style={{ borderColor: 'var(--coral)', background: 'var(--coral-light)', color: 'var(--coral-dark)' }}>
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="rounded-[24px] border border-[var(--border)] bg-white p-8 shadow-[var(--card-shadow)]">
          <div className="text-sm text-[var(--text-secondary)]">Loading automations...</div>
        </div>
      ) : null}

      {!loading && automations.length === 0 ? (
        <div className="rounded-[24px] border border-dashed border-[var(--border)] bg-white p-10 text-center text-sm text-[var(--text-secondary)] shadow-[var(--card-shadow)]">
          No automations in this space yet.
        </div>
      ) : null}

      {!loading ? (
        <div className="space-y-3">
          {automations.map((automation) => {
            const latestRun = getLatestRun(automation.runs)
            const statusKey = getRunStatusKey(latestRun?.status)
            const statusStyle = RUN_STATUS_STYLES[statusKey] ?? RUN_STATUS_STYLES.error

            return (
              <div key={automation.id} className="rounded-[24px] border border-[var(--border)] bg-white p-5 shadow-[var(--card-shadow)]">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="text-base font-semibold text-[var(--text-primary)]">{automation.name}</div>
                    <div className="mt-1 text-sm text-[var(--text-secondary)]">
                      {`When: ${TRIGGER_LABELS[automation.trigger_type] ?? automation.trigger_type} → Then: ${getFirstActionLabel(automation.actions)}`}
                    </div>
                    <div className="mt-3 text-xs text-[var(--text-tertiary)]">
                      {automation.fire_count ?? 0} runs · Last:{' '}
                      {latestRun ? (
                        <span style={{ color: statusStyle.color, fontWeight: 600 }}>
                          {getRunStatusLabel(latestRun.status)} · {formatRelativeDate(latestRun.ran_at, { includeTime: true })}
                        </span>
                      ) : (
                        'Never'
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await toggleAutomation(automation.id, !automation.enabled)
                          await loadAutomations()
                        } catch (nextError) {
                          setError(nextError.message)
                        }
                      }}
                      className="rounded-full px-3 py-1 text-xs font-semibold"
                      style={
                        automation.enabled
                          ? { background: '#E7F7EC', color: '#2D8653' }
                          : { background: '#F2EEE6', color: '#7A6F5E' }
                      }
                    >
                      {automation.enabled ? 'Enabled' : 'Disabled'}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setEditingAutomation(automation)
                        setBuilderTemplate(null)
                        setShowBuilder(true)
                      }}
                      className="rounded-xl border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)]"
                    >
                      Edit
                    </button>

                    <button
                      type="button"
                      onClick={async () => {
                        if (!window.confirm(`Delete automation "${automation.name}"?`)) return
                        try {
                          await deleteAutomation(automation.id)
                          await loadAutomations()
                        } catch (nextError) {
                          setError(nextError.message)
                        }
                      }}
                      className="rounded-xl border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--coral-dark)]"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      ) : null}

      {canManage ? (
        <div className="rounded-[24px] border border-[var(--border)] bg-white p-5 shadow-[var(--card-shadow)]">
          <div className="text-sm font-semibold text-[var(--text-primary)]">Quick-add templates</div>
          <div className="mt-3 flex flex-wrap gap-2">
            {templates.map((template) => {
              const cat = TEMPLATE_CATEGORIES[template.category]
              return (
                <button
                  key={template.id}
                  type="button"
                  title={template.description}
                  onClick={() => {
                    setEditingAutomation(null)
                    setBuilderTemplate(template.values)
                    setShowBuilder(true)
                  }}
                  className="rounded-full border border-[var(--border)] bg-[var(--surface-secondary)] px-4 py-2 text-sm text-[var(--text-primary)]"
                >
                  {cat ? `${cat.icon} ` : ''}
                  {template.label}
                </button>
              )
            })}
          </div>
        </div>
      ) : null}

      {showBuilder ? (
        <AutomationBuilder
          automation={editingAutomation}
          initialValues={builderTemplate}
          departmentId={space.id}
          users={users}
          departments={departments}
          onSaved={async () => {
            await loadAutomations()
          }}
          onClose={() => {
            setEditingAutomation(null)
            setBuilderTemplate(null)
            setShowBuilder(false)
          }}
        />
      ) : null}
    </div>
  )
}
