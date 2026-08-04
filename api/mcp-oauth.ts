import { createHash, randomBytes } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { createClient } from '@supabase/supabase-js'

type Req = IncomingMessage & { body?: unknown; query?: Record<string, string | string[]> }
type Res = ServerResponse & { status: (code: number) => Res; json: (value: unknown) => void }
const ORIGIN = process.env.NEXUS_PUBLIC_URL ?? 'https://nexus.lwcanada.org'
const CALLBACK = 'https://claude.ai/api/mcp/auth_callback'
const SCOPES = ['mcp:access', 'tasks:read', 'tasks:write', 'wins:read', 'meetings:write']
const hash = (value: string) => createHash('sha256').update(value).digest('hex')
const token = () => randomBytes(32).toString('base64url')
async function readBody(req: Req): Promise<Record<string, string>> {
  if (req.body && typeof req.body === 'object') return req.body as Record<string, string>
  const raw = await new Promise<string>((resolve) => {
    let value = ''
    req.on('data', (chunk) => { value += chunk })
    req.on('end', () => resolve(value))
  })
  return Object.fromEntries(new URLSearchParams(raw))
}

export default async function handler(req: Req, res: Res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')
  if (req.method === 'OPTIONS') return res.status(204).end()

  const url = new URL(req.url ?? '/', ORIGIN)
  const metadata = url.searchParams.get('metadata')
  if (req.method === 'GET' && metadata === 'protected-resource') return res.status(200).json({ resource: `${ORIGIN}/api/mcp`, authorization_servers: [ORIGIN], scopes_supported: SCOPES })
  if (req.method === 'GET' && metadata === 'authorization-server') return res.status(200).json({ issuer: ORIGIN, authorization_endpoint: `${ORIGIN}/mcp/authorize`, token_endpoint: `${ORIGIN}/api/mcp-oauth`, registration_endpoint: `${ORIGIN}/api/mcp-oauth`, response_types_supported: ['code'], grant_types_supported: ['authorization_code'], code_challenge_methods_supported: ['S256'], token_endpoint_auth_methods_supported: ['none'], client_id_metadata_document_supported: true })
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
  if (!supabaseUrl || !process.env.SUPABASE_SERVICE_ROLE_KEY) return res.status(500).json({ error: 'server_configuration_error' })
  const supabase = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
  const body = await readBody(req)
  if (!body.grant_type && !body.action) {
    const redirectUris = (body as any).redirect_uris ?? [CALLBACK]
    return res.status(201).json({ client_id: 'claude', client_name: body.client_name ?? 'Claude', token_endpoint_auth_method: 'none', redirect_uris: Array.isArray(redirectUris) ? redirectUris : [redirectUris] })
  }
  if (body.action === 'approve') {
    const jwt = req.headers.authorization?.replace(/^Bearer\s+/i, '')
    const { data: { user } } = await supabase.auth.getUser(jwt)
    if (!user || body.redirect_uri !== CALLBACK || !body.code_challenge) return res.status(400).json({ error: 'invalid_request' })
    const code = token()
    await supabase.from('mcp_oauth_authorization_codes').insert({ code_hash: hash(code), user_id: user.id, client_id: body.client_id || 'claude', redirect_uri: body.redirect_uri, code_challenge: body.code_challenge, scopes: SCOPES, expires_at: new Date(Date.now() + 5 * 60_000).toISOString() })
    return res.status(200).json({ redirect_to: `${body.redirect_uri}?code=${encodeURIComponent(code)}&state=${encodeURIComponent(body.state ?? '')}` })
  }
  if (body.grant_type !== 'authorization_code') return res.status(400).json({ error: 'unsupported_grant_type' })
  const { data: code } = await supabase.from('mcp_oauth_authorization_codes').select('*').eq('code_hash', hash(body.code ?? '')).maybeSingle()
  const verifierHash = createHash('sha256').update(body.code_verifier ?? '').digest('base64url')
  if (!code || code.consumed_at || new Date(code.expires_at) <= new Date() || code.redirect_uri !== body.redirect_uri || code.code_challenge !== verifierHash) return res.status(400).json({ error: 'invalid_grant' })
  await supabase.from('mcp_oauth_authorization_codes').update({ consumed_at: new Date().toISOString() }).eq('id', code.id)
  const accessToken = token()
  await supabase.from('mcp_oauth_tokens').insert({ token_hash: hash(accessToken), user_id: code.user_id, client_id: code.client_id, scopes: code.scopes, expires_at: new Date(Date.now() + 8 * 60 * 60_000).toISOString() })
  return res.status(200).json({ access_token: accessToken, token_type: 'Bearer', expires_in: 28800, scope: code.scopes.join(' ') })
}
