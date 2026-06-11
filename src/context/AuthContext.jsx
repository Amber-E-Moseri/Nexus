import { createContext, useEffect, useMemo, useState } from 'react'
import { touchLastActive } from '../lib/people/api'
import { supabase } from '../lib/supabase'

export const AuthContext = createContext(null)

async function fetchProfile(userId) {
  const { data, error } = await supabase
    .from('users')
    .select('id, name, email, role, department_id, avatar_url, status, first_name, last_name, last_active_at')
    .eq('id', userId)
    .single()

  if (error) {
    throw error
  }

  return data
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  const refreshProfile = async (userId = user?.id) => {
    if (!userId) {
      setProfile(null)
      return null
    }

    const nextProfile = await fetchProfile(userId)
    setProfile(nextProfile)
    return nextProfile
  }

  useEffect(() => {
    let mounted = true

    const loadSession = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession()

      if (!mounted) {
        return
      }

      setUser(session?.user ?? null)

      if (session?.user) {
        try {
          const nextProfile = await fetchProfile(session.user.id)
          if (mounted) {
            setProfile(nextProfile)
          }
          touchLastActive().catch(() => {})
        } catch {
          if (mounted) {
            setProfile(null)
          }
        }
      }

      if (mounted) {
        setLoading(false)
      }
    }

    loadSession()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_, session) => {
      if (!mounted) {
        return
      }

      setUser(session?.user ?? null)

      if (session?.user) {
        setLoading(true)
        try {
          const nextProfile = await fetchProfile(session.user.id)
          if (mounted) {
            setProfile(nextProfile)
          }
          touchLastActive().catch(() => {})
        } catch {
          if (mounted) {
            setProfile(null)
          }
        } finally {
          if (mounted) {
            setLoading(false)
          }
        }
      } else {
        setProfile(null)
        setLoading(false)
      }
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  const value = useMemo(
    () => ({
      user,
      profile,
      role: profile?.role ?? null,
      loading,
      signOut: () => supabase.auth.signOut(),
      refreshProfile,
    }),
    [loading, profile, user],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
