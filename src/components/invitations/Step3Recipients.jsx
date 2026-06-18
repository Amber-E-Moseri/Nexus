import { useMemo, useState } from 'react'
import { X, AlertCircle, Upload } from 'lucide-react'
import CSVImporter from './CSVImporter'

const PRIMARY = '#4C2A92'
const BORDER = '#EDE8DC'
const TEXT = '#2D2A22'
const MUTED = '#9E9488'

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function validateEmail(email) {
  return EMAIL_REGEX.test(email.trim())
}

function prettifyKey(key) {
  return key
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

export default function Step3Recipients({ template, onUpdate, wizardState }) {
  const [inputMode, setInputMode] = useState('manual') // 'manual' | 'csv'
  const [formData, setFormData] = useState({
    email: '',
    name: '',
    tokenFields: {},
  })

  const [formErrors, setFormErrors] = useState({})
  const tokenFields = template?.token_fields || []

  function validateForm() {
    const errors = {}
    const email = formData.email.trim()
    const name = formData.name.trim()

    if (!email) {
      errors.email = 'Email is required'
    } else if (!validateEmail(email)) {
      errors.email = 'Invalid email address'
    }

    if (!name) {
      errors.name = 'Name is required'
    }

    tokenFields.forEach((field) => {
      if (!formData.tokenFields[field]?.trim()) {
        errors[`token_${field}`] = `${prettifyKey(field)} is required`
      }
    })

    const emailExists = wizardState.recipients.some(
      (r) => r.email.toLowerCase() === email.toLowerCase()
    )
    if (emailExists && email) {
      errors.email = 'This email is already in the list'
    }

    setFormErrors(errors)
    return Object.keys(errors).length === 0
  }

  function handleAddRecipient() {
    if (!validateForm()) return

    const email = formData.email.trim()
    const name = formData.name.trim()

    const newRecipient = {
      email,
      name,
      custom_fields: { ...formData.tokenFields },
    }

    onUpdate([...wizardState.recipients, newRecipient])

    setFormData({
      email: '',
      name: '',
      tokenFields: {},
    })
    setFormErrors({})
  }

  function handleRemoveRecipient(index) {
    onUpdate(wizardState.recipients.filter((_, i) => i !== index))
  }

  function updateFormField(key, value) {
    setFormData((prev) => ({ ...prev, [key]: value }))
    if (formErrors[key]) {
      const newErrors = { ...formErrors }
      delete newErrors[key]
      setFormErrors(newErrors)
    }
  }

  function updateTokenField(field, value) {
    setFormData((prev) => ({
      ...prev,
      tokenFields: { ...prev.tokenFields, [field]: value },
    }))
    if (formErrors[`token_${field}`]) {
      const newErrors = { ...formErrors }
      delete newErrors[`token_${field}`]
      setFormErrors(newErrors)
    }
  }

  const hasErrors = Object.keys(formErrors).length > 0

  const handleCSVImportComplete = (recipients) => {
    onUpdate([...wizardState.recipients, ...recipients])
    setInputMode('manual')
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <div style={{ fontSize: 14, fontWeight: 700, color: TEXT, marginBottom: 8 }}>
          Add Recipients
        </div>
        <p style={{ margin: 0, fontSize: 13, color: MUTED }}>
          Import recipients via CSV or add them manually.
        </p>
      </div>

      {/* Input Mode Selector */}
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          type="button"
          onClick={() => setInputMode('manual')}
          style={{
            flex: 1,
            padding: '10px 14px',
            border: `2px solid ${inputMode === 'manual' ? PRIMARY : BORDER}`,
            background: inputMode === 'manual' ? '#EDE8F8' : '#FFFFFF',
            borderRadius: 8,
            cursor: 'pointer',
            fontWeight: inputMode === 'manual' ? 600 : 500,
            fontSize: 13,
            color: inputMode === 'manual' ? PRIMARY : TEXT,
            transition: 'all 0.2s'
          }}
        >
          ✏️ Manual Entry
        </button>
        <button
          type="button"
          onClick={() => setInputMode('csv')}
          style={{
            flex: 1,
            padding: '10px 14px',
            border: `2px solid ${inputMode === 'csv' ? PRIMARY : BORDER}`,
            background: inputMode === 'csv' ? '#EDE8F8' : '#FFFFFF',
            borderRadius: 8,
            cursor: 'pointer',
            fontWeight: inputMode === 'csv' ? 600 : 500,
            fontSize: 13,
            color: inputMode === 'csv' ? PRIMARY : TEXT,
            transition: 'all 0.2s'
          }}
        >
          📁 CSV Import
        </button>
      </div>

      {/* CSV Importer */}
      {inputMode === 'csv' && (
        <CSVImporter
          templateTokenFields={tokenFields}
          onComplete={handleCSVImportComplete}
        />
      )}

      {/* Manual Entry */}
      {inputMode === 'manual' && (
        <div style={{ border: `1px solid ${BORDER}`, borderRadius: 12, padding: 16, background: '#FFFFFF' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: TEXT }}>
                Email <span style={{ color: '#C94830' }}>*</span>
              </div>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => updateFormField('email', e.target.value)}
                placeholder="recipient@example.com"
                style={{
                  border: `1px solid ${formErrors.email ? '#F5A0A0' : BORDER}`,
                  borderRadius: 8,
                  padding: '9px 12px',
                  fontSize: 13,
                  outline: 'none',
                  fontFamily: 'inherit',
                  background: formErrors.email ? '#FEF5F5' : '#FFFFFF',
                }}
              />
              {formErrors.email && (
                <span style={{ fontSize: 11, color: '#C94830' }}>
                  <AlertCircle size={12} style={{ display: 'inline', marginRight: 4 }} />
                  {formErrors.email}
                </span>
              )}
            </label>

            <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: TEXT }}>
                Name <span style={{ color: '#C94830' }}>*</span>
              </div>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => updateFormField('name', e.target.value)}
                placeholder="Full name"
                style={{
                  border: `1px solid ${formErrors.name ? '#F5A0A0' : BORDER}`,
                  borderRadius: 8,
                  padding: '9px 12px',
                  fontSize: 13,
                  outline: 'none',
                  fontFamily: 'inherit',
                  background: formErrors.name ? '#FEF5F5' : '#FFFFFF',
                }}
              />
              {formErrors.name && (
                <span style={{ fontSize: 11, color: '#C94830' }}>
                  {formErrors.name}
                </span>
              )}
            </label>
          </div>

          {tokenFields.map((field) => (
            <label key={field} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: TEXT }}>
                {prettifyKey(field)} <span style={{ color: '#C94830' }}>*</span>
              </div>
              <input
                type="text"
                value={formData.tokenFields[field] ?? ''}
                onChange={(e) => updateTokenField(field, e.target.value)}
                placeholder={`Enter ${prettifyKey(field).toLowerCase()}`}
                style={{
                  border: `1px solid ${formErrors[`token_${field}`] ? '#F5A0A0' : BORDER}`,
                  borderRadius: 8,
                  padding: '9px 12px',
                  fontSize: 13,
                  outline: 'none',
                  fontFamily: 'inherit',
                  background: formErrors[`token_${field}`] ? '#FEF5F5' : '#FFFFFF',
                }}
              />
              {formErrors[`token_${field}`] && (
                <span style={{ fontSize: 11, color: '#C94830' }}>
                  {formErrors[`token_${field}`]}
                </span>
              )}
            </label>
          ))}

          <button
            type="button"
            onClick={handleAddRecipient}
            style={{
              background: PRIMARY,
              color: '#FFFFFF',
              border: 'none',
              borderRadius: 8,
              padding: '9px 16px',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              alignSelf: 'flex-start',
              marginTop: 4,
            }}
          >
            Add Recipient
          </button>
        </div>
        </div>
      )}

      {wizardState.recipients.length > 0 && (
        <div style={{ border: `1px solid ${BORDER}`, borderRadius: 12, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#F4F1EA', borderBottom: `1px solid ${BORDER}` }}>
                <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 700, color: MUTED, fontSize: 11 }}>
                  Name
                </th>
                <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 700, color: MUTED, fontSize: 11 }}>
                  Email
                </th>
                <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 700, color: MUTED, fontSize: 11, width: 50 }}>
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {wizardState.recipients.map((recipient, index) => (
                <tr
                  key={index}
                  style={{
                    borderBottom: `1px solid ${BORDER}`,
                    background: '#FFFFFF',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = '#FAFAF7' }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = '#FFFFFF' }}
                >
                  <td style={{ padding: '10px 12px', color: TEXT, fontWeight: 500 }}>
                    {recipient.name}
                  </td>
                  <td style={{ padding: '10px 12px', color: MUTED }}>
                    {recipient.email}
                  </td>
                  <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                    <button
                      type="button"
                      onClick={() => handleRemoveRecipient(index)}
                      style={{
                        border: 'none',
                        background: 'none',
                        color: '#C94830',
                        cursor: 'pointer',
                        padding: 4,
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                      title="Remove recipient"
                    >
                      <X size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div
        style={{
          background: hasErrors ? '#FEF0ED' : '#EBF7F1',
          border: `1px solid ${hasErrors ? '#F5C4B8' : '#A7DDBA'}`,
          borderRadius: 10,
          padding: '12px 16px',
          fontSize: 13,
          color: hasErrors ? '#C94830' : '#1B5E3C',
        }}
      >
        {hasErrors
          ? `${Object.keys(formErrors).length} validation error(s)`
          : `Ready to continue (${wizardState.recipients.length} recipient${wizardState.recipients.length !== 1 ? 's' : ''})`}
      </div>
    </div>
  )
}
