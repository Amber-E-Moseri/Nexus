import {
  Bell,
  Bot,
  Building2,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Ellipsis,
  Home,
  LayoutDashboard,
  MailPlus,
  MapPin,
  Settings,
  SquareCheckBig,
  Users,
  Users2,
  Zap,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { getSpacesByType, SPACE_TYPE_LABELS } from '../../lib/spaces'
import { supabase } from '../../lib/supabase'
import SpaceModal from '../../modules/spaces/SpaceModal'
import { useSprints } from '../../modules/sprints/SprintsContext'
import Badge from '../ui/Badge'

const HEALTH_LABELS = {
  on_track: 'On track',
  at_risk: 'At risk',
  off_track: 'Off track',
}

const RAIL_ITEMS = [
  { icon: Home, label: 'Home', to: '/dashboard' },
  { icon: Users, label: 'Spaces', to: '/spaces' },
  { icon: CalendarDays, label: 'Planner', to: '/meetings' },
  { icon: Bot, label: 'AI', to: '/automations', roles: ['super_admin', 'dept_lead'] },
  { icon: Users2, label: 'Teams', to: '/people/users', roles: ['super_admin', 'dept_lead', 'pastor'] },
  { icon: LayoutDashboard, label: 'Dash', to: '/dashboard' },
]

const SPACE_GROUPS = ['department', 'program', 'personal', 'sandbox']

function SidebarLink({ collapsed, icon: Icon, label, to, badge }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        [
          'flex items-center gap-3 rounded-xl border-l-2 border-transparent px-3 py-2.5 text-sm font-medium transition-all duration-150',
          isActive
            ? 'border-[var(--accent)] bg-[var(--accent-light)] text-[var(--accent-dark)]'
            : 'text-[var(--text-secondary)] hover:bg-[var(--surface-secondary)] hover:text-[var(--text-primary)]',
        ].join(' ')
      }
    >
      <Icon size={17} className="flex-shrink-0" />
      {!collapsed && (
        <>
          <span className="flex-1 truncate">{label}</span>
          {badge ? (
            <span className="rounded-full bg-[#f03f86] px-2 py-0.5 text-[10px] font-semibold text-white">
              {badge}
            </span>
          ) : null}
        </>
      )}
    </NavLink>
  )
}

function SpaceLink({ collapsed, space }) {
  return (
    <NavLink
      to={`/spaces/${space.id}`}
      className={({ isActive }) =>
        [
          'flex items-center gap-3 rounded-xl border-l-2 border-transparent px-3 py-2.5 transition-all duration-150',
          isActive
            ? 'border-[var(--accent)] bg-[var(--accent-light)] text-[var(--accent-dark)]'
            : 'hover:bg-[var(--surface-secondary)]',
        ].join(' ')
      }
    >
      <span
        className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg text-xs font-semibold text-white"
        style={{ backgroundColor: `#${space.color}` }}
      >
        {collapsed ? '•' : space.name.charAt(0)}
      </span>
      {!collapsed && (
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-[var(--text-primary)]">{space.name}</div>
          {space.health_status ? (
            <div className="mt-0.5">
              <Badge tone={space.health_status}>
                {HEALTH_LABELS[space.health_status] ?? space.health_status}
              </Badge>
            </div>
          ) : null}
        </div>
      )}
    </NavLink>
  )
}

export default function Sidebar() {
  const { profile, role } = useAuth()
  const { activeSprints, planningSprints } = useSprints()
  const [collapsed, setCollapsed] = useState(false)
  const [spaceGroups, setSpaceGroups] = useState({
    department: [],
    program: [],
    personal: [],
    sandbox: [],
    archived: [],
  })
  const [integrations, setIntegrations] = useState([])
  const [toolsOpen, setToolsOpen] = useState(true)
  const [archivedOpen, setArchivedOpen] = useState(false)
  const [showSpaceModal, setShowSpaceModal] = useState(false)

  async function loadSpaces() {
    if (!profile?.id || !role) return
    const groups = await getSpacesByType(profile.id, role, profile.department_id)
    setSpaceGroups(groups)
  }

  useEffect(() => {
    let active = true

    loadSpaces().catch(() => {})

    supabase
      .from('external_integrations')
      .select('*')
      .eq('enabled', true)
      .order('sort_order')
      .then(({ data }) => {
        if (active) {
          setIntegrations(data ?? [])
        }
      })

    return () => {
      active = false
    }
  }, [profile?.department_id, profile?.id, role])

  const displayedSprints = useMemo(
    () => [...activeSprints, ...planningSprints].slice(0, 8),
    [activeSprints, planningSprints],
  )

  const quickLinks = [
    { icon: CalendarDays, label: 'Meetings', to: '/meetings' },
    ...(role === 'super_admin' || role === 'dept_lead'
      ? [{ icon: MailPlus, label: 'Communications', to: '/communications' }]
      : []),
    ...(role === 'super_admin' || role === 'dept_lead'
      ? [{ icon: Bot, label: 'Automations', to: '/automations' }]
      : []),
    { icon: Settings, label: 'Settings', to: '/settings' },
  ]

  const canCreateSpace = role === 'super_admin' || role === 'dept_lead'

  return (
    <aside
      className={[
        'relative flex h-screen border-r border-[var(--border)] bg-[var(--workspace-panel)] transition-all duration-200',
        collapsed ? 'w-[134px]' : 'w-[400px]',
      ].join(' ')}
    >
      <div className="flex w-[74px] flex-col items-center justify-between rounded-r-[18px] bg-[linear-gradient(180deg,_var(--workspace-rail)_0%,_var(--workspace-rail-dark)_100%)] px-2 py-4 text-white shadow-[inset_-1px_0_0_rgba(255,255,255,0.04)]">
        <div className="flex w-full flex-col items-center gap-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-[var(--workspace-rail)] shadow-[0_10px_24px_rgba(0,0,0,0.18)]">
            <span className="text-sm font-bold">B</span>
          </div>

          {RAIL_ITEMS
            .filter((item) => !item.roles || item.roles.includes(role))
            .map((item) => (
              <NavLink
                key={item.label}
                to={item.to}
                title={item.label}
                className={({ isActive }) =>
                  [
                    'flex w-full flex-col items-center gap-1 rounded-full px-1 py-2 text-[11px] font-medium transition',
                    isActive
                      ? 'bg-white/15 text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.18)]'
                      : 'text-white/90 hover:bg-white/12',
                  ].join(' ')
                }
              >
                <item.icon size={18} />
              </NavLink>
            ))}
        </div>

        {role === 'super_admin' || role === 'dept_lead' ? (
          <NavLink
            to="/people/invitations"
            className={({ isActive }) =>
              [
                'flex w-full flex-col items-center gap-1 rounded-full border border-white/16 px-1 py-2 text-[11px] font-medium transition',
                isActive ? 'bg-white/18 text-white' : 'bg-white/8 text-white hover:bg-white/14',
              ].join(' ')
            }
          >
            <MailPlus size={18} />
            <span>Invite</span>
          </NavLink>
        ) : null}
      </div>

      <div className="flex min-w-0 flex-1 flex-col bg-white shadow-[var(--card-shadow)]">
        <div className="border-b border-[var(--border)] px-5 pb-4 pt-4">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="truncate px-2 mb-1 mt-1 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
                Workspace
              </div>
              {!collapsed && (
                <div className="mt-1 truncate text-[28px] font-semibold tracking-[-0.04em] text-[var(--text-primary)]">
                  Home
                </div>
              )}
            </div>
            <button
              type="button"
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--border)] text-[var(--text-secondary)] transition hover:bg-[var(--surface-secondary)]"
              aria-label="More actions"
            >
              <Ellipsis size={18} />
            </button>
          </div>
        </div>

        <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-4">
          <section className="space-y-1">
            <SidebarLink collapsed={collapsed} icon={Bell} label="Inbox" to="/dashboard" />
            <SidebarLink collapsed={collapsed} icon={SquareCheckBig} label="My Tasks" to="/my-tasks" />
            <SidebarLink collapsed={collapsed} icon={CalendarDays} label="Ministry Calendar" to="/calendar" />
            {role === 'pastor' ? <SidebarLink collapsed={collapsed} icon={Users} label="My Flock" to="/flock" /> : null}
          </section>

          <section className="space-y-2">
            {!collapsed ? (
              <div className="px-2 mb-1 mt-1 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
                Spaces
              </div>
            ) : null}

            {SPACE_GROUPS.map((groupKey) => {
              const items = spaceGroups[groupKey] ?? []
              if (items.length === 0) return null
              return (
                <div key={groupKey} className="space-y-1">
                  {!collapsed ? (
                    <div className="px-3 pt-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-tertiary)]">
                      {SPACE_TYPE_LABELS[groupKey]}s
                    </div>
                  ) : null}
                  {items.map((space) => (
                    <SpaceLink key={space.id} collapsed={collapsed} space={space} />
                  ))}
                </div>
              )
            })}

            {(spaceGroups.archived ?? []).length > 0 ? (
              <div className="space-y-1">
                {!collapsed ? (
                  <button
                    type="button"
                    onClick={() => setArchivedOpen((value) => !value)}
                    className="flex w-full items-center justify-between px-3 pt-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-tertiary)]"
                  >
                    <span>Archived</span>
                    <ChevronDown size={12} className={archivedOpen ? 'rotate-180 transition-transform' : 'transition-transform'} />
                  </button>
                ) : null}
                {archivedOpen
                  ? (spaceGroups.archived ?? []).map((space) => (
                      <SpaceLink key={space.id} collapsed={collapsed} space={space} />
                    ))
                  : null}
              </div>
            ) : null}

            {!collapsed ? (
              <div className="px-3 pt-2 text-sm space-y-2">
                {canCreateSpace ? (
                  <button type="button" onClick={() => setShowSpaceModal(true)} className="text-[var(--text-secondary)]">
                    + New Space
                  </button>
                ) : null}
                <div>
                  <NavLink to="/spaces" className="text-[var(--accent)]">
                    All spaces →
                  </NavLink>
                </div>
              </div>
            ) : null}
          </section>

          <section className="space-y-2">
            {!collapsed && (
              <div className="px-2 mb-1 mt-1 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
                Sprints
              </div>
            )}

            {displayedSprints.length > 0 ? (
              displayedSprints.map((sprint) => (
                <NavLink
                  key={sprint.id}
                  to={`/sprints/${sprint.id}`}
                  className={({ isActive }) =>
                    [
                      'flex items-center gap-3 rounded-xl border-l-2 border-transparent px-3 py-2.5 transition-all duration-150',
                      isActive
                        ? 'border-[var(--accent)] bg-[var(--accent-light)] text-[var(--accent-dark)]'
                        : 'hover:bg-[var(--surface-secondary)]',
                    ].join(' ')
                  }
                >
                  <Zap size={16} className="shrink-0 text-[var(--accent)]" />
                  {!collapsed && (
                    <>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-[var(--text-primary)]">{sprint.name}</div>
                      </div>
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ background: sprint.status === 'active' ? 'var(--status-done-text)' : 'var(--text-placeholder)' }}
                      />
                    </>
                  )}
                </NavLink>
              ))
            ) : !collapsed ? (
              <div className="px-3 py-2 text-sm text-[var(--text-tertiary)]">No active sprints</div>
            ) : null}

            {!collapsed && (
              <div className="px-3 pt-1 text-sm">
                <NavLink to="/sprints" className="text-[var(--accent)]">
                  All sprints →
                </NavLink>
                {role === 'super_admin' || role === 'dept_lead' ? (
                  <div className="mt-2">
                    <NavLink to="/sprints?new=true" className="text-[var(--text-secondary)]">
                      + New Sprint
                    </NavLink>
                  </div>
                ) : null}
              </div>
            )}
          </section>

          <section className="space-y-2">
            {!collapsed && (
              <div className="px-2 mb-1 mt-1 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
                Platform
              </div>
            )}

            {quickLinks.map((item) => (
              <SidebarLink key={item.label} collapsed={collapsed} icon={item.icon} label={item.label} to={item.to} />
            ))}
            <a
              href="/apps/map/index.html"
              className="flex items-center gap-3 rounded-xl border-l-2 border-transparent px-3 py-2.5 text-sm font-medium text-[var(--text-secondary)] transition-all duration-150 hover:bg-[var(--surface-secondary)] hover:text-[var(--text-primary)]"
            >
              <MapPin size={17} className="flex-shrink-0" />
              {!collapsed && <span className="flex-1 truncate">Map</span>}
            </a>

            <div className="pt-2">
              <button
                type="button"
                onClick={() => setToolsOpen((value) => !value)}
                className="flex w-full items-center gap-3 rounded-xl border-l-2 border-transparent px-3 py-2.5 text-sm font-medium text-[var(--text-secondary)] transition-all duration-150 hover:bg-[var(--surface-secondary)] hover:text-[var(--text-primary)]"
              >
                <Building2 size={17} className="shrink-0" />
                {!collapsed && (
                  <>
                    <span className="flex-1 truncate">Tools</span>
                    <ChevronDown
                      size={15}
                      className={['transition-transform', toolsOpen ? 'rotate-180' : 'rotate-0'].join(' ')}
                    />
                  </>
                )}
              </button>

              {toolsOpen ? (
                <div className="mt-1 space-y-1">
                  {integrations.map((integration) => (
                    <a
                      key={integration.id}
                      href={integration.launch_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={integration.name}
                      className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-[var(--text-secondary)] transition-all duration-150 hover:bg-[var(--surface-secondary)] hover:text-[var(--text-primary)]"
                    >
                      <span className="flex h-[17px] w-[17px] items-center justify-center text-[15px]">
                        {integration.icon_emoji || '🔗'}
                      </span>
                      {!collapsed && <span className="flex-1 truncate">{integration.name} ↗</span>}
                    </a>
                  ))}
                </div>
              ) : null}
            </div>
          </section>

          {role !== 'member' ? (
            <section className="space-y-1">
              {!collapsed && (
                <div className="px-2 mb-1 mt-1 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
                  People
                </div>
              )}
              <SidebarLink collapsed={collapsed} icon={Users2} label="Users" to="/people/users" />
              {role === 'super_admin' || role === 'dept_lead' ? (
                <SidebarLink collapsed={collapsed} icon={MailPlus} label="Invitations" to="/people/invitations" />
              ) : null}
              <SidebarLink collapsed={collapsed} icon={Building2} label="Spaces" to="/people/departments" />
              <SidebarLink collapsed={collapsed} icon={Users} label="Pastoral Assignments" to="/people/pastoral-assignments" />
            </section>
          ) : null}
        </nav>

        <div className="border-t border-[var(--border)] p-3">
          <div className="flex justify-end px-3 pb-2">
            <button
              type="button"
              onClick={() => setCollapsed((value) => !value)}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-[var(--text-tertiary)] transition hover:bg-[var(--surface-secondary)] hover:text-[var(--text-primary)]"
              aria-label="Toggle sidebar"
            >
              {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
            </button>
          </div>
          <div className="flex items-center gap-3 rounded-2xl bg-[var(--surface-secondary)] px-3 py-3">
            <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-[linear-gradient(135deg,_var(--accent),_#5a49c8)] text-[12px] font-bold text-white">
              {profile?.name?.charAt(0)?.toUpperCase() ?? '?'}
            </div>
            {!collapsed && (
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-[var(--text-primary)]">{profile?.name}</div>
                <div className="mt-1 inline-flex items-center rounded-full bg-[var(--accent-light)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--accent-dark)]">
                  {role?.replace('_', ' ')}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {showSpaceModal ? (
        <SpaceModal onSaved={loadSpaces} onClose={() => setShowSpaceModal(false)} />
      ) : null}
    </aside>
  )
}
