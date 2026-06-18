import { useState } from 'react'
import { X } from 'lucide-react'
import { submitEvent } from '../../lib/calendar'
import { useAuth } from '../../hooks/useAuth'
import { useToast } from '../../context/ToastContext'

export default function EventSubmitModal({ onClose, onSubmitted, departments = [] }) {
  const { profile } = useAuth()
  const { showToast } = useToast()
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    start_date: new Date().toISOString().split('T')[0],
    end_date: new Date().toISOString().split('T')[0],
    start_time: '09:00',
    end_time: '10:00',
    all_day: false,
    location: '',
    zoom_join_url: '',
    event_type: 'meeting',
    department_id: null,
    space_id: null,
    sprint_id: null,
  })

  async function handleSubmit(e) {
    e.preventDefault()
    if (!formData.title.trim()) {
      showToast('Event title is required', { tone: 'error' })
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
      }

      const userRole = profile?.user_role || 'user'
      await submitEvent(eventData, profile.id, userRole)

      showToast('Event submitted successfully', { tone: 'success' })
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

          {/* Zoom URL */}
          <div>
            <label style={{
              display: 'block',
              fontSize: '14px',
              fontWeight: 600,
              marginBottom: '8px',
              color: 'var(--text-primary)'
            }}>
              Zoom Link
            </label>
            <input
              type="url"
              name="zoom_join_url"
              value={formData.zoom_join_url}
              onChange={handleChange}
              placeholder="https://zoom.us/j/..."
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
              Event Type
            </label>
            <select
              name="event_type"
              value={formData.event_type}
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
              <option value="meeting">Meeting</option>
              <option value="service">Service</option>
              <option value="training">Training</option>
              <option value="deadline">Deadline</option>
              <option value="other">Other</option>
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
