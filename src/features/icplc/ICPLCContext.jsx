import React, { createContext, useContext, useState, useCallback, useEffect } from 'react'

const ICPLCContext = createContext(null)

const DEFAULT_FILTERS = {
  search: '',
  working_list_view: 'all',
  participation_status: [],
  registration_status: [],
  passport_readiness: [],
  visa_requirement: [],
  visa_process_status: [],
  readiness: [],
  flight_status: [],
  tags: [],
  subgroup: [],
}

function storageKey(eventId) {
  return `icplc_filters_v1_${eventId}`
}

function loadFilters(eventId) {
  if (!eventId) return DEFAULT_FILTERS
  try {
    const raw = localStorage.getItem(storageKey(eventId))
    if (!raw) return DEFAULT_FILTERS
    const saved = JSON.parse(raw)
    if (typeof saved !== 'object' || saved === null) return DEFAULT_FILTERS
    // Merge with defaults so new filter fields don't come up undefined.
    // Always reset search — restoring a previous search is disorienting.
    return { ...DEFAULT_FILTERS, ...saved, search: '' }
  } catch {
    return DEFAULT_FILTERS
  }
}

function saveFilters(eventId, filters) {
  if (!eventId) return
  try {
    localStorage.setItem(storageKey(eventId), JSON.stringify(filters))
  } catch {}
}

export function ICPLCProvider({ config, accessTier, children }) {
  const eventId = config?.id

  // Active profile drawer state — one canonical profile ID open at a time
  const [activeProfileId, setActiveProfileId] = useState(null)
  const [activeProfileTab, setActiveProfileTab] = useState('overview')

  // Shared filter state — persisted per event so events don't bleed into each other
  const [filters, setFiltersRaw] = useState(() => loadFilters(eventId))

  // If the config/event changes (rare but possible), reload from that event's storage
  useEffect(() => {
    setFiltersRaw(loadFilters(eventId))
  }, [eventId])

  const setFilters = useCallback((updater) => {
    setFiltersRaw((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater
      saveFilters(eventId, next)
      return next
    })
  }, [eventId])

  const openProfile = useCallback((id, tab = 'overview') => {
    setActiveProfileId(id)
    setActiveProfileTab(tab)
  }, [])

  const closeProfile = useCallback(() => {
    setActiveProfileId(null)
    setActiveProfileTab('overview')
  }, [])

  const value = {
    config,
    accessTier,
    activeProfileId,
    activeProfileTab,
    openProfile,
    closeProfile,
    filters,
    setFilters,
  }

  return <ICPLCContext.Provider value={value}>{children}</ICPLCContext.Provider>
}

export function useICPLC() {
  const ctx = useContext(ICPLCContext)
  if (!ctx) throw new Error('useICPLC must be used inside ICPLCProvider')
  return ctx
}
