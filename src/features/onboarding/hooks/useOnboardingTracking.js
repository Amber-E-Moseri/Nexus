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

export function useOnboardingTracking() {
  const { profile, jwtRole } = useAuth()
  const trackedRef = useRef(new Set())

  useEffect(() => {
    if (!profile?.id || !jwtRole) return

    console.log('[onboarding] tracking active:', { avatar: !!profile?.avatar_url, role: jwtRole })

    async function trackEvent(completionEvent) {
      const trackKey = `${profile.id}:${completionEvent}`
      if (trackedRef.current.has(trackKey)) return
      trackedRef.current.add(trackKey)

      const totalSteps = getOnboardingStepCount(jwtRole)
      if (totalSteps === 0) return

      console.log('[onboarding] marking:', completionEvent)
      try {
        await supabase.rpc('mark_onboarding_step_complete', {
          p_step_key: completionEvent,
          p_total_steps: totalSteps,
          p_metadata: {}
        })
        console.log('[onboarding] marked:', completionEvent)
      } catch (err) {
        console.error('[onboarding] error:', err)
      }
    }

    // Profile completion: check if avatar is set
    if (profile?.avatar_url) {
      trackEvent('profile_completed')
    }

    // Listen for page visits
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
}
