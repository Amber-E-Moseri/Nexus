import { useContext } from 'react'
import { AgendaBuilderContext } from '../context/AgendaBuilderContext'

export function useAgendaWizard() {
  const context = useContext(AgendaBuilderContext)
  if (!context) {
    throw new Error('useAgendaWizard must be used within AgendaBuilderProvider')
  }
  return context
}

export function calculateTimings(startTime, agendaItems) {
  if (!agendaItems || agendaItems.length === 0) return []

  const [hours, minutes] = startTime.split(':').map(Number)
  let currentDate = new Date()
  currentDate.setHours(hours, minutes, 0)

  return agendaItems.map((item) => {
    // For pinned items (intro music), show "Pre-start" and don't advance time
    if (item.isPinned) {
      return {
        ...item,
        timing: 'Pre-start',
        startTime: 'Pre-start',
        endTime: 'Pre-start',
      }
    }

    // For non-pinned items, calculate the chain
    const startTimeObj = new Date(currentDate)
    const endTimeObj = new Date(startTimeObj.getTime() + (item.duration || 0) * 60_000)

    const timing = `${formatTime(startTimeObj)} - ${formatTime(endTimeObj)}`

    currentDate = endTimeObj // Advance for next item

    return {
      ...item,
      timing,
      startTime: formatTime(startTimeObj),
      endTime: formatTime(endTimeObj),
    }
  })
}

function formatTime(date) {
  const hours = date.getHours()
  const minutes = date.getMinutes()
  const ampm = hours >= 12 ? 'PM' : 'AM'
  const displayHours = hours % 12 || 12
  const displayMinutes = String(minutes).padStart(2, '0')
  return `${displayHours}:${displayMinutes} ${ampm}`
}

export function validateStep1(agendaData) {
  const errors = {}
  if (!agendaData.title?.trim()) {
    errors.title = 'Meeting title is required'
  }
  if (!agendaData.date) {
    errors.date = 'Meeting date is required'
  }
  if (!agendaData.startTime) {
    errors.startTime = 'Start time is required'
  }
  if (!agendaData.endTime) {
    errors.endTime = 'End time is required'
  }
  if (agendaData.startTime && agendaData.endTime && agendaData.startTime >= agendaData.endTime) {
    errors.endTime = 'End time must be after start time'
  }
  return errors
}

export function validateStep2(agendaItems) {
  const errors = {}
  if (!agendaItems || agendaItems.length < 1) {
    errors.items = 'Add at least one agenda item'
  }
  agendaItems.forEach((item, index) => {
    if (!item.segment?.trim()) {
      errors[`segment-${index}`] = 'Segment name is required'
    }
    if (!item.duration || item.duration <= 0) {
      errors[`duration-${index}`] = 'Duration must be greater than 0'
    }
  })
  return errors
}
