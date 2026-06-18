import { useMemo } from 'react'

const PRIMARY = '#4C2A92'
const BORDER = '#EDE8DC'
const TEXT = '#2D2A22'
const MUTED = '#9E9488'

function prettifyKey(key) {
  return key
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

export default function Step2EventDetails({ template, onUpdate, wizardState }) {
  const contentSlots = template?.content_slots || []

  const missingFields = useMemo(() => {
    return contentSlots.filter((slot) => !wizardState.content[slot]?.trim())
  }, [contentSlots, wizardState.content])

  function handleInputChange(slot, value) {
    onUpdate({
      ...wizardState.content,
      [slot]: value,
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <div style={{ fontSize: 14, fontWeight: 700, color: TEXT, marginBottom: 8 }}>
          Event Details
        </div>
        <p style={{ margin: 0, fontSize: 13, color: MUTED }}>
          Fill in the details for your invitation. All fields are required.
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {contentSlots.map((slot) => {
          const value = wizardState.content[slot] ?? ''
          const isEmpty = !value.trim()
          const label = prettifyKey(slot)

          return (
            <label key={slot} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: TEXT }}>
                {label}
                <span style={{ color: '#C94830' }}>*</span>
              </div>
              <input
                type="text"
                value={value}
                onChange={(e) => handleInputChange(slot, e.target.value)}
                placeholder={`Enter ${label.toLowerCase()}`}
                style={{
                  border: `1px solid ${isEmpty ? '#F5A0A0' : BORDER}`,
                  borderRadius: 9,
                  padding: '10px 12px',
                  fontSize: 13,
                  outline: 'none',
                  fontFamily: 'inherit',
                  background: isEmpty ? '#FEF5F5' : '#FFFFFF',
                }}
              />
              {isEmpty && (
                <span style={{ fontSize: 11, color: '#C94830' }}>
                  {label} is required
                </span>
              )}
            </label>
          )
        })}
      </div>

      {missingFields.length > 0 && (
        <div
          style={{
            background: '#FEF0ED',
            border: `1px solid #F5C4B8`,
            borderRadius: 10,
            padding: '12px 16px',
            fontSize: 13,
            color: '#C94830',
          }}
        >
          {missingFields.length} required {missingFields.length === 1 ? 'field' : 'fields'} missing
        </div>
      )}
    </div>
  )
}
