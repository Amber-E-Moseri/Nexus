import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { spawn } from 'node:child_process'
import http from 'node:http'
import net from 'node:net'
import pg from 'pg'
import { CMP_FIELD_IDS } from '../../features/icplc/lib/cmpDocumentation.js'

// DB-backed suite: each helper opens a fresh pg connection (~1-2s/test alone). Under the full
// parallel run the 5s default is exceeded by load, not by a race; give it headroom.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 })

const API_URL = process.env.SUPABASE_URL || 'http://127.0.0.1:54321'
const ANON_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
const PG_URL = process.env.SUPABASE_DB_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'

// Resolved in beforeAll; module-level so invoke() can reference it.
let functionPort

const EVENT_ID = '00000000-0000-0000-0000-000000009150'
const PARTICIPANT_ID = '00000000-0000-0000-0000-000000009199'
const OTHER_EVENT_ID = '00000000-0000-0000-0000-000000009151'
const PASSWORD = 'Local-cmp-cert-123456!'

// When set, the mock CMP API serves exactly these submissions (default: one fresh submission per request).
let mockSubmissions = null

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


function newcomer(id, overrides = {}) {
  return {
    ...cmpSubmission(id),
    submitterName: 'Newcomer Person',
    answers: {
      ...cmpSubmission(id).answers,
      [CMP_FIELD_IDS.email]: 'Newcomer@Local.Test',
      [CMP_FIELD_IDS.firstName]: 'Newcomer',
      [CMP_FIELD_IDS.lastName]: 'Person',
      [CMP_FIELD_IDS.canadianStatus]: 'Permanent Resident',
      ...overrides,
    },
  }
}

async function eventParticipants(eventId, email) {
  return (await pgExec(
    'SELECT * FROM public.icplc_participants WHERE event_id = $1 AND email = $2',
    [eventId, email],
  )).rows
}

async function removeAddedParticipants() {
  for (const eid of [EVENT_ID, OTHER_EVENT_ID]) {
    await pgExec('DELETE FROM public.icplc_identity_maps WHERE event_id = $1 AND participant_id <> $2', [eid, PARTICIPANT_ID])
    await pgExec('DELETE FROM public.icplc_participants WHERE event_id = $1 AND id <> $2', [eid, PARTICIPANT_ID])
  }
}

async function invoke(token, action = 'apply', extra = {}, eventId = EVENT_ID) {
  return fetch(`http://127.0.0.1:${functionPort}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ action, event_id: eventId, ...extra }),
  })
}

const freePort = () => new Promise((resolve, reject) => {
  const s = net.createServer()
  s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolve(port)) })
  s.on('error', reject)
})

// Wait until the Deno process is accepting connections (no-auth request returns 401).
async function waitForFunction(getLogs = () => '') {
  const deadline = Date.now() + 60_000
  let last = 'no response'
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${functionPort}`, { method: 'POST', body: '{}', headers: { 'content-type': 'application/json' } })
      const text = await res.text()
      last = `${res.status} ${text.slice(0, 200)}`
      if (res.status === 401) return
    } catch (err) {
      last = String(err).slice(0, 200)
    }
    await new Promise((resolve) => setTimeout(resolve, 300))
  }
  throw new Error(`cmp-documentation-sync did not start. Last: ${last}\n${getLogs().slice(-2000)}`)
}

describe('CMP documentation sync edge authorization', () => {
  let admin
  let mockServer
  let mockUrl
  let functionProcess
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
    // Authorization follows the explicit event -> sprint link, never the name pattern.
    await pgExec('UPDATE public.event_configs SET sprint_id = $1 WHERE id = $2', [sprint.id, EVENT_ID])
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
        data: mockSubmissions ?? [cmpSubmission(`cmp-auth-${Date.now()}`)],
        pagination: { total: (mockSubmissions ?? [1]).length, page: 1, pageSize: 1000 },
      }))
    })
    await new Promise((resolve, reject) => {
      mockServer.once('error', reject)
      mockServer.listen(0, '127.0.0.1', resolve)
    })
    mockUrl = `http://127.0.0.1:${mockServer.address().port}/submissions`

    functionPort = await freePort()
    functionProcess = spawn('deno', ['run', '-A', 'supabase/functions/cmp-documentation-sync/index.ts'], {
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        DENO_SERVE_ADDRESS: `tcp:127.0.0.1:${functionPort}`,
        SUPABASE_URL: API_URL,
        SUPABASE_SERVICE_ROLE_KEY: SERVICE_ROLE_KEY,
        LEADERS_PLATFORM_TOKEN: 'local-cert-token',
        CMP_DOCUMENTATION_FORM_URL: mockUrl,
      },
    })
    functionProcess.stdout?.on('data', (chunk) => { functionLogs += chunk.toString() })
    functionProcess.stderr?.on('data', (chunk) => { functionLogs += chunk.toString() })
    await waitForFunction(() => functionLogs)
  }, 120_000)

  afterAll(async () => {
    if (functionProcess) functionProcess.kill()
    if (mockServer) await new Promise((resolve) => mockServer.close(resolve))
    await pgExec('DELETE FROM public.icplc_email_claims WHERE event_id = $1', [EVENT_ID])
    await pgExec('DELETE FROM public.icplc_identity_maps WHERE event_id = $1', [EVENT_ID])
    await pgExec('DELETE FROM public.icplc_participants WHERE event_id = $1', [EVENT_ID])
    await pgExec('DELETE FROM public.icplc_email_claims WHERE event_id = $1', [OTHER_EVENT_ID])
    await pgExec('DELETE FROM public.icplc_identity_maps WHERE event_id = $1', [OTHER_EVENT_ID])
    await pgExec('DELETE FROM public.icplc_participants WHERE event_id = $1', [OTHER_EVENT_ID])
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

  describe('add_unmatched', () => {
    afterEach(async () => {
      mockSubmissions = null
      await removeAddedParticipants()
      await pgExec('DELETE FROM public.icplc_email_claims WHERE event_id = $1 AND participant_id <> $2', [EVENT_ID, PARTICIPANT_ID])
    })

    it('adds an unmatched submission as a not-registered, tracking participant and applies its documentation', async () => {
      await resetParticipant()
      mockSubmissions = [newcomer('cmp-um-1')]
      const preview = await (await invoke(tokens.superAdmin, 'preview')).json()
      expect(preview.results[0].status).toBe('unmatched')
      expect(preview.results[0].submitter).toEqual({ name: 'Newcomer Person', email: 'newcomer@local.test' })
      expect(await eventParticipants(EVENT_ID, 'newcomer@local.test')).toHaveLength(0) // preview never creates

      const res = await invoke(tokens.superAdmin, 'add_unmatched', { submission_ids: ['cmp-um-1'] })
      const body = await res.json()
      expect(res.status, JSON.stringify(body)).toBe(200)
      expect(body.results).toHaveLength(1)
      expect(body.results[0].status).toBe('matched_applied')

      const rows = await eventParticipants(EVENT_ID, 'newcomer@local.test')
      expect(rows).toHaveLength(1)
      const row = rows[0]
      expect(row.full_name).toBe('Newcomer Person')
      expect(row.registration_status).toBe('not_registered')
      expect(row.participation_status).toBe('tracking')
      expect(row.canada_residency_status).toBe('PERMANENT_RESIDENT')
      expect(row.passport_readiness).toBe('ready')
      expect(row.source_values.created_from.source).toBe('cmp_documentation')
      expect(row.source_values.cmp_documentation.submission_id).toBe('cmp-um-1')
      expect(row.source_values.cmp_documentation.phone).toBe('555-3333')
      const map = await pgExec(
        `SELECT participant_id FROM public.icplc_identity_maps WHERE event_id = $1 AND source_type = 'cmp_documentation' AND source_key = 'cmp-um-1'`,
        [EVENT_ID],
      )
      expect(map.rows[0]?.participant_id).toBe(row.id)
    }, 60_000)

    it('is safe to repeat: a second call and an already-matched participant never create duplicates', async () => {
      await resetParticipant()
      mockSubmissions = [newcomer('cmp-um-2')]
      await invoke(tokens.superAdmin, 'add_unmatched', { submission_ids: ['cmp-um-2'] })
      const again = await (await invoke(tokens.superAdmin, 'add_unmatched', { submission_ids: ['cmp-um-2'] })).json()
      expect(again.results[0].issues).toContain('not_unmatched')
      expect(await eventParticipants(EVENT_ID, 'newcomer@local.test')).toHaveLength(1)

      // Submission for a participant that already exists (matched by email) must not be added again.
      await resetParticipant()
      mockSubmissions = [cmpSubmission('cmp-um-matched')]
      const matched = await (await invoke(tokens.superAdmin, 'add_unmatched', { submission_ids: ['cmp-um-matched'] })).json()
      expect(matched.results[0].issues).toContain('not_unmatched')
      expect(await eventParticipants(EVENT_ID, 'cmp-auth-owner@local.test')).toHaveLength(1)
      const total = await pgExec('SELECT count(*)::int AS n FROM public.icplc_participants WHERE event_id = $1', [EVENT_ID])
      expect(total.rows[0].n).toBe(2)
    }, 60_000)

    it('only adds the submissions the caller selected', async () => {
      await resetParticipant()
      mockSubmissions = [newcomer('cmp-um-a'), newcomer('cmp-um-b', { [CMP_FIELD_IDS.email]: 'other-newcomer@local.test' })]
      const body = await (await invoke(tokens.superAdmin, 'add_unmatched', { submission_ids: ['cmp-um-b'] })).json()
      expect(body.results).toHaveLength(1)
      expect(await eventParticipants(EVENT_ID, 'other-newcomer@local.test')).toHaveLength(1)
      expect(await eventParticipants(EVENT_ID, 'newcomer@local.test')).toHaveLength(0)
      const missing = await invoke(tokens.superAdmin, 'add_unmatched', {})
      expect(missing.status).toBe(400)
    }, 60_000)

    it('keeps staff overrides protected on later CMP syncs of an added participant', async () => {
      await resetParticipant()
      mockSubmissions = [newcomer('cmp-um-3')]
      await invoke(tokens.superAdmin, 'add_unmatched', { submission_ids: ['cmp-um-3'] })
      const [added] = await eventParticipants(EVENT_ID, 'newcomer@local.test')
      await pgExec(
        `UPDATE public.icplc_participants
         SET passport_readiness = 'no_passport',
             override_fields = '{"passport_readiness":{"overridden":true,"source":"manual"}}'::jsonb,
             participation_status = 'confirmed'
         WHERE id = $1`,
        [added.id],
      )
      const res = await invoke(tokens.superAdmin, 'apply') // CMP still says "I have a valid passport"
      expect(res.status).toBe(200)
      const [after] = await eventParticipants(EVENT_ID, 'newcomer@local.test')
      expect(after.passport_readiness).toBe('no_passport')
      expect(after.participation_status).toBe('confirmed')
      expect(after.registration_status).toBe('not_registered')
      expect(after.source_values.created_from.source).toBe('cmp_documentation')
    }, 60_000)

    it('stays inside the requested event', async () => {
      await resetParticipant()
      await pgExec(
        `INSERT INTO public.event_configs(id, event_name, sprint_pattern, is_active)
         VALUES ($1, 'CMP Auth Other Event', 'cmp-auth-other', false) ON CONFLICT (id) DO NOTHING`,
        [OTHER_EVENT_ID],
      )
      await pgExec(
        `INSERT INTO public.icplc_participants(event_id, full_name, email) VALUES ($1, 'Other Event Person', 'newcomer@local.test')`,
        [OTHER_EVENT_ID],
      )
      mockSubmissions = [newcomer('cmp-um-4')]
      const body = await (await invoke(tokens.superAdmin, 'add_unmatched', { submission_ids: ['cmp-um-4'] })).json()
      expect(body.results[0].status).toBe('matched_applied')
      const inEvent = await eventParticipants(EVENT_ID, 'newcomer@local.test')
      const inOther = await eventParticipants(OTHER_EVENT_ID, 'newcomer@local.test')
      expect(inEvent).toHaveLength(1)
      expect(inOther).toHaveLength(1)
      expect(inOther[0].full_name).toBe('Other Event Person')
      expect(inOther[0].source_values.cmp_documentation).toBeUndefined()
      const otherMaps = await pgExec('SELECT count(*)::int AS n FROM public.icplc_identity_maps WHERE event_id = $1', [OTHER_EVENT_ID])
      expect(otherMaps.rows[0].n).toBe(0)
    }, 60_000)

    it('rejects callers without ICPLC write access and creates nothing', async () => {
      await resetParticipant()
      mockSubmissions = [newcomer('cmp-um-5')]
      for (const key of ['member', 'finance', 'transportation', 'accommodation', 'hospitality']) {
        const res = await invoke(tokens[key], 'add_unmatched', { submission_ids: ['cmp-um-5'] })
        expect(res.status, key).toBe(403)
      }
      expect((await invoke(null, 'add_unmatched', { submission_ids: ['cmp-um-5'] })).status).toBe(401)
      expect(await eventParticipants(EVENT_ID, 'newcomer@local.test')).toHaveLength(0)
      for (const key of ['regionalSecretary', 'writer']) {
        const res = await invoke(tokens[key], 'add_unmatched', { submission_ids: ['cmp-um-5'] })
        expect(res.status, key).toBe(200)
        await removeAddedParticipants()
        await pgExec('DELETE FROM public.icplc_email_claims WHERE event_id = $1 AND participant_id <> $2', [EVENT_ID, PARTICIPANT_ID])
      }
    }, 60_000)
  })
})
