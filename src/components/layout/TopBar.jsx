import { Clock3, PanelsTopLeft, Search, Settings2, Sparkles } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { supabase } from '../../lib/supabase'
import NotificationBell from '../../modules/notifications/NotificationBell'

const PAGE_TITLES = {
  '/dashboard': 'Overview',
  '/my-tasks': 'My Tasks',
  '/calendar': 'Ministry Calendar',
  '/map': 'CAN Map',
  '/flock': 'My Flock',
  '/meetings': 'Meetings',
  '/spaces': 'Spaces',
  '/sprints': 'Sprints',
  '/people/users': 'People · Users',
  '/people/invitations': 'People · Invitations',
  '/people/departments': 'People · Spaces',
  '/people/pastoral-assignments': 'People · Pastoral Assignments',
  '/automations': 'Automations',
  '/communications': 'Communications',
  '/settings': 'Settings',
}

function getPageTitle(pathname) {
  if (PAGE_TITLES[pathname]) return PAGE_TITLES[pathname]
  if (pathname.startsWith('/spaces/')) return 'Space'
  if (pathname.startsWith('/sprints/')) return 'Sprint'
  if (pathname.startsWith('/dept/')) {
    const slug = pathname.replace('/dept/', '')
    return slug.charAt(0).toUpperCase() + slug.slice(1).replace('-', ' ')
  }
  return 'BLW Canada OS'
}

export default function TopBar() {
  const { profile, signOut } = useAuth()
  const location = useLocation()
  const [spaceName, setSpaceName] = useState('')

  useEffect(() => {
    let active = true

    if (!location.pathname.startsWith('/spaces/')) {
      setSpaceName('')
      return () => {
        active = false
      }
    }

    const spaceId = location.pathname.replace('/spaces/', '').split('/')[0]
    supabase
      .from('departments')
      .select('name')
      .eq('id', spaceId)
      .maybeSingle()
      .then(({ data }) => {
        if (active) {
          setSpaceName(data?.name ?? 'Space')
        }
      })

    return () => {
      active = false
    }
  }, [location.pathname])

  const pageTitle = location.pathname.startsWith('/spaces/') ? spaceName || 'Space' : getPageTitle(location.pathname)

  return (
    <header
      className="sticky top-0 z-10 backdrop-blur-md"
      style={{
        borderBottom: '1px solid var(--topbar-border)',
        background: 'var(--topbar-bg)',
        backdropFilter: 'blur(8px)',
      }}
    >
      <div className="flex h-[54px] items-center justify-between gap-4 px-5">
        <div className="flex min-w-0 items-center gap-3">
          <div className="min-w-0">
            <div className="truncate text-base font-semibold text-[var(--text-primary)]">{pageTitle}</div>
            <div className="hidden text-xs text-[var(--text-tertiary)] md:block">
              BLW Canada OS workspace
            </div>
          </div>
        </div>

        <div className="hidden flex-1 justify-center lg:flex">
          <div className="flex w-full max-w-sm cursor-pointer items-center gap-2 rounded-xl border border-[var(--border-strong)] bg-white px-4 py-2 text-sm text-[var(--text-secondary)] shadow-[inset_0_1px_2px_rgba(0,0,0,0.04)] transition hover:border-[var(--accent)]">
            <Search size={16} className="text-[var(--text-tertiary)]" />
            <span className="flex-1">Search</span>
            <span className="text-xs text-[var(--text-tertiary)]">Ctrl J</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            className="hidden rounded-xl border border-[var(--border)] bg-[var(--surface-tertiary)] p-2.5 text-[var(--text-tertiary)] transition hover:text-[var(--text-primary)] xl:block"
            aria-label="Activity"
          >
            <Clock3 size={16} />
          </button>
          <button
            type="button"
            className="hidden rounded-xl border border-[var(--border)] bg-[var(--surface-tertiary)] p-2.5 text-[var(--text-tertiary)] transition hover:text-[var(--text-primary)] xl:block"
            aria-label="Views"
          >
            <PanelsTopLeft size={16} />
          </button>
          <button
            type="button"
            className="hidden rounded-xl border border-[var(--border)] bg-[var(--surface-tertiary)] p-2.5 text-[var(--text-tertiary)] transition hover:text-[var(--text-primary)] xl:block"
            aria-label="AI"
          >
            <Sparkles size={16} />
          </button>
          <NotificationBell />
          <button
            type="button"
            className="hidden rounded-xl border border-[var(--border)] bg-[var(--surface-tertiary)] p-2.5 text-[var(--text-tertiary)] transition hover:text-[var(--text-primary)] xl:block"
            aria-label="Workspace settings"
          >
            <Settings2 size={16} />
          </button>

          <button
            type="button"
            onClick={signOut}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-[linear-gradient(135deg,_var(--workspace-rail),_var(--workspace-rail-dark))] text-[12px] font-bold text-white shadow-sm ring-2 ring-transparent transition hover:ring-[var(--accent)]"
            title={`Sign out (${profile?.name})`}
          >
            {profile?.name?.charAt(0)?.toUpperCase() ?? '?'}
          </button>
        </div>
      </div>
    </header>
  )
}
