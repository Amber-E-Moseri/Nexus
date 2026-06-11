import test from 'node:test'
import assert from 'node:assert/strict'
import {
  selectActiveUsers,
  selectDepartmentUsers,
  selectInactiveUsers,
  selectPastorMembers,
  selectPendingInvitations,
  selectUserLifecycleStats,
} from '../src/lib/people/selectors.js'

const users = [
  { id: 'admin', email: 'admin@example.com', department_id: 'd1', status: 'active' },
  { id: 'member-a', email: 'member-a@example.com', department_id: 'd1', status: 'active', activated_at: new Date().toISOString() },
  { id: 'member-b', email: 'member-b@example.com', department_id: 'd2', status: 'inactive' },
  { id: 'member-c', email: 'member-c@example.com', department_id: 'd1', status: 'pending_activation' },
]

const invitations = [
  { id: 'i1', email: 'member-a@example.com', department_id: 'd1', status: 'accepted', assigned_pastor_id: 'pastor-1' },
  { id: 'i2', email: 'member-c@example.com', department_id: 'd1', status: 'pending', assigned_pastor_id: 'pastor-1' },
]

const pastorMembers = [{ pastor_id: 'pastor-1', member_id: 'member-a' }]

test('basic user selectors return expected records', () => {
  assert.equal(selectActiveUsers(users).length, 2)
  assert.equal(selectInactiveUsers(users).length, 1)
  assert.equal(selectPendingInvitations(invitations).length, 1)
  assert.equal(selectDepartmentUsers(users, 'd1').length, 3)
  assert.equal(selectPastorMembers(users, pastorMembers, 'pastor-1').length, 1)
})

test('lifecycle stats scope to pastor members', () => {
  const stats = selectUserLifecycleStats({
    users,
    invitations,
    pastorMembers,
    role: 'pastor',
    profile: { id: 'pastor-1' },
  })

  assert.equal(stats.activeUsers, 1)
  assert.equal(stats.pendingInvitations, 1)
})
