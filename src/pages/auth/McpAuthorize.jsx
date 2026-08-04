import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { supabase } from '../../lib/supabase'

export default function McpAuthorize() {
  const { user } = useAuth()
  const { search } = useLocation()
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const params = new URLSearchParams(search)
  const redirectUri = params.get('redirect_uri')
  const state = params.get('state') ?? ''
  const clientId = params.get('client_id') ?? 'claude'
  const codeChallenge = params.get('code_challenge')

  async function approve() {
    if (redirectUri !== 'https://claude.ai/api/mcp/auth_callback' || !codeChallenge) { setError('Invalid OAuth authorization request.'); return }
    setSaving(true)
    const { data: { session } } = await supabase.auth.getSession()
    const response = await fetch('/api/mcp-oauth', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token ?? ''}` }, body: JSON.stringify({ action: 'approve', redirect_uri: redirectUri, state, client_id: clientId, code_challenge: codeChallenge }) })
    const result = await response.json()
    if (!response.ok || !result.redirect_to) { setError('Nexus could not approve this connection.'); setSaving(false); return }
    window.location.assign(result.redirect_to)
  }

  return <main className="flex min-h-screen items-center justify-center bg-[var(--surface-sub)] p-6"><section className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-white p-6 shadow-[var(--card-shadow)]"><h1 className="text-xl font-bold text-[var(--text-primary)]">Connect Claude to Nexus</h1><p className="mt-2 text-sm text-[var(--text-secondary)]">Claude will act with your Nexus permissions. You can disconnect this access later.</p><div className="mt-5 rounded-lg bg-[var(--purple-tint)] p-3 text-sm text-[var(--text-primary)]">Requested access: tasks, sprint status, weekly wins, and meeting notes.</div>{error ? <p className="mt-4 text-sm text-[var(--coral-dark)]">{error}</p> : null}<button type="button" onClick={approve} disabled={!user || saving} className="mt-6 w-full rounded-lg bg-[var(--accent)] px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">{saving ? 'Connecting...' : 'Approve Nexus access'}</button></section></main>
}
