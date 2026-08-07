import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../../hooks/useAuth'
import { supabase } from '../../../lib/supabase'
import { getOnboardingStepsForRole, getOnboardingStepCount } from '../../../lib/adoption-config'

export default function OnboardingChecklist() {
  const navigate = useNavigate()
  const { profile, jwtRole } = useAuth()
  const [state, setState] = useState(null)
  const [progress, setProgress] = useState([])
  const [loading, setLoading] = useState(true)
  const [dismissed, setDismissed] = useState(false)

  const steps = getOnboardingStepsForRole(jwtRole || 'member')
  const totalSteps = getOnboardingStepCount(jwtRole || 'member')

  // Load onboarding state + progress
  useEffect(() => {
    if (!profile?.id) return
    let active = true

    async function load() {
      try {
        // Fetch onboarding state
        const { data: stateData } = await supabase
          .from('user_onboarding_state')
          .select('*')
          .eq('user_id', profile.id)
          .single()

        if (!active) return

        // If dismissed or completed, hide the widget
        if (stateData?.dismissed_at || stateData?.completed_at) {
          setDismissed(true)
          setLoading(false)
          return
        }

        setState(stateData)

        // Fetch progress
        const { data: progressData } = await supabase
          .from('user_onboarding_progress')
          .select('step_key, completed_at')
          .eq('user_id', profile.id)

        if (!active) return
        setProgress(progressData || [])
      } finally {
        if (active) setLoading(false)
      }
    }

    load()
    return () => { active = false }
  }, [profile?.id])

  // Handle dismiss
  const handleDismiss = async () => {
    try {
      await supabase.rpc('dismiss_onboarding')
      setDismissed(true)
    } catch (err) {
      console.error('Failed to dismiss onboarding', err)
    }
  }

  // If dismissed, completed, or no steps, don't render
  if (dismissed || loading || steps.length === 0) {
    return null
  }

  const completedCount = progress.filter((p) => p.completed_at).length
  const isComplete = completedCount >= totalSteps
  const progressPercent = Math.round((completedCount / totalSteps) * 100)

  // Completion message
  if (isComplete) {
    return (
      <div
        style={{
          padding: '16px',
          borderRadius: 12,
          background: 'var(--surface-sub)',
          border: '1px solid var(--border-subtle)',
          marginBottom: 16,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>
              🎉 You're all set!
            </div>
            <div style={{ fontSize: 13, color: 'var(--ink-3)' }}>
              You've completed your Nexus onboarding. Keep exploring features!
            </div>
          </div>
          <button
            type="button"
            onClick={handleDismiss}
            style={{
              padding: '6px 12px',
              fontSize: 12,
              background: 'transparent',
              border: '1px solid var(--border-subtle)',
              borderRadius: 6,
              cursor: 'pointer',
              color: 'var(--ink-2)',
            }}
          >
            Dismiss
          </button>
        </div>
      </div>
    )
  }

  // Onboarding checklist
  return (
    <div
      style={{
        padding: '16px',
        borderRadius: 12,
        background: 'var(--surface-sub)',
        border: '1px solid var(--border-subtle)',
        marginBottom: 16,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>
            Welcome to Nexus 👋
          </div>
          <div style={{ fontSize: 13, color: 'var(--ink-3)' }}>
            Let's get you ready. {completedCount} of {totalSteps} complete
          </div>
        </div>
        <button
          type="button"
          onClick={handleDismiss}
          style={{
            padding: '6px 12px',
            fontSize: 12,
            background: 'transparent',
            border: '1px solid var(--border-subtle)',
            borderRadius: 6,
            cursor: 'pointer',
            color: 'var(--ink-2)',
          }}
        >
          Dismiss
        </button>
      </div>

      {/* Progress bar */}
      <div
        style={{
          height: 4,
          borderRadius: 2,
          background: 'var(--border-subtle)',
          overflow: 'hidden',
          marginBottom: 12,
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${progressPercent}%`,
            background: 'var(--purple-700)',
            transition: 'width 0.3s ease',
          }}
        />
      </div>

      {/* Steps */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {steps.map((step) => {
          const isCompleted = progress.some((p) => p.step_key === step.key && p.completed_at)
          return (
            <div
              key={step.key}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '8px 0',
              }}
            >
              <div
                style={{
                  flex: '0 0 20px',
                  height: 20,
                  borderRadius: '50%',
                  background: isCompleted ? 'var(--accent-green)' : 'var(--border-subtle)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'white',
                  fontSize: 12,
                  fontWeight: 600,
                }}
              >
                {isCompleted ? '✓' : '○'}
              </div>
              <div style={{ flex: 1 }}>
                <div
                  style={{
                    fontSize: 13,
                    color: isCompleted ? 'var(--ink-2)' : 'var(--ink-1)',
                    textDecoration: isCompleted ? 'line-through' : 'none',
                  }}
                >
                  {step.title}
                </div>
                {!isCompleted && (
                  <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 2 }}>
                    {step.description}
                  </div>
                )}
              </div>
              {!isCompleted && step.actionUrl && (
                <button
                  type="button"
                  onClick={() => navigate(step.actionUrl)}
                  style={{
                    padding: '4px 8px',
                    fontSize: 11,
                    background: 'var(--purple-700)',
                    color: 'white',
                    border: 'none',
                    borderRadius: 4,
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
    </div>
  )
}
