import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

const inputClassName =
  'w-full rounded-xl border border-[var(--border)] bg-white px-3 py-2 text-sm text-[var(--text-primary)] outline-none'

export default function ZoomSettings() {
  const [configId, setConfigId] = useState(null)
  const [accountId, setAccountId] = useState('')
  const [clientId, setClientId] = useState('')
  const [clientSecret, setClientSecret] = useState('')
  const [webhookSecret, setWebhookSecret] = useState('')
  const [enabled, setEnabled] = useState(false)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState('')

  useEffect(() => {
    let active = true

    supabase
      .from('zoom_config')
      .select('id, account_id, client_id, webhook_secret, enabled')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!active || error || !data) return
        setConfigId(data.id)
        setAccountId(data.account_id ?? '')
        setClientId(data.client_id ?? '')
        setWebhookSecret(data.webhook_secret ?? '')
        setEnabled(Boolean(data.enabled))
      })

    return () => {
      active = false
    }
  }, [])

  async function handleSave() {
    setSaving(true)
    setStatus('')

    const payload = {
      account_id: accountId.trim() || null,
      client_id: clientId.trim() || null,
      webhook_secret: webhookSecret.trim() || null,
      enabled,
      updated_at: new Date().toISOString(),
    }

    const query = configId
      ? supabase.from('zoom_config').update(payload).eq('id', configId)
      : supabase.from('zoom_config').insert(payload).select('id').single()

    const { data, error } = await query
    if (error) {
      setStatus(error.message)
      setSaving(false)
      return
    }

    if (data?.id) {
      setConfigId(data.id)
    }

    setStatus('Zoom settings saved. Client secret is not stored from this UI.')
    setSaving(false)
  }

  return (
    <section className="rounded-2xl border border-[var(--border)] bg-white p-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 className="text-base font-semibold text-[var(--text-primary)]">Zoom</h3>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            Manual configuration only in Phase 7. Full OAuth comes later.
          </p>
        </div>
        <span
          className="rounded-full px-3 py-1 text-xs font-semibold"
          style={enabled
            ? { background: 'var(--status-done-bg)', color: 'var(--status-done-text)' }
            : { background: 'var(--status-backlog-bg)', color: 'var(--status-backlog-text)' }
          }
        >
          {enabled ? 'Connected' : 'Not connected'}
        </span>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <label className="space-y-1">
          <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-tertiary)]">Account ID</span>
          <input className={inputClassName} value={accountId} onChange={(e) => setAccountId(e.target.value)} />
        </label>
        <label className="space-y-1">
          <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-tertiary)]">Client ID</span>
          <input className={inputClassName} value={clientId} onChange={(e) => setClientId(e.target.value)} />
        </label>
        <label className="space-y-1">
          <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-tertiary)]">Client Secret</span>
          <input
            className={inputClassName}
            type="password"
            value={clientSecret}
            onChange={(e) => setClientSecret(e.target.value)}
            placeholder="Stored in Supabase vault in production"
          />
        </label>
        <label className="space-y-1">
          <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-tertiary)]">Webhook Secret</span>
          <input
            className={inputClassName}
            type="password"
            value={webhookSecret}
            onChange={(e) => setWebhookSecret(e.target.value)}
          />
        </label>
      </div>

      <label className="mt-4 flex items-center gap-3 text-sm text-[var(--text-secondary)]">
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
        Enable Zoom config
      </label>

      {status ? <p className="mt-3 text-sm text-[var(--text-secondary)]">{status}</p> : null}

      <button
        type="button"
        onClick={handleSave}
        disabled={saving}
        className="mt-4 rounded-xl bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-70"
      >
        {saving ? 'Saving…' : 'Save Zoom settings'}
      </button>
    </section>
  )
}
