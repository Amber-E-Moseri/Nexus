import { useEffect, useState } from 'react'
import { Play, Pause, RotateCcw, Check } from 'lucide-react'
import { supabase } from '../../lib/supabase'

export function PrayerTimer({ campusId, campusName }) {
  const [seconds, setSeconds] = useState(0)
  const [isRunning, setIsRunning] = useState(false)
  const [saved, setSaved] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  // Timer interval
  useEffect(() => {
    let interval
    if (isRunning) {
      interval = setInterval(() => {
        setSeconds((s) => s + 1)
      }, 1000)
    }
    return () => clearInterval(interval)
  }, [isRunning])

  const formatTime = (secs) => {
    const hours = Math.floor(secs / 3600)
    const minutes = Math.floor((secs % 3600) / 60)
    const s = secs % 60

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
    }
    return `${minutes}:${s.toString().padStart(2, '0')}`
  }

  const savePrayerSession = async () => {
    if (seconds < 60) {
      alert('Prayer session must be at least 1 minute')
      return
    }

    setIsSaving(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()

      const { error } = await supabase.from('prayer_logs').insert({
        campus_id: campusId,
        user_id: user?.id || null,
        duration_seconds: seconds,
        logged_at: new Date().toISOString(),
      })

      if (!error) {
        setSaved(true)
        setTimeout(() => {
          setSeconds(0)
          setIsRunning(false)
          setSaved(false)
        }, 2000)
      } else {
        alert('Error saving prayer: ' + error.message)
      }
    } catch (err) {
      console.error('Error saving prayer:', err)
      alert('Error saving prayer session')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="blw-prayer-timer">
      <div className="blw-prayer-timer-display">{formatTime(seconds)}</div>

      {saved && (
        <div className="blw-prayer-timer-success">
          <Check size={16} />
          <span>Prayer saved! 🙏</span>
        </div>
      )}

      <div className="blw-prayer-timer-controls">
        <button
          className="blw-prayer-timer-btn blw-prayer-timer-btn-start"
          onClick={() => setIsRunning(!isRunning)}
          disabled={saved}
          aria-label={isRunning ? 'Pause timer' : 'Start timer'}
        >
          {isRunning ? <Pause size={18} /> : <Play size={18} />}
          <span>{isRunning ? 'Pause' : 'Start'}</span>
        </button>

        <button
          className="blw-prayer-timer-btn blw-prayer-timer-btn-save"
          onClick={savePrayerSession}
          disabled={seconds < 60 || saved || isSaving}
          aria-label="Save prayer session"
        >
          <Check size={18} />
          <span>{isSaving ? 'Saving...' : 'Save'}</span>
        </button>

        <button
          className="blw-prayer-timer-btn blw-prayer-timer-btn-reset"
          onClick={() => {
            setSeconds(0)
            setIsRunning(false)
            setSaved(false)
          }}
          disabled={seconds === 0}
          aria-label="Reset timer"
        >
          <RotateCcw size={18} />
          <span>Reset</span>
        </button>
      </div>

      <p className="blw-prayer-timer-note">Minimum 1 minute to save</p>
    </div>
  )
}
