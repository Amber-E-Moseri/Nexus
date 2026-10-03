import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  canSendIcplcEmail,
  isValidEmail,
  normalizeEmail,
  personalizeSubject,
  renderFormattedBody,
  renderIcplcEmailHtml,
  replaceMergeTags,
  resolveRecipients,
  runIcplcProviderAttempts,
  shouldAttemptSend,
} from '../../supabase/functions/_shared/icplcEmailCore.ts'

const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')

describe('ICPLC email recipient resolution', () => {
  it('resolves recipients server-side from participant rows, excludes Not Attending, missing and invalid email, and dedupes', () => {
    const result = resolveRecipients(
      ['p1', 'p2', 'p3', 'p4', 'p5', 'p1', 'wrong-event'],
      [
        { id: 'p1', full_name: 'Ada One', email: ' ADA@Example.org ', subgroup: 'Central', participation_status: 'confirmed' },
        { id: 'p2', full_name: 'Ada Duplicate', email: 'ada@example.org', subgroup: 'Central', participation_status: 'likely' },
        { id: 'p3', full_name: 'No Mail', email: '', subgroup: 'West', participation_status: 'confirmed' },
        { id: 'p4', full_name: 'Bad Mail', email: 'not-an-email', subgroup: 'West', participation_status: 'confirmed' },
        { id: 'p5', full_name: 'Absent', email: 'absent@example.org', subgroup: 'East', participation_status: 'not_attending' },
      ],
    )

    expect(result.requestedParticipants).toBe(6)
    expect(result.unmatchedParticipantIds).toEqual(['wrong-event'])
    expect(result.eligibleParticipants).toBe(2)
    expect(result.uniqueRecipients).toBe(1)
    expect(result.skippedMissingEmail).toBe(1)
    expect(result.skippedInvalidEmail).toBe(1)
    expect(result.skippedNotAttending).toBe(1)
    expect(result.deduplicatedRecipients).toBe(1)
    expect(result.recipients[0]).toMatchObject({
      email: 'ADA@Example.org',
      normalizedEmail: 'ada@example.org',
      participantIds: ['p1', 'p2'],
    })
  })

  it('normalizes and validates emails conservatively', () => {
    expect(normalizeEmail('  USER@Example.ORG ')).toBe('user@example.org')
    expect(isValidEmail('user@example.org')).toBe(true)
    expect(isValidEmail('javascript:alert(1)')).toBe(false)
    expect(isValidEmail('missing-at.example.org')).toBe(false)
  })
})

describe('ICPLC email send authorization', () => {
  it('allows only explicit campaign send authorities', () => {
    expect(canSendIcplcEmail({ role: 'super_admin' }, false)).toBe(true)
    expect(canSendIcplcEmail({ role: 'regional_secretary' }, false)).toBe(true)
    expect(canSendIcplcEmail({ role: 'member' }, true)).toBe(true)
    expect(canSendIcplcEmail({ role: 'member' }, false)).toBe(false)
    expect(canSendIcplcEmail({ role: 'group_pastor' }, false)).toBe(false)
    expect(canSendIcplcEmail(null, false)).toBe(false)
  })

  it('keeps retry attempts scoped to pending or failed recipient rows', () => {
    expect(shouldAttemptSend('pending')).toBe(true)
    expect(shouldAttemptSend('failed')).toBe(true)
    expect(shouldAttemptSend('sent')).toBe(false)
    expect(shouldAttemptSend('skipped')).toBe(false)
    expect(shouldAttemptSend('unsubscribed')).toBe(false)
  })
})

describe('ICPLC email content safety', () => {
  it('server-resolves merge tags for subject and body', () => {
    const vars = { name: 'Ada Lovelace', subgroup: 'Central A', email: 'ada@example.org' }
    expect(personalizeSubject('Hi {{first_name}} from {{subgroup}}', vars)).toBe('Hi Ada from Central A')
    expect(replaceMergeTags('Hello {{name}} <{{email}}> {{missing}}', vars)).toBe('Hello Ada Lovelace <ada@example.org> ')
  })

  it('escapes HTML/script injection and supports bold', () => {
    const html = renderFormattedBody('Hi **{{first_name}}**\n\n<script>alert(1)</script>', { name: '<img src=x onerror=1>' })
    expect(html).toContain('<strong>&lt;img</strong>')
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(html).not.toContain('<script>')
    expect(html).not.toContain('<img src=x')
  })

  it('only linkifies http/https links; javascript/data stay inert text', () => {
    const html = renderFormattedBody('Go https://example.org/path now\njavascript:alert(1)\ndata:text/html,boom')
    expect(html).toContain('href="https://example.org/path"')
    expect(html).toContain('javascript:alert(1)')
    expect(html).toContain('data:text/html,boom')
    expect(html).not.toContain('href="javascript:')
    expect(html).not.toContain('href="data:')
  })

  it('preview renderer and server renderer share the same ICPLC shell signal', () => {
    const html = renderIcplcEmailHtml('Hi {{first_name}}', { name: 'Ada Lovelace' })
    expect(html).toContain('ICPLC 2026')
    expect(html).toContain('Hi Ada')
  })
})

describe('ICPLC email provider behavior', () => {
  const rows = [
    { id: 's1', email: 'one@example.org' },
    { id: 's2', email: 'two@example.org' },
    { id: 's3', email: 'three@example.org' },
  ]

  it('records all-success provider results without sending real email', async () => {
    const result = await runIcplcProviderAttempts(rows, async (row) => ({ id: `resend-${row.id}` }))
    expect(result.sent).toBe(3)
    expect(result.failed).toBe(0)
    expect(result.outcomes.map((outcome) => outcome.status)).toEqual(['sent', 'sent', 'sent'])
  })

  it('records partial failures accurately', async () => {
    const result = await runIcplcProviderAttempts(rows, async (row) => {
      if (row.id === 's2') throw new Error('provider rejected recipient')
      return { id: `resend-${row.id}` }
    })
    expect(result.sent).toBe(2)
    expect(result.failed).toBe(1)
    expect(result.outcomes.find((outcome) => outcome.id === 's2')).toMatchObject({
      status: 'failed',
      error: 'provider rejected recipient',
    })
  })

  it('records all failures and timeout-style errors safely', async () => {
    const result = await runIcplcProviderAttempts(rows, async () => {
      throw new Error('provider timeout')
    })
    expect(result.sent).toBe(0)
    expect(result.failed).toBe(3)
    expect(result.outcomes.every((outcome) => outcome.error === 'provider timeout')).toBe(true)
  })

  it('treats malformed success responses as sent with no provider id', async () => {
    const result = await runIcplcProviderAttempts([rows[0]], async () => ({}))
    expect(result).toMatchObject({
      sent: 1,
      failed: 0,
      outcomes: [{ status: 'sent', providerId: null }],
    })
  })
})

describe('ICPLC email wiring', () => {
  it('edge function authenticates a real user and has no historical hard-coded sender bypass', () => {
    const src = read('supabase/functions/icplc-send-email/index.ts')
    expect(src).toContain('auth.getUser()')
    expect(src).toContain('icplc_is_programs_member')
    expect(src).toContain('canSendIcplcEmail')
    expect(src).not.toContain('icplc_can_read_participants')
    expect(src).not.toContain('icplc_can_write_participants')
    expect(src).not.toContain('NAMED_EDITOR_USER_IDS')
    expect(src).not.toContain('4c70ca61-443b-4a64-87aa-3453c9dd5c65')
  })

  it('edge function never accepts raw recipient emails for real sends', () => {
    const src = read('supabase/functions/icplc-send-email/index.ts')
    expect(src).not.toMatch(/\bto\?:/)
    expect(src).toContain(".from('icplc_participants')")
    expect(src).toContain(".eq('event_id', eventId)")
    expect(src).toContain('resolveRecipients')
  })

  it('test send cannot accept an arbitrary browser-supplied recipient', () => {
    const src = read('supabase/functions/icplc-send-email/index.ts')
    expect(src).not.toContain('test_email')
    expect(src).toContain('const to = authData.user.email')
    expect(src).toContain('Test emails can only be sent to the signed-in sender')
  })

  it('config preserves Phase 0 and RSO function stanzas while adding icplc-send-email', () => {
    const cfg = read('supabase/config.toml')
    for (const fn of ['task-api', 'users', 'send-task-push-notification', 'delegated-task-reminders', 'task-notification-email-batch', 'meeting-reminders', 'due-date-reminders', 'daily-digest', 'send-notification-email']) {
      expect(cfg).toMatch(new RegExp(`\\[functions\\."${fn}"\\]\\s*\\nverify_jwt = false`))
    }
    expect(cfg).toMatch(/\[functions\."icplc-send-email"\]\s*\nverify_jwt = true/)
  })

  it('migration adds idempotency and recipient dedupe without touching historical migrations', () => {
    const mig = read('supabase/migrations/20271004000000_icplc_campaign_email_safety.sql')
    expect(mig).toContain('idempotency_key')
    expect(mig).toContain('communication_campaigns_created_by_idempotency_key_idx')
    expect(mig).toContain('communication_sends_campaign_recipient_email_normalized_idx')
    expect(mig).toContain('source_participant_ids')
  })
})
