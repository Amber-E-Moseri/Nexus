import { createContext, useCallback, useState } from 'react'

export const AgendaBuilderContext = createContext(null)

export function AgendaBuilderProvider({ children }) {
  const [step, setStep] = useState(1)
  const [agendaData, setAgendaData] = useState({
    meetingType: 'sunday_service',
    title: '',
    date: '',
    startTime: '10:00',
    endTime: '11:30',
    location: '',
    moderator: '',
    theme: 'cream_purple',
  })
  const [agendaItems, setAgendaItems] = useState([])
  const [selectedTemplate, setSelectedTemplate] = useState('tpl-sunday-service')
  const [errors, setErrors] = useState({})
  const [isSaving, setIsSaving] = useState(false)

  const goToStep = useCallback((nextStep) => {
    setStep(nextStep)
  }, [])

  const updateAgendaData = useCallback((updates) => {
    setAgendaData((prev) => ({ ...prev, ...updates }))
  }, [])

  const setAgendaItemsData = useCallback((items) => {
    setAgendaItems(items)
  }, [])

  const addAgendaItem = useCallback((item) => {
    const newItem = {
      id: `item-${Date.now()}`,
      segment: item.segment || '',
      notes: item.notes || '',
      duration: item.duration || 15,
      sortOrder: agendaItems.length,
      isPinned: item.isPinned || false,
    }
    setAgendaItems((prev) => [...prev, newItem])
  }, [agendaItems.length])

  const updateAgendaItem = useCallback((itemId, updates) => {
    setAgendaItems((prev) =>
      prev.map((item) => (item.id === itemId ? { ...item, ...updates } : item)),
    )
  }, [])

  const deleteAgendaItem = useCallback((itemId) => {
    setAgendaItems((prev) => prev.filter((item) => item.id !== itemId))
  }, [])

  const reorderAgendaItems = useCallback((items) => {
    const reordered = items.map((item, index) => ({
      ...item,
      sortOrder: index,
    }))
    setAgendaItems(reordered)
  }, [])

  const setError = useCallback((field, message) => {
    setErrors((prev) => {
      if (message) {
        return { ...prev, [field]: message }
      }
      const next = { ...prev }
      delete next[field]
      return next
    })
  }, [])

  const clearErrors = useCallback(() => {
    setErrors({})
  }, [])

  const reset = useCallback(() => {
    setStep(1)
    setAgendaData({
      meetingType: 'sunday_service',
      title: '',
      date: '',
      startTime: '10:00',
      endTime: '11:30',
      location: '',
      moderator: '',
      theme: 'cream_purple',
    })
    setAgendaItems([])
    setSelectedTemplate('tpl-sunday-service')
    setErrors({})
    setIsSaving(false)
  }, [])

  const value = {
    step,
    goToStep,
    reset,
    agendaData,
    updateAgendaData,
    agendaItems,
    setAgendaItemsData,
    addAgendaItem,
    updateAgendaItem,
    deleteAgendaItem,
    reorderAgendaItems,
    selectedTemplate,
    setSelectedTemplate,
    errors,
    setError,
    clearErrors,
    isSaving,
    setIsSaving,
  }

  return (
    <AgendaBuilderContext.Provider value={value}>
      {children}
    </AgendaBuilderContext.Provider>
  )
}
