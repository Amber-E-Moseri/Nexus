import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AgendaBuilderProvider, AgendaBuilderContext } from '../../context/AgendaBuilderContext'
import { useAgendaWizard, validateStep1, validateStep2 } from '../../hooks/useAgendaWizard'
import Step1MeetingSetup from '../../features/agendas/components/Step1MeetingSetup'
import Step2BuildAgenda from '../../features/agendas/components/Step2BuildAgenda'
import Step3PreviewExport from '../../features/agendas/components/Step3PreviewExport'

function WizardContent() {
  const { step, goToStep, reset, agendaData, agendaItems, errors, clearErrors, setError, autoSaveStatus } = useAgendaWizard()
  const navigate = useNavigate()
  const [unsavedChanges, setUnsavedChanges] = useState(false)

  useEffect(() => {
    setUnsavedChanges(true)
  }, [agendaData, agendaItems])

  function handleBackClick() {
    if (step > 1) {
      clearErrors()
      goToStep(step - 1)
    }
  }

  function handleNextClick() {
    clearErrors()

    if (step === 1) {
      const newErrors = validateStep1(agendaData)
      if (Object.keys(newErrors).length > 0) {
        Object.entries(newErrors).forEach(([field, message]) => {
          setError(field, message)
        })
        return
      }
    } else if (step === 2) {
      const newErrors = validateStep2(agendaItems)
      if (Object.keys(newErrors).length > 0) {
        Object.entries(newErrors).forEach(([field, message]) => {
          setError(field, message)
        })
        return
      }
    }

    goToStep(step + 1)
  }

  function handleCancelClick() {
    if (unsavedChanges) {
      if (window.confirm('You have unsaved changes. Are you sure you want to exit?')) {
        reset()
        navigate('/meetings')
      }
    } else {
      reset()
      navigate('/meetings')
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#FCFAF6' }}>
      {/* Header */}
      <div style={{ background: 'white', borderBottom: '1px solid #E5DDD0', padding: '18px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', maxWidth: 1400, margin: '0 auto' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#0C0E18' }}>
              Plan Meeting
            </h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 4 }}>
              <p style={{ margin: 0, fontSize: 12, color: '#9E9488' }}>
                Step {step} of 3
              </p>
              {autoSaveStatus === 'saving' && (
                <span style={{ fontSize: 11, color: '#9E9488' }}>💾 Saving...</span>
              )}
              {autoSaveStatus === 'saved' && (
                <span style={{ fontSize: 11, color: '#27AE60' }}>✓ Saved</span>
              )}
              {autoSaveStatus === 'error' && (
                <span style={{ fontSize: 11, color: '#DC3545' }}>⚠ Save failed — retrying...</span>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={handleCancelClick}
            style={{
              border: 'none',
              background: 'transparent',
              fontSize: 24,
              color: '#9E9488',
              cursor: 'pointer',
              padding: '4px 8px',
            }}
          >
            ×
          </button>
        </div>
      </div>

      {/* Stepper */}
      <div style={{ display: 'flex', gap: 0, background: 'white', borderBottom: '1px solid #E5DDD0', padding: '0 24px', maxWidth: 1400, margin: '0 auto', width: '100%' }}>
        {[1, 2, 3].map((stepNum) => (
          <button
            key={stepNum}
            type="button"
            onClick={() => stepNum <= step && goToStep(stepNum)}
            style={{
              flex: 1,
              border: 'none',
              background: 'none',
              padding: '12px 16px',
              fontSize: 12,
              fontWeight: 600,
              color: step >= stepNum ? '#4C2A92' : '#CCC3B0',
              borderBottom: step === stepNum ? '2px solid #4C2A92' : '1px solid transparent',
              cursor: stepNum <= step ? 'pointer' : 'default',
              transition: 'color .2s',
            }}
          >
            {stepNum === 1 && 'Meeting Setup'}
            {stepNum === 2 && 'Build Agenda'}
            {stepNum === 3 && 'Preview & Export'}
          </button>
        ))}
      </div>

      {/* Content Area */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px', maxWidth: 1400, margin: '0 auto', width: '100%' }}>
        {step === 1 && <Step1MeetingSetup />}
        {step === 2 && <Step2BuildAgenda />}
        {step === 3 && <Step3PreviewExport />}
      </div>

      {/* Footer with Navigation Buttons */}
      <div style={{ background: 'white', borderTop: '1px solid #E5DDD0', padding: '14px 24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', maxWidth: 1400, margin: '0 auto' }}>
          <button
            type="button"
            onClick={handleBackClick}
            disabled={step === 1}
            style={{
              borderRadius: 8,
              border: '1px solid #E5DDD0',
              background: 'white',
              padding: '8px 16px',
              fontSize: 13,
              fontWeight: 600,
              color: step === 1 ? '#CCC3B0' : '#4C2A92',
              cursor: step === 1 ? 'default' : 'pointer',
              opacity: step === 1 ? 0.5 : 1,
            }}
          >
            ← Back
          </button>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              onClick={handleCancelClick}
              style={{
                borderRadius: 8,
                border: '1px solid #E5DDD0',
                background: 'white',
                padding: '8px 16px',
                fontSize: 13,
                fontWeight: 600,
                color: '#666',
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            {step < 3 && (
              <button
                type="button"
                onClick={handleNextClick}
                style={{
                  borderRadius: 8,
                  border: 'none',
                  background: '#4C2A92',
                  padding: '8px 16px',
                  fontSize: 13,
                  fontWeight: 600,
                  color: 'white',
                  cursor: 'pointer',
                }}
              >
                Next →
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function MeetingWizardPage() {
  return (
    <AgendaBuilderProvider>
      <WizardContent />
    </AgendaBuilderProvider>
  )
}
