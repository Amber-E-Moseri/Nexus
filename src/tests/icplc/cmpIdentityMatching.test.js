import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { spawn, spawnSync } from 'node:child_process'
import http from 'node:http'
import net from 'node:net'
import { randomUUID } from 'node:crypto'
import pg from 'pg'
import { CMP_FIELD_IDS } from '../../features/icplc/lib/cmpDocumentation.js'

// Identity-matching certification for cmp-flight-sync and cmp-documentation-sync.
//
// Runs both edge functions under Deno against the LOCAL Supabase stack (never production) with a mock CMP API
// shaped like the real Leaders Platform payload: envelope { data, unitNames, ... } with NO `pagination` key,
// submissions carrying `member: { id, fullName }` (the logged-in submitter, which is NOT the person the form is for)
// and `submitterName`. Flight answers use the real field ids, ISO dates and "9:30AM" style times.

vi.setConfig({ testTimeout: 60_000, hookTimeout: 90_000 })

const API_URL = process.env.SUPABASE_URL || 'http://127.0.0.1:54321'
const ANON_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
const PG_URL = process.env.SUPABASE_DB_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
const PASSWORD = 'Local-identity-cert-123456!'

// Fresh ids per run so concurrent runs (this suite in a parallel full run, or another session) never collide.
const RUN = randomUUID().slice(0, 8)
const EVENT_A = randomUUID()
const EVENT_B = randomUUID()
const pid = () => randomUUID()

const P = {
  ada: pid(),        // "Ada Lovelace" — unique name in event A
  target: pid(),     // "Reassign Target" — destination for manual merges
  third: pid(),      // "Third Person" — second reassignment destination
  twin1: pid(),      // "Sam Twin" ×2 — ambiguous
  twin2: pid(),
  emailP: pid(),     // "Email Person", email emailperson@local.test
  submitter: pid(),  // "Logged Inger" — the logged-in submitter, never the form subject
  hyphen: pid(),     // "Mary-Jane O'Brien-Smith"
  accent: pid(),     // "José Núñez"
  drew: pid(),       // "Drew Prolifico" — starts with the honorific stem "dr"
  bWin: pid(),       // event B "Ada Lovelace" — must never be touched
  bTwin: pid(),      // event B "Reassign Target"
}

const PARTICIPANTS = [
  [P.ada, EVENT_A, 'Ada Lovelace', 'ada@local.test'],
  [P.target, EVENT_A, 'Reassign Target', 'target@local.test'],
  [P.third, EVENT_A, 'Third Person', 'third@local.test'],
  [P.twin1, EVENT_A, 'Sam Twin', 'twin1@local.test'],
  [P.twin2, EVENT_A, 'Sam Twin', 'twin2@local.test'],
  [P.emailP, EVENT_A, 'Email Person', 'emailperson@local.test'],
  [P.submitter, EVENT_A, 'Logged Inger', 'inger@local.test'],
  [P.hyphen, EVENT_A, "Mary-Jane O'Brien-Smith", 'mj@local.test'],
  [P.accent, EVENT_A, 'José Núñez', 'jose@local.test'],
  [P.drew, EVENT_A, 'Drew Prolifico', 'drew@local.test'],
  [P.bWin, EVENT_B, 'Ada Lovelace', 'ada-b@local.test'],
  [P.bTwin, EVENT_B, 'Reassign Target', 'target-b@local.test'],
]

async function pgExec(sql, params = []) {
  const client = new pg.Client(PG_URL)
  await client.connect()
  try { return await client.query(sql, params) } finally { await client.end() }
}

const freePort = () => new Promise((resolve, reject) => {
  const s = net.createServer()
  s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolve(port)) })
  s.on('error', reject)
})

// ── Real-shape submission builders ───────────────────────────────────────────────────────────────

let seq = 0
function flightSub({ id = `fl-${++seq}`, first, last, createdAt = '2026-09-30T12:00:00.000Z', by = 'Logged Inger', ...f }) {
  return {
    id,
    createdAt,
    submitterName: by,
    memberId: 'm-1', userId: 'u-1', unitId: null, matchDismissedAt: null, user: null, unit: null,
    member: { id: 'm-1', fullName: by },
    answers: {
      first_name_n8lv: first,
      last_name_jh4r: last,
      arrival_date_ymd7: f.arrivalDate ?? '2026-11-12',
      arrival_time_y5si: f.arrivalTime ?? '9:30AM',
      arrival_flight_code_451b: f.arrivalFlight ?? 'ac123',
      arrival_date_u4to: f.departureDate ?? '2026-11-16',
      departure_time_8uel: f.departureTime ?? '2:15PM',
      departure_flight_code_73kt: f.departureFlight ?? 'ac456',
    },
  }
}

function docSub({ id = `dc-${++seq}`, first, last, email, createdAt = '2026-09-30T12:00:00.000Z', by = 'Logged Inger', ...over }) {
  return {
    id,
    createdAt,
    submitterName: by,
    member: { id: 'm-1', fullName: by },
    unit: null,
    answers: {
      [CMP_FIELD_IDS.email]: email,
      [CMP_FIELD_IDS.firstName]: first,
      [CMP_FIELD_IDS.lastName]: last,
      [CMP_FIELD_IDS.phone]: '555-0100',
      [CMP_FIELD_IDS.passportStatus]: 'I have a valid passport',
      [CMP_FIELD_IDS.passportRegion]: 'ECOWAS',
      [CMP_FIELD_IDS.canadianStatus]: 'Permanent Resident',
      [CMP_FIELD_IDS.canadianDocValidity]: 'Yes',
      [CMP_FIELD_IDS.assistanceRequested]: 'No',
      ...over,
    },
  }
}

describe('CMP identity matching — flights and immigration', () => {
  let admin
  let mockServer
  let mockBase
  let flightSubs = []
  let docSubs = []
  const procs = []
  const tokens = {}
  const ports = {}
  let logs = ''
  const users = {
    sa: { email: `idm-${RUN}-sa@local.test`, role: 'super_admin' },
    member: { email: `idm-${RUN}-member@local.test`, role: 'member' },
  }

  async function ensureAuthUser(user) {
    for (const row of (await pgExec('SELECT id FROM auth.users WHERE email = $1', [user.email])).rows) {
      await admin.auth.admin.deleteUser(row.id).catch(() => {})
    }
    const { data, error } = await admin.auth.admin.createUser({ email: user.email, password: PASSWORD, email_confirm: true })
    if (error) throw error
    user.id = data.user.id
    const c = createClient(API_URL, ANON_KEY)
    const { data: s, error: e2 } = await c.auth.signInWithPassword({ email: user.email, password: PASSWORD })
    if (e2) throw e2
    return s.session.access_token
  }

  function spawnFunction(name, port, extraEnv) {
    // No shell wrapper: on Windows kill() would only end the wrapper and leak the deno process.
    const p = spawn('deno', ['run', '-A', `supabase/functions/${name}/index.ts`], {
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        DENO_SERVE_ADDRESS: `tcp:127.0.0.1:${port}`,
        SUPABASE_URL: API_URL,
        SUPABASE_SERVICE_ROLE_KEY: SERVICE_ROLE_KEY,
        LEADERS_PLATFORM_TOKEN: 'local-cert-token',
        ...extraEnv,
      },
    })
    p.stdout?.on('data', (c) => { logs += c.toString() })
    p.stderr?.on('data', (c) => { logs += c.toString() })
    procs.push(p)
  }

  async function waitFor(port) {
    const deadline = Date.now() + 60_000
    while (Date.now() < deadline) {
      try {
        const r = await fetch(`http://127.0.0.1:${port}`, { method: 'POST', body: '{}' })
        if (r.status === 401) return
      } catch { /* not up yet */ }
      await new Promise((r) => setTimeout(r, 300))
    }
    throw new Error(`function on ${port} never came up\n${logs.slice(-1500)}`)
  }

  const call = (fn, body, token = tokens.sa, eventId = EVENT_A) =>
    fetch(`http://127.0.0.1:${ports[fn]}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ event_id: eventId, ...body }),
    }).then(async (res) => ({ status: res.status, body: await res.json() }))

  const flights = (action, extra = {}) => call('flight', { action, ...extra })
  const docs = (action, extra = {}) => call('doc', { action, ...extra })
  const byId = (out, id) => out.body.results.find((r) => r.submission_id === id)

  async function snapshot() {
    return (await pgExec('SELECT * FROM public.icplc_participants WHERE event_id = ANY($1::uuid[]) ORDER BY id', [[EVENT_A, EVENT_B]])).rows
  }
  const maps = async (type = 'cmp_flights', eventId = EVENT_A) =>
    (await pgExec('SELECT source_key, participant_id FROM public.icplc_identity_maps WHERE event_id = $1 AND source_type = $2 ORDER BY source_key', [eventId, type])).rows
  const row = async (id) => (await pgExec('SELECT * FROM public.icplc_participants WHERE id = $1', [id])).rows[0]
  const counts = async () => (await pgExec('SELECT event_id, count(*)::int AS n FROM public.icplc_participants WHERE event_id = ANY($1::uuid[]) GROUP BY event_id ORDER BY event_id', [[EVENT_A, EVENT_B]])).rows

  async function cleanup() {
    for (const e of [EVENT_A, EVENT_B]) {
      await pgExec('DELETE FROM public.icplc_email_claims WHERE event_id = $1', [e])
      await pgExec('DELETE FROM public.icplc_identity_maps WHERE event_id = $1', [e])
      await pgExec('DELETE FROM public.icplc_participants WHERE event_id = $1', [e])
    }
  }

  async function seedParticipants() {
    await cleanup()
    for (const [id, ev, name, email] of PARTICIPANTS) {
      await pgExec(
        `INSERT INTO public.icplc_participants(id, event_id, full_name, email, participation_status, registration_status, passport_readiness)
         VALUES ($1, $2, $3, $4, 'confirmed', 'registered', 'unknown')`,
        [id, ev, name, email],
      )
    }
  }

  beforeAll(async () => {
    admin = createClient(API_URL, SERVICE_ROLE_KEY)
    for (const [k, u] of Object.entries(users)) {
      tokens[k] = await ensureAuthUser(u)
      await pgExec('INSERT INTO public.users(id, email, name, role, status) VALUES ($1, $2, $3, $4, $5)', [u.id, u.email, u.email, u.role, 'active'])
    }
    for (const [ev, name] of [[EVENT_A, 'Identity Cert A'], [EVENT_B, 'Identity Cert B']]) {
      await pgExec(
        `INSERT INTO public.event_configs(id, event_name, sprint_pattern, is_active) VALUES ($1, $2, 'idm-cert', false)
         ON CONFLICT (id) DO UPDATE SET sprint_pattern = excluded.sprint_pattern`,
        [ev, name],
      )
    }

    mockServer = http.createServer((req, res) => {
      res.setHeader('content-type', 'application/json')
      const data = req.url.startsWith('/flights') ? flightSubs : docSubs
      // Real envelope: no `pagination` key.
      res.end(JSON.stringify({ data, unitNames: {}, roleLabelByUser: {}, unitAncestry: {}, suggestions: {}, memberNames: {} }))
    })
    await new Promise((resolve) => mockServer.listen(0, '127.0.0.1', resolve))
    mockBase = `http://127.0.0.1:${mockServer.address().port}`

    ports.flight = await freePort()
    ports.doc = await freePort()
    spawnFunction('cmp-flight-sync', ports.flight, { CMP_FLIGHT_FORM_URL: `${mockBase}/flights` })
    spawnFunction('cmp-documentation-sync', ports.doc, { CMP_DOCUMENTATION_FORM_URL: `${mockBase}/docs` })
    await Promise.all([waitFor(ports.flight), waitFor(ports.doc)])
  }, 120_000)

  afterAll(async () => {
    for (const p of procs) {
      // The scoop `deno` shim starts the real deno.exe as a child, so end the whole tree.
      if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(p.pid), '/T', '/F'])
      else { try { p.kill() } catch { /* already gone */ } }
    }
    await new Promise((resolve) => mockServer?.close(resolve))
    await cleanup()
    await pgExec('DELETE FROM public.event_configs WHERE id = ANY($1::uuid[])', [[EVENT_A, EVENT_B]]).catch(() => {})
    await pgExec('DELETE FROM public.activity_log WHERE user_id = ANY($1::uuid[])', [Object.values(users).map((u) => u.id)]).catch(() => {})
    await pgExec('DELETE FROM public.users WHERE id = ANY($1::uuid[])', [Object.values(users).map((u) => u.id)])
    await Promise.all(Object.values(users).map((u) => admin.auth.admin.deleteUser(u.id).catch(() => {})))
  }, 60_000)

  beforeEach(async () => {
    await seedParticipants()
    flightSubs = []
    docSubs = []
  })

  // ═════════════════════════════════════ PHASE 1 — FLIGHT IDENTITY ═════════════════════════════════════

  describe('flight identity (preview)', () => {
    it('1. extracts first + last name from the real answer ids and normalises real-shape dates/times', async () => {
      const s = flightSub({ first: 'Ada', last: 'Lovelace' })
      flightSubs = [s]
      const out = await flights('preview')
      expect(out.status, JSON.stringify(out.body)).toBe(200)
      const r = byId(out, s.id)
      expect(r.status).toBe('matched_applied')
      expect(r.participant_id).toBe(P.ada)
      expect(r.submitter.name).toBe('Ada Lovelace')
      const m = r.canonical_mutations
      expect(m.arrival_date).toBe('2026-11-12')
      expect(m.arrival_time).toBe('09:30')      // "9:30AM" → 24h
      expect(m.departure_date).toBe('2026-11-16') // the departure date lives under the "arrival_date_u4to" id
      expect(m.departure_time).toBe('14:15')    // "2:15PM" → 24h
      expect(m.arrival_flight).toBe('AC123')
      expect(m.departure_flight).toBe('AC456')
    })

    it('2. prefers the form-entered name over the logged-in submitter', async () => {
      const s = flightSub({ first: 'Ada', last: 'Lovelace', by: 'Logged Inger' })
      flightSubs = [s]
      const out = await flights('preview')
      const r = byId(out, s.id)
      expect(r.participant_id).toBe(P.ada)
      expect(r.participant_id).not.toBe(P.submitter)
    })

    it('2b. falls back to the submitter only when the form name is blank', async () => {
      const s = flightSub({ first: '', last: '', by: 'Logged Inger' })
      flightSubs = [s]
      const out = await flights('preview')
      expect(byId(out, s.id).participant_id).toBe(P.submitter)
    })

    it('3. latest submission wins for the same form name (either listing order)', async () => {
      const older = flightSub({ id: 'old', first: 'Ada', last: 'Lovelace', createdAt: '2026-09-29T10:00:00.000Z', arrivalFlight: 'old1' })
      const newer = flightSub({ id: 'new', first: 'Ada', last: 'Lovelace', createdAt: '2026-09-30T10:00:00.000Z', arrivalFlight: 'new1' })
      for (const order of [[older, newer], [newer, older]]) {
        flightSubs = order
        const out = await flights('preview')
        expect(byId(out, 'new').status).toBe('matched_applied')
        expect(byId(out, 'new').canonical_mutations.arrival_flight).toBe('NEW1')
        expect(byId(out, 'old').status).toBe('superseded')
      }
    })

    it('4/5/6. unique name resolves; unknown stays unmatched; duplicate names stay ambiguous', async () => {
      const a = flightSub({ first: 'Ada', last: 'Lovelace' })
      const nobody = flightSub({ first: 'Nobody', last: 'Here' })
      const twin = flightSub({ first: 'Sam', last: 'Twin' })
      flightSubs = [a, nobody, twin]
      const out = await flights('preview')
      expect(byId(out, a.id).participant_id).toBe(P.ada)
      expect(byId(out, nobody.id).status).toBe('unmatched')
      expect(byId(out, nobody.id).participant_id).toBeUndefined()
      expect(byId(out, nobody.id).flight.arrival_time).toBe('09:30') // full flight data is returned for hand-matching
      expect(byId(out, twin.id).status).toBe('ambiguous')
      expect(byId(out, twin.id).participant_id).toBeUndefined()
    })

    it('6b. an ambiguous name is not written on Apply without a manual choice', async () => {
      flightSubs = [flightSub({ first: 'Sam', last: 'Twin' })]
      const before = await snapshot()
      const out = await flights('apply')
      expect(out.body.counts.ambiguous).toBe(1)
      expect(await snapshot()).toEqual(before)
      expect(await maps()).toEqual([])
    })

    it('7. a saved submission assignment overrides the automatic match', async () => {
      const s = flightSub({ first: 'Ada', last: 'Lovelace' })
      flightSubs = [s]
      await pgExec(`INSERT INTO public.icplc_identity_maps(event_id, source_type, source_key, participant_id) VALUES ($1, 'cmp_flights', $2, $3)`, [EVENT_A, s.id, P.target])
      const r = byId(await flights('preview'), s.id)
      expect(r.participant_id).toBe(P.target)
      expect(r.matched_by).toBe('saved_link')
    })

    it('8. a saved form-name assignment overrides the automatic match', async () => {
      const s = flightSub({ first: 'Ada', last: 'Lovelace' })
      flightSubs = [s]
      await pgExec(`INSERT INTO public.icplc_identity_maps(event_id, source_type, source_key, participant_id) VALUES ($1, 'cmp_flights', 'name:ada lovelace', $2)`, [EVENT_A, P.target])
      const r = byId(await flights('preview'), s.id)
      expect(r.participant_id).toBe(P.target)
      expect(r.matched_by).toBe('saved_name')
    })

    it('8b. saved submission link beats a saved name alias', async () => {
      const s = flightSub({ first: 'Ada', last: 'Lovelace' })
      flightSubs = [s]
      await pgExec(`INSERT INTO public.icplc_identity_maps(event_id, source_type, source_key, participant_id) VALUES ($1, 'cmp_flights', $2, $3), ($1, 'cmp_flights', 'name:ada lovelace', $4)`, [EVENT_A, s.id, P.third, P.target])
      expect(byId(await flights('preview'), s.id).participant_id).toBe(P.third)
    })

    it('10. preview changes nothing (participants, maps, other events)', async () => {
      flightSubs = [
        flightSub({ first: 'Ada', last: 'Lovelace' }),
        flightSub({ first: 'Sam', last: 'Twin' }),
        flightSub({ first: 'Nobody', last: 'Here' }),
      ]
      const before = await snapshot()
      const out = await flights('preview', { manual_matches: [{ submission_id: flightSubs[1].id, participant_id: P.twin1 }] })
      expect(out.status).toBe(200)
      expect(await snapshot()).toEqual(before)
      expect(await maps()).toEqual([])
    })

    it('handles sub-second-only ordering and the real envelope without `pagination`', async () => {
      flightSubs = [flightSub({ first: 'Ada', last: 'Lovelace' })]
      const out = await flights('preview')
      expect(out.body.submission_count).toBe(1)
    })
  })

  // ═══════════════════════════════════ PHASE 3 — FLIGHT MERGE (local DB) ═══════════════════════════════════

  describe('flight merge / reassignment (apply on the local database)', () => {
    it('A/D/E. matched flight reassigned to another participant, persisting submission + form-name links', async () => {
      const s = flightSub({ first: 'Ada', last: 'Lovelace' })
      flightSubs = [s]
      const adaBefore = await row(P.ada)
      const out = await flights('apply', { manual_matches: [{ submission_id: s.id, participant_id: P.target }] })
      expect(out.status, JSON.stringify(out.body)).toBe(200)
      expect(byId(out, s.id).participant_id).toBe(P.target)
      expect(byId(out, s.id).matched_by).toBe('manual')

      const t = await row(P.target)
      expect(t.arrival_flight).toBe('AC123')
      expect(t.arrival_time).toBe('09:30')
      expect(t.departure_flight).toBe('AC456')
      const adaAfter = await row(P.ada)
      expect(adaAfter.arrival_flight).toBe(adaBefore.arrival_flight) // the wrong auto-match target is untouched
      expect(adaAfter.departure_flight).toBe(adaBefore.departure_flight)

      expect(await maps()).toEqual([
        { source_key: 'name:ada lovelace', participant_id: P.target },
        { source_key: s.id, participant_id: P.target },
      ].sort((a, b) => a.source_key.localeCompare(b.source_key)))
    })

    it('B. unmatched flight assigned to a participant', async () => {
      const s = flightSub({ first: 'Nobody', last: 'Here' })
      flightSubs = [s]
      const out = await flights('apply', { manual_matches: [{ submission_id: s.id, participant_id: P.third }] })
      expect(byId(out, s.id).participant_id).toBe(P.third)
      expect((await row(P.third)).arrival_flight).toBe('AC123')
    })

    it('C. ambiguous flight resolved by choosing one of the participants', async () => {
      const s = flightSub({ first: 'Sam', last: 'Twin' })
      flightSubs = [s]
      await flights('apply', { manual_matches: [{ submission_id: s.id, participant_id: P.twin2 }] })
      expect((await row(P.twin2)).arrival_flight).toBe('AC123')
      expect((await row(P.twin1)).arrival_flight).toBeNull()
    })

    it('C2. identically named participants: either can be chosen, reassignment replaces the saved link, later syncs follow it', async () => {
      const s = flightSub({ first: 'Sam', last: 'Twin' })
      flightSubs = [s]
      await flights('apply', { manual_matches: [{ submission_id: s.id, participant_id: P.twin1 }] })
      expect((await row(P.twin1)).arrival_flight).toBe('AC123')
      expect((await row(P.twin2)).arrival_flight).toBeNull()
      expect(byId(await flights('preview'), s.id).participant_id).toBe(P.twin1)

      // reassign to the other twin: saved links move, twin1 keeps what it already had, twin2 gains the flight
      await flights('apply', { manual_matches: [{ submission_id: s.id, participant_id: P.twin2 }] })
      expect((await row(P.twin2)).arrival_flight).toBe('AC123')
      const m = await maps()
      expect(m).toHaveLength(2)
      expect(m.every((x) => x.participant_id === P.twin2)).toBe(true)
      const later = byId(await flights('preview'), s.id)
      expect(later.participant_id).toBe(P.twin2)
      expect(later.matched_by).toBe('saved_link')
    })

    it('F/G. later syncs — and a NEW submission with the same form name — use the persisted assignment', async () => {
      const s = flightSub({ first: 'Nobody', last: 'Here' })
      flightSubs = [s]
      await flights('apply', { manual_matches: [{ submission_id: s.id, participant_id: P.third }] })

      const again = await flights('preview') // same submission, no manual_matches
      expect(byId(again, s.id).participant_id).toBe(P.third)
      expect(byId(again, s.id).matched_by).toBe('saved_link')

      // new id, different case, submitted later: the latest submission for the name wins, and the name alias resolves it
      const fresh = flightSub({ first: 'nobody', last: 'HERE', arrivalFlight: 'ws999', createdAt: '2026-10-01T09:00:00.000Z' })
      flightSubs = [s, fresh]
      const out = await flights('preview')
      const r = byId(out, fresh.id)
      expect(r.participant_id).toBe(P.third)
      expect(r.matched_by).toBe('saved_name')
      expect(r.canonical_mutations.arrival_flight).toBe('WS999')
      expect(byId(out, s.id).status).toBe('superseded')
    })

    it('H. a second reassignment replaces the earlier saved links (one row per key)', async () => {
      const s = flightSub({ first: 'Ada', last: 'Lovelace' })
      flightSubs = [s]
      await flights('apply', { manual_matches: [{ submission_id: s.id, participant_id: P.target }] })
      await flights('apply', { manual_matches: [{ submission_id: s.id, participant_id: P.third }] })
      const m = await maps()
      expect(m).toHaveLength(2)
      expect(m.every((x) => x.participant_id === P.third)).toBe(true)
      const again = await flights('preview')
      expect(byId(again, s.id).participant_id).toBe(P.third)
    })

    it('I. no participant or flight records are created', async () => {
      const before = await counts()
      const s = flightSub({ first: 'Ada', last: 'Lovelace' })
      flightSubs = [s]
      await flights('apply', { manual_matches: [{ submission_id: s.id, participant_id: P.target }] })
      await flights('apply')
      await flights('apply')
      expect(await counts()).toEqual(before)
      expect(await maps()).toHaveLength(2)
    })

    it('J. event isolation: another event\'s participant can never be targeted or touched', async () => {
      const s = flightSub({ first: 'Nobody', last: 'Here' })
      flightSubs = [s]
      const bBefore = await pgExec('SELECT * FROM public.icplc_participants WHERE event_id = $1 ORDER BY id', [EVENT_B])
      const out = await flights('apply', { manual_matches: [{ submission_id: s.id, participant_id: P.bTwin }] })
      expect(out.status).toBe(200)
      expect(byId(out, s.id).status).toBe('unmatched') // the foreign id is ignored, not honoured
      const bAfter = await pgExec('SELECT * FROM public.icplc_participants WHERE event_id = $1 ORDER BY id', [EVENT_B])
      expect(bAfter.rows).toEqual(bBefore.rows)
      expect(await maps('cmp_flights', EVENT_B)).toEqual([])
      expect(await maps()).toEqual([])
      // Event B's own "Ada Lovelace" is not matched when syncing event A.
      flightSubs = [flightSub({ first: 'Ada', last: 'Lovelace' })]
      const a = await flights('apply')
      expect(a.body.results.find((r) => r.participant_id).participant_id).toBe(P.ada)
      expect((await row(P.bWin)).arrival_flight).toBeNull()
    })

    it('a staff override on a flight field is kept even when merged by hand', async () => {
      const s = flightSub({ first: 'Ada', last: 'Lovelace' })
      flightSubs = [s]
      await pgExec(`UPDATE public.icplc_participants SET arrival_flight = 'KEEP1', override_fields = '{"arrival_flight":{"overridden":true}}'::jsonb WHERE id = $1`, [P.target])
      await flights('apply', { manual_matches: [{ submission_id: s.id, participant_id: P.target }] })
      const t = await row(P.target)
      expect(t.arrival_flight).toBe('KEEP1')
      expect(t.departure_flight).toBe('AC456')
    })

    it('honorifics and the repaired \\b regex: "Drew" is not truncated, "Pastor Ada Lovelace" still matches', async () => {
      const drew = flightSub({ first: 'Drew', last: 'Prolifico' })
      const pastor = flightSub({ first: 'Pastor Ada', last: 'Lovelace' })
      flightSubs = [drew, pastor]
      const out = await flights('preview')
      expect(byId(out, drew.id).participant_id).toBe(P.drew)
      expect(byId(out, pastor.id).participant_id).toBe(P.ada)
    })

    it('authorization: anonymous → 401, ordinary member → 403, nothing written', async () => {
      flightSubs = [flightSub({ first: 'Ada', last: 'Lovelace' })]
      const before = await snapshot()
      expect((await call('flight', { action: 'apply' }, null)).status).toBe(401)
      expect((await call('flight', { action: 'apply' }, tokens.member)).status).toBe(403)
      expect(await snapshot()).toEqual(before)
    })
  })

  // ═════════════════════════════════════ PHASE 2 — IMMIGRATION IDENTITY ═════════════════════════════════════

  describe('immigration identity (preview + apply on the local database)', () => {
    it('1-3. reads the real first/last answer ids and joins them into one normalised name', async () => {
      const s = docSub({ first: 'Nobody', last: 'Here', email: 'nobody@nowhere.test' })
      docSubs = [s]
      const out = await docs('preview')
      expect(out.status, JSON.stringify(out.body)).toBe(200)
      const r = byId(out, s.id)
      expect(r.status).toBe('unmatched')
      expect(r.submitter.name).toBe('Nobody Here')
      expect(r.submitter.email).toBe('nobody@nowhere.test')
    })

    it('4. email match stays first priority (even when the typed name points at someone else)', async () => {
      const s = docSub({ first: 'Ada', last: 'Lovelace', email: 'EmailPerson@Local.Test' })
      docSubs = [s]
      const r = byId(await docs('preview'), s.id)
      expect(r.participant_id).toBe(P.emailP)
    })

    it('5. with no email match, a unique exact normalised first + last name matches', async () => {
      const s = docSub({ first: 'Ada', last: 'Lovelace', email: 'unknown@nowhere.test' })
      docSubs = [s]
      expect(byId(await docs('preview'), s.id).participant_id).toBe(P.ada)
    })

    it('6/7. shared name stays unmatched; a name nobody has stays unmatched', async () => {
      const twin = docSub({ first: 'Sam', last: 'Twin', email: 'x1@nowhere.test' })
      const none = docSub({ first: 'Zzz', last: 'Nobody', email: 'x2@nowhere.test' })
      docSubs = [twin, none]
      const out = await docs('preview')
      expect(byId(out, twin.id).status).toBe('unmatched')
      expect(byId(out, none.id).status).toBe('unmatched')
    })

    it('8. the name fallback never overrides an existing deterministic mapping', async () => {
      const s = docSub({ first: 'Ada', last: 'Lovelace', email: 'unknown@nowhere.test' })
      docSubs = [s]
      await pgExec(`INSERT INTO public.icplc_identity_maps(event_id, source_type, source_key, participant_id) VALUES ($1, 'cmp_documentation', $2, $3)`, [EVENT_A, s.id, P.target])
      expect(byId(await docs('preview'), s.id).participant_id).toBe(P.target)

      // durable map and email claim that disagree remain a conflict; the name is not used to break the tie
      const c = docSub({ first: 'Ada', last: 'Lovelace', email: 'emailperson@local.test' })
      docSubs = [c]
      await pgExec(`INSERT INTO public.icplc_identity_maps(event_id, source_type, source_key, participant_id) VALUES ($1, 'cmp_documentation', $2, $3)`, [EVENT_A, c.id, P.target])
      const conflict = byId(await docs('preview'), c.id)
      expect(conflict.status).toBe('identity_conflict')
      expect(conflict.participant_id).toBeUndefined()
    })

    it('9. staff overrides and unrelated source values survive an Apply that matched by name', async () => {
      const s = docSub({ first: 'Ada', last: 'Lovelace', email: 'unknown@nowhere.test' })
      docSubs = [s]
      await pgExec(
        `UPDATE public.icplc_participants
         SET passport_readiness = 'issue',
             override_fields = '{"passport_readiness":{"overridden":true}}'::jsonb,
             source_values = '{"registration_csv":{"registration_id":"R-1"}}'::jsonb,
             participation_status = 'confirmed', registration_status = 'registered'
         WHERE id = $1`, [P.ada])
      const out = await docs('apply')
      expect(byId(out, s.id).participant_id).toBe(P.ada)
      const a = await row(P.ada)
      expect(a.passport_readiness).toBe('issue')                        // override kept
      expect(a.canada_residency_status).toBe('PERMANENT_RESIDENT')      // non-overridden field updated
      expect(a.source_values.registration_csv.registration_id).toBe('R-1')
      expect(a.participation_status).toBe('confirmed')
      expect(a.registration_status).toBe('registered')
      expect(a.email).toBe('ada@local.test')                            // identity fields untouched
      // nobody else changed
      expect((await row(P.target)).canada_residency_status).toBeNull()
      expect((await row(P.bWin)).canada_residency_status).toBeNull()
    })

    // Normalisation: lower-case, accents stripped, punctuation removed, spaces collapsed. No fuzzy matching.
    describe('10. normalisation regex', () => {
      const match = async (first, last, expected) => {
        const s = docSub({ first, last, email: `n-${++seq}@nowhere.test` })
        docSubs = [s]
        const r = byId(await docs('preview'), s.id)
        if (expected) expect(r.participant_id, `${first}|${last}`).toBe(expected)
        else expect(r.status, `${first}|${last}`).toBe('unmatched')
      }

      it('ignores capitalisation and stray/extra spaces', async () => {
        await match('  ADA ', '  lovelace  ', P.ada)
        await match('Ada', 'Love  lace'.replace('  ', ''), P.ada)
        await match('ada    ', 'LOVELACE', P.ada)
      })
      it('ignores accents on either side', async () => {
        await match('Jose', 'Nunez', P.accent)
        await match('JOSÉ', 'NÚÑEZ', P.accent)
        await match('Ada', 'Lövelace', P.ada) // accent stripped from the form side only
      })
      it('drops hyphens and apostrophes (straight or curly) on either side', async () => {
        await match('Mary-Jane', "O'Brien-Smith", P.hyphen)
        await match('Maryjane', 'OBriensmith', P.hyphen)
        await match('mary‑jane', 'O’Brien‑Smith', P.hyphen)
      })
      it('does not do fuzzy matching: a split hyphenated name and typos do not match', async () => {
        await match('Mary Jane', "O'Brien Smith", null) // "mary jane obrien smith" ≠ "maryjane obriensmith"
        await match('Adda', 'Lovelace', null)
        await match('Ada', 'Lovelac', null)
      })
      it('strips honorifics only as whole words (repaired \\b): "Drew" stays "drew"', async () => {
        await match('Drew', 'Prolifico', P.drew)
        await match('Pastor Drew', 'Prolifico', P.drew)
        await match('Dr Ada', 'Lovelace', P.ada)
      })
    })

    it('authorization: anonymous → 401, ordinary member → 403', async () => {
      docSubs = [docSub({ first: 'Ada', last: 'Lovelace', email: 'unknown@nowhere.test' })]
      const before = await snapshot()
      expect((await call('doc', { action: 'apply' }, null)).status).toBe(401)
      expect((await call('doc', { action: 'apply' }, tokens.member)).status).toBe(403)
      expect(await snapshot()).toEqual(before)
    })
  })
})
