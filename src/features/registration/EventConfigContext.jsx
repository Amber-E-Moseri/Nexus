import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'

export const EventConfigContext = createContext(null)

const REGISTRATION_ROLES = new Set(['super_admin', 'regional_secretary', 'pastor', 'member'])

export function EventConfigProvider({ children }) {
  const { user, effectiveRole } = useAuth()
  const [config, setConfig] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const loadConfig = useCallback(async () => {
    if (!user) {
      setConfig(null)
      setError(null)
      setLoading(false)
      return
    }

    // Skip the DB query for roles that can never access registration.
    // `member` role still queries because sprint-team membership (not role alone)
    // determines access and that data isn't available here.
    if (effectiveRole && !REGISTRATION_ROLES.has(effectiveRole)) {
      setConfig(null)
      setLoading(false)
      return
    }

    try {
      setLoading(true)
      setError(null)
      const { data, error } = await supabase
        .from('event_configs')
        .select('*')
        .eq('is_active', true)
        .maybeSingle()

      if (error) throw error
      setConfig(data ?? null)
    } catch (err) {
      console.error('Failed to load event config:', err)
      setConfig(null)
      setError(err)
    } finally {
      setLoading(false)
    }
  }, [user, effectiveRole])

  useEffect(() => {
    loadConfig()
  }, [loadConfig])

  const value = useMemo(() => ({
    config,
    loading,
    error,
    reload: loadConfig,
  }), [config, loading, error, loadConfig])

  return (
    <EventConfigContext.Provider value={value}>
      {children}
    </EventConfigContext.Provider>
  )
}

export function useEventConfig() {
  const ctx = useContext(EventConfigContext)
  if (!ctx) throw new Error('useEventConfig must be inside EventConfigProvider')
  return ctx
}
