import { useState, useEffect } from 'react'
import { Clock, Calendar, X } from 'lucide-react'

const PRIMARY = '#4C2A92'
const ACCENT = '#E8A020'
const TEXT = '#2D2A22'
const MUTED = '#9E9488'
const BG = '#F4F1EA'
const BORDER = '#EDE8DC'
const SUCCESS = '#2D6A4F'
const ERROR = '#C94830'

// Common timezones
const TIMEZONES = [
  { name: 'UTC', offset: 0 },
  { name: 'Eastern', offset: -5 },
  { name: 'Central', offset: -6 },
  { name: 'Mountain', offset: -7 },
  { name: 'Pacific', offset: -8 },
  { name: 'London', offset: 0 },
  { name: 'Europe/Paris', offset: 1 },
  { name: 'Asia/Tokyo', offset: 9 },
  { name: 'Australia/Sydney', offset: 11 },
]

export default function SchedulePicker({
  enabled = false,
  scheduledAt = null,
  onEnabledChange = () => {},
  onScheduledAtChange = () => {},
  isMobile = false,
}) {
  const [localDate, setLocalDate] = useState('')
  const [localTime, setLocalTime] = useState('09:00')
  const [timezone, setTimezone] = useState('Eastern')
  const [preview, setPreview] = useState('')

  useEffect(() => {
    if (scheduledAt) {
      const date = new Date(scheduledAt)
      setLocalDate(date.toISOString().split('T')[0])
      setLocalTime(date.toTimeString().slice(0, 5))
    }
  }, [scheduledAt])

  useEffect(() => {
    if (enabled && localDate && localTime) {
      const [year, month, day] = localDate.split('-')
      const [hours, minutes] = localTime.split(':')
      const utcDate = new Date(
        parseInt(year, 10),
        parseInt(month, 10) - 1,
        parseInt(day, 10),
        parseInt(hours, 10),
        parseInt(minutes, 10),
      )

      const tz = TIMEZONES.find(t => t.name === timezone)
      const tzOffsetMs = (tz?.offset ?? 0) * 60 * 60 * 1000
      const scheduledTime = new Date(utcDate.getTime() - tzOffsetMs)

      setPreview(scheduledTime.toLocaleString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'UTC',
      }))

      onScheduledAtChange(scheduledTime.toISOString())
    }
  }, [enabled, localDate, localTime, timezone])

  return (
    <div style={{ background: BG, borderRadius: 10, padding: 14, marginBottom: 14 }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: enabled ? 12 : 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => onEnabledChange(e.target.checked)}
            style={{ cursor: 'pointer', width: 18, height: 18 }}
          />
          <label style={{ fontSize: 13, fontWeight: 700, color: TEXT, cursor: 'pointer' }}>
            Schedule this campaign
          </label>
        </div>
        {enabled && preview && (
          <span style={{ fontSize: 11, fontWeight: 600, color: SUCCESS, background: '#EBF7F1', padding: '2px 8px', borderRadius: 4 }}>
            ✓ Ready
          </span>
        )}
      </div>

      {enabled && (
        <div style={{
          display: isMobile ? 'block' : 'grid',
          gridTemplateColumns: '1fr 1fr 1fr',
          gap: 10,
          marginTop: 12,
        }}>
          {/* Date picker */}
          <div>
            <label style={{ fontSize: 10, fontWeight: 700, color: MUTED, textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>
              <Calendar size={12} style={{ display: 'inline', marginRight: 4 }} />
              Date
            </label>
            <input
              type="date"
              value={localDate}
              onChange={(e) => setLocalDate(e.target.value)}
              min={new Date().toISOString().split('T')[0]}
              style={{
                width: '100%',
                padding: '8px 10px',
                border: `1px solid ${BORDER}`,
                borderRadius: 6,
                fontSize: 12,
                color: TEXT,
                fontFamily: 'inherit',
                background: '#fff',
              }}
            />
          </div>

          {/* Time picker */}
          <div>
            <label style={{ fontSize: 10, fontWeight: 700, color: MUTED, textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>
              <Clock size={12} style={{ display: 'inline', marginRight: 4 }} />
              Time
            </label>
            <input
              type="time"
              value={localTime}
              onChange={(e) => setLocalTime(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 10px',
                border: `1px solid ${BORDER}`,
                borderRadius: 6,
                fontSize: 12,
                color: TEXT,
                fontFamily: 'inherit',
                background: '#fff',
              }}
            />
          </div>

          {/* Timezone selector */}
          <div>
            <label style={{ fontSize: 10, fontWeight: 700, color: MUTED, textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>
              Timezone
            </label>
            <select
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 10px',
                border: `1px solid ${BORDER}`,
                borderRadius: 6,
                fontSize: 12,
                color: TEXT,
                fontFamily: 'inherit',
                background: '#fff',
                cursor: 'pointer',
              }}
            >
              {TIMEZONES.map((tz) => (
                <option key={tz.name} value={tz.name}>{tz.name}</option>
              ))}
            </select>
          </div>
        </div>
      )}

      {enabled && preview && (
        <div style={{
          marginTop: 10,
          padding: 10,
          background: '#fff',
          border: `1px solid ${BORDER}`,
          borderRadius: 6,
          fontSize: 12,
          color: TEXT,
        }}>
          <strong>Send on:</strong> {preview}
        </div>
      )}
    </div>
  )
}
