/**
 * Nova R4/R5 — RLS policy-logic tests.
 *
 * Covers the USING predicates for:
 *   nova_reports         (nova_reports_dept policy)
 *   nova_embeddings      (nova_embeddings_deny policy)
 *   nova_action_proposals (nova_proposals_own policy)
 *
 * Same approach as tests/novaKbRls.test.js — pure boolean predicates,
 * no live Postgres. Each function mirrors the exact SQL USING clause.
 */

import { describe, it, expect } from 'vitest'

// ─── nova_reports: nova_reports_dept USING clause ────────────────────────────
// USING (
//   generated_by = auth.uid()
//   OR current_user_role() IN ('super_admin', 'regional_secretary')
//   OR (
//     current_user_role() IN ('dept_lead', 'pastor')
//     AND department_id = current_user_department()
//   )
// )

function canAccessReport({ userId, userRole, userDeptId, reportGeneratedBy, reportDeptId }) {
  return (
    reportGeneratedBy === userId
    || ['super_admin', 'regional_secretary'].includes(userRole)
    || (
      ['dept_lead', 'pastor'].includes(userRole)
      && reportDeptId === userDeptId
    )
  )
}

describe('nova_reports RLS — nova_reports_dept', () => {
  const report = { reportGeneratedBy: 'user-A', reportDeptId: 'dept-media' }

  it('allows the report creator to access their own report', () => {
    expect(canAccessReport({ userId: 'user-A', userRole: 'member', userDeptId: 'dept-media', ...report })).toBe(true)
  })

  it('allows super_admin to access any report', () => {
    expect(canAccessReport({ userId: 'admin-1', userRole: 'super_admin', userDeptId: 'dept-admin', ...report })).toBe(true)
  })

  it('allows regional_secretary to access any report', () => {
    expect(canAccessReport({ userId: 'rs-1', userRole: 'regional_secretary', userDeptId: 'dept-ors', ...report })).toBe(true)
  })

  it('allows dept_lead to access reports within their own department', () => {
    expect(canAccessReport({ userId: 'lead-1', userRole: 'dept_lead', userDeptId: 'dept-media', ...report })).toBe(true)
  })

  it('denies dept_lead from accessing reports in another department', () => {
    expect(canAccessReport({ userId: 'lead-1', userRole: 'dept_lead', userDeptId: 'dept-ors', ...report })).toBe(false)
  })

  it('allows pastor to access reports in their own department', () => {
    expect(canAccessReport({ userId: 'pastor-1', userRole: 'pastor', userDeptId: 'dept-media', ...report })).toBe(true)
  })

  it('denies pastor from accessing reports in another department', () => {
    expect(canAccessReport({ userId: 'pastor-1', userRole: 'pastor', userDeptId: 'dept-pfcc', ...report })).toBe(false)
  })

  it('denies a plain member from accessing a report they did not create', () => {
    expect(canAccessReport({ userId: 'user-B', userRole: 'member', userDeptId: 'dept-media', ...report })).toBe(false)
  })

  it('allows a member to access a report they generated, regardless of department match', () => {
    const crossDeptReport = { reportGeneratedBy: 'user-B', reportDeptId: 'dept-admin' }
    expect(canAccessReport({ userId: 'user-B', userRole: 'member', userDeptId: 'dept-media', ...crossDeptReport })).toBe(true)
  })
})

// ─── nova_embeddings: deny-all SELECT USING (false) ──────────────────────────
// Direct table access is always denied; the RPC match_authorized_nova_chunks
// is the only authorised read path (SECURITY DEFINER bypasses this policy).

function canDirectlySelectEmbedding() {
  return false
}

describe('nova_embeddings RLS — deny-all policy', () => {
  it('denies super_admin direct table access', () => {
    expect(canDirectlySelectEmbedding()).toBe(false)
  })

  it('denies any authenticated user direct table access', () => {
    expect(canDirectlySelectEmbedding()).toBe(false)
  })
})

// ─── match_authorized_nova_chunks: access predicate ──────────────────────────
// The RPC applies meeting-attendance join before returning chunks.
// Non-meeting chunks are visible to dept-scope or org-wide roles.

function canAccessChunk({ sourceType, chunkDeptId, userDeptId, userRole, attendedMeeting }) {
  if (sourceType !== 'meeting_minutes') return true  // non-meeting chunks — no extra gate

  return (
    attendedMeeting                                          // was in the meeting
    || chunkDeptId === userDeptId                            // same dept as meeting
    || ['super_admin', 'regional_secretary'].includes(userRole)
  )
}

describe('match_authorized_nova_chunks access predicate', () => {
  it('allows access to non-meeting-minutes chunks for any user', () => {
    expect(canAccessChunk({ sourceType: 'decision', chunkDeptId: 'dept-media', userDeptId: 'dept-ors', userRole: 'member', attendedMeeting: false })).toBe(true)
    expect(canAccessChunk({ sourceType: 'report', chunkDeptId: 'dept-media', userDeptId: 'dept-ors', userRole: 'member', attendedMeeting: false })).toBe(true)
  })

  it('allows meeting_minutes chunks if the user attended the meeting', () => {
    expect(canAccessChunk({ sourceType: 'meeting_minutes', chunkDeptId: 'dept-media', userDeptId: 'dept-ors', userRole: 'member', attendedMeeting: true })).toBe(true)
  })

  it('allows meeting_minutes chunks if the user is in the meeting\'s department', () => {
    expect(canAccessChunk({ sourceType: 'meeting_minutes', chunkDeptId: 'dept-media', userDeptId: 'dept-media', userRole: 'member', attendedMeeting: false })).toBe(true)
  })

  it('allows super_admin access to any meeting_minutes chunk', () => {
    expect(canAccessChunk({ sourceType: 'meeting_minutes', chunkDeptId: 'dept-media', userDeptId: 'dept-ors', userRole: 'super_admin', attendedMeeting: false })).toBe(true)
  })

  it('allows regional_secretary access to any meeting_minutes chunk', () => {
    expect(canAccessChunk({ sourceType: 'meeting_minutes', chunkDeptId: 'dept-media', userDeptId: 'dept-ors', userRole: 'regional_secretary', attendedMeeting: false })).toBe(true)
  })

  it('denies a member from a different dept who did not attend the meeting', () => {
    expect(canAccessChunk({ sourceType: 'meeting_minutes', chunkDeptId: 'dept-media', userDeptId: 'dept-ors', userRole: 'member', attendedMeeting: false })).toBe(false)
  })
})

// ─── nova_action_proposals: nova_proposals_own USING clause ──────────────────
// USING (user_id = auth.uid())

function canAccessProposal({ userId, proposalOwnerId }) {
  return userId === proposalOwnerId
}

describe('nova_action_proposals RLS — nova_proposals_own', () => {
  it('allows a user to access their own proposal', () => {
    expect(canAccessProposal({ userId: 'user-A', proposalOwnerId: 'user-A' })).toBe(true)
  })

  it('denies a user from accessing another user\'s proposal', () => {
    expect(canAccessProposal({ userId: 'user-A', proposalOwnerId: 'user-B' })).toBe(false)
  })

  it('denies super_admin from accessing another user\'s proposal via the base policy', () => {
    // super_admin gets no special bypass on nova_action_proposals —
    // proposals contain signed tokens and must stay owner-scoped.
    expect(canAccessProposal({ userId: 'admin-1', proposalOwnerId: 'user-B' })).toBe(false)
  })
})
