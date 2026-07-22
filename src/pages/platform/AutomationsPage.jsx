import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { useHasPermission } from '../../hooks/useHasPermission'
import { ACTION_LABELS, TRIGGER_LABELS, deleteAutomation, getRecentAutomationRuns, toggleAutomation, getAllDepartments, getAllUsers, getAllAutomations, getAutomationRunLog, getWebhookDeliveryLog, AutomationBuilder } from '../../features/automations'
import { AUTOMATION_TEMPLATES, TEMPLATE_CATEGORIES } from '../../features/automations/lib/automationTemplates'
import { formatLastActive } from '../../lib/dateUtils'
import { supabase } from '../../lib/supabase'
import { FONT_BODY, FONT_HEADING } from '../../lib/fonts'

function getRunTone(status) {
  if (status === 'success' || status === 'ok') {
    return { bg: 'var(--status-done-bg)', text: 'var(--status-done-text)', label: 'Success' }
  }

  if (status === 'partial') {
    return { bg: 'var(--status-review-bg)', text: 'var(--status-review-text)', label: 'Partial' }
  }

  return { bg: 'var(--status-blocked-bg)', text: 'var(--status-blocked-text)', label: 'Error' }
}

function Toggle({ checked, onClick }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onClick}
      className={[
        'relative h-6 w-12 rounded-full transition',
        checked ? 'bg-[#2E8B57]' : 'bg-[#D7D0C6]',
      ].join(' ')}
    >
      <span
        className={[
          'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition',
          checked ? 'left-6' : 'left-0.5',
        ].join(' ')}
      />
    </button>
  )
}

function RunBadge({ status }) {
  const tone = getRunTone(status)

  return (
    <span
      className="rounded-full px-2.5 py-1 text-[11px] font-semibold"
      style={{ background: tone.bg, color: tone.text }}
    >
      {tone.label}
    </span>
  )
}

export default function AutomationsPage({ embedded = false, initialDepartmentId = null }) {
  const { profile, role } = useAuth()
  const canManageAutomations = useHasPermission('automations:manage')
  const [deptId, setDeptId] = useState(initialDepartmentId ?? profile?.department_id ?? null)
  const [departments, setDepartments] = useState([])
  const [users, setUsers] = useState([])
  const [automations, setAutomations] = useState([])
  const [runLog, setRunLog] = useState([])
  const [automationRunLog, setAutomationRunLog] = useState([])
  const [automationRunFilter, setAutomationRunFilter] = useState('all')
  const [selectedRunDetail, setSelectedRunDetail] = useState(null)
  const [webhookLog, setWebhookLog] = useState([])
  const [webhookFilter, setWebhookFilter] = useState('all')
  const [showBuilder, setShowBuilder] = useState(false)
  const [editingAutomation, setEditingAutomation] = useState(null)
  const [loading, setLoading] = useState(true)
  const [runLogLoading, setRunLogLoading] = useState(false)
  const [webhookLoading, setWebhookLoading] = useState(false)
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState('automations')
  const [showTemplates, setShowTemplates] = useState(false)
  const [templateFilter, setTemplateFilter] = useState('all')

  useEffect(() => {
    if (initialDepartmentId) {
      setDeptId(initialDepartmentId)
      return
    }

    if (profile?.department_id) {
      setDeptId(profile.department_id)
    }
  }, [initialDepartmentId, profile?.department_id])

  const loadPageData = useCallback(
    async (targetDeptId = deptId) => {
      setLoading(true)
      setError('')

      try {
        const [departmentsRes, usersRes, automationsRes] = await Promise.all([
          getAllDepartments(),
          getAllUsers(),
          getAllAutomations(),
        ])

        let nextAutomations = automationsRes
        if (role !== 'super_admin') {
          // Show org-wide automations (null dept) + this user's dept automations
          nextAutomations = automationsRes.filter(
            (a) => a.department_id === null || a.department_id === targetDeptId
          )
        }

        const nextDepartments = departmentsRes ?? []
        const mapped = (nextAutomations ?? []).map((automation) => ({
          ...automation,
          department: nextDepartments.find((department) => department.id === automation.department_id) ?? null,
        }))

        setDepartments(nextDepartments)
        setAutomations(mapped)
        setRunLog(await getRecentAutomationRuns(mapped.map((automation) => automation.id)))
        setUsers(
          (usersRes ?? []).filter((user) => (
            role === 'super_admin'
              ? true
              : user.department_id === (targetDeptId ?? profile?.department_id ?? null)
          )),
        )
      } catch (nextError) {
        setError(nextError.message)
      } finally {
        setLoading(false)
      }
    },
    [deptId, role, profile?.department_id]
  )

  const loadAutomationRunLog = useCallback(async () => {
    if (role !== 'super_admin') return

    setRunLogLoading(true)
    try {
      const data = await getAutomationRunLog(100)
      setAutomationRunLog(data ?? [])
    } catch (nextError) {
      setError(nextError.message)
    } finally {
      setRunLogLoading(false)
    }
  }, [role])

  const loadWebhookLog = useCallback(async () => {
    if (role !== 'super_admin') return

    setWebhookLoading(true)
    try {
      const data = await getWebhookDeliveryLog(100)
      setWebhookLog(data ?? [])
    } catch (nextError) {
      setError(nextError.message)
    } finally {
      setWebhookLoading(false)
    }
  }, [role])

  useEffect(() => {
    loadPageData()
  }, [loadPageData])

  useEffect(() => {
    if (activeTab === 'webhooks') {
      loadWebhookLog()
    } else if (activeTab === 'run-log') {
      loadAutomationRunLog()
    }
  }, [activeTab, loadWebhookLog, loadAutomationRunLog])

  const scopedDepartments = useMemo(() => {
    if (role === 'super_admin') return departments
    return departments.filter((department) => department.id === (deptId ?? profile?.department_id ?? null))
  }, [departments, deptId, profile?.department_id, role])

  const activeCount = automations.filter((automation) => automation.enabled).length

  return (
    <div className="space-y-6" style={{ fontFamily: FONT_BODY }}>
      {!embedded ? (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-[22px]" style={{ fontFamily: FONT_HEADING, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--ink-1)' }}>Automations</h1>
            <p className="mt-0.5 text-sm" style={{ color: 'var(--ink-2)' }}>
              Trigger-and-action workflows across departments.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={() => setShowTemplates((v) => !v)}
              className="rounded-xl px-4 py-2 text-sm font-semibold"
              style={{ border: '1px solid var(--border-1)', background: showTemplates ? 'var(--purple-tint)' : 'white', color: 'var(--purple-700)' }}
            >
              {showTemplates ? 'Hide Templates' : 'Browse Templates'}
            </button>
            {canManageAutomations && (
            <button
              type="button"
              onClick={() => {
                setEditingAutomation(null)
                setShowBuilder(true)
              }}
              className="rounded-xl bg-[var(--purple-700)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--purple-600)]"
            >
              + New Automation
            </button>
            )}
          </div>
        </div>
      ) : null}

      {embedded ? (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-[var(--text-secondary)]">
            {activeCount} of {automations.length} rules active · trigger-and-action workflows across departments.
          </p>

          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={() => setShowTemplates((v) => !v)}
              className="rounded-xl px-4 py-2 text-sm font-semibold"
              style={{ border: '1px solid var(--border-1)', background: showTemplates ? 'var(--purple-tint)' : 'white', color: 'var(--purple-700)' }}
            >
              {showTemplates ? 'Hide Templates' : 'Browse Templates'}
            </button>
            {canManageAutomations && (
            <button
              type="button"
              onClick={() => {
                setEditingAutomation(null)
                setShowBuilder(true)
              }}
              className="rounded-xl bg-[var(--purple-700)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--purple-600)]"
            >
              + New Automation
            </button>
            )}
          </div>
        </div>
      ) : null}

      {error ? (
        <div className="rounded-2xl border px-4 py-3 text-sm" style={{ borderColor: 'var(--coral)', background: 'var(--coral-light)', color: 'var(--coral-dark)' }}>
          {error}
        </div>
      ) : null}

      {showTemplates && (
        <div style={{ background: 'white', border: '1px solid var(--border-1)', borderRadius: 16, padding: '18px 20px' }}>
          <div className="mb-[14px] flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h3 style={{ fontFamily: FONT_HEADING, fontSize: 15, fontWeight: 700, color: 'var(--ink-1)' }}>Automation Templates</h3>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setTemplateFilter('all')} style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 20, border: 'none', cursor: 'pointer', background: templateFilter === 'all' ? 'var(--purple-tint)' : 'transparent', color: templateFilter === 'all' ? 'var(--purple-700)' : 'var(--ink-2)' }}>All</button>
              {Object.entries(TEMPLATE_CATEGORIES).map(([key, cat]) => (
                <button key={key} type="button" onClick={() => setTemplateFilter(key)} style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 20, border: 'none', cursor: 'pointer', background: templateFilter === key ? 'var(--purple-tint)' : 'transparent', color: templateFilter === key ? 'var(--purple-700)' : 'var(--ink-2)' }}>
                  {cat.icon} {cat.label}
                </button>
              ))}
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 10 }}>
            {AUTOMATION_TEMPLATES
              .filter((t) => templateFilter === 'all' || t.category === templateFilter)
              .map((template) => {
                const cat = TEMPLATE_CATEGORIES[template.category]
                return (
                  <button
                    key={template.id}
                    type="button"
                    onClick={() => {
                      setEditingAutomation({
                        name: template.name,
                        description: template.description,
                        trigger_type: template.trigger_type,
                        trigger_config: template.trigger_config,
                        conditions: template.conditions,
                        actions: template.actions,
                        department_id: deptId,
                        enabled: true,
                      })
                      setShowBuilder(true)
                      setShowTemplates(false)
                    }}
                    style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '12px 14px', borderRadius: 12, border: '1px solid var(--border-1)', background: 'var(--surface-1)', cursor: 'pointer', textAlign: 'left', transition: 'border-color .15s' }}
                    onMouseEnter={(e) => { e.currentTarget.style.borderColor = cat?.color ?? 'var(--purple-500)' }}
                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border-1)' }}
                  >
                    <span style={{ fontSize: 18, flexShrink: 0, marginTop: 1 }}>{cat?.icon ?? '⚡'}</span>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-1)' }}>{template.name}</div>
                      <div style={{ fontSize: 11.5, color: 'var(--ink-2)', marginTop: 2, lineHeight: 1.4 }}>{template.description}</div>
                    </div>
                  </button>
                )
              })}
          </div>
        </div>
      )}

      {loading ? (
        <div className="rounded-3xl border border-[var(--border)] bg-white p-6 text-sm text-[var(--text-secondary)] shadow-[var(--card-shadow)]">
          Loading automations…
        </div>
      ) : (
        <>
          {role === 'super_admin' ? (
            <div className="flex gap-2 overflow-x-auto border-b border-[var(--border)] pb-1">
              <button
                type="button"
                onClick={() => setActiveTab('automations')}
                className={`px-4 py-3 text-sm font-medium border-b-2 transition ${
                  activeTab === 'automations'
                    ? 'border-[var(--purple-700)] text-[var(--purple-700)]'
                    : 'border-transparent text-[var(--ink-2)] hover:text-[var(--purple-600)]'
                }`}
              >
                Automations
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('run-log')}
                className={`px-4 py-3 text-sm font-medium border-b-2 transition ${
                  activeTab === 'run-log'
                    ? 'border-[var(--purple-700)] text-[var(--purple-700)]'
                    : 'border-transparent text-[var(--ink-2)] hover:text-[var(--purple-600)]'
                }`}
              >
                Run Log
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('webhooks')}
                className={`px-4 py-3 text-sm font-medium border-b-2 transition ${
                  activeTab === 'webhooks'
                    ? 'border-[var(--purple-700)] text-[var(--purple-700)]'
                    : 'border-transparent text-[var(--ink-2)] hover:text-[var(--purple-600)]'
                }`}
              >
                Webhook Log
              </button>
            </div>
          ) : null}

          {activeTab === 'automations' ? (
            <div className="grid gap-4 xl:grid-cols-[1fr_520px]">
          <section className="space-y-4">
            {!automations.length ? (
              <div className="rounded-3xl border border-dashed border-[var(--border)] bg-white p-10 text-center">
                <h3 className="text-base font-semibold text-[var(--text-primary)]">No automations yet</h3>
                <p className="mt-2 text-sm text-[var(--text-secondary)]">
                  Start with a trigger and action rule for a space.
                </p>
              </div>
            ) : null}

            {automations.map((automation) => {
              const latestRun = runLog.find((run) => run.automation_id === automation.id)

              return (
                <div key={automation.id} className="rounded-3xl border border-[var(--border)] bg-white p-4 shadow-[var(--card-shadow)]">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingAutomation(automation)
                          setShowBuilder(true)
                        }}
                        className="text-left"
                      >
                        <div className="text-[1.05rem] font-semibold text-[var(--text-primary)]">{automation.name}</div>
                      </button>

                      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                        <span className="rounded-full bg-[var(--status-progress-bg)] px-2.5 py-1 font-semibold text-[var(--status-progress-text)]">
                          When: {TRIGGER_LABELS[automation.trigger_type] ?? automation.trigger_type}
                        </span>
                        <span className="text-[var(--text-tertiary)]">→</span>
                        <span className="rounded-full bg-[var(--status-review-bg)] px-2.5 py-1 font-semibold text-[var(--status-review-text)]">
                          Then: {ACTION_LABELS[automation.actions?.[0]?.type] ?? automation.actions?.[0]?.type ?? 'Add action'}
                        </span>
                      </div>

                      <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-[var(--text-secondary)]">
                        <span>{automation.department?.name ?? 'All Spaces'}</span>
                        <span>{automation.fire_count ?? 0} runs</span>
                        {latestRun ? (
                          <>
                            <RunBadge status={latestRun.status} />
                            <span>{formatLastActive(latestRun.ran_at)}</span>
                          </>
                        ) : (
                          <span>No runs yet</span>
                        )}
                      </div>
                    </div>

                    {canManageAutomations && (
                    <div className="flex items-center gap-3 sm:self-start">
                      <Toggle
                        checked={automation.enabled}
                        onClick={async () => {
                          try {
                            await toggleAutomation(automation.id, !automation.enabled)
                            await loadPageData()
                          } catch (nextError) {
                            setError(nextError.message)
                          }
                        }}
                      />
                    </div>
                    )}
                  </div>
                </div>
              )
            })}
          </section>

          <section className="rounded-3xl border border-[var(--border)] bg-white shadow-[var(--card-shadow)]">
            <div className="border-b border-[var(--border)] px-5 py-4">
              <h3 className="text-lg font-semibold text-[var(--text-primary)]">Recent Runs</h3>
            </div>

            {!runLog.length ? (
              <div className="px-5 py-6 text-sm text-[var(--text-secondary)]">No automation runs yet.</div>
            ) : (
              <div>
                {runLog.slice(0, 8).map((run) => (
                  <div key={run.id} className="flex flex-col gap-3 border-b border-[var(--border)] px-5 py-4 last:border-b-0 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-[var(--text-primary)]">
                        {run.automation?.name ?? 'Automation'}
                      </div>
                      <div className="mt-1 text-sm text-[var(--text-secondary)]">
                        {run.error || `${Array.isArray(run.actions_taken) ? run.actions_taken.length : 0} action items`}
                      </div>
                      <div className="mt-2 text-xs text-[var(--text-tertiary)]">
                        {formatLastActive(run.ran_at)} · {run.duration_ms ?? 0}ms
                      </div>
                    </div>

                    <div className="sm:self-start">
                      <RunBadge status={run.status} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
            </div>
          ) : null}

          {activeTab === 'run-log' ? (
            <div className="space-y-4">
              <div className="rounded-3xl border border-[var(--border)] bg-white shadow-[var(--card-shadow)]">
                <div className="flex flex-col gap-3 border-b border-[var(--border)] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <h3 className="text-lg font-semibold text-[var(--text-primary)]">Automation Run Log</h3>
                  <div className="flex flex-wrap gap-2">
                    {['all', 'failed'].map((filter) => (
                      <button
                        key={filter}
                        type="button"
                        onClick={() => setAutomationRunFilter(filter)}
                        className={`px-3 py-1.5 text-xs font-medium rounded-lg border ${
                          automationRunFilter === filter
                            ? 'border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]'
                            : 'border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--text-secondary)]'
                        }`}
                      >
                        {filter === 'all' ? 'All' : 'Failed only'}
                      </button>
                    ))}
                  </div>
                </div>

                {runLogLoading ? (
                  <div className="px-5 py-6 text-sm text-[var(--text-secondary)]">Loading run log…</div>
                ) : !automationRunLog.length ? (
                  <div className="px-5 py-6 text-sm text-[var(--text-secondary)]">No automations have run yet.</div>
                ) : (
                  <>
                    <div className="divide-y divide-[var(--border)] md:hidden">
                      {automationRunLog
                        .filter((entry) => {
                          if (automationRunFilter === 'failed') return !entry.success
                          return true
                        })
                        .map((entry) => {
                          const automation = automations.find((a) => a.id === entry.automation_id)
                          const actionCount = Array.isArray(entry.actions_executed) ? entry.actions_executed.length : 0

                          return (
                            <button
                              key={entry.id}
                              type="button"
                              className="block w-full space-y-2 px-5 py-4 text-left transition hover:bg-[var(--surface-secondary)]"
                              onClick={() => setSelectedRunDetail(entry)}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="font-medium text-[var(--text-primary)]">
                                    {automation?.name ?? 'Unknown automation'}
                                  </div>
                                  <div className="mt-1 text-xs text-[var(--text-secondary)]">
                                    {entry.trigger_type}
                                  </div>
                                </div>
                                <span
                                  className="rounded-full px-2.5 py-1 text-[11px] font-semibold"
                                  style={{
                                    background: entry.success ? 'var(--status-done-bg)' : 'var(--status-blocked-bg)',
                                    color: entry.success ? 'var(--status-done-text)' : 'var(--status-blocked-text)',
                                  }}
                                >
                                  {entry.success ? 'Success' : 'Failed'}
                                </span>
                              </div>
                              <div className="text-xs text-[var(--text-secondary)]">
                                {new Date(entry.ran_at).toLocaleString('en-CA', {
                                  month: 'short',
                                  day: 'numeric',
                                  hour: 'numeric',
                                  minute: '2-digit',
                                })}
                              </div>
                              <div className="text-xs text-[var(--text-secondary)]">
                                {actionCount} action{actionCount !== 1 ? 's' : ''}
                              </div>
                            </button>
                          )
                        })}
                    </div>
                    <div className="hidden overflow-x-auto md:block">
                    <table className="min-w-full text-left text-sm">
                      <thead className="text-[var(--text-secondary)]">
                        <tr className="border-b border-[var(--border)]">
                          <th className="px-5 py-3 font-medium">Automation name</th>
                          <th className="px-5 py-3 font-medium">Trigger</th>
                          <th className="px-5 py-3 font-medium">Time</th>
                          <th className="px-5 py-3 font-medium">Result</th>
                          <th className="px-5 py-3 font-medium">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {automationRunLog
                          .filter((entry) => {
                            if (automationRunFilter === 'failed') return !entry.success
                            return true
                          })
                          .map((entry) => {
                            const automation = automations.find((a) => a.id === entry.automation_id)
                            const actionCount = Array.isArray(entry.actions_executed) ? entry.actions_executed.length : 0

                            return (
                              <tr
                                key={entry.id}
                                className="border-b border-[var(--border)]/60 cursor-pointer hover:bg-[var(--surface-secondary)] transition"
                                onClick={() => setSelectedRunDetail(entry)}
                              >
                                <td className="px-5 py-3 font-medium text-[var(--text-primary)]">
                                  {automation?.name ?? 'Unknown automation'}
                                </td>
                                <td className="px-5 py-3 text-xs text-[var(--text-secondary)]">
                                  {entry.trigger_type}
                                </td>
                                <td className="px-5 py-3 text-xs text-[var(--text-secondary)]">
                                  {new Date(entry.ran_at).toLocaleString('en-CA', {
                                    month: 'short',
                                    day: 'numeric',
                                    hour: 'numeric',
                                    minute: '2-digit',
                                  })}
                                </td>
                                <td className="px-5 py-3">
                                  <span
                                    className="rounded-full px-2.5 py-1 text-[11px] font-semibold"
                                    style={{
                                      background: entry.success ? 'var(--status-done-bg)' : 'var(--status-blocked-bg)',
                                      color: entry.success ? 'var(--status-done-text)' : 'var(--status-blocked-text)',
                                    }}
                                  >
                                    {entry.success ? '✅ Success' : '❌ Failed'}
                                  </span>
                                </td>
                                <td className="px-5 py-3 text-xs text-[var(--text-secondary)]">
                                  {actionCount} action{actionCount !== 1 ? 's' : ''}
                                </td>
                              </tr>
                            )
                          })}
                      </tbody>
                    </table>
                    </div>
                  </>
                )}
              </div>

              {selectedRunDetail ? (
                <div className="rounded-3xl border border-[var(--border)] bg-white p-6 shadow-[var(--card-shadow)]">
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="text-lg font-semibold text-[var(--text-primary)]">Run Details</h3>
                    <button
                      type="button"
                      onClick={() => setSelectedRunDetail(null)}
                      className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
                    >
                      ×
                    </button>
                  </div>

                  <div className="space-y-6">
                    <div>
                      <h4 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wide mb-2">
                        Trigger Payload
                      </h4>
                      <pre
                        className="rounded-xl p-3 overflow-x-auto text-xs font-mono"
                        style={{
                          background: '#2D2A22',
                          color: '#F4F1EA',
                          lineHeight: '1.5',
                        }}
                      >
                        {JSON.stringify(selectedRunDetail.trigger_payload, null, 2)}
                      </pre>
                    </div>

                    {selectedRunDetail.actions_executed && Array.isArray(selectedRunDetail.actions_executed) ? (
                      <div>
                        <h4 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wide mb-3">
                          Actions Executed
                        </h4>
                        <div className="space-y-3">
                          {selectedRunDetail.actions_executed.map((action, idx) => (
                            <div key={idx} className="rounded-lg border border-[var(--border)] p-3">
                              <div className="flex items-start justify-between gap-2">
                                <div>
                                  <div className="font-mono text-xs font-semibold text-[var(--text-primary)]">
                                    {action.action_type}
                                  </div>
                                  {action.error ? (
                                    <div className="mt-1 text-xs text-[#D32F2F]">Error: {action.error}</div>
                                  ) : null}
                                </div>
                              </div>
                              {action.result ? (
                                <pre
                                  className="mt-2 rounded-lg p-2 overflow-x-auto text-xs font-mono bg-[#F4F1EA]"
                                  style={{ color: '#2D2A22' }}
                                >
                                  {JSON.stringify(action.result, null, 2)}
                                </pre>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    {selectedRunDetail.error_message ? (
                      <div className="rounded-lg border border-[#EDE8DC]" style={{ background: '#FFEBEE' }}>
                        <div className="p-3 text-sm" style={{ color: '#D32F2F' }}>
                          <strong>Run Error:</strong> {selectedRunDetail.error_message}
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          {activeTab === 'webhooks' ? (
            <div className="rounded-3xl border border-[var(--border)] bg-white shadow-[var(--card-shadow)]">
              <div className="flex flex-col gap-3 border-b border-[var(--border)] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <h3 className="text-lg font-semibold text-[var(--text-primary)]">Webhook Delivery Log</h3>
                <div className="flex flex-wrap gap-2">
                  {['all', 'success', 'failed'].map((filter) => (
                    <button
                      key={filter}
                      type="button"
                      onClick={() => setWebhookFilter(filter)}
                      className={`px-3 py-1.5 text-xs font-medium rounded-lg border ${
                        webhookFilter === filter
                          ? 'border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]'
                          : 'border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--text-secondary)]'
                      }`}
                    >
                      {filter.charAt(0).toUpperCase() + filter.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              {webhookLoading ? (
                <div className="px-5 py-6 text-sm text-[var(--text-secondary)]">Loading webhook log…</div>
              ) : !webhookLog.length ? (
                <div className="px-5 py-6 text-sm text-[var(--text-secondary)]">No webhook deliveries recorded yet.</div>
              ) : (
                <>
                  <div className="divide-y divide-[var(--border)] md:hidden">
                    {webhookLog
                      .filter((entry) => {
                        if (webhookFilter === 'success') return entry.success
                        if (webhookFilter === 'failed') return !entry.success
                        return true
                      })
                      .map((entry) => (
                        <div key={entry.id} className="space-y-2 px-5 py-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 break-all text-xs font-mono text-[var(--text-secondary)]">
                              {entry.webhook_url}
                            </div>
                            <span
                              className="rounded-full px-2.5 py-1 text-[11px] font-semibold"
                              style={{
                                background: entry.success ? 'var(--status-done-bg)' : 'var(--status-blocked-bg)',
                                color: entry.success ? 'var(--status-done-text)' : 'var(--status-blocked-text)',
                              }}
                            >
                              {entry.response_status ?? 'Error'}
                            </span>
                          </div>
                          <div className="text-xs text-[var(--text-secondary)]">
                            {new Date(entry.delivered_at).toLocaleString('en-CA', {
                              month: 'short',
                              day: 'numeric',
                              hour: 'numeric',
                              minute: '2-digit',
                            })}
                          </div>
                          <div className="break-words text-xs text-[var(--text-secondary)]">
                            {entry.response_body || '—'}
                          </div>
                        </div>
                      ))}
                  </div>
                  <div className="hidden overflow-x-auto md:block">
                  <table className="min-w-full text-left text-sm">
                    <thead className="text-[var(--text-secondary)]">
                      <tr className="border-b border-[var(--border)]">
                        <th className="px-5 py-3 font-medium">URL</th>
                        <th className="px-5 py-3 font-medium">Status</th>
                        <th className="px-5 py-3 font-medium">Delivered</th>
                        <th className="px-5 py-3 font-medium">Response</th>
                      </tr>
                    </thead>
                    <tbody>
                      {webhookLog
                        .filter((entry) => {
                          if (webhookFilter === 'success') return entry.success
                          if (webhookFilter === 'failed') return !entry.success
                          return true
                        })
                        .map((entry) => (
                          <tr key={entry.id} className="border-b border-[var(--border)]/60">
                            <td className="px-5 py-3 text-xs font-mono text-[var(--text-secondary)]">
                              {entry.webhook_url.length > 50
                                ? entry.webhook_url.substring(0, 50) + '…'
                                : entry.webhook_url}
                            </td>
                            <td className="px-5 py-3">
                              {entry.response_status ? (
                                <span
                                  className="rounded-full px-2.5 py-1 text-[11px] font-semibold"
                                  style={{
                                    background: entry.success ? 'var(--status-done-bg)' : 'var(--status-blocked-bg)',
                                    color: entry.success ? 'var(--status-done-text)' : 'var(--status-blocked-text)',
                                  }}
                                >
                                  {entry.response_status}
                                </span>
                              ) : (
                                <span className="rounded-full px-2.5 py-1 text-[11px] font-semibold" style={{ background: 'var(--status-blocked-bg)', color: 'var(--status-blocked-text)' }}>
                                  Error
                                </span>
                              )}
                            </td>
                            <td className="px-5 py-3 text-xs text-[var(--text-secondary)]">
                              {new Date(entry.delivered_at).toLocaleString('en-CA', {
                                month: 'short',
                                day: 'numeric',
                                hour: 'numeric',
                                minute: '2-digit',
                              })}
                            </td>
                            <td className="px-5 py-3 text-xs text-[var(--text-secondary)] max-w-xs truncate">
                              {entry.response_body || '—'}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                  </div>
                </>
              )}
            </div>
          ) : null}
        </>
      )}

      {showBuilder ? (
        <AutomationBuilder
          automation={editingAutomation}
          departmentId={editingAutomation?.department_id ?? deptId}
          users={users}
          departments={scopedDepartments}
          onSaved={async () => {
            await loadPageData()
          }}
          onClose={() => {
            setEditingAutomation(null)
            setShowBuilder(false)
          }}
        />
      ) : null}
    </div>
  )
}
