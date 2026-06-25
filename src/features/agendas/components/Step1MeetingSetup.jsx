import { useHasPermission } from '../../../hooks/useHasPermission'
import { useAgendaWizard, validateStep1 } from '../../../hooks/useAgendaWizard'
import { MEETING_TYPES, THEME_OPTIONS } from '../../../data/agendaTemplates'

export default function Step1MeetingSetup() {
  const { hasPermission, loading: checkingPermissions } = useHasPermission('meetings:manage')
  const { agendaData, updateAgendaData, setError, errors, goToStep } = useAgendaWizard()

  function handleNext() {
    const newErrors = validateStep1(agendaData)
    if (Object.keys(newErrors).length > 0) {
      Object.entries(newErrors).forEach(([field, message]) => {
        setError(field, message)
      })
      return
    }
    goToStep(2)
  }

  // Permission guard
  if (!checkingPermissions && !hasPermission) {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <h2 style={{ color: '#DC3545', marginBottom: 16 }}>Access Denied</h2>
        <p style={{ color: '#9E9488', marginBottom: 20 }}>
          You don't have permission to create agendas. Only ORS members can plan meetings.
        </p>
        <p style={{ fontSize: 12, color: '#999' }}>
          Contact your administrator if you believe this is an error.
        </p>
      </div>
    )
  }

  if (checkingPermissions) {
    return <div style={{ padding: '40px', textAlign: 'center' }}>Checking permissions...</div>
  }

  return (
    <div style={{ maxWidth: 800 }}>
      <div style={{ marginBottom: 32 }}>
        <h2 style={{ margin: '0 0 16px', fontSize: 18, fontWeight: 700, color: '#0C0E18' }}>
          Meeting Type
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
          {MEETING_TYPES.map((type) => (
            <button
              key={type.value}
              type="button"
              onClick={() => updateAgendaData({ meetingType: type.value })}
              style={{
                borderRadius: 12,
                border: agendaData.meetingType === type.value ? '2px solid #4C2A92' : '1px solid #E5DDD0',
                background: agendaData.meetingType === type.value ? 'rgba(76, 42, 146, 0.08)' : 'white',
                padding: '16px 12px',
                fontSize: 13,
                fontWeight: 600,
                color: agendaData.meetingType === type.value ? '#4C2A92' : '#4C4C4C',
                cursor: 'pointer',
                transition: 'all .2s',
              }}
            >
              {type.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gap: 14, gridTemplateColumns: '1.5fr 1fr' }}>
        <div>
          <label style={labelStyle}>Meeting Title *</label>
          <input
            type="text"
            value={agendaData.title}
            onChange={(e) => updateAgendaData({ title: e.target.value })}
            placeholder="e.g., Sunday Service, Regional Sync"
            style={{
              ...inputStyle,
              borderColor: errors.title ? '#DC3545' : '#E5DDD0',
              background: errors.title ? 'rgba(220, 53, 69, 0.04)' : 'white',
            }}
          />
          {errors.title && <p style={errorStyle}>{errors.title}</p>}
        </div>
        <div>
          <label style={labelStyle}>Date *</label>
          <input
            type="date"
            value={agendaData.date}
            onChange={(e) => updateAgendaData({ date: e.target.value })}
            style={{
              ...inputStyle,
              borderColor: errors.date ? '#DC3545' : '#E5DDD0',
              background: errors.date ? 'rgba(220, 53, 69, 0.04)' : 'white',
            }}
          />
          {errors.date && <p style={errorStyle}>{errors.date}</p>}
        </div>
      </div>

      <div style={{ display: 'grid', gap: 14, gridTemplateColumns: '1fr 1fr', marginTop: 14 }}>
        <div>
          <label style={labelStyle}>Start Time *</label>
          <input
            type="time"
            value={agendaData.startTime}
            onChange={(e) => updateAgendaData({ startTime: e.target.value })}
            style={{
              ...inputStyle,
              borderColor: errors.startTime ? '#DC3545' : '#E5DDD0',
              background: errors.startTime ? 'rgba(220, 53, 69, 0.04)' : 'white',
            }}
          />
          {errors.startTime && <p style={errorStyle}>{errors.startTime}</p>}
        </div>
        <div>
          <label style={labelStyle}>End Time *</label>
          <input
            type="time"
            value={agendaData.endTime}
            onChange={(e) => updateAgendaData({ endTime: e.target.value })}
            style={{
              ...inputStyle,
              borderColor: errors.endTime ? '#DC3545' : '#E5DDD0',
              background: errors.endTime ? 'rgba(220, 53, 69, 0.04)' : 'white',
            }}
          />
          {errors.endTime && <p style={errorStyle}>{errors.endTime}</p>}
        </div>
      </div>

      <div style={{ marginTop: 14 }}>
        <label style={labelStyle}>Location</label>
        <input
          type="text"
          value={agendaData.location}
          onChange={(e) => updateAgendaData({ location: e.target.value })}
          placeholder="e.g., Main Hall, Zoom Link, Room 201"
          style={inputStyle}
        />
      </div>

      <div style={{ marginTop: 14 }}>
        <label style={labelStyle}>Moderator Name</label>
        <input
          type="text"
          value={agendaData.moderator}
          onChange={(e) => updateAgendaData({ moderator: e.target.value })}
          placeholder="e.g., John Doe"
          style={inputStyle}
        />
      </div>

      <div style={{ marginTop: 24 }}>
        <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 700, color: '#0C0E18' }}>
          Visual Theme
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
          {THEME_OPTIONS.map((theme) => (
            <button
              key={theme.id}
              type="button"
              onClick={() => updateAgendaData({ theme: theme.id })}
              style={{
                borderRadius: 12,
                border: agendaData.theme === theme.id ? '2px solid #4C2A92' : '1px solid #E5DDD0',
                background: theme.background,
                padding: '16px 12px',
                cursor: 'pointer',
                transition: 'all .2s',
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 600, color: theme.primary, marginBottom: 8 }}>
                {theme.name}
              </div>
              <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                <div style={{ width: 12, height: 12, borderRadius: 3, background: theme.primary }} />
                <div style={{ width: 12, height: 12, borderRadius: 3, background: theme.accent }} />
              </div>
            </button>
          ))}
        </div>
      </div>

      <div style={{ marginTop: 24, padding: '16px', background: 'rgba(76, 42, 146, 0.06)', borderRadius: 12 }}>
        <p style={{ margin: 0, fontSize: 12, color: '#4C2A92', fontWeight: 500 }}>
          ✓ Form is ready. Click "Next" to build your agenda.
        </p>
      </div>
    </div>
  )
}

const labelStyle = {
  display: 'block',
  marginBottom: 6,
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: '#9E9488',
}

const inputStyle = {
  width: '100%',
  fontSize: 13,
  padding: '10px 12px',
  border: '1px solid #E5DDD0',
  borderRadius: 8,
  outline: 'none',
  background: 'white',
  color: '#0C0E18',
  fontFamily: 'inherit',
}

const errorStyle = {
  margin: '4px 0 0',
  fontSize: 11,
  color: '#DC3545',
  fontWeight: 500,
}
