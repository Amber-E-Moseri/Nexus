import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { createMeeting, deleteMeeting, getDeptMeetings, updateMeeting } from './lib/meetings'

const MeetingsContext = createContext(null)

export function MeetingsProvider({ departmentId, children }) {
  const [meetings, setMeetings] = useState([])
  const [totalCount, setTotalCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const reload = useCallback(async () => {
    if (!departmentId) {
      setMeetings([])
      setTotalCount(0)
      setLoading(false)
      setError(null)
      return
    }

    try {
      setLoading(true)
      setError(null)
      const { meetings: rows, totalCount: count } = await getDeptMeetings(departmentId)
      setMeetings(rows)
      setTotalCount(count)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [departmentId])

  // BLW-16: fetch the next page and append — no silent 50-meeting cap.
  const loadMore = useCallback(async () => {
    if (!departmentId) return
    try {
      const { meetings: rows, totalCount: count } = await getDeptMeetings(departmentId, {
        offset: meetings.length,
      })
      setMeetings((prev) => {
        const seen = new Set(prev.map((m) => m.id))
        return [...prev, ...rows.filter((m) => !seen.has(m.id))]
      })
      setTotalCount(count)
    } catch (err) {
      setError(err.message)
    }
  }, [departmentId, meetings.length])

  const hasMore = meetings.length < totalCount

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

  const removeMeeting = useCallback(async (meetingId) => {
    await deleteMeeting(meetingId)
    setMeetings((prev) => prev.filter((meeting) => meeting.id !== meetingId))
  }, [])

  return (
    <MeetingsContext.Provider value={{ meetings, totalCount, hasMore, loadMore, loading, error, reload, addMeeting, editMeeting, removeMeeting }}>
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
