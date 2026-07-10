import * as Dialog from '@radix-ui/react-dialog'
import { useEffect, useMemo, useState } from 'react'
import { deleteApiKey, generateApiKey, getDeptApiKeys, regenerateApiKey, revokeApiKey, toggleApiKeyDisabled } from '../../../lib/apiKeys'
import { FONT_BODY, FONT_HEADING, FONT_MONO } from '../../../lib/fonts'

const INPUT_CLASS =
  'w-full rounded-xl border border-[var(--border-1)] bg-white px-3 py-2 text-sm text-[var(--ink-1)] outline-none focus:border-[var(--purple-500)]'

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
  if (key.revoked) return { label: 'Revoked', style: { background: 'var(--accent-red-tint)', color: 'var(--accent-red-text)' } }
  if (key.disabled) return { label: 'Disabled', style: { background: 'var(--surface-secondary, #f3f4f6)', color: 'var(--ink-3)' } }
  if (key.expires_at && new Date(key.expires_at).getTime() < Date.now()) {
    return { label: 'Expired', style: { background: 'var(--accent-yellow-tint)', color: 'var(--accent-yellow-text)' } }
  }
  return { label: 'Active', style: { background: 'var(--accent-green-tint)', color: 'var(--accent-green-text)' } }
}

function maskKey(fullKey) {
  return `${fullKey.slice(0, 10)}${'•'.repeat(Math.max(fullKey.length - 10, 12))}`
}

function MetaChip({ label, value }) {
  if (!value || value === '—') return null
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      <span style={{ fontSize: '9.5px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-tertiary)' }}>{label}</span>
      <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{value}</span>
    </div>
  )
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
  const [regeneratingId, setRegeneratingId] = useState(null)
  const [revealKey, setRevealKey] = useState(false)
  const [copied, setCopied] = useState(false)

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
    <section className="space-y-4 rounded-2xl border border-[var(--border-1)] bg-white p-5" style={{ fontFamily: FONT_BODY }}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 style={{ margin: 0, fontFamily: FONT_HEADING, fontSize: 16, fontWeight: 600, color: 'var(--ink-1)' }}>
            API Keys <span style={{ fontFamily: FONT_BODY, fontSize: 12, fontWeight: 600, background: 'var(--purple-tint)', color: 'var(--purple-700)', borderRadius: 999, padding: '2px 9px', marginLeft: 6 }}>{keys.length}</span>
          </h2>
          <p className="mt-1 text-sm" style={{ color: 'var(--ink-2)' }}>
            Generate department-scoped keys for Google Sheets, Apps Script, and other external tools.
          </p>
        </div>
        <button
          type="button"
          disabled={!canManage || !departmentId}
          onClick={() => setOpen(true)}
          className="rounded-xl bg-[var(--purple-700)] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[var(--purple-600)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          Generate key
        </button>
      </div>

      {error ? (
        <div className="rounded-xl border px-3 py-2 text-sm" style={{ borderColor: 'var(--coral)', background: 'var(--coral-light)', color: 'var(--coral-dark)' }}>{error}</div>
      ) : null}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {keys.map((key) => {
          const status = getKeyStatus(key)
          return (
            <div
              key={key.id}
              style={{
                background: 'white',
                border: '1px solid var(--border-1)',
                borderRadius: 14,
                padding: '14px 16px',
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
                transition: 'border-color .13s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--border-2)' }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border-1)' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {key.name}
                  </div>
                  <div style={{ fontSize: 11, fontFamily: FONT_MONO, color: 'var(--ink-3)', marginTop: 2 }}>
                    {key.key_prefix}••••••••
                  </div>
                </div>
                <span style={{ fontSize: 11, fontWeight: 700, borderRadius: 999, padding: '3px 10px', ...status.style }}>
                  {status.label}
                </span>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {/* Regenerate */}
                  {canManage && !key.revoked && (
                    <button
                      type="button"
                      disabled={saving || regeneratingId === key.id}
                      onClick={async () => {
                        if (!window.confirm(`Regenerate "${key.name}"? The current key will stop working immediately.`)) return
                        setRegeneratingId(key.id)
                        try {
                          const newFullKey = await regenerateApiKey(key.id)
                          setGeneratedKey(newFullKey)
                          setOpen(true)
                          await loadKeys()
                        } catch (nextError) {
                          setError(nextError.message)
                        } finally {
                          setRegeneratingId(null)
                        }
                      }}
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        padding: '4px 10px',
                        borderRadius: 8,
                        border: '1px solid var(--border-1)',
                        background: 'transparent',
                        color: 'var(--ink-2)',
                        cursor: 'pointer',
                        opacity: saving || regeneratingId === key.id ? 0.5 : 1,
                        transition: 'color .12s, border-color .12s',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--purple-700)'; e.currentTarget.style.borderColor = 'var(--purple-700)' }}
                      onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--ink-2)'; e.currentTarget.style.borderColor = 'var(--border-1)' }}
                    >
                      {regeneratingId === key.id ? 'Rotating…' : 'Regenerate'}
                    </button>
                  )}
                  {/* Disable / Enable */}
                  {canManage && !key.revoked && (
                    <button
                      type="button"
                      disabled={saving}
                      onClick={async () => {
                        setSaving(true)
                        try {
                          await toggleApiKeyDisabled(key.id, !key.disabled)
                          await loadKeys()
                        } catch (nextError) {
                          setError(nextError.message)
                        } finally {
                          setSaving(false)
                        }
                      }}
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        padding: '4px 10px',
                        borderRadius: 8,
                        border: `1px solid ${key.disabled ? 'var(--accent-green)' : 'var(--border-1)'}`,
                        background: 'transparent',
                        color: key.disabled ? 'var(--accent-green-text)' : 'var(--ink-2)',
                        cursor: 'pointer',
                        transition: 'color .12s, border-color .12s',
                      }}
                    >
                      {key.disabled ? 'Enable' : 'Disable'}
                    </button>
                  )}
                  {/* Revoke */}
                  <button
                    type="button"
                    disabled={key.revoked || !canManage}
                    onClick={async () => {
                      if (!window.confirm(`Revoke "${key.name}"? This cannot be undone.`)) return
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
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      padding: '4px 12px',
                      borderRadius: 8,
                      border: '1px solid var(--accent-red)',
                      background: 'transparent',
                      color: 'var(--accent-red-text)',
                      cursor: key.revoked || !canManage ? 'not-allowed' : 'pointer',
                      opacity: key.revoked || !canManage ? 0.35 : 1,
                      transition: 'background .12s',
                    }}
                    onMouseEnter={(e) => { if (!key.revoked && canManage) e.currentTarget.style.background = 'var(--accent-red-tint)' }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                  >
                    Revoke
                  </button>
                  {/* Delete */}
                  {canManage && (
                    <button
                      type="button"
                      onClick={async () => {
                        if (!window.confirm(`Delete "${key.name}"?`)) return
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
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        padding: '4px 10px',
                        borderRadius: 8,
                        border: '1px solid var(--border-1)',
                        background: 'transparent',
                        color: 'var(--ink-2)',
                        cursor: 'pointer',
                        transition: 'color .12s, border-color .12s',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--accent-red-text)'; e.currentTarget.style.borderColor = 'var(--accent-red)' }}
                      onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--ink-2)'; e.currentTarget.style.borderColor = 'var(--border-1)' }}
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <span style={{ fontSize: '9.5px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-3)' }}>Scopes</span>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {(key.permissions ?? []).map((permission) => (
                      <span
                        key={permission}
                        style={{
                          fontFamily: FONT_MONO,
                          fontSize: 10.5,
                          fontWeight: 500,
                          background: 'var(--accent-blue-tint)',
                          color: 'var(--accent-blue-text)',
                          borderRadius: 6,
                          padding: '2px 7px',
                        }}
                      >
                        {permission}
                      </span>
                    ))}
                  </div>
                </div>
                <MetaChip label="Rate limit" value="60 req/min" />
                <MetaChip label="Last used" value={formatDateTime(key.last_used_at)} />
                <MetaChip label="Expires" value={formatDateTime(key.expires_at)} />
              </div>
            </div>
          )
        })}
        {!loading && keys.length === 0 ? (
          <div style={{ padding: '32px 16px', textAlign: 'center', fontSize: 13, color: 'var(--text-secondary)', border: '1px dashed var(--border)', borderRadius: 14 }}>
            No API keys created for this department yet.
          </div>
        ) : null}
      </div>

      <div className="rounded-2xl bg-[var(--surface-secondary)] px-4 py-3 text-sm text-[var(--text-secondary)]">
        <div>API endpoint: <span className="font-mono text-xs text-[var(--text-primary)]">{endpoint}</span></div>
        <div className="mt-1">Include header: <span className="font-mono text-xs text-[var(--text-primary)]">x-api-key: [your key]</span></div>
        <div className="mt-3 pt-3 border-t border-[var(--border)]">
          <a
            href="/settings/api-docs"
            className="inline-flex items-center gap-1 text-[var(--purple-700)] hover:text-[var(--purple-500)] font-medium"
          >
            View API documentation →
          </a>
        </div>
      </div>

      <Dialog.Root open={open} onOpenChange={(nextOpen) => {
        setOpen(nextOpen)
        if (!nextOpen) {
          setGeneratedKey('')
          setError('')
          setRevealKey(false)
          setCopied(false)
        }
      }}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]" />
          <Dialog.Content
            className="fixed left-1/2 top-1/2 z-50 w-[min(560px,92vw)] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl bg-white shadow-[0_24px_64px_rgba(14,14,30,0.22)]"
            aria-describedby={undefined}
          >
            <div className="flex items-center justify-between border-b border-[var(--border-1)] px-5 py-4">
              <Dialog.Title className="text-sm" style={{ fontFamily: FONT_HEADING, fontWeight: 600, color: 'var(--ink-1)' }}>
                {generatedKey ? 'Copy your new API key' : 'Generate API key'}
              </Dialog.Title>
              <Dialog.Close className="rounded-lg px-2 py-1 text-[var(--text-tertiary)]">×</Dialog.Close>
            </div>

            <div className="space-y-4 px-5 py-5">
              {generatedKey ? (
                <div className="space-y-3">
                  <div className="rounded-xl border px-3 py-2 text-sm" style={{ borderColor: 'var(--accent-yellow)', background: 'var(--accent-yellow-tint)', color: 'var(--accent-yellow-text)' }}>
                    This key will only be shown once. Copy it now.
                  </div>
                  <div className="rounded-2xl bg-[#111827] px-4 py-4 text-sm text-slate-100">
                    <div className="break-all" style={{ fontFamily: FONT_MONO }}>
                      {revealKey ? generatedKey : maskKey(generatedKey)}
                    </div>
                  </div>
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setRevealKey((current) => !current)}
                      className="rounded-xl border border-[var(--border-1)] px-4 py-2 text-sm font-medium text-[var(--ink-1)] transition-colors hover:bg-[var(--surface-sub)]"
                    >
                      {revealKey ? 'Hide' : 'Reveal'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(generatedKey)
                        setCopied(true)
                        setTimeout(() => setCopied(false), 1800)
                      }}
                      className="rounded-xl border px-4 py-2 text-sm font-medium transition-colors"
                      style={copied
                        ? { borderColor: 'var(--accent-green)', background: 'var(--accent-green-tint)', color: 'var(--accent-green-text)' }
                        : { borderColor: 'var(--border-1)', color: 'var(--ink-1)' }}
                    >
                      {copied ? 'Copied ✓' : 'Copy'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setGeneratedKey('')
                        setOpen(false)
                      }}
                      className="rounded-xl bg-[var(--purple-700)] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[var(--purple-600)]"
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
              <div className="flex justify-end gap-2 border-t border-[var(--border-1)] bg-[var(--surface-sub)] px-5 py-4">
                <Dialog.Close className="rounded-xl border border-[var(--border-1)] px-4 py-2 text-sm font-medium text-[var(--ink-2)]">
                  Cancel
                </Dialog.Close>
                <button
                  type="button"
                  disabled={saving || !departmentId}
                  onClick={handleGenerate}
                  className="rounded-xl bg-[var(--purple-700)] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[var(--purple-600)] disabled:opacity-60"
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
