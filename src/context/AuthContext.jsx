import { createContext, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { touchLastActive } from '../lib/people/api'
import { supabase } from '../lib/supabase'
import { clearAllAppCache, loadSession, clearSession } from '../lib/cacheUtils'
import { silentSubscribeToPush, unsubscribePush } from '../lib/webPush'

export const AuthContext = createContext(null)

function getJwtRole(session) {
  return session?.user?.app_metadata?.user_role
    ?? session?.user?.user_metadata?.user_role
    ?? null
}

async function restorePushSubscription() {
  // Callers already guard on Notification.permission === 'granted', so we
  // only need to ensure an active PushManager subscription exists in the DB.
  try {
    const registration = await navigator.serviceWorker.ready
    const subscription = await registration.pushManager.getSubscription()
    if (!subscription) {
      // Silent re-subscribe (no browser permission prompt since it's already granted)
      await silentSubscribeToPush()
    }
  } catch (error) {
    console.warn('Failed to restore push subscription:', error)
  }
}

// Abort-safe timeout wrapper: rejects if the inner promise takes longer than
// `ms`. The Supabase JS client uses `fetch()` which has no built-in timeout,
// so a network stall (server never responds, IndexedDB lock, etc.) would hang
// the auth init forever — this cap prevents the infinite-spinner scenario.
function withTimeout(promise, ms) {
  let timer
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`Timed out after ${ms}ms`)), ms)
    }),
  ]).finally(() => clearTimeout(timer))
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

  // Fire all supplementary queries in parallel — they're independent of each
  // other and waiting sequentially doubled the cold-start time for no reason.
  const [deptResult, departmentsResult, spaceRolesResult, grantResult] = await Promise.all([
    // Check if user's department is the Programs department
    data.department_id
      ? supabase.from('departments').select('is_programs').eq('id', data.department_id).single()
      : Promise.resolve({ data: null }),
    // Fetch all departments for space/scope selection in admin views
    supabase.from('departments').select('id, name').order('name'),
    // Space roles (Phase 3 permission model)
    supabase.from('space_roles').select('space_id, role').eq('user_id', userId),
    // Ad-hoc grants (user_grants table)
    supabase.from('user_grants').select('grant_type').eq('user_id', userId),
  ])

  return {
    ...data,
    departments: departmentsResult.data ?? [],
    space_roles: spaceRolesResult.data ?? [],
    grants: (grantResult.data ?? []).map((g) => g.grant_type),
    is_programs_member: deptResult.data?.is_programs ?? false,
  }
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
      // Primary: Supabase SDK reads from its own IndexedDB store (nexus-auth/kv).
      // This is the main session source now that auth storage was switched from
      // localStorage to IndexedDB — it survives PWA standalone cold-starts and
      // background suspension on both iOS and Android.
      let { data: { session } } = await supabase.auth.getSession()

      // Migration path: on first launch after switching to IDB storage the SDK's
      // store is empty. Fall back to the old manual nexus/session IDB store so
      // existing logged-in users aren't forced to re-authenticate.
      if (!session) {
        const cachedSession = await loadSession()
        if (cachedSession?.access_token) {
          try {
            const { data: restored, error } = await supabase.auth.setSession({
              access_token:  cachedSession.access_token,
              refresh_token: cachedSession.refresh_token,
            })
            if (error) {
              console.warn('Session migration failed:', error)
              clearSession()
            } else {
              session = restored?.session ?? null
            }
          } catch (e) {
            console.warn('Error during session migration:', e)
            clearSession()
          }
        }
      }

      if (!mounted) return

      setUser(session?.user ?? null)
      setJwtRole(getJwtRole(session))

      if (session?.user) {
        try {
          const nextProfile = await fetchProfile(session.user.id)
          if (mounted) setProfile(nextProfile)

          // Restore push subscription if it was enabled (handles PWA cold-start)
          if (nextProfile?.push_enabled && Notification.permission === 'granted') {
            restorePushSubscription().catch(() => {})
          }

          touchLastActive().catch(() => {})
        } catch {
          if (mounted) setProfile(null)
        }
      }

      if (mounted) setLoading(false)
    }

    // Safety-net: if initializeAuth hangs (network stall, IndexedDB lock, etc.),
    // force loading=false after 12 seconds so the user isn't stuck on the spinner
    // forever. They'll land on the login page and can retry.
    const loadingTimeout = setTimeout(() => {
      if (mounted) {
        console.warn('[Auth] Initialization timed out after 12 s — clearing loading state')
        setLoading(false)
      }
    }, 12_000)

    initializeAuth().finally(() => clearTimeout(loadingTimeout))

    // Re-check push subscription whenever the PWA comes back to the foreground.
    // On iOS/Android the subscription can be dropped while the app is suspended;
    // this silently re-registers it without prompting the user again.
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && profileRef.current?.push_enabled && Notification.permission === 'granted') {
        restorePushSubscription().catch(() => {})
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)

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
        clearSession()
      }
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
      document.removeEventListener('visibilitychange', handleVisibilityChange)
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
