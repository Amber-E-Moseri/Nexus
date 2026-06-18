import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import Step1PickTemplate from '../../components/invitations/Step1PickTemplate'
import Step2EventDetails from '../../components/invitations/Step2EventDetails'
import Step3Recipients from '../../components/invitations/Step3Recipients'
import Step4PreviewSend from '../../components/invitations/Step4PreviewSend'

const PRIMARY = '#4C2A92'
const BORDER = '#EDE8DC'
const TEXT = '#2D2A22'
const MUTED = '#9E9488'
const BG = '#F4F1EA'

function StepIndicator({ currentStep, totalSteps }) {
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 24 }}>
      {Array.from({ length: totalSteps }, (_, i) => {
        const step = i + 1
        const isDone = step < currentStep
        const isActive = step === currentStep

        return (
          <div key={step} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 700,
                fontSize: 14,
                background: isDone ? '#2D8653' : isActive ? PRIMARY : '#E8E3D5',
                color: isDone || isActive ? 'white' : MUTED,
              }}
            >
              {isDone ? '✓' : step}
            </div>
            {step < totalSteps && (
              <div
                style={{
                  width: 20,
                  height: 2,
                  background: isDone ? '#2D8653' : BORDER,
                }}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

export default function InvitationWizard() {
  const navigate = useNavigate()
  const [currentStep, setCurrentStep] = useState(1)
  const [wizardState, setWizardState] = useState({
    templateId: null,
    template: null,
    content: {},
    recipients: [],
    scheduledAt: null,
    sendMode: 'now', // 'now', 'schedule', 'draft'
  })

  const totalSteps = 4

  function updateState(updates) {
    setWizardState((prev) => ({ ...prev, ...updates }))
  }

  function handleContinue() {
    if (currentStep < totalSteps) {
      setCurrentStep((s) => s + 1)
    }
  }

  function handleBack() {
    if (currentStep > 1) {
      setCurrentStep((s) => s - 1)
    }
  }

  function isStepValid() {
    if (currentStep === 1) return wizardState.templateId !== null
    if (currentStep === 2) {
      if (!wizardState.template?.content_slots) return true
      const slots = wizardState.template.content_slots || []
      return slots.every((slot) => wizardState.content[slot]?.trim())
    }
    if (currentStep === 3) return wizardState.recipients.length > 0
    if (currentStep === 4) return true
    return true
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: BG }}>
      <div style={{ padding: '20px 24px', background: '#FFFFFF', borderBottom: `1px solid ${BORDER}`, flexShrink: 0 }}>
        <button
          type="button"
          onClick={() => navigate('/communications')}
          style={{ border: 'none', background: 'none', color: MUTED, cursor: 'pointer', fontSize: 13, padding: 0, marginBottom: 16 }}
        >
          {'<-'} Communications
        </button>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: TEXT, marginBottom: 4 }}>
          Create Invitation Campaign
        </h1>
        <p style={{ margin: 0, fontSize: 13, color: MUTED }}>Build and send invitation campaigns step by step.</p>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
        <div style={{ maxWidth: 800, margin: '0 auto' }}>
          <StepIndicator currentStep={currentStep} totalSteps={totalSteps} />

          {currentStep === 1 && (
            <Step1PickTemplate
              onSelect={(templateId, template) => {
                updateState({ templateId, template })
              }}
              wizardState={wizardState}
            />
          )}

          {currentStep === 2 && wizardState.template && (
            <Step2EventDetails
              template={wizardState.template}
              onUpdate={(content) => updateState({ content })}
              wizardState={wizardState}
            />
          )}

          {currentStep === 3 && wizardState.template && (
            <Step3Recipients
              template={wizardState.template}
              onUpdate={(recipients) => updateState({ recipients })}
              wizardState={wizardState}
            />
          )}

          {currentStep === 4 && wizardState.template && (
            <Step4PreviewSend
              template={wizardState.template}
              wizardState={wizardState}
              onUpdate={(updates) => updateState(updates)}
            />
          )}
        </div>
      </div>

      <div
        style={{
          padding: '16px 24px',
          background: '#FFFFFF',
          borderTop: `1px solid ${BORDER}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          flexShrink: 0,
        }}
      >
        <button
          type="button"
          onClick={handleBack}
          disabled={currentStep === 1}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            border: `1px solid ${BORDER}`,
            background: '#FFFFFF',
            color: MUTED,
            borderRadius: 8,
            padding: '8px 16px',
            fontSize: 13,
            fontWeight: 600,
            cursor: currentStep === 1 ? 'not-allowed' : 'pointer',
            opacity: currentStep === 1 ? 0.5 : 1,
          }}
        >
          <ChevronLeft size={16} /> Back
        </button>

        <button
          type="button"
          onClick={handleContinue}
          disabled={!isStepValid()}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            border: 'none',
            background: PRIMARY,
            color: '#FFFFFF',
            borderRadius: 8,
            padding: '8px 16px',
            fontSize: 13,
            fontWeight: 600,
            cursor: !isStepValid() ? 'not-allowed' : 'pointer',
            opacity: !isStepValid() ? 0.5 : 1,
          }}
        >
          Continue <ChevronRight size={16} />
        </button>
      </div>
    </div>
  )
}
