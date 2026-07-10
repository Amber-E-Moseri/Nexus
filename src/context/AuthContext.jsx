import { createContext, useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
    .select('id, name, email, role, department_id, avatar_url, status, first_name, last_name, group_name, last_active_at')
    .eq('id', userId)
    .single()

  if (error) {
    // PGRST116 = no rows returned — this user has an auth account but no public.users row.
    // Try to self-heal by accepting any pending invitation for their email.
    if (error.code === 'PGRST116') {
      const { data: healed, error: healError } = await supabase.rpc('heal_pending_invitation_for_self')
      if (!healError && healed) return healed
    }
    throw error
  }

  // Space roles (Phase 3 permission model): ors/programs/media/dept_lead are
  // granted per-space via the space_roles table, not users.role. Attached to
  // the profile so hasSpaceRole()/route guards can resolve them without extra
  // fetches. A failure here degrades to "no space roles" rather than blocking
  // sign-in.
  const { data: spaceRoles } = await supabase
    .from('space_roles')
    .select('space_id, role')
    .eq('user_id', userId)

  return { ...data, space_roles: spaceRoles ?? [] }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [jwtRole, setJwtRole] = useState(null)
  const [loading, setLoading] = useState(true)
  const [isRecoveryMode, setIsRecoveryMode] = useState(false)

  // Mirror of `profile` readable from the onAuthStateChange closure (BLW-06):
  // SIGNED_IN also fires on session restore and tab refocus, where the
  // profile is already loaded and refetching is wasted work.
  const profileRef = useRef(null)
  useEffect(() => {
    profileRef.current = profile
  }, [profile])

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

      // PASSWORD_RECOVERY: keep the recovery session alive so updateUser() can
      // change the password. Navigation is locked to /reset-password via
      // isRecoveryMode (enforced in ProtectedRoute) until the password is changed.
      if (event === 'PASSWORD_RECOVERY') {
        // Retain a token marker in sessionStorage for ResetPassword's presence/expiry gate.
        const accessToken =
          session?.access_token ??
          new URLSearchParams(window.location.hash.substring(1)).get('access_token')
        if (accessToken) {
          sessionStorage.setItem('recovery_token', accessToken)
          // 15-minute TTL for the recovery token
          sessionStorage.setItem('recovery_token_expires', String(Date.now() + 15 * 60 * 1000))
        }

        if (mounted) {
          setUser(session?.user ?? null)
          setJwtRole(getJwtRole(session))
          setIsRecoveryMode(true)
          setLoading(false)
          if (window.location.pathname !== '/reset-password') {
            window.location.replace('/reset-password')
          }
        }
        return
      }

      setUser(session?.user ?? null)
      setJwtRole(getJwtRole(session))

      if (session?.user) {
        // Only fetch profile on SIGNED_IN (initial login). On TOKEN_REFRESHED
        // and other events, keep the cached profile to avoid unnecessary DB queries.
        if (event === 'SIGNED_IN') {
          // Session restore / tab refocus also emit SIGNED_IN — skip the
          // refetch when the loaded profile already matches this user (BLW-06)
          if (profileRef.current?.id === session.user.id) {
            touchLastActive().catch(() => {})
            setLoading(false)
            return
          }
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
        } else if (event === 'TOKEN_REFRESHED') {
          // Token refreshed: keep existing profile (no DB query needed)
          touchLastActive().catch(() => {})
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
      isRecoveryMode,
      clearRecoveryMode: () => {
        setIsRecoveryMode(false)
        sessionStorage.removeItem('recovery_token')
        sessionStorage.removeItem('recovery_token_expires')
      },
      signIn,
      signUp,
      signOut: () => supabase.auth.signOut(),
      refreshProfile,
    }),
    [jwtRole, loading, profile, user, isRecoveryMode, signIn, signUp],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
