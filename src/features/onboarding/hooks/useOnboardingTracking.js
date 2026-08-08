/**
 * useOnboardingTracking — Monitors user actions and marks onboarding steps complete.
 *
 * Tracks completion events (profile_completed, dept_opened, task_viewed, task_updated)
 * and calls mark_onboarding_step_complete(step_key, total_steps) to persist progress.
 *
 * Mounted globally in Shell to fire continuously as the user navigates.
 */

import { useEffect, useRef } from 'react'
import { useAuth } from '../../../hooks/useAuth'
import { supabase } from '../../../lib/supabase'
import { getOnboardingStepCount } from '../../../lib/adoption-config'

const COMPLETION_EVENTS = {
  profile_completed: { event: 'profile_updated', minFields: ['avatar_url'] },
  dept_opened: { event: 'dept_opened', minFields: [] },
  task_viewed: { event: 'task_viewed', minFields: [] },
  task_updated: { event: 'task_updated', minFields: [] },
  meeting_opened: { event: 'meeting_opened', minFields: [] },
}

export function useOnboardingTracking() {
  const { profile, jwtRole } = useAuth()
  const trackedRef = useRef(new Set())

  useEffect(() => {
    if (!profile?.id || !jwtRole) return

    async function trackEvent(completionEvent) {
      const trackKey = `${profile.id}:${completionEvent}`
      if (trackedRef.current.has(trackKey)) return
      trackedRef.current.add(trackKey)

      const totalSteps = getOnboardingStepCount(jwtRole)
      if (totalSteps === 0) return

      try {
        await supabase.rpc('mark_onboarding_step_complete', {
          p_step_key: completionEvent,
          p_total_steps: totalSteps,
          p_metadata: {}
        })
      } catch (err) {
        console.error('[onboarding] failed to mark step complete:', err)
      }
    }

    // Profile completion: check if avatar is set
    if (profile?.avatar_url) {
      trackEvent('profile_completed')
    }

    // Listen for page visits via navigation events
    // dept_opened: user navigated to /dashboard (main dept view)
    const originalPushState = window.history.pushState
    window.history.pushState = function(...args) {
      const result = originalPushState.apply(this, args)
      const path = window.location.pathname

      if (path === '/dashboard') trackEvent('dept_opened')
      if (path.includes('/my-tasks')) trackEvent('task_viewed')
      if (path.includes('/meetings')) trackEvent('meeting_opened')

      return result
    }

    return () => {
      window.history.pushState = originalPushState
    }
  }, [profile?.id, profile?.avatar_url, jwtRole])

  // Also track task_updated via a realtime subscription
  useEffect(() => {
    if (!profile?.id || !jwtRole) return

    const totalSteps = getOnboardingStepCount(jwtRole)
    if (totalSteps === 0) return

    const subscription = supabase
      .channel(`task_activity_${profile.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'task_activity',
          filter: `user_id=eq.${profile.id}`,
        },
        () => {
          const trackKey = `${profile.id}:task_updated`
          if (!trackedRef.current.has(trackKey)) {
            trackedRef.current.add(trackKey)
            supabase.rpc('mark_onboarding_step_complete', {
              p_step_key: 'task_updated',
              p_total_steps: totalSteps,
              p_metadata: {}
            }).catch(err => console.error('[onboarding] task_updated error:', err))
          }
        }
      )
      .subscribe()

    return () => subscription?.unsubscribe?.()
  }, [profile?.id, jwtRole])
}
