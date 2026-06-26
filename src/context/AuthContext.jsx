import { createContext, useCallback, useEffect, useMemo, useState } from 'react'
import { touchLastActive } from '../lib/people/api'
import { supabase } from '../lib/supabase'
import { clearAllAppCache } from '../lib/cacheUtils'

export const AuthContext = createContext(null)

function getJwtRole(session) {
  return session?.user?.app_metadata?.user_role
    ?? session?.user?.user_metadata?.user_role
    ?? null
}

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
  const [jwtRole, setJwtRole] = useState(null)
  const [loading, setLoading] = useState(true)

  const refreshProfile = useCallback(
    async (userId) => {
      const resolvedUserId = userId ?? user?.id
      if (!resolvedUserId) {
        setProfile(null)
        return null
      }

      const nextProfile = await fetchProfile(resolvedUserId)
      setProfile((prev) => (prev?.id === nextProfile.id ? { ...prev, ...nextProfile } : nextProfile))
      return nextProfile
    },
    [user]
  )

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
      setJwtRole(getJwtRole(session))

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
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!mounted) {
        return
      }

      // SECURITY FIX: Reject PASSWORD_RECOVERY auto-authentication
      // Do NOT create a user session from the recovery token
      // Instead, store recovery token in sessionStorage for use on reset-password page
      if (event === 'PASSWORD_RECOVERY') {
        // Extract recovery token from URL hash
        const hash = window.location.hash
        const params = new URLSearchParams(hash.substring(1))
        const accessToken = params.get('access_token')
        const type = params.get('type')

        if (type === 'recovery' && accessToken) {
          // Store recovery token in sessionStorage (expires when browser closes)
          sessionStorage.setItem('recovery_token', accessToken)
          // 15-minute TTL for the recovery token
          sessionStorage.setItem('recovery_token_expires', String(Date.now() + 15 * 60 * 1000))

          // CRITICAL: Reject the auto-session from Supabase
          // This prevents users from gaining access without changing their password
          await supabase.auth.signOut({ scope: 'local' })

          // Redirect to reset password page (safe - recovery token is in sessionStorage, not exposed in JS)
          if (mounted) {
            setLoading(false)
            window.location.href = '/reset-password'
          }
          return
        }
      }

      setUser(session?.user ?? null)
      setJwtRole(getJwtRole(session))

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
        clearAllAppCache()
      }
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  const signIn = useCallback(
    (email, password) => supabase.auth.signInWithPassword({ email, password }),
    [],
  )

  const signUp = useCallback(
    (email, password, userData) => supabase.auth.signUp({ email, password, options: { data: userData } }),
    [],
  )

  const value = useMemo(
    () => ({
      user,
      profile,
      role: profile?.role ?? null,
      effectiveRole: jwtRole ?? profile?.role ?? null,
      loading,
      signIn,
      signUp,
      signOut: () => supabase.auth.signOut(),
      refreshProfile,
    }),
    [jwtRole, loading, profile, user, signIn, signUp],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
