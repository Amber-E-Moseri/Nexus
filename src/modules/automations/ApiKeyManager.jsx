import * as Dialog from '@radix-ui/react-dialog'
import { useEffect, useMemo, useState } from 'react'
import { deleteApiKey, generateApiKey, getDeptApiKeys, revokeApiKey } from '../../lib/apiKeys'

const INPUT_CLASS =
  'w-full rounded-xl border border-[var(--border)] bg-white px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]'

function formatDateTime(value) {
  if (!value) return '—'
  return new Date(value).toLocaleString('en-CA', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function getKeyStatus(key) {
  if (key.revoked) return { label: 'Revoked', style: { background: 'var(--status-blocked-bg)', color: 'var(--status-blocked-text)' } }
  if (key.expires_at && new Date(key.expires_at).getTime() < Date.now()) {
    return { label: 'Expired', style: { background: 'var(--status-review-bg)', color: 'var(--status-review-text)' } }
  }
  return { label: 'Active', style: { background: 'var(--status-done-bg)', color: 'var(--status-done-text)' } }
}

export default function ApiKeyManager({
  departmentId,
  currentUserId,
  canManage,
  onGeneratedKey,
}) {
  const [keys, setKeys] = useState([])
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [expiresAt, setExpiresAt] = useState('')
  const [permissions, setPermissions] = useState(['tasks:read', 'tasks:write'])
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [generatedKey, setGeneratedKey] = useState('')

  const endpoint = useMemo(() => {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? ''
    return supabaseUrl ? `${supabaseUrl}/functions/v1/task-api` : 'https://[project-ref].supabase.co/functions/v1/task-api'
  }, [])

  async function loadKeys() {
    if (!departmentId) {
      setKeys([])
      setLoading(false)
      return
    }

    setLoading(true)
    try {
      setKeys(await getDeptApiKeys(departmentId))
      setError('')
    } catch (nextError) {
      setError(nextError.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadKeys()
  }, [departmentId])

  async function handleGenerate() {
    if (!name.trim()) {
      setError('Key name is required.')
      return
    }

    if (permissions.length === 0) {
      setError('Select at least one permission.')
      return
    }

    setSaving(true)
    setError('')
    try {
      const { fullKey } = await generateApiKey(
        name.trim(),
        departmentId,
        currentUserId,
        permissions,
        expiresAt || null,
      )
      setGeneratedKey(fullKey)
      onGeneratedKey?.(fullKey)
      await loadKeys()
      setName('')
      setExpiresAt('')
      setPermissions(['tasks:read', 'tasks:write'])
    } catch (nextError) {
      setError(nextError.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="space-y-4 rounded-2xl border border-[var(--border)] bg-white p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-[var(--text-primary)]">API Keys</h2>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            Generate department-scoped keys for Google Sheets, Apps Script, and other external tools.
          </p>
        </div>
        <button
          type="button"
          disabled={!canManage || !departmentId}
          onClick={() => setOpen(true)}
          className="rounded-xl bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          Generate key
        </button>
      </div>

      {error ? (
        <div className="rounded-xl border px-3 py-2 text-sm" style={{ borderColor: 'var(--coral)', background: 'var(--coral-light)', color: 'var(--coral-dark)' }}>{error}</div>
      ) : null}

      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="text-[var(--text-secondary)]">
            <tr className="border-b border-[var(--border)]">
              <th className="px-3 py-3 font-medium">Name</th>
              <th className="px-3 py-3 font-medium">Prefix</th>
              <th className="px-3 py-3 font-medium">Permissions</th>
              <th className="px-3 py-3 font-medium">Last used</th>
              <th className="px-3 py-3 font-medium">Expires</th>
              <th className="px-3 py-3 font-medium">Status</th>
              <th className="px-3 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {keys.map((key) => {
              const status = getKeyStatus(key)
              return (
                <tr key={key.id} className="border-b border-[var(--border)]/60 align-top">
                  <td className="px-3 py-3 font-medium text-[var(--text-primary)]">{key.name}</td>
                  <td className="px-3 py-3 font-mono text-xs text-[var(--text-secondary)]">{key.key_prefix}</td>
                  <td className="px-3 py-3 text-[var(--text-secondary)]">{(key.permissions ?? []).join(', ')}</td>
                  <td className="px-3 py-3 text-[var(--text-secondary)]">{formatDateTime(key.last_used_at)}</td>
                  <td className="px-3 py-3 text-[var(--text-secondary)]">{formatDateTime(key.expires_at)}</td>
                  <td className="px-3 py-3">
                    <span className="rounded-full px-2.5 py-1 text-xs font-medium" style={status.style}>
                      {status.label}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={key.revoked}
                        onClick={async () => {
                          setSaving(true)
                          try {
                            await revokeApiKey(key.id)
                            await loadKeys()
                          } catch (nextError) {
                            setError(nextError.message)
                          } finally {
                            setSaving(false)
                          }
                        }}
                        className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] disabled:opacity-50"
                      >
                        Revoke
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          if (!window.confirm(`Delete API key "${key.name}" permanently?`)) return
                          setSaving(true)
                          try {
                            await deleteApiKey(key.id)
                            await loadKeys()
                          } catch (nextError) {
                            setError(nextError.message)
                          } finally {
                            setSaving(false)
                          }
                        }}
                        className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)]"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}

            {!loading && keys.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-10 text-center text-[var(--text-secondary)]">
                  No API keys created for this department yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="rounded-2xl bg-[var(--surface-secondary)] px-4 py-3 text-sm text-[var(--text-secondary)]">
        <div>API endpoint: <span className="font-mono text-xs text-[var(--text-primary)]">{endpoint}</span></div>
        <div className="mt-1">Include header: <span className="font-mono text-xs text-[var(--text-primary)]">x-api-key: [your key]</span></div>
      </div>

      <Dialog.Root open={open} onOpenChange={(nextOpen) => {
        setOpen(nextOpen)
        if (!nextOpen) {
          setGeneratedKey('')
          setError('')
        }
      }}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]" />
          <Dialog.Content
            className="fixed left-1/2 top-1/2 z-50 w-[min(560px,92vw)] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl bg-white shadow-[0_24px_64px_rgba(14,14,30,0.22)]"
            aria-describedby={undefined}
          >
            <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
              <Dialog.Title className="text-sm font-semibold text-[var(--text-primary)]">
                Generate API key
              </Dialog.Title>
              <Dialog.Close className="rounded-lg px-2 py-1 text-[var(--text-tertiary)]">×</Dialog.Close>
            </div>

            <div className="space-y-4 px-5 py-5">
              {generatedKey ? (
                <div className="space-y-3">
                  <div className="rounded-xl border px-3 py-2 text-sm" style={{ borderColor: 'var(--amber)', background: 'var(--amber-light)', color: 'var(--amber-hover)' }}>
                    This key will only be shown once. Copy it now.
                  </div>
                  <div className="rounded-2xl bg-[#111827] px-4 py-4 text-sm text-slate-100">
                    <div className="break-all font-mono">{generatedKey}</div>
                  </div>
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => navigator.clipboard.writeText(generatedKey)}
                      className="rounded-xl border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--text-primary)]"
                    >
                      Copy
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setGeneratedKey('')
                        setOpen(false)
                      }}
                      className="rounded-xl bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white"
                    >
                      Done
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div>
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-secondary)]">
                      Name
                    </label>
                    <input
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      className={INPUT_CLASS}
                      placeholder="Birthday sync key"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-secondary)]">
                      Permissions
                    </label>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {[
                        ['tasks:read', 'Can read tasks'],
                        ['tasks:write', 'Can create and update tasks'],
                      ].map(([value, label]) => (
                        <label key={value} className="flex items-center gap-2 rounded-xl border border-[var(--border)] px-3 py-2 text-sm text-[var(--text-primary)]">
                          <input
                            type="checkbox"
                            checked={permissions.includes(value)}
                            onChange={(event) =>
                              setPermissions((current) =>
                                event.target.checked
                                  ? [...current, value]
                                  : current.filter((entry) => entry !== value),
                              )
                            }
                          />
                          <span>{value} — {label}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-secondary)]">
                      Expiry date
                    </label>
                    <input
                      type="date"
                      value={expiresAt}
                      onChange={(event) => setExpiresAt(event.target.value)}
                      className={INPUT_CLASS}
                    />
                  </div>
                </>
              )}
            </div>

            {!generatedKey ? (
              <div className="flex justify-end gap-2 border-t border-[var(--border)] bg-[var(--surface-secondary)] px-5 py-4">
                <Dialog.Close className="rounded-xl border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--text-secondary)]">
                  Cancel
                </Dialog.Close>
                <button
                  type="button"
                  disabled={saving || !departmentId}
                  onClick={handleGenerate}
                  className="rounded-xl bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {saving ? 'Generating…' : 'Generate key'}
                </button>
              </div>
            ) : null}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </section>
  )
}
