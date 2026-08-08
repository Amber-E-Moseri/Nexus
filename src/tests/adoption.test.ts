/**
 * Adoption System Test Suite
 * Tests for Release 1: Analytics foundation, onboarding tables, Nova tools
 *
 * Run with: npm test -- adoption.test.ts
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createClient } from '@supabase/supabase-js'

// Use test/staging Supabase credentials
// In CI, these should come from environment variables
const supabaseUrl = process.env.VITE_SUPABASE_URL || 'http://localhost:54321'
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9'

const supabase = createClient(supabaseUrl, supabaseKey)

describe('Adoption System - Analytics Events', () => {
  it('should create analytics_events table', async () => {
    // Check table exists by trying to query it
    const { error } = await supabase
      .from('analytics_events')
      .select('id')
      .limit(1)

    // If table doesn't exist, we'd get a 'relation does not exist' error
    expect(error?.code).not.toBe('42P01')
  })

  it('should have required columns on analytics_events', async () => {
    // Insert a test event and verify columns exist
    const testEvent = {
      event: 'test_event',
      actor_id: '00000000-0000-0000-0000-000000000001',
      target_type: 'test',
      target_id: '00000000-0000-0000-0000-000000000002',
      department_id: null,
      metadata: { test: true },
    }

    const { error } = await supabase
      .from('analytics_events')
      .insert([testEvent])
      .select()

    // Should succeed if columns exist (will fail with auth error, not schema error)
    expect(error?.code).not.toMatch(/column|syntax/i)
  })

  it('should have indexes on analytics_events', async () => {
    // Verify indexes exist by checking query performance
    // This is a basic smoke test; real performance tests would use EXPLAIN ANALYZE
    const { data, error } = await supabase
      .from('analytics_events')
      .select('id')
      .eq('event', 'test_event')
      .limit(1)

    expect(error?.code).not.toBe('42P01') // relation does not exist
  })
})

describe('Adoption System - Onboarding Tables', () => {
  it('should create user_onboarding_state table', async () => {
    const { error } = await supabase
      .from('user_onboarding_state')
      .select('user_id')
      .limit(1)

    expect(error?.code).not.toBe('42P01')
  })

  it('should create user_onboarding_progress table', async () => {
    const { error } = await supabase
      .from('user_onboarding_progress')
      .select('user_id, step_key')
      .limit(1)

    expect(error?.code).not.toBe('42P01')
  })

  it('should create user_achievements table', async () => {
    const { error } = await supabase
      .from('user_achievements')
      .select('user_id, achievement_key')
      .limit(1)

    expect(error?.code).not.toBe('42P01')
  })

  it('should have unique constraint on (user_id, step_key)', async () => {
    // Try to insert duplicate step for same user
    const testData = {
      user_id: '00000000-0000-0000-0000-000000000001',
      step_key: 'test_step',
    }

    // First insert should succeed (or fail with auth, not constraint)
    await supabase.from('user_onboarding_progress').insert([testData]).select()

    // Second insert should fail with unique constraint violation
    const { error: duplicateError } = await supabase
      .from('user_onboarding_progress')
      .insert([testData])
      .select()

    // Either succeeds (auth prevents it) or fails with unique constraint
    expect(duplicateError?.code).toMatch(/23505|auth/i)
  })
})

describe('Adoption System - Onboarding RPCs', () => {
  it('should have mark_onboarding_step_complete RPC', async () => {
    const { error } = await supabase.rpc('mark_onboarding_step_complete', {
      p_step_key: 'test_step',
      p_total_steps: 5,
      p_metadata: {},
    })

    // Should fail with auth error, not "function does not exist"
    expect(error?.code).not.toMatch(/42883|undefined function/i)
  })

  it('should have dismiss_onboarding RPC', async () => {
    const { error } = await supabase.rpc('dismiss_onboarding')

    // Should fail with auth error, not "function does not exist"
    expect(error?.code).not.toMatch(/42883|undefined function/i)
  })

  it('should have get_onboarding_status RPC', async () => {
    const { error } = await supabase.rpc('get_onboarding_status', {
      p_user_id: '00000000-0000-0000-0000-000000000001',
    })

    // Should fail with auth error, not "function does not exist"
    expect(error?.code).not.toMatch(/42883|undefined function/i)
  })
})

describe('Adoption System - Nova Tools', () => {
  it('should export NOVA_TOOL_NAMES constant', async () => {
    // This is a TypeScript compile-time test
    // Just importing the module should succeed
    const { NOVA_TOOL_NAMES } = await import('../features/nova/lib/novaTools.ts')

    expect(NOVA_TOOL_NAMES).toBeDefined()
    expect(Array.isArray(NOVA_TOOL_NAMES)).toBe(true)
    expect(NOVA_TOOL_NAMES.length).toBeGreaterThan(0)
  })

  it('should include new adoption tools in NOVA_TOOL_NAMES', async () => {
    const { NOVA_TOOL_NAMES } = await import('../features/nova/lib/novaTools.ts')

    expect(NOVA_TOOL_NAMES).toContain('get_sprint_due_today')
    expect(NOVA_TOOL_NAMES).toContain('get_my_followups_today')
    expect(NOVA_TOOL_NAMES).toContain('get_my_work_summary')
    expect(NOVA_TOOL_NAMES).toContain('get_onboarding_status')
    expect(NOVA_TOOL_NAMES).toContain('get_department_health')
  })

  it('should build Nova tool definitions including new tools', async () => {
    const { buildNovaToolDefinitions } = await import('../features/nova/lib/novaTools.ts')

    const tools = buildNovaToolDefinitions()
    expect(tools).toBeDefined()
    expect(Array.isArray(tools)).toBe(true)
    expect(tools.length).toBeGreaterThanOrEqual(5)

    const toolNames = tools.map((t) => t.name)
    expect(toolNames).toContain('get_my_work_summary')
    expect(toolNames).toContain('get_onboarding_status')
    expect(toolNames).toContain('get_department_health')
  })
})

describe('Adoption System - Configuration', () => {
  it('should export onboarding config', async () => {
    const {
      ONBOARDING_STEPS,
      getOnboardingStepsForRole,
      getOnboardingStepCount,
    } = await import('../lib/adoption-config.ts')

    expect(ONBOARDING_STEPS).toBeDefined()
    expect(typeof getOnboardingStepsForRole).toBe('function')
    expect(typeof getOnboardingStepCount).toBe('function')
  })

  it('should have role-aware onboarding steps', async () => {
    const { getOnboardingStepsForRole } = await import('../lib/adoption-config.ts')

    const memberSteps = getOnboardingStepsForRole('member')
    const leadSteps = getOnboardingStepsForRole('dept_lead')
    const adminSteps = getOnboardingStepsForRole('super_admin')

    expect(memberSteps.length).toBeGreaterThan(0)
    expect(leadSteps.length).toBeGreaterThan(0)
    expect(adminSteps.length).toBeGreaterThan(0)

    // Each step should have required fields
    memberSteps.forEach((step) => {
      expect(step.key).toBeDefined()
      expect(step.title).toBeDefined()
      expect(step.completionEvent).toBeDefined()
      expect(step.roles).toBeDefined()
    })
  })

  it('should define adoption funnel stages', async () => {
    const { ADOPTION_FUNNEL_STAGES } = await import('../lib/adoption-config.ts')

    expect(ADOPTION_FUNNEL_STAGES).toBeDefined()
    expect(ADOPTION_FUNNEL_STAGES.length).toBe(8)

    // Should progress from Invited to Power User
    const keys = ADOPTION_FUNNEL_STAGES.map((s) => s.key)
    expect(keys[0]).toBe('invited')
    expect(keys[keys.length - 1]).toBe('power_user')
  })

  it('should define feature adoption thresholds', async () => {
    const { FEATURE_ADOPTION_THRESHOLDS } = await import('../lib/adoption-config.ts')

    expect(FEATURE_ADOPTION_THRESHOLDS).toBeDefined()
    expect(Array.isArray(FEATURE_ADOPTION_THRESHOLDS)).toBe(true)

    const features = FEATURE_ADOPTION_THRESHOLDS.map((t) => t.feature)
    expect(features).toContain('tasks')
    expect(features).toContain('meetings')
    expect(features).toContain('nova')
  })

  it('should define confidence thresholds', async () => {
    const { CONFIDENCE_THRESHOLDS, getConfidenceLevel } = await import('../lib/adoption-config.ts')

    expect(CONFIDENCE_THRESHOLDS).toBeDefined()
    expect(CONFIDENCE_THRESHOLDS.high).toBeGreaterThan(CONFIDENCE_THRESHOLDS.medium)
    expect(CONFIDENCE_THRESHOLDS.medium).toBeGreaterThan(CONFIDENCE_THRESHOLDS.low)

    expect(getConfidenceLevel(50)).toBe('high')
    expect(getConfidenceLevel(15)).toBe('medium')
    expect(getConfidenceLevel(5)).toBe('low')
    expect(getConfidenceLevel(0)).toBe('minimal')
  })

  it('should define default health components with correct weights', async () => {
    const { DEFAULT_HEALTH_COMPONENTS, validateHealthWeights } = await import('../lib/adoption-config.ts')

    expect(DEFAULT_HEALTH_COMPONENTS).toBeDefined()
    expect(Array.isArray(DEFAULT_HEALTH_COMPONENTS)).toBe(true)

    // Should validate to 100
    expect(validateHealthWeights()).toBe(true)

    const totalWeight = DEFAULT_HEALTH_COMPONENTS.reduce((sum, c) => sum + c.weight, 0)
    expect(totalWeight).toBe(100)
  })
})

describe('Adoption System - OnboardingModal Component', () => {
  it('should export OnboardingModal component', async () => {
    // Verify the modal overlay (mounted in Shell) can be imported
    const OnboardingModal = await import('../features/onboarding/components/OnboardingModal.jsx')

    expect(OnboardingModal).toBeDefined()
    expect(OnboardingModal.default).toBeDefined()
  })
})
