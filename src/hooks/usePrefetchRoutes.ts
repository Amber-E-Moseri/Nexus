import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

/**
 * Hook to prefetch likely route components, speeding up navigation.
 * Uses dynamic import to trigger Vite code-split chunk downloads.
 *
 * Strategy:
 * - On app load: prefetch Dashboard (most common entry point)
 * - On Dashboard: prefetch Inbox, Calendar, MyTasks (common next pages)
 * - On other pages: prefetch Dashboard (home fallback)
 */
export function usePrefetchRoutes() {
  const { pathname } = useLocation()

  useEffect(() => {
    // Define prefetch routes based on current page
    let routesToPrefetch: (() => Promise<any>)[] = []

    if (pathname === '/dashboard') {
      // From dashboard, prefetch common next pages
      routesToPrefetch = [
        () => import('../pages/Inbox'),
        () => import('../pages/calendar/MinistryCalendar'),
        () => import('../pages/personal/MyTasks'),
      ]
    } else if (pathname === '/') {
      // On login/home, prefetch dashboard
      routesToPrefetch = [() => import('../pages/Dashboard')]
    } else {
      // On other pages, prefetch dashboard as fallback
      routesToPrefetch = [() => import('../pages/Dashboard')]
    }

    // Prefetch all routes with a slight delay to avoid blocking navigation
    const timeoutId = setTimeout(() => {
      routesToPrefetch.forEach((importFn) => {
        importFn().catch(() => {
          // Silent fail - prefetch is just optimization, not critical
        })
      })
    }, 1000)

    return () => clearTimeout(timeoutId)
  }, [pathname])
}
