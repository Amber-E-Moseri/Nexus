import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { submitEvent, getEventTypes } from '../../lib/calendar'
import { useAuth } from '../../hooks/useAuth'
import { useToast } from '../../context/ToastContext'
import { EVENT_COLORS } from './CalendarEventCard'

const DAYS_OF_WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export default function EventSubmitModal({ onClose, onSubmitted, departments = [] }) {
  const { profile, effectiveRole } = useAuth()
  const { showToast } = useToast()
  const [loading, setLoading] = useState(false)
  const [eventTypes, setEventTypes] = useState([])
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    start_date: new Date().toISOString().split('T')[0],
    end_date: new Date().toISOString().split('T')[0],
    start_time: '09:00',
    end_time: '10:00',
    all_day: false,
    location: '',
    event_type: 'event',
    department_id: null,
    is_org_wide: true,
  })
  const [recurring, setRecurring] = useState(false)
  const [recurrenceData, setRecurrenceData] = useState({
    frequency: 'none',
    daysOfWeek: new Set(),
    dayOfMonth: 1,
    endType: 'never',
    occurrences: 4,
    endDate: new Date().toISOString().split('T')[0],
  })

  useEffect(() => {
    async function loadTypes() {
      try {
        const types = await getEventTypes()
        setEventTypes(types)
        if (types.length > 0 && !types.includes(formData.event_type)) {
          setFormData((prev) => ({ ...prev, event_type: types[0] }))
        }
      } catch (err) {
        console.error('Failed to load event types:', err)
      }
    }
    loadTypes()
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    if (!formData.title.trim()) {
      showToast('Event title is required', { tone: 'error' })
      return
    }
    if (!formData.event_type) {
      showToast('Event type is required', { tone: 'error' })
      return
    }

    const startDate = new Date(formData.start_date)
    const endDate = new Date(formData.end_date)
    if (endDate < startDate) {
      showToast('End date must be after start date', { tone: 'error' })
      return
    }

    setLoading(true)
    try {
      const eventData = {
        ...formData,
        start_date: formData.all_day
          ? new Date(formData.start_date).toISOString()
          : new Date(`${formData.start_date}T${formData.start_time}`).toISOString(),
        end_date: formData.all_day
          ? new Date(formData.end_date).toISOString()
          : new Date(`${formData.end_date}T${formData.end_time}`).toISOString(),
        recurrence_rule: buildRRule(),
      }

      const userRole = effectiveRole || 'user'
      await submitEvent(eventData, profile.id, userRole)

      const isAutoApproved = userRole === 'super_admin' || (profile?.can_manage === true)
      showToast(isAutoApproved ? 'Event added to calendar' : 'Event submitted for review', { tone: 'success' })
      onSubmitted?.()
      onClose()
    } catch (err) {
      console.error('Failed to submit event:', err)
      showToast('Failed to submit event', { tone: 'error' })
    } finally {
      setLoading(false)
    }
  }

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }))
  }

  function buildRRule() {
    if (!recurring || recurrenceData.frequency === 'none') return null

    let rrule = `FREQ=${recurrenceData.frequency.toUpperCase()}`

    if (recurrenceData.frequency === 'bi-weekly') {
      rrule = `FREQ=WEEKLY;INTERVAL=2`
    }

    if (recurrenceData.frequency === 'weekly' || recurrenceData.frequency === 'bi-weekly') {
      if (recurrenceData.daysOfWeek.size > 0) {
        const dayMap = { Sun: 'SU', Mon: 'MO', Tue: 'TU', Wed: 'WE', Thu: 'TH', Fri: 'FR', Sat: 'SA' }
        const days = Array.from(recurrenceData.daysOfWeek).map((d) => dayMap[d]).join(',')
        rrule += `;BYDAY=${days}`
      }
    } else if (recurrenceData.frequency === 'monthly') {
      rrule += `;BYMONTHDAY=${recurrenceData.dayOfMonth}`
    }

    if (recurrenceData.endType === 'occurrences') {
      rrule += `;COUNT=${recurrenceData.occurrences}`
    } else if (recurrenceData.endType === 'date') {
      const endDate = new Date(recurrenceData.endDate)
      const dateStr = endDate.toISOString().split('T')[0].replace(/-/g, '')
      rrule += `;UNTIL=${dateStr}T000000Z`
    }

    return rrule
  }

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 50
    }}>
      <div style={{
        backgroundColor: 'white',
        borderRadius: '16px',
        padding: '32px',
        maxWidth: '600px',
        width: '90%',
        maxHeight: '90vh',
        overflowY: 'auto',
        boxShadow: '0 10px 40px rgba(0, 0, 0, 0.1)'
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '24px'
        }}>
          <h2 style={{
            fontSize: '20px',
            fontWeight: 600,
            color: 'var(--text-primary)'
          }}>
            Submit Event
          </h2>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <X size={20} color="var(--text-secondary)" />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Title */}
          <div>
            <label style={{
              display: 'block',
              fontSize: '14px',
              fontWeight: 600,
              marginBottom: '8px',
              color: 'var(--text-primary)'
            }}>
              Event Title *
            </label>
            <input
              type="text"
              name="title"
              value={formData.title}
              onChange={handleChange}
              placeholder="e.g., Sunday Service"
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: '8px',
                border: '1px solid var(--border)',
                fontSize: '14px',
                boxSizing: 'border-box'
              }}
            />
          </div>

          {/* Description */}
          <div>
            <label style={{
              display: 'block',
              fontSize: '14px',
              fontWeight: 600,
              marginBottom: '8px',
              color: 'var(--text-primary)'
            }}>
              Description
            </label>
            <textarea
              name="description"
              value={formData.description}
              onChange={handleChange}
              placeholder="Add details about the event..."
              rows={4}
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: '8px',
                border: '1px solid var(--border)',
                fontSize: '14px',
                boxSizing: 'border-box',
                fontFamily: 'inherit',
                resize: 'vertical'
              }}
            />
          </div>

          {/* All Day Toggle */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <input
              type="checkbox"
              name="all_day"
              checked={formData.all_day}
              onChange={handleChange}
              id="all-day-checkbox"
              style={{ cursor: 'pointer' }}
            />
            <label htmlFor="all-day-checkbox" style={{
              fontSize: '14px',
              fontWeight: 500,
              color: 'var(--text-primary)',
              cursor: 'pointer'
            }}>
              All-day event
            </label>
          </div>

          {/* Dates and Times */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={{
                display: 'block',
                fontSize: '14px',
                fontWeight: 600,
                marginBottom: '8px',
                color: 'var(--text-primary)'
              }}>
                Start Date
              </label>
              <input
                type="date"
                name="start_date"
                value={formData.start_date}
                onChange={handleChange}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: '8px',
                  border: '1px solid var(--border)',
                  fontSize: '14px',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            {!formData.all_day && (
              <div>
                <label style={{
                  display: 'block',
                  fontSize: '14px',
                  fontWeight: 600,
                  marginBottom: '8px',
                  color: 'var(--text-primary)'
                }}>
                  Start Time
                </label>
                <input
                  type="time"
                  name="start_time"
                  value={formData.start_time}
                  onChange={handleChange}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    border: '1px solid var(--border)',
                    fontSize: '14px',
                    boxSizing: 'border-box'
                  }}
                />
              </div>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={{
                display: 'block',
                fontSize: '14px',
                fontWeight: 600,
                marginBottom: '8px',
                color: 'var(--text-primary)'
              }}>
                End Date
              </label>
              <input
                type="date"
                name="end_date"
                value={formData.end_date}
                onChange={handleChange}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: '8px',
                  border: '1px solid var(--border)',
                  fontSize: '14px',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            {!formData.all_day && (
              <div>
                <label style={{
                  display: 'block',
                  fontSize: '14px',
                  fontWeight: 600,
                  marginBottom: '8px',
                  color: 'var(--text-primary)'
                }}>
                  End Time
                </label>
                <input
                  type="time"
                  name="end_time"
                  value={formData.end_time}
                  onChange={handleChange}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    border: '1px solid var(--border)',
                    fontSize: '14px',
                    boxSizing: 'border-box'
                  }}
                />
              </div>
            )}
          </div>

          {/* Recurrence Toggle */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <input
              type="checkbox"
              checked={recurring}
              onChange={(e) => setRecurring(e.target.checked)}
              id="recurrence-checkbox"
              style={{ cursor: 'pointer' }}
            />
            <label htmlFor="recurrence-checkbox" style={{
              fontSize: '14px',
              fontWeight: 500,
              color: 'var(--text-primary)',
              cursor: 'pointer'
            }}>
              Repeat this event
            </label>
          </div>

          {/* Recurrence Options */}
          {recurring && (
            <div style={{
              padding: '16px',
              backgroundColor: 'var(--surface-tertiary)',
              borderRadius: '8px',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px'
            }}>
              <div>
                <label style={{
                  display: 'block',
                  fontSize: '14px',
                  fontWeight: 600,
                  marginBottom: '8px',
                  color: 'var(--text-primary)'
                }}>
                  Frequency
                </label>
                <select
                  value={recurrenceData.frequency}
                  onChange={(e) => setRecurrenceData((prev) => ({ ...prev, frequency: e.target.value }))}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    border: '1px solid var(--border)',
                    fontSize: '14px',
                    boxSizing: 'border-box'
                  }}
                >
                  <option value="none">None</option>
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="bi-weekly">Bi-weekly</option>
                  <option value="monthly">Monthly</option>
                </select>
              </div>

              {(recurrenceData.frequency === 'weekly' || recurrenceData.frequency === 'bi-weekly') && (
                <div>
                  <label style={{
                    display: 'block',
                    fontSize: '14px',
                    fontWeight: 600,
                    marginBottom: '8px',
                    color: 'var(--text-primary)'
                  }}>
                    Days of Week
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '6px' }}>
                    {DAYS_OF_WEEK.map((day, idx) => (
                      <label key={day} style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        cursor: 'pointer',
                        fontSize: '12px'
                      }}>
                        <input
                          type="checkbox"
                          checked={recurrenceData.daysOfWeek.has(day)}
                          onChange={(e) => {
                            const newDays = new Set(recurrenceData.daysOfWeek)
                            if (e.target.checked) {
                              newDays.add(day)
                            } else {
                              newDays.delete(day)
                            }
                            setRecurrenceData((prev) => ({ ...prev, daysOfWeek: newDays }))
                          }}
                          style={{ cursor: 'pointer' }}
                        />
                        {day}
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {recurrenceData.frequency === 'monthly' && (
                <div>
                  <label style={{
                    display: 'block',
                    fontSize: '14px',
                    fontWeight: 600,
                    marginBottom: '8px',
                    color: 'var(--text-primary)'
                  }}>
                    Day of Month
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="31"
                    value={recurrenceData.dayOfMonth}
                    onChange={(e) => setRecurrenceData((prev) => ({ ...prev, dayOfMonth: Math.max(1, Math.min(31, parseInt(e.target.value) || 1)) }))}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: '8px',
                      border: '1px solid var(--border)',
                      fontSize: '14px',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>
              )}

              <div>
                <label style={{
                  display: 'block',
                  fontSize: '14px',
                  fontWeight: 600,
                  marginBottom: '8px',
                  color: 'var(--text-primary)'
                }}>
                  End After
                </label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <label style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    cursor: 'pointer',
                    fontSize: '14px'
                  }}>
                    <input
                      type="radio"
                      name="endType"
                      value="occurrences"
                      checked={recurrenceData.endType === 'occurrences'}
                      onChange={(e) => setRecurrenceData((prev) => ({ ...prev, endType: e.target.value }))}
                      style={{ cursor: 'pointer' }}
                    />
                    <span>
                      <input
                        type="number"
                        min="1"
                        max="365"
                        value={recurrenceData.occurrences}
                        onChange={(e) => setRecurrenceData((prev) => ({ ...prev, occurrences: Math.max(1, parseInt(e.target.value) || 1) }))}
                        style={{
                          width: '60px',
                          padding: '6px 8px',
                          borderRadius: '6px',
                          border: '1px solid var(--border)',
                          fontSize: '12px',
                          marginRight: '6px'
                        }}
                      />
                      occurrences
                    </span>
                  </label>

                  <label style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    cursor: 'pointer',
                    fontSize: '14px'
                  }}>
                    <input
                      type="radio"
                      name="endType"
                      value="date"
                      checked={recurrenceData.endType === 'date'}
                      onChange={(e) => setRecurrenceData((prev) => ({ ...prev, endType: e.target.value }))}
                      style={{ cursor: 'pointer' }}
                    />
                    <span>
                      On date
                      <input
                        type="date"
                        value={recurrenceData.endDate}
                        onChange={(e) => setRecurrenceData((prev) => ({ ...prev, endDate: e.target.value }))}
                        style={{
                          padding: '6px 8px',
                          borderRadius: '6px',
                          border: '1px solid var(--border)',
                          fontSize: '12px',
                          marginLeft: '6px'
                        }}
                      />
                    </span>
                  </label>

                  <label style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    cursor: 'pointer',
                    fontSize: '14px'
                  }}>
                    <input
                      type="radio"
                      name="endType"
                      value="never"
                      checked={recurrenceData.endType === 'never'}
                      onChange={(e) => setRecurrenceData((prev) => ({ ...prev, endType: e.target.value }))}
                      style={{ cursor: 'pointer' }}
                    />
                    Never
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* Location */}
          <div>
            <label style={{
              display: 'block',
              fontSize: '14px',
              fontWeight: 600,
              marginBottom: '8px',
              color: 'var(--text-primary)'
            }}>
              Location
            </label>
            <input
              type="text"
              name="location"
              value={formData.location}
              onChange={handleChange}
              placeholder="e.g., Main Sanctuary"
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: '8px',
                border: '1px solid var(--border)',
                fontSize: '14px',
                boxSizing: 'border-box'
              }}
            />
          </div>


          {/* Event Type */}
          <div>
            <label style={{
              display: 'block',
              fontSize: '14px',
              fontWeight: 600,
              marginBottom: '8px',
              color: 'var(--text-primary)'
            }}>
              Event Type *
            </label>
            <select
              name="event_type"
              value={formData.event_type}
              onChange={handleChange}
              required
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: '8px',
                border: '1px solid var(--border)',
                fontSize: '14px',
                boxSizing: 'border-box'
              }}
            >
              {eventTypes.map((type) => (
                <option key={type} value={type}>
                  ● {type.charAt(0).toUpperCase() + type.slice(1)}
                </option>
              ))}
            </select>
          </div>

          {/* Department */}
          {departments.length > 0 && (
            <div>
              <label style={{
                display: 'block',
                fontSize: '14px',
                fontWeight: 600,
                marginBottom: '8px',
                color: 'var(--text-primary)'
              }}>
                Department (Optional)
              </label>
              <select
                name="department_id"
                value={formData.department_id || ''}
                onChange={handleChange}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: '8px',
                  border: '1px solid var(--border)',
                  fontSize: '14px',
                  boxSizing: 'border-box'
                }}
              >
                <option value="">Org-wide event</option>
                {departments.map((dept) => (
                  <option key={dept.id} value={dept.id}>
                    {dept.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Org-wide Toggle (super_admin only) */}
          {effectiveRole === 'super_admin' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <input
                type="checkbox"
                name="is_org_wide"
                checked={formData.is_org_wide}
                onChange={handleChange}
                id="org-wide-checkbox"
                style={{ cursor: 'pointer' }}
              />
              <label htmlFor="org-wide-checkbox" style={{
                fontSize: '14px',
                fontWeight: 500,
                color: 'var(--text-primary)',
                cursor: 'pointer'
              }}>
                Visible to entire organization
              </label>
            </div>
          )}

          {/* Buttons */}
          <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                flex: 1,
                padding: '12px 16px',
                backgroundColor: 'var(--surface-tertiary)',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: 600,
                color: 'var(--text-primary)',
                fontSize: '14px'
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              style={{
                flex: 1,
                padding: '12px 16px',
                backgroundColor: 'var(--accent)',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: loading ? 'not-allowed' : 'pointer',
                fontWeight: 600,
                fontSize: '14px',
                opacity: loading ? 0.6 : 1
              }}
            >
              {loading ? 'Submitting...' : 'Submit Event'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
