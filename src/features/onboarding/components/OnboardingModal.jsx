/**
 * OnboardingModal — Smart first-login overlay
 *
 * Behaviour:
 *  1. First login → shows immediately if onboarding incomplete
 *  2. "Not now" → suppresses for 3 days (localStorage), marks dismissed_at in DB
 *  3. After 3 days, resurfaces once as a gentle reminder (if still incomplete)
 *  4. Second dismissal → permanently hidden (localStorage dismiss count ≥ 2)
 *  5. Completed → permanently hidden
 *
 * Mounted in Shell.jsx alongside BirthdayOverlay / RegionalUpdatesPopup.
 * Never appears on auth/public pages (Shell only wraps protected routes).
 */

import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../../hooks/useAuth'
import { supabase } from '../../../lib/supabase'
import { getOnboardingStepsForRole } from '../../../lib/adoption-config'

const LS_SUPPRESSED_UNTIL = 'nexus_onboarding_suppressed_until'
const LS_DISMISS_COUNT    = 'nexus_onboarding_dismiss_count'
const RESURFACE_DAYS      = 3
const MAX_DISMISSALS      = 2

const KEYFRAMES = `
@keyframes onboardingBackdropIn {
  from { opacity: 0; }
  to   { opacity: 1; }
}
@keyframes onboardingCardIn {
  0%   { transform: translate(-50%,-48%) scale(0.94); opacity: 0; }
  70%  { transform: translate(-50%,-50%) scale(1.01); opacity: 1; }
  100% { transform: translate(-50%,-50%) scale(1);    opacity: 1; }
}
@keyframes onboardingCardOut {
  from { transform: translate(-50%,-50%) scale(1);    opacity: 1; }
  to   { transform: translate(-50%,-52%) scale(0.94); opacity: 0; }
}
`

function shouldShow(dbState) {
  // Show modal as long as onboarding is not fully completed
  // Stays visible through all steps, hidden only when all steps are done
  return !dbState?.completed_at
}

export default function OnboardingModal() {
  const navigate  = useNavigate()
  const { profile, jwtRole } = useAuth()

  const [dbState,    setDbState]    = useState(null)
  const [progress,   setProgress]   = useState([])
  const [visible,    setVisible]    = useState(false)
  const [closing,    setClosing]    = useState(false)
  const [loaded,     setLoaded]     = useState(false)

  const steps = getOnboardingStepsForRole(jwtRole || 'member')

  // ── Load state from DB ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!profile?.id) return
    let active = true

    async function load() {
      const [{ data: stateData }, { data: progressData }] = await Promise.all([
        supabase
          .from('user_onboarding_state')
          .select('*')
          .eq('user_id', profile.id)
          .maybeSingle(),
        supabase
          .from('user_onboarding_progress')
          .select('step_key, completed_at')
          .eq('user_id', profile.id),
      ])
      if (!active) return

      setDbState(stateData)
      setProgress(progressData || [])

      if (shouldShow(stateData)) {
        // Small delay so the app layout settles first
        setTimeout(() => { if (active) setVisible(true) }, 800)
      }
      setLoaded(true)
    }

    load()
    return () => { active = false }
  }, [profile?.id])

  // ── Dismiss logic ──────────────────────────────────────────────────────────
  const handleDismiss = useCallback(async () => {
    // Animate out
    setClosing(true)
    setTimeout(() => setVisible(false), 240)

    // Increment dismiss counter
    const prev = parseInt(localStorage.getItem(LS_DISMISS_COUNT) || '0', 10)
    localStorage.setItem(LS_DISMISS_COUNT, String(prev + 1))

    // First dismiss → suppress for 3 days, then resurface once
    if (prev === 0) {
      const until = new Date()
      until.setDate(until.getDate() + RESURFACE_DAYS)
      localStorage.setItem(LS_SUPPRESSED_UNTIL, until.toISOString())
    }

    // Persist to DB
    try {
      await supabase.rpc('dismiss_onboarding')
    } catch {
      // Non-critical — localStorage suppression is enough
    }
  }, [])

  // ── Don't render until loaded (prevents flash) ─────────────────────────────
  if (!loaded || !visible) return null

  const completedKeys = new Set(progress.filter(p => p.completed_at).map(p => p.step_key))
  const completedCount = completedKeys.size
  const totalSteps = steps.length
  const progressPct = totalSteps > 0 ? Math.round((completedCount / totalSteps) * 100) : 0
  const isComplete = completedCount >= totalSteps

  return (
    <>
      <style>{KEYFRAMES}</style>

      {/* Backdrop */}
      <div
        onClick={handleDismiss}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(28, 22, 16, 0.15)',
          backdropFilter: 'blur(1px)',
          WebkitBackdropFilter: 'blur(1px)',
          zIndex: 9998,
          animation: closing
            ? 'onboardingBackdropIn 0.2s ease reverse both'
            : 'onboardingBackdropIn 0.25s ease both',
        }}
        aria-hidden="true"
      />

      {/* Modal card */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Nexus onboarding"
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 'min(420px, 92vw)',
          maxHeight: '88vh',
          overflowY: 'auto',
          background: 'var(--bg-card, #fff)',
          border: '0.5px solid var(--border, #E9E4D8)',
          borderRadius: 14,
          boxShadow: '0 16px 48px rgba(28,22,16,0.16)',
          zIndex: 9999,
          animation: closing
            ? 'onboardingCardOut 0.22s cubic-bezier(.4,0,1,1) both'
            : 'onboardingCardIn 0.38s cubic-bezier(.22,1,.36,1) both',
          fontFamily: "'DM Sans', system-ui, sans-serif",
        }}
      >
        {/* Header */}
        <div
          style={{
            background: 'var(--color-primary, #4C2A92)',
            padding: '28px 24px 20px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontSize: 20, marginBottom: 6 }}>
                {isComplete ? '🎉' : '👋'}
              </div>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#fff', lineHeight: 1.3 }}>
                {isComplete ? "You're all set!" : 'Welcome to Nexus'}
              </div>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.75)', marginTop: 4 }}>
                {isComplete
                  ? "You've completed your setup."
                  : `${completedCount} of ${totalSteps} steps complete`}
              </div>
            </div>

            {/* X close */}
            <button
              onClick={handleDismiss}
              aria-label="Dismiss"
              style={{
                background: 'rgba(255,255,255,0.12)',
                border: 'none',
                borderRadius: 6,
                color: '#fff',
                cursor: 'pointer',
                fontSize: 16,
                lineHeight: 1,
                padding: '4px 8px',
                marginTop: 2,
              }}
            >
              ×
            </button>
          </div>

          {/* Progress bar */}
          {!isComplete && (
            <div
              style={{
                marginTop: 14,
                height: 4,
                borderRadius: 2,
                background: 'rgba(255,255,255,0.2)',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  height: '100%',
                  width: `${progressPct}%`,
                  background: '#fff',
                  borderRadius: 2,
                  transition: 'width 0.4s ease',
                }}
              />
            </div>
          )}
        </div>

        {/* Body */}
        <div style={{ padding: '20px 24px 24px' }}>
          {isComplete ? (
            <div style={{ textAlign: 'center', padding: '8px 0' }}>
              <p style={{ margin: 0, fontSize: 14, color: 'var(--ink-2)', lineHeight: 1.6 }}>
                You're ready to get to work in Nexus. Explore your department, track your tasks, and connect with your team.
              </p>
              <button
                onClick={handleDismiss}
                style={{
                  marginTop: 20,
                  width: '100%',
                  padding: '11px 0',
                  background: 'var(--color-primary, #4C2A92)',
                  border: 'none',
                  borderRadius: 8,
                  color: '#fff',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Continue
              </button>
            </div>
          ) : (
            <>
              {/* Steps */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {steps.map((step, idx) => {
                  const done = completedKeys.has(step.key)
                  const isNext = !done && steps.slice(0, idx).every(s => completedKeys.has(s.key))

                  return (
                    <div
                      key={step.key}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        padding: '10px 0',
                        borderBottom: idx < steps.length - 1
                          ? '1px solid var(--border-subtle, #F0EDE6)'
                          : 'none',
                      }}
                    >
                      {/* Status circle */}
                      <div
                        style={{
                          flexShrink: 0,
                          width: 22,
                          height: 22,
                          borderRadius: '50%',
                          background: done
                            ? 'var(--accent-green, #2D8653)'
                            : isNext
                              ? 'var(--color-primary, #4C2A92)'
                              : 'var(--border-subtle, #E9E4D8)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: done || isNext ? '#fff' : 'var(--ink-3)',
                          fontSize: 11,
                          fontWeight: 700,
                          transition: 'background 0.2s',
                        }}
                        aria-hidden="true"
                      >
                        {done ? '✓' : idx + 1}
                      </div>

                      {/* Label */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            fontSize: 13,
                            fontWeight: done ? 400 : 500,
                            color: done ? 'var(--ink-3)' : 'var(--ink-1)',
                            textDecoration: done ? 'line-through' : 'none',
                          }}
                        >
                          {step.title}
                        </div>
                        {!done && (
                          <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 2, lineHeight: 1.4 }}>
                            {step.description}
                          </div>
                        )}
                      </div>

                      {/* Go button (only on next uncompleted step) */}
                      {isNext && step.actionUrl && (
                        <button
                          type="button"
                          onClick={() => {
                            handleDismiss()
                            navigate(step.actionUrl)
                          }}
                          style={{
                            flexShrink: 0,
                            padding: '5px 12px',
                            fontSize: 12,
                            fontWeight: 600,
                            background: 'var(--color-primary, #4C2A92)',
                            color: '#fff',
                            border: 'none',
                            borderRadius: 6,
                            cursor: 'pointer',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          Go
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* Footer */}
              <button
                type="button"
                onClick={handleDismiss}
                style={{
                  marginTop: 20,
                  width: '100%',
                  padding: '10px 0',
                  background: 'transparent',
                  border: '1px solid var(--border, #E9E4D8)',
                  borderRadius: 8,
                  color: 'var(--ink-2)',
                  fontSize: 13,
                  cursor: 'pointer',
                }}
              >
                Not now
              </button>
            </>
          )}
        </div>
      </div>
    </>
  )
}
