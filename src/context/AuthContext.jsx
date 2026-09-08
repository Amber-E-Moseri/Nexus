import { createContext, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { touchLastActive } from '../lib/people/api'
import { supabase } from '../lib/supabase'
import { clearAllAppCache, loadSession, clearSession } from '../lib/cacheUtils'
import { silentSubscribeToPush, unsubscribePush } from '../lib/webPush'
import { queryClient } from '../lib/queryClient'

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
  // Holds the timer started by INITIAL_SESSION(null) so TOKEN_REFRESHED can
  // cancel it before it fires mid-profile-fetch (the "workspace with no user
  // info" mobile race: timer fires at 4 s, profile fetch finishes at 4.5 s).
  const initialSessionTimerRef = useRef(null)
  // Deduplicates concurrent fetchMinimalProfile calls between initializeAuth
  // and onAuthStateChange — both fire on page load and race to fetch the
  // same profile, doubling the DB round-trips and causing a spinner flash
  // when the slower path calls setLoading(true) mid-flight.
  const profileFetchRef = useRef(null)
  // Tracks supplementary profile fetch to avoid redundant updates on page navigations.
  // Defers fetch via requestIdleCallback so it doesn't interrupt page renders.
  const supplementaryFetchRef = useRef(null)
  const supplementaryTimeoutRef = useRef(null)
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

    function ensureProfileFetch(userId) {
      if (profileFetchRef.current?.userId === userId) {
        return profileFetchRef.current.promise
      }
      const promise = withTimeout(fetchMinimalProfile(userId), 8_000)
      profileFetchRef.current = { userId, promise }
      promise.catch(() => {}).finally(() => {
        if (profileFetchRef.current?.promise === promise) {
          profileFetchRef.current = null
        }
      })
      return promise
    }

    function deferredFetchSupplementary(userId, departmentId) {
      // Skip if already fetched for this user
      if (supplementaryFetchRef.current?.userId === userId && profileRef.current?._supplementaryLoaded) {
        return
      }

      // Cancel any pending defer
      if (supplementaryTimeoutRef.current) {
        clearTimeout(supplementaryTimeoutRef.current)
      }

      // Defer fetch to requestIdleCallback (run when browser is idle, not blocking page renders)
      const callback = () => {
        if (!mounted || profileRef.current?.id !== userId) return
        supplementaryFetchRef.current = { userId, loading: true }

        fetchSupplementaryProfile(userId, departmentId)
          .then((supplementary) => {
            if (!mounted || profileRef.current?.id !== userId) return
            // Memoize: only update if essential data (space_roles, grants) changed
            const prev = profileRef.current || {}
            const spaceRolesChanged = JSON.stringify(prev.space_roles) !== JSON.stringify(supplementary.space_roles)
            const grantsChanged = JSON.stringify(prev.grants) !== JSON.stringify(supplementary.grants)
            const isProgramsChanged = prev.is_programs_member !== supplementary.is_programs_member

            if (spaceRolesChanged || grantsChanged || isProgramsChanged) {
              setProfile((p) => p?.id === userId ? { ...p, ...supplementary, _supplementaryLoaded: true } : p)
            } else {
              // Data unchanged, still mark as loaded to avoid refetching
              profileRef.current._supplementaryLoaded = true
            }
            supplementaryFetchRef.current = { userId, loading: false }
          })
          .catch((err) => {
            console.warn('[Auth] Supplementary profile fetch failed:', err)
            supplementaryFetchRef.current = { userId, loading: false }
          })
      }

      // Use requestIdleCallback if available (modern browsers), fallback to setTimeout
      if (typeof requestIdleCallback !== 'undefined') {
        supplementaryTimeoutRef.current = requestIdleCallback(callback, { timeout: 3000 })
      } else {
        // Defer by 500ms to let current page render complete
        supplementaryTimeoutRef.current = setTimeout(callback, 500)
      }
    }

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
      // Not raced directly against the timeout below — withTimeout's loser keeps
      // running in the background, and its result was previously just discarded
      // when it arrived late. If the network/IndexedDB was merely slow rather than
      // actually stuck, that valid session got silently dropped, and the user rode
      // out every fallback below only to land on the 15s safety net with
      // user/profile still null — a spinner that "resolves" into a false logout.
      // Keeping the reference lets us recover it below if nothing else won first.
      const getSessionPromise = supabase.auth.getSession()
      try {
        const result = await withTimeout(getSessionPromise, 8_000)
        session = result?.data?.session ?? null
      } catch (e) {
        console.warn('[Auth] getSession failed or timed out:', e)
        getSessionTimedOut = true

        // Recover a session that arrives after the timeout instead of dropping it.
        // Guarded by profileRef so it only acts if nothing else — the IDB fallback
        // below, or onAuthStateChange — already resolved a profile by then; it must
        // never clobber a session that was already correctly established.
        getSessionPromise.then((result) => {
          if (!mounted || profileRef.current) return
          const lateSession = result?.data?.session ?? null
          if (!lateSession?.user) return
          console.warn('[Auth] getSession resolved after the timeout — recovering the session instead of treating it as logged out')
          setUser(lateSession.user)
          setJwtRole(getJwtRole(lateSession))
          fetchMinimalProfile(lateSession.user.id)
            .then((nextProfile) => {
              if (!mounted || profileRef.current) return
              profileRef.current = nextProfile
              setProfile(nextProfile)
              setLoading(false)
              touchLastActive().catch(() => {})
              deferredFetchSupplementary(lateSession.user.id, nextProfile.department_id)
            })
            .catch(() => {})
        }).catch(() => {})
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

      // Clear the legacy nexus IDB store now that nexus-auth is the authority.
      // This prevents the migration fallback below from running on future visits
      // (it fires when getSession returns null, which can happen on stuck IDB).
      if (session?.user) {
        clearSession().catch(() => {})
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
          const nextProfile = await ensureProfileFetch(session.user.id)
          if (mounted) {
            profileRef.current = nextProfile
            setProfile(nextProfile)
            // Defer supplementary fetch to avoid interrupting page renders on navigation
            deferredFetchSupplementary(session.user.id, nextProfile.department_id)
          }

          if (nextProfile?.push_enabled && Notification.permission === 'granted') {
            restorePushSubscription().catch(() => {})
          }

          touchLastActive().catch(() => {})
          if (mounted) setLoading(false)
        } catch (e) {
          console.warn('[Auth] fetchProfile failed or timed out:', e)
        }
      }
      // No session: don't call setLoading(false) here. onAuthStateChange will fire
      // INITIAL_SESSION (null) shortly and call setLoading(false) in its else branch.
      // The 12 s safety-net above catches the case where it never fires.
    }

    // Safety-net covers the FULL auth lifecycle — both initializeAuth AND the
    // onAuthStateChange INITIAL_SESSION profile fetch (which can fire after
    // initializeAuth returns and has no timeout of its own). 6s is the mobile
    // UX threshold for spinner patience. The timer is never cleared early;
    // setLoading(false) when loading is already false is a no-op.
    const safetyNetTimeout = setTimeout(() => {
      if (mounted) {
        console.warn('[Auth] Initialization timed out after 6 s — clearing loading state')
        setLoading(false)
        // Do NOT clear user here — if INITIAL_SESSION already fired and a profile
        // fetch is in progress (which has its own 8s timeout), clearing user would
        // boot a legitimate login 2 seconds before the fetch has a chance to land.
        // The ProtectedRoute `user && !profile` guard holds the spinner until profile
        // arrives; the ensureProfileFetch catch block clears user if it truly fails.
      }
    }, 6_000)

    initializeAuth()

    // Re-check auth + push subscription whenever the PWA comes back to the
    // foreground. On iOS/Android the OS can kill the process while suspended;
    // IndexedDB becomes inaccessible briefly, causing init to conclude "no session"
    // even though a valid session exists. Re-running getSession after IDB recovers
    // restores the session without forcing re-login.
    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return

      // Session recovery: if currently showing spinner (loading) or logged out (user is null),
      // re-check for a valid session in storage. This catches both:
      // - IDB cold-start race (init thought no session, but IDB recovers after suspend)
      // - PWA process kill (storage layer was never initialized)
      if (loading || !profileRef.current) {
        supabase.auth.getSession().then(({ data }) => {
          if (!mounted) return
          const resumeSession = data?.session
          if (!resumeSession?.user) return

          // Restore the session if we're still in loading state or logged out
          if (loading || !profileRef.current) {
            console.log('[Auth] Resuming session from visibility change')
            setUser(resumeSession.user)
            setJwtRole(getJwtRole(resumeSession))
            // Fetch profile synchronously (don't defer) — user is waiting to resume
            fetchMinimalProfile(resumeSession.user.id)
              .then((nextProfile) => {
                if (mounted && !profileRef.current) {
                  profileRef.current = nextProfile
                  setProfile(nextProfile)
                  setLoading(false)
                  deferredFetchSupplementary(resumeSession.user.id, nextProfile.department_id)
                }
              })
              .catch((err) => {
                console.warn('[Auth] Visibility resume failed:', err)
                if (mounted) {
                  if (loading) setLoading(false)
                }
              })
          }
        }).catch(() => {})
      }

      if (profileRef.current?.push_enabled && Notification.permission === 'granted') {
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
            const nextProfile = await ensureProfileFetch(session.user.id)
            if (mounted) {
              setProfile(nextProfile)
              deferredFetchSupplementary(session.user.id, nextProfile.department_id)
            }
            touchLastActive().catch(() => {})
          } catch {
            if (mounted) {
              setProfile(null)
              // Clear user so ProtectedRoute redirects to login instead of
              // spinning forever (user set, profile null, loading false).
              setUser(null)
            }
          } finally {
            if (mounted) {
              setLoading(false)
            }
          }
        } else if (event === 'TOKEN_REFRESHED') {
          // Cancel the INITIAL_SESSION null timer: we have a real session now and
          // are about to restore the profile. Without this, the 4 s timer fires
          // mid-fetch and calls setLoading(false) with profile=null, causing the
          // "workspace with no user info" flash on mobile resume.
          if (initialSessionTimerRef.current) {
            clearTimeout(initialSessionTimerRef.current)
            initialSessionTimerRef.current = null
          }
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
          queryClient.clear()
        } else if (event === 'INITIAL_SESSION') {
          // INITIAL_SESSION(null) fires when the token is expired but the refresh
          // token is still valid — auth-js emits TOKEN_REFRESHED shortly after.
          // Don't clear profile or release loading here: doing so causes a skeleton
          // flash (user is set, profile is null, app renders with no name/data).
          // Give TOKEN_REFRESHED 8 s; if it doesn't arrive, conclude no session.
          // (Previously 4 s — too aggressive on slow mobile/3G connections where
          // the token refresh round-trip can exceed 4 s, causing a false login
          // redirect before TOKEN_REFRESHED arrives.)
          // TOKEN_REFRESHED cancels this timer (see below) so it can never fire
          // mid-profile-fetch — the source of the "workspace with no user info"
          // flash on mobile cold-start after backgrounding.
          initialSessionTimerRef.current = setTimeout(() => {
            initialSessionTimerRef.current = null
            if (mounted && !profileRef.current) {
              setProfile(null)
              setLoading(false)
            }
          }, 8_000)
        } else {
          setProfile(null)
          setLoading(false)
        }
      }
    })

    return () => {
      mounted = false
      if (supplementaryTimeoutRef.current) {
        clearTimeout(supplementaryTimeoutRef.current)
      }
      clearTimeout(safetyNetTimeout)
      subscription.unsubscribe()
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      if (initialSessionTimerRef.current) {
        clearTimeout(initialSessionTimerRef.current)
        initialSessionTimerRef.current = null
      }
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
