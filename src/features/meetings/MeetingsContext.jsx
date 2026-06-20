import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { createMeeting, getDeptMeetings, updateMeeting } from './lib/meetings'

const MeetingsContext = createContext(null)

export function MeetingsProvider({ departmentId, children }) {
  const [meetings, setMeetings] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const reload = useCallback(async () => {
    if (!departmentId) {
      setMeetings([])
      setLoading(false)
      setError(null)
      return
    }

    try {
      setLoading(true)
      setError(null)
      const data = await getDeptMeetings(departmentId)
      setMeetings(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [departmentId])

  useEffect(() => {
    reload()
  }, [reload])

  const addMeeting = useCallback(async (meetingData) => {
    const created = await createMeeting(meetingData)
    setMeetings((prev) => [created, ...prev])
    return created
  }, [])

  const editMeeting = useCallback(async (meetingId, updates) => {
    const updated = await updateMeeting(meetingId, updates)
    setMeetings((prev) => prev.map((meeting) => (meeting.id === meetingId ? { ...meeting, ...updated } : meeting)))
    return updated
  }, [])

  return (
    <MeetingsContext.Provider value={{ meetings, loading, error, reload, addMeeting, editMeeting }}>
      {children}
    </MeetingsContext.Provider>
  )
}

export function useMeetings() {
  const context = useContext(MeetingsContext)

  if (!context) {
    throw new Error('useMeetings must be used inside MeetingsProvider')
  }

  return context
}
