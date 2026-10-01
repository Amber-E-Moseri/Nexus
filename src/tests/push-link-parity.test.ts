/**
 * The service worker re-validates notification links (defense in depth). Its copy of the validator
 * (public/service-worker.js, <safe-link> region) must give the same verdict as the server's
 * validateInternalLink() for every input, so a link the server would reject can never be opened.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { validateInternalLink } from '../../supabase/functions/_shared/pushCore.ts'

const sw = readFileSync(new URL('../../public/service-worker.js', import.meta.url), 'utf8')
const region = sw.slice(sw.indexOf('// <safe-link>'), sw.indexOf('// </safe-link>'))
const swValidate = new Function(`${region}; return nexusSafeLink;`)() as (v: unknown) => string | null

const U = '44444444-4444-4444-8444-444444444444'
const CORPUS: unknown[] = [
  '/inbox', '/notifications', '/dashboard', '/my-tasks', `/my-tasks?task=${U}`, '/my-tasks/today', '/meetings', '/meetings/abc-123',
  '/sprints', '/sprints/9f2', '/spaces', '/spaces/xyz', '/dept/Media', '/calendar', '/calendar/review', '/growth-tracking',
  '/growth-tracking?week=2026-09-28', `/icplc?participant=${U}&tab=documentation`, '/registration', '/personal-list',
  'https://evil.example', '//evil.example', '/\\evil.example', 'javascript:alert(1)', 'data:text/html,x', 'file:///etc/passwd',
  '', ' /inbox', '/inbox ', '/inbox\n', '/inbox#x', '/inbox?x=1', '/inbox?next=https://evil.example', '/in box',
  '/my-tasks?task=bad', `/my-tasks?task=${U}&task=${U}`, '/growth-tracking?week=2026-9-1', '/admin/permissions', '/login',
  '/api/x', '/%2f%2fevil.example', '/../etc/passwd', '/inbox/../admin/permissions', '/inbox//x', '/meetings/' + 'a'.repeat(65),
  '/' + 'a'.repeat(400), null, undefined, 5, {}, [],
]

describe('service worker link validator parity', () => {
  it('region extracted', () => {
    expect(region.length).toBeGreaterThan(200)
    expect(typeof swValidate).toBe('function')
  })

  it.each(CORPUS.map((v) => [typeof v === 'string' ? JSON.stringify(v).slice(0, 60) : String(v), v]))(
    'same verdict as server: %s',
    (_label, value) => {
      expect(swValidate(value)).toBe(validateInternalLink(value))
    },
  )

  it('the push + notificationclick handlers actually use the validator and open same-origin only', () => {
    expect(sw).toMatch(/url:\s*nexusSafeLink\(data\.url\)\s*\|\|\s*'\/inbox'/)
    expect(sw).toMatch(/const safePath = nexusSafeLink\(/)
    expect(sw).toMatch(/new URL\(safePath, self\.location\.origin\)\.href/)
    expect(sw).not.toMatch(/event\.notification\.data\.url \|\| '\/'/)
  })
})
