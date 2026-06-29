import { createContext, useCallback, useState, useEffect, useRef } from 'react'

export const AgendaBuilderContext = createContext(null)

const CACHE_KEY = 'agenda_builder_draft'

const DEFAULT_AGENDA_DATA = {
  meetingType: 'sunday_service',
  title: '',
  date: '',
  startTime: '10:00',
  endTime: '11:30',
  location: '',
  moderator: '',
  theme: 'cream_purple',
}

function loadDraft() {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function saveDraft(state) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(state))
  } catch {}
}

function clearDraft() {
  localStorage.removeItem(CACHE_KEY)
}

export function AgendaBuilderProvider({ children }) {
  const draft = loadDraft()

  const [step, setStep] = useState(draft?.step ?? 1)
  const [agendaData, setAgendaData] = useState(draft?.agendaData ?? DEFAULT_AGENDA_DATA)
  const [agendaItems, setAgendaItems] = useState(draft?.agendaItems ?? [])
  const [selectedTemplate, setSelectedTemplate] = useState(draft?.selectedTemplate ?? 'tpl-sunday-service')
  const [errors, setErrors] = useState({})
  const [isSaving, setIsSaving] = useState(false)
  const [autoSaveStatus, setAutoSaveStatus] = useState('idle')
  const autoSaveTimerRef = useRef(null)
  const draftIdRef = useRef(draft?.draftId ?? null)
  const cacheTimerRef = useRef(null)

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
    clearDraft()
    setStep(1)
    setAgendaData(DEFAULT_AGENDA_DATA)
    setAgendaItems([])
    setSelectedTemplate('tpl-sunday-service')
    setErrors({})
    setIsSaving(false)
    draftIdRef.current = null
  }, [])

  // Persist wizard state to localStorage (debounced 400ms)
  useEffect(() => {
    clearTimeout(cacheTimerRef.current)
    cacheTimerRef.current = setTimeout(() => {
      saveDraft({ step, agendaData, agendaItems, selectedTemplate, draftId: draftIdRef.current })
    }, 400)
    return () => clearTimeout(cacheTimerRef.current)
  }, [step, agendaData, agendaItems, selectedTemplate])

  // Auto-save effect (every 30 seconds)
  useEffect(() => {
    const shouldAutoSave = agendaData.title && agendaItems.length > 0 && !isSaving

    if (shouldAutoSave) {
      // Clear previous timer
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current)
      }

      // Set new timer
      autoSaveTimerRef.current = setTimeout(async () => {
        try {
          setAutoSaveStatus('saving')

          // Lazy import to avoid circular dependencies
          const { createAgenda, updateAgenda } = await import('../features/agendas/lib/agendas')

          // If no draft ID yet, create the agenda
          if (!draftIdRef.current) {
            const agenda = await createAgenda(agendaData, agendaItems)
            draftIdRef.current = agenda.id
            setAutoSaveStatus('saved')
          } else {
            // Otherwise, update existing draft
            await updateAgenda(draftIdRef.current, agendaData)
            setAutoSaveStatus('saved')
          }

          // Clear "saved" status after 3 seconds
          setTimeout(() => {
            setAutoSaveStatus('idle')
          }, 3000)
        } catch (err) {
          console.error('Auto-save failed:', err)
          setAutoSaveStatus('error')
          // Retry after 10 seconds
          setTimeout(() => setAutoSaveStatus('idle'), 10000)
        }
      }, 30000) // 30 second interval
    }

    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current)
      }
    }
  }, [agendaData, agendaItems, isSaving])

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
    autoSaveStatus,
    draftAgendaId: draftIdRef.current,
  }

  return (
    <AgendaBuilderContext.Provider value={value}>
      {children}
    </AgendaBuilderContext.Provider>
  )
}
