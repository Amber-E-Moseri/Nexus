import { createContext, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { touchLastActive } from '../lib/people/api'
import { supabase } from '../lib/supabase'
import { clearAllAppCache, loadSession, clearSession } from '../lib/cacheUtils'
import { silentSubscribeToPush, unsubscribePush } from '../lib/webPush'

// Default is used by detached fibers (lazy-loaded component's Suspense retry fires
// after the Suspense boundary unmounts due to an auth redirect). loading:true makes
// ProtectedRoute show a spinner instead of crashing from a null context.
const AUTH_CONTEXT_DEFAULT = {
  user: null,
  profile: null,
  role: null,
  effectiveRole: null,
  loading: true,
  isRecoveryMode: false,
  clearRecoveryMode: () => {},
  signIn: async () => ({ error: new Error('AuthProvider not mounted') }),
  signUp: async () => ({ error: new Error('AuthProvider not mounted') }),
  signOut: async () => {},
  refreshProfile: async () => null,
}
export const AuthContext = createContext(AUTH_CONTEXT_DEFAULT)

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

async function fetchMinimalProfile(userId) {
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
      if (!healError && healed) return { ...healed, departments: [], space_roles: [], grants: [], is_programs_member: false, _supplementaryLoaded: false }
    }
    throw error
  }

  return { ...data, departments: [], space_roles: [], grants: [], is_programs_member: false, _supplementaryLoaded: false }
}

async function fetchSupplementaryProfile(userId, departmentId) {
  const [deptResult, departmentsResult, spaceRolesResult, grantResult] = await Promise.all([
    departmentId
      ? supabase.from('departments').select('is_programs').eq('id', departmentId).single()
      : Promise.resolve({ data: null }),
    supabase.from('departments').select('id, name').order('name'),
    supabase.from('space_roles').select('space_id, role').eq('user_id', userId),
    supabase.from('user_grants').select('grant_type').eq('user_id', userId),
  ])

  return {
    departments: departmentsResult.data ?? [],
    space_roles: spaceRolesResult.data ?? [],
    grants: (grantResult.data ?? []).map((g) => g.grant_type),
    is_programs_member: deptResult.data?.is_programs ?? false,
  }
}

async function fetchProfile(userId) {
  const minimal = await fetchMinimalProfile(userId)
  const supplementary = await fetchSupplementaryProfile(userId, minimal.department_id)
  return { ...minimal, ...supplementary, _supplementaryLoaded: true }
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
      // Wrapped in withTimeout: a stuck IndexedDB connection (known iOS/Safari
      // issue after backgrounding) must not hang init forever — that left
      // `user` unset until the 12s safety-net fired, which read as a random
      // logout even though a valid session existed.
      let session = null
      let getSessionTimedOut = false
      try {
        const result = await withTimeout(supabase.auth.getSession(), 8_000)
        session = result?.data?.session ?? null
      } catch (e) {
        console.warn('[Auth] getSession failed or timed out:', e)
        getSessionTimedOut = true
      }

      // Migration path: on first launch after switching to IDB storage the SDK's
      // store is empty. Fall back to the old manual nexus/session IDB store so
      // existing logged-in users aren't forced to re-authenticate.
      if (!session) {
        try {
          const cachedSession = await withTimeout(loadSession(), 5_000)
          if (cachedSession?.access_token) {
            try {
              const { data: restored, error } = await withTimeout(
                supabase.auth.setSession({
                  access_token:  cachedSession.access_token,
                  refresh_token: cachedSession.refresh_token,
                }),
                8_000,
              )
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
        } catch (e) {
          console.warn('[Auth] loadSession fallback failed or timed out:', e)
        }
      }

      if (!mounted) return

      // Only set user state when we have a valid session. Never call setUser(null)
      // here — onAuthStateChange is the sole authority for the signed-out transition.
      // INITIAL_SESSION fires shortly and will clear state if there truly is no session.
      if (session?.user) {
        setUser(session.user)
        setJwtRole(getJwtRole(session))
      }

      if (session?.user) {
        try {
          const nextProfile = await withTimeout(fetchMinimalProfile(session.user.id), 8_000)
          if (mounted) {
            profileRef.current = nextProfile  // sync before INITIAL_SESSION can race
            setProfile(nextProfile)
            fetchSupplementaryProfile(session.user.id, nextProfile.department_id)
              .then((supplementary) => {
                if (mounted) {
                  const merged = (prev) => prev?.id === nextProfile.id ? { ...prev, ...supplementary, _supplementaryLoaded: true } : prev
                  profileRef.current = merged(profileRef.current)
                  setProfile(merged)
                }
              })
              .catch(() => {})
          }

          // Restore push subscription if it was enabled (handles PWA cold-start)
          if (nextProfile?.push_enabled && Notification.permission === 'granted') {
            restorePushSubscription().catch(() => {})
          }

          touchLastActive().catch(() => {})
          // Profile loaded — release spinner
          if (mounted) setLoading(false)
        } catch (e) {
          // Profile fetch failed/timed out. Don't release the spinner here — the
          // INITIAL_SESSION event from onAuthStateChange will retry the fetch.
          // Releasing loading with profile=null causes a skeleton with no user info.
          // The 15 s safety-net ensures we never hang indefinitely.
          console.warn('[Auth] fetchProfile failed or timed out:', e)
        }
      }
      // No session: don't call setLoading(false) here. onAuthStateChange will fire
      // INITIAL_SESSION (null) shortly and call setLoading(false) in its else branch.
      // The 12 s safety-net above catches the case where it never fires.
    }

    // Safety-net covers the FULL auth lifecycle — both initializeAuth AND the
    // onAuthStateChange INITIAL_SESSION profile fetch (which can fire after
    // initializeAuth returns and has no timeout of its own). The timer is never
    // cleared early; setLoading(false) when loading is already false is a no-op.
    setTimeout(() => {
      if (mounted) {
        console.warn('[Auth] Initialization timed out after 15 s — clearing loading state')
        setLoading(false)
      }
    }, 15_000)

    initializeAuth()

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
        // Fetch profile on SIGNED_IN (explicit login) and INITIAL_SESSION (session
        // restored from storage — this is what fires when a stored session is found,
        // including after a background token refresh). TOKEN_REFRESHED keeps the
        // cached profile to avoid unnecessary DB queries.
        if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
          // Session restore / tab refocus also emit SIGNED_IN — skip the
          // refetch when the loaded profile already matches this user (BLW-06)
          if (profileRef.current?.id === session.user.id) {
            touchLastActive().catch(() => {})
            setLoading(false)
            return
          }
          setLoading(true)
          try {
            const nextProfile = await withTimeout(fetchMinimalProfile(session.user.id), 8_000)
            if (mounted) {
              setProfile(nextProfile)
              fetchSupplementaryProfile(session.user.id, nextProfile.department_id)
                .then((supplementary) => {
                  if (mounted) setProfile((prev) => prev?.id === nextProfile.id ? { ...prev, ...supplementary } : prev)
                })
                .catch(() => {})
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
          touchLastActive().catch(() => {})
          // If INITIAL_SESSION fired with null before the refresh completed,
          // the profile was cleared. Re-fetch it now that we have a valid session.
          if (!profileRef.current) {
            try {
              const nextProfile = await fetchMinimalProfile(session.user.id)
              if (mounted) {
                profileRef.current = nextProfile
                setProfile(nextProfile)
                fetchSupplementaryProfile(session.user.id, nextProfile.department_id)
                  .then((supplementary) => {
                    if (mounted) {
                      const merged = (prev) => prev?.id === nextProfile.id ? { ...prev, ...supplementary } : prev
                      profileRef.current = merged(profileRef.current)
                      setProfile(merged)
                    }
                  })
                  .catch(() => {})
              }
            } catch {}
            // Release spinner after TOKEN_REFRESHED re-fetch (success or failure)
            if (mounted) setLoading(false)
          }
        }
      } else {
        if (event === 'SIGNED_OUT' || event === 'USER_DELETED') {
          setProfile(null)
          setLoading(false)
          clearAllAppCache()
          clearSession()
        } else if (event === 'INITIAL_SESSION') {
          // INITIAL_SESSION(null) fires when the token is expired but the refresh
          // token is still valid — auth-js emits TOKEN_REFRESHED shortly after.
          // Don't clear profile or release loading here: doing so causes a skeleton
          // flash (user is set, profile is null, app renders with no name/data).
          // Give TOKEN_REFRESHED 4 s; if it doesn't arrive, conclude no session.
          setTimeout(() => {
            if (mounted && !profileRef.current) {
              setProfile(null)
              setLoading(false)
            }
          }, 4_000)
        } else {
          setProfile(null)
          setLoading(false)
        }
      }
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [])

  const signIn = useCallback(
    (email, password) => withTimeout(supabase.auth.signInWithPassword({ email, password }), 12_000)
      .catch(e => ({ error: e })),
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
