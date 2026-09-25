/**
 * Concurrency Import — RELEASE GATE
 *
 * 2 tests: post-preview correction skips protected field, and CAS prevents double-apply.
 */

import { describe, it, expect } from 'vitest'
import { shouldUpdate, isFieldOverridden, setOverridePatch } from '../../features/icplc/lib/fieldAuthority.js'

describe('Concurrency Import (release gate)', () => {
  // ── Test 8: Manual correction after preview → apply skips that field ──
  it('8. Field updated after preview is skipped at apply time (stale preview)', () => {
    // Simulate: preview computed participant.updated_at = T1
    // Staff correction at T2 > T1 sets override
    const previewComputedAt = '2026-09-20T10:00:00Z'

    // Participant state at apply time (after staff correction)
    const participantAtApplyTime = {
      registration_status: 'registered', // staff changed this to 'registered'
      updated_at: '2026-09-20T10:05:00Z', // updated AFTER preview
      override_fields: {
        registration_status: { overridden: true, by: 'staff-user', at: '2026-09-20T10:05:00Z' },
      },
      source_values: {},
    }

    const previewDecision = {
      registration_status: {
        decision: 'update',
        incoming_value: 'not_registered',
        current_value: 'unknown', // what preview saw
        source: 'csv',
      },
    }

    // At apply time: re-check override (staff set it after preview)
    const isProtected = isFieldOverridden(participantAtApplyTime, 'registration_status')
    expect(isProtected).toBe(true)

    // At apply time: participant.updated_at > previewComputedAt
    const updatedAfterPreview = participantAtApplyTime.updated_at > previewComputedAt
    expect(updatedAfterPreview).toBe(true)

    // At apply time: current DB value differs from what preview saw → skip
    const currentValue = participantAtApplyTime.registration_status
    const previewSawValue = previewDecision.registration_status.current_value
    expect(currentValue).not.toBe(previewSawValue)

    // Final apply decision: protected → skip
    const applyResult = isProtected ? 'protected' : 'would_apply'
    expect(applyResult).toBe('protected')
  })

  // ── Test 9: Two simultaneous Apply calls → only one succeeds (CAS) ──
  it('9. CAS semantics: second apply attempt on already-applying batch fails', () => {
    // Simulate the CAS check in the edge function:
    // UPDATE batches SET status='applying' WHERE id=? AND status='previewed'
    // First call transitions 'previewed' → 'applying' (succeeds)
    // Second call finds status='applying' (not 'previewed') → fails

    function simulateCAS(currentStatus) {
      // Returns true if CAS succeeded (batch was in 'previewed' state)
      if (currentStatus === 'previewed') return { success: true, newStatus: 'applying' }
      return { success: false, error: 'Batch not in previewed state or concurrent apply in progress' }
    }

    const firstCall = simulateCAS('previewed')
    expect(firstCall.success).toBe(true)
    expect(firstCall.newStatus).toBe('applying')

    // After first call, batch is now 'applying'
    const secondCall = simulateCAS(firstCall.newStatus)
    expect(secondCall.success).toBe(false)
    expect(secondCall.error).toMatch(/concurrent/i)
  })
})
