import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import pg from 'pg'
import { CMP_FIELD_IDS } from '../../features/icplc/lib/cmpDocumentation.js'

const API_URL = process.env.SUPABASE_URL || 'http://127.0.0.1:54321'
const FUNCTIONS_URL = process.env.SUPABASE_FUNCTIONS_URL || `${API_URL}/functions/v1`
const ANON_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
const PG_URL = process.env.SUPABASE_DB_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'

const EVENT_ID = '00000000-0000-0000-0000-000000009101'
const PARTICIPANT_ID = '00000000-0000-0000-0000-000000009199'
const PASSWORD = 'Local-cmp-cert-123456!'

const USERS = {
  superAdmin: { id: '00000000-0000-0000-0000-000000009111', email: 'cmp-sa@local.test', role: 'super_admin' },
  regionalSecretary: { id: '00000000-0000-0000-0000-000000009112', email: 'cmp-rs@local.test', role: 'regional_secretary' },
  writer: { id: '00000000-0000-0000-0000-000000009113', email: 'cmp-writer@local.test', role: 'member', team: 'Documentation' },
  member: { id: '00000000-0000-0000-0000-000000009114', email: 'cmp-member@local.test', role: 'member' },
  finance: { id: '00000000-0000-0000-0000-000000009115', email: 'cmp-finance@local.test', role: 'member', team: 'Finance' },
  transportation: { id: '00000000-0000-0000-0000-000000009116', email: 'cmp-transportation@local.test', role: 'member', team: 'Transportation' },
  accommodation: { id: '00000000-0000-0000-0000-000000009117', email: 'cmp-accommodation@local.test', role: 'member', team: 'Accommodation' },
  hospitality: { id: '00000000-0000-0000-0000-000000009118', email: 'cmp-hospitality@local.test', role: 'member', team: 'Hospitality' },
}

async function pgExec(sql, params = []) {
  const client = new pg.Client(PG_URL)
  await client.connect()
  try { return await client.query(sql, params) }
  finally { await client.end() }
}

async function resetParticipant() {
  await pgExec(
    `UPDATE public.icplc_participants
     SET passport_readiness = 'unknown',
         canada_residency_status = null,
         source_values = '{"registration_csv":{"registration_id":"AUTH-R1"},"manual_notes":{"note":"auth baseline"}}'::jsonb
     WHERE id = $1`,
    [PARTICIPANT_ID],
  )
  await pgExec(
    `DELETE FROM public.icplc_identity_maps
     WHERE event_id = $1 AND source_type = 'cmp_documentation'`,
    [EVENT_ID],
  )
}

async function snapshotParticipant() {
  return (await pgExec(
    `SELECT passport_readiness, canada_residency_status, source_values, registration_status,
            participation_status, email
     FROM public.icplc_participants
     WHERE id = $1`,
    [PARTICIPANT_ID],
  )).rows[0]
}

async function ensureAuthUser(admin, user) {
  const existing = (await pgExec('SELECT id FROM auth.users WHERE email = $1', [user.email])).rows
  for (const row of existing) {
    await admin.auth.admin.deleteUser(row.id).catch(() => {})
  }
  const { data, error } = await admin.auth.admin.createUser({
    email: user.email,
    password: PASSWORD,
    email_confirm: true,
  })
  if (error) throw error
  user.id = data.user.id
}

async function signIn(user) {
  const client = createClient(API_URL, ANON_KEY)
  const { data, error } = await client.auth.signInWithPassword({
    email: user.email,
    password: PASSWORD,
  })
  if (error) throw error
  return data.session.access_token
}

function cmpSubmission(id) {
  return {
    id,
    createdAt: '2026-09-28T00:00:00Z',
    submitterName: 'Auth Fixture',
    answers: {
      [CMP_FIELD_IDS.email]: 'cmp-auth-owner@local.test',
      [CMP_FIELD_IDS.firstName]: 'Auth',
      [CMP_FIELD_IDS.lastName]: 'Owner',
      [CMP_FIELD_IDS.phone]: '555-3333',
      [CMP_FIELD_IDS.passportStatus]: 'I have a valid passport',
      [CMP_FIELD_IDS.passportRegion]: 'ECOWAS',
      [CMP_FIELD_IDS.canadianStatus]: 'Canadian Citizen',
      [CMP_FIELD_IDS.canadianDocValidity]: 'Yes',
      [CMP_FIELD_IDS.assistanceRequested]: 'No',
    },
  }
}

async function invoke(token, action = 'apply') {
  return fetch(`${FUNCTIONS_URL}/cmp-documentation-sync`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      apikey: ANON_KEY,
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ action, event_id: EVENT_ID }),
  })
}

async function waitForFunction(token) {
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    try {
      const res = await invoke(token, 'preview')
      if (res.status === 403) return
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  throw new Error('cmp-documentation-sync local function did not become ready')
}

describe('CMP documentation sync edge authorization', () => {
  let admin
  let mockServer
  let mockUrl
  let functionProcess
  let envPath
  let functionLogs = ''
  const tokens = {}

  beforeAll(async () => {
    admin = createClient(API_URL, SERVICE_ROLE_KEY)
    await pgExec('DELETE FROM public.icplc_email_claims WHERE event_id = $1', [EVENT_ID])
    await pgExec('DELETE FROM public.icplc_identity_maps WHERE event_id = $1', [EVENT_ID])
    await pgExec('DELETE FROM public.icplc_participants WHERE event_id = $1', [EVENT_ID])
    await pgExec('DELETE FROM public.sprint_team_members WHERE user_id IN (SELECT id FROM public.users WHERE email LIKE $1)', ['cmp-%@local.test'])
    await pgExec('DELETE FROM public.activity_log WHERE user_id IN (SELECT id FROM public.users WHERE email LIKE $1)', ['cmp-%@local.test'])
    await pgExec('DELETE FROM public.users WHERE email LIKE $1', ['cmp-%@local.test'])

    for (const user of Object.values(USERS)) {
      await ensureAuthUser(admin, user)
      await pgExec(
        'INSERT INTO public.users(id, email, name, role, status) VALUES ($1, $2, $3, $4, $5)',
        [user.id, user.email, user.email, user.role, 'active'],
      )
    }

    await pgExec(
      `INSERT INTO public.event_configs(id, event_name, sprint_pattern, is_active)
       VALUES ($1, 'CMP Auth Event', 'cmp-auth', false)
       ON CONFLICT (id) DO UPDATE SET sprint_pattern = excluded.sprint_pattern`,
      [EVENT_ID],
    )
    await pgExec(
      `INSERT INTO public.icplc_participants(
         id, event_id, full_name, email, participation_status, registration_status,
         passport_readiness, source_values
       ) VALUES (
         $1, $2, 'CMP Auth Owner', 'cmp-auth-owner@local.test', 'confirmed', 'registered',
         'unknown', '{"registration_csv":{"registration_id":"AUTH-R1"},"manual_notes":{"note":"auth baseline"}}'::jsonb
       )`,
      [PARTICIPANT_ID, EVENT_ID],
    )

    const sprint = (await pgExec(
      `INSERT INTO public.sprints(name, status) VALUES ('cmp-auth sprint', 'active') RETURNING id`,
    )).rows[0]
    for (const user of Object.values(USERS).filter((u) => u.team)) {
      const team = (await pgExec(
        `INSERT INTO public.sprint_teams(sprint_id, name) VALUES ($1, $2) RETURNING id`,
        [sprint.id, user.team],
      )).rows[0]
      await pgExec(
        `INSERT INTO public.sprint_team_members(team_id, user_id, role) VALUES ($1, $2, 'member')`,
        [team.id, user.id],
      )
    }

    for (const [key, user] of Object.entries(USERS)) {
      tokens[key] = await signIn(user)
    }

    mockServer = http.createServer((req, res) => {
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify({
        data: [cmpSubmission(`cmp-auth-${Date.now()}`)],
        pagination: { total: 1, page: 1, pageSize: 1000 },
      }))
    })
    await new Promise((resolve) => mockServer.listen(0, '0.0.0.0', resolve))
    mockUrl = `http://host.docker.internal:${mockServer.address().port}/submissions`

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cmp-doc-auth-'))
    envPath = path.join(tmpDir, 'edge.env')
    fs.writeFileSync(envPath, [
      'LEADERS_PLATFORM_TOKEN=local-cert-token',
      `CMP_DOCUMENTATION_FORM_URL=${mockUrl}`,
      '',
    ].join('\n'))

    functionProcess = spawn('supabase', ['functions', 'serve', 'cmp-documentation-sync', '--env-file', envPath], {
      cwd: process.cwd(),
      shell: process.platform === 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        SUPABASE_URL: API_URL,
        SUPABASE_SERVICE_ROLE_KEY: SERVICE_ROLE_KEY,
      },
    })
    functionProcess.stdout?.on('data', (chunk) => { functionLogs += chunk.toString() })
    functionProcess.stderr?.on('data', (chunk) => { functionLogs += chunk.toString() })
    await waitForFunction(tokens.member)
  }, 90_000)

  afterAll(async () => {
    if (functionProcess) functionProcess.kill()
    if (mockServer) await new Promise((resolve) => mockServer.close(resolve))
    await pgExec('DELETE FROM public.icplc_email_claims WHERE event_id = $1', [EVENT_ID])
    await pgExec('DELETE FROM public.icplc_identity_maps WHERE event_id = $1', [EVENT_ID])
    await pgExec('DELETE FROM public.icplc_participants WHERE event_id = $1', [EVENT_ID])
    await pgExec('DELETE FROM public.sprint_team_members WHERE user_id = ANY($1::uuid[])', [Object.values(USERS).map((u) => u.id)])
    await pgExec('DELETE FROM public.activity_log WHERE user_id = ANY($1::uuid[])', [Object.values(USERS).map((u) => u.id)])
    await pgExec('DELETE FROM public.users WHERE id = ANY($1::uuid[])', [Object.values(USERS).map((u) => u.id)])
    await Promise.all(Object.values(USERS).map((user) => admin.auth.admin.deleteUser(user.id).catch(() => {})))
  }, 30_000)

  it('allows super_admin, regional_secretary, and permitted ICPLC sprint-team writer', async () => {
    for (const key of ['superAdmin', 'regionalSecretary', 'writer']) {
      await resetParticipant()
      const res = await invoke(tokens[key])
      const body = await res.json()
      expect(res.status, `${key}: ${JSON.stringify(body)}\n${functionLogs}`).toBe(200)
      expect(body.counts.matched_applied).toBe(1)
      const row = await snapshotParticipant()
      expect(row.passport_readiness).toBe('ready')
      expect(row.registration_status).toBe('registered')
      expect(row.participation_status).toBe('confirmed')
      expect(row.email).toBe('cmp-auth-owner@local.test')
      expect(row.source_values.registration_csv.registration_id).toBe('AUTH-R1')
    }
  }, 45_000)

  it('denies ordinary, restricted team, and anonymous callers without mutating state', async () => {
    for (const key of ['member', 'finance', 'transportation', 'accommodation', 'hospitality']) {
      await resetParticipant()
      const before = await snapshotParticipant()
      const res = await invoke(tokens[key])
      const body = await res.json()
      expect(res.status, `${key}: ${JSON.stringify(body)}\n${functionLogs}`).toBe(403)
      expect(await snapshotParticipant()).toEqual(before)
    }

    await resetParticipant()
    const before = await snapshotParticipant()
    const res = await invoke(null)
    expect(res.status).toBe(401)
    expect(await snapshotParticipant()).toEqual(before)
  }, 45_000)
})
