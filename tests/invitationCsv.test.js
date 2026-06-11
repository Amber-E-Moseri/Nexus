import test from 'node:test'
import assert from 'node:assert/strict'
import { parseInvitationCsv } from '../src/lib/people/csv.js'

test('parseInvitationCsv maps expected columns', () => {
  const csv = [
    'First Name,Last Name,Email,Department,Role,Pastor Email',
    'Jane,Doe,jane@example.com,Media,member,pastor@example.com',
  ].join('\n')

  const rows = parseInvitationCsv(csv)

  assert.equal(rows.length, 1)
  assert.deepEqual(rows[0], {
    first_name: 'Jane',
    last_name: 'Doe',
    email: 'jane@example.com',
    department: 'Media',
    role: 'member',
    pastor_email: 'pastor@example.com',
    row_number: 2,
  })
})
