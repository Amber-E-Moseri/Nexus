import React, { createContext, useContext, useState, useCallback } from 'react'

const ICPLCContext = createContext(null)

export function ICPLCProvider({ config, accessTier, children }) {
  // Active profile drawer state — one canonical profile ID open at a time
  const [activeProfileId, setActiveProfileId] = useState(null)
  const [activeProfileTab, setActiveProfileTab] = useState('overview')

  // Shared filter state across pages
  const [filters, setFilters] = useState({
    search: '',
    participation_status: [],
    registration_status: [],
    passport_readiness: [],
    visa_requirement: [],
    visa_process_status: [],
    readiness: [],
    tags: [],
    subgroup: [],
  })

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
