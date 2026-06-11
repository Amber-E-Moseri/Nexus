import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { deleteAutomation, getDeptAutomations, getRecentAutomationRuns, toggleAutomation } from '../../lib/automations'
import { supabase } from '../../lib/supabase'
import ApiKeyManager from '../../modules/automations/ApiKeyManager'
import AutomationBuilder from '../../modules/automations/AutomationBuilder'
import AutomationCard from '../../modules/automations/AutomationCard'

const TABS = ['Automations', 'API Keys', 'Run Log']

const CODE_BLOCK_STYLE = {
  background: '#1e1e2e',
  borderRadius: 10,
  padding: '16px 20px',
  fontFamily: 'monospace',
  fontSize: 12,
  color: '#cdd6f4',
  lineHeight: 1.7,
  marginTop: 16,
}

export default function AutomationsPage() {
  const { profile, role } = useAuth()
  const [activeTab, setActiveTab] = useState('Automations')
  const [deptId, setDeptId] = useState(null)
  const [departments, setDepartments] = useState([])
  const [users, setUsers] = useState([])
  const [automations, setAutomations] = useState([])
  const [showBuilder, setShowBuilder] = useState(false)
  const [editingAutomation, setEditingAutomation] = useState(null)
  const [latestKey, setLatestKey] = useState('')
  const [runLog, setRunLog] = useState([])
  const [expandedRunId, setExpandedRunId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? 'https://[project-ref].supabase.co'

  useEffect(() => {
    if (profile?.department_id) {
      setDeptId(profile.department_id)
    }
  }, [profile])

  async function loadPageData(targetDeptId = deptId) {
    if (!targetDeptId) {
      setAutomations([])
      setLoading(false)
      return
    }

    setLoading(true)
    setError('')
    try {
      const [nextAutomations, departmentsRes, usersRes] = await Promise.all([
        getDeptAutomations(targetDeptId),
        supabase.from('departments').select('id, name').order('name'),
        supabase.from('users').select('id, name, department_id, status').order('name'),
      ])

      setAutomations(nextAutomations)
      setRunLog(await getRecentAutomationRuns((nextAutomations ?? []).map((automation) => automation.id)))
      setDepartments(departmentsRes.data ?? [])
      setUsers((usersRes.data ?? []).filter((user) => role === 'super_admin' || user.department_id === targetDeptId))
    } catch (nextError) {
      setError(nextError.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadPageData()
  }, [deptId, role])

  const scopedDepartments = useMemo(() => {
    if (role === 'super_admin') return departments
    return departments.filter((department) => department.id === deptId)
  }, [departments, deptId, role])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-[var(--text-primary)]">Automations</h1>
          <p className="mt-0.5 text-sm text-[var(--text-secondary)]">
            Automation rules and API access for your department
          </p>
        </div>
        {activeTab === 'Automations' ? (
          <button
            onClick={() => {
              setEditingAutomation(null)
              setShowBuilder(true)
            }}
            className="rounded-xl bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--accent-hover)]"
          >
            + New automation
          </button>
        ) : null}
      </div>

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={[
              'rounded-full px-4 py-2 text-sm font-medium transition',
              activeTab === tab
                ? 'bg-[var(--accent)] text-white'
                : 'bg-white text-[var(--text-secondary)] shadow-[var(--card-shadow)]',
            ].join(' ')}
          >
            {tab}
          </button>
        ))}
      </div>

      {activeTab === 'Automations' ? (
        <section className="space-y-4">
          {!deptId ? (
            <div className="rounded-2xl border border-dashed border-[var(--border)] bg-white p-10 text-center text-sm text-[var(--text-secondary)]">
              Assign a department to this account before configuring automations.
            </div>
          ) : null}

          {!loading && deptId && automations.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[var(--border)] bg-white p-12 text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--accent-light)]">
                <span className="text-2xl">⚡</span>
              </div>
              <h3 className="mb-2 text-base font-semibold text-[var(--text-primary)]">No automations yet</h3>
              <p className="text-sm text-[var(--text-secondary)]">
                Start with a trigger, then add conditions and actions your department can review before Phase 7 execution.
              </p>
            </div>
          ) : null}

          {automations.map((automation) => (
            <AutomationCard
              key={automation.id}
              automation={automation}
              onEdit={(value) => {
                setEditingAutomation(value)
                setShowBuilder(true)
              }}
              onToggle={async (value) => {
                try {
                  await toggleAutomation(value.id, !value.enabled)
                  await loadPageData()
                } catch (nextError) {
                  setError(nextError.message)
                }
              }}
              onDelete={async (value) => {
                if (!window.confirm(`Delete automation "${value.name}"?`)) return
                try {
                  await deleteAutomation(value.id)
                  await loadPageData()
                } catch (nextError) {
                  setError(nextError.message)
                }
              }}
            />
          ))}
        </section>
      ) : null}

      {activeTab === 'API Keys' ? (
        <section className="space-y-4">
          <ApiKeyManager
            departmentId={deptId}
            currentUserId={profile?.id}
            canManage={role === 'super_admin' || role === 'dept_lead'}
            onGeneratedKey={setLatestKey}
          />

          <section className="rounded-2xl border border-[var(--border)] bg-white p-5">
            <div className="text-sm font-semibold text-[var(--text-primary)]">Usage example</div>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              Use the generated key in Apps Script, scheduled jobs, or lightweight connectors.
            </p>

            <div style={CODE_BLOCK_STYLE}>
              <div style={{ color: '#6c7086', marginBottom: 8 }}># Create a task via API</div>
              <div><span style={{ color: '#89b4fa' }}>curl</span> -X POST \</div>
              <div style={{ paddingLeft: 16 }}>{`"${supabaseUrl}/functions/v1/task-api/tasks" \\`}</div>
              <div style={{ paddingLeft: 16 }}>{`-H "x-api-key: ${latestKey || 'blwk_your_key_here'}" \\`}</div>
              <div style={{ paddingLeft: 16 }}>{`-H "Content-Type: application/json" \\`}</div>
              <div style={{ paddingLeft: 16 }}>{`-d '{"title":"New task","priority":"medium","external_unique_key":"my-unique-id"}'`}</div>
            </div>
          </section>
        </section>
      ) : null}

      {activeTab === 'Run Log' ? (
        <section className="rounded-2xl border border-[var(--border)] bg-white p-5">
          {!runLog.length ? (
            <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--surface-secondary)] p-12 text-center">
              <h3 className="text-base font-semibold text-[var(--text-primary)]">No automation runs yet</h3>
              <p className="mt-2 text-sm text-[var(--text-secondary)]">
                Run history will appear here after the Phase 7 automation engine executes a rule.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {runLog.map((run) => (
                <div key={run.id} className="rounded-2xl border border-[var(--border)]">
                  <button
                    type="button"
                    onClick={() => setExpandedRunId((value) => (value === run.id ? null : run.id))}
                    className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left"
                  >
                    <div>
                      <div className="text-sm font-semibold text-[var(--text-primary)]">
                        {run.automation?.name ?? 'Automation'}
                      </div>
                      <div className="mt-1 text-xs text-[var(--text-tertiary)]">
                        {run.automation?.trigger_type ?? 'manual'} · {new Date(run.ran_at).toLocaleString()}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span
                        className={[
                          'rounded-full px-3 py-1 text-xs font-semibold',
                          run.status === 'success'
                            ? 'bg-emerald-100 text-emerald-700'
                            : run.status === 'partial'
                              ? 'bg-amber-100 text-amber-700'
                              : 'bg-red-100 text-red-700',
                        ].join(' ')}
                      >
                        {run.status}
                      </span>
                      <span className="text-xs text-[var(--text-tertiary)]">{run.duration_ms ?? 0}ms</span>
                      <span className="text-xs text-[var(--text-tertiary)]">
                        {Array.isArray(run.actions_taken) ? run.actions_taken.length : 0} actions
                      </span>
                    </div>
                  </button>
                  {expandedRunId === run.id ? (
                    <pre className="overflow-x-auto border-t border-[var(--border)] bg-[var(--surface-secondary)] px-4 py-3 text-xs text-[var(--text-secondary)]">
                      {JSON.stringify(run.actions_taken, null, 2)}
                    </pre>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </section>
      ) : null}

      {showBuilder ? (
        <AutomationBuilder
          automation={editingAutomation}
          departmentId={deptId}
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
