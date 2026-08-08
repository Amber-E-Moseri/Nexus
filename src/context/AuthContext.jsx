import { createContext, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { touchLastActive } from '../lib/people/api'
import { supabase } from '../lib/supabase'
import { clearAllAppCache, saveSession, loadSession, clearSession } from '../lib/cacheUtils'
import { requestPushPermission, silentSubscribeToPush, unsubscribePush } from '../lib/webPush'

export const AuthContext = createContext(null)

function getJwtRole(session) {
  return session?.user?.app_metadata?.user_role
    ?? session?.user?.user_metadata?.user_role
    ?? null
}

async function restorePushSubscription() {
  try {
    const registration = await navigator.serviceWorker.ready
    const subscription = await registration.pushManager.getSubscription()
    // If no active subscription but push is enabled, try silent restore first
    if (!subscription) {
      const silentSuccess = await silentSubscribeToPush()
      // If silent subscribe failed and user previously granted permission, show prompt
      if (!silentSuccess && localStorage.getItem('notification-permission-granted') === 'true') {
        await requestPushPermission()
      }
    }
  } catch (error) {
    console.warn('Failed to restore push subscription:', error)
  }
}

async function fetchProfile(userId) {
  const { data, error } = await supabase
    .from('users')
    .select('id, name, email, role, department_id, avatar_url, status, first_name, last_name, group_name, is_temporary, last_active_at')
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

  // Check if user's department is the Programs department
  let isProgramsMember = false
  if (data.department_id) {
    const { data: dept } = await supabase
      .from('departments')
      .select('is_programs')
      .eq('id', data.department_id)
      .single()
    isProgramsMember = dept?.is_programs ?? false
  }

  // Fetch all departments for space/scope selection in admin views
  const { data: departments } = await supabase
    .from('departments')
    .select('id, name')
    .order('name')

  // Space roles (Phase 3 permission model): ors/programs/media/dept_lead are
  // granted per-space via the space_roles table, not users.role. Attached to
  // the profile so hasSpaceRole()/route guards can resolve them without extra
  // fetches. A failure here degrades to "no space roles" rather than blocking
  // sign-in.
  const { data: spaceRoles } = await supabase
    .from('space_roles')
    .select('space_id, role')
    .eq('user_id', userId)

  // Ad-hoc grants (user_grants table) — capabilities given to a specific user
  // beyond their base role/department, e.g. a pastor given regional_secretary-
  // level admin reach without changing their base role (which would silently
  // drop the ~10 pastor-specific RLS/RPC checks elsewhere in the app). Attached
  // as a flat array of grant_type strings so hasGrant()/route guards can check
  // synchronously, same as space_roles above.
  const { data: grantRows } = await supabase
    .from('user_grants')
    .select('grant_type')
    .eq('user_id', userId)

  return { ...data, departments: departments ?? [], space_roles: spaceRoles ?? [], grants: (grantRows ?? []).map((g) => g.grant_type), is_programs_member: isProgramsMember }
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

    const initializeAuth = async () => {
      // Layer 1: Try restore session from IndexedDB (iOS PWA recovery)
      const cachedSession = await loadSession()
      if (cachedSession?.access_token && mounted) {
        try {
          // Restore the session to Supabase client
          const { error } = await supabase.auth.setSession(cachedSession)
          if (error) {
            console.warn('Failed to restore IndexedDB session:', error)
            clearSession()
          }
        } catch (e) {
          console.warn('Error restoring IndexedDB session:', e)
          clearSession()
        }
      }

      // Layer 2: Try silent token refresh if session is old or missing
      const {
        data: { session },
      } = await supabase.auth.getSession()

      if (!session && mounted) {
        // No session available; try silent refresh
        try {
          const { data: refreshed } = await supabase.auth.refreshSession()
          if (refreshed?.session && mounted) {
            // Save refreshed session to IndexedDB
            await saveSession(refreshed.session)
          }
        } catch (e) {
          console.warn('Silent token refresh failed:', e)
        }
      }

      // Layer 3: Get current session (after potential refresh/restore)
      const {
        data: { session: finalSession },
      } = await supabase.auth.getSession()

      if (!mounted) {
        return
      }

      setUser(finalSession?.user ?? null)
      setJwtRole(getJwtRole(finalSession))

      if (finalSession?.user) {
        try {
          const nextProfile = await fetchProfile(finalSession.user.id)
          if (mounted) {
            setProfile(nextProfile)
          }

          // Layer 4: Restore push subscription if enabled and missing
          if (nextProfile?.push_enabled && localStorage.getItem('notification-permission-granted') === 'true') {
            restorePushSubscription().catch(() => {})
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

    initializeAuth()

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
        // Save session to IndexedDB for iOS PWA recovery
        await saveSession(session)

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
        clearSession()
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
      signOut: async () => {
        // Unsubscribe from push notifications before signing out
        await unsubscribePush().catch(() => {})
        // Clear IndexedDB session
        await clearSession().catch(() => {})
        // Sign out from Supabase
        return supabase.auth.signOut()
      },
      refreshProfile,
    }),
    [jwtRole, loading, profile, user, isRecoveryMode, signIn, signUp],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
