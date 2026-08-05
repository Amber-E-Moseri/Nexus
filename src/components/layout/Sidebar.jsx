import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import {
  Archive,
  Bell,
  CalendarClock,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock,
  Copy,
  Folder,
  HelpCircle,
  HeadphonesIcon,
  Ticket,
  Trophy,
  TrendingUp,
  Search,
  LayoutGrid,
  Library,
  Lock,
  Mail,
  MailPlus,
  Map,
  MoreHorizontal,
  Network,
  PanelLeft,
  Phone,
  Pencil,
  Plus,
  Settings,
  EyeOff,
  Trash2,
  Users,
  Users2,
  Video,
  Send,
  Image,
  Zap,
  Sparkles,
} from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import { useCallback, useEffect, useMemo, useRef, useState, memo } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useInboxCount } from '../../context/InboxCountContext'
import { useAuth } from '../../hooks/useAuth'
import { archiveSpace, getSpacesByType, restoreSpace, updateSpace } from '../../features/spaces'
import { supabase } from '../../lib/supabase'
import { FLOCK_CRM_CONFIG, hasSpaceRole, hasGrant, isProgramsMember } from '../../lib/permissions.js'
import { INSTAGRAM_GRADING_ENABLED } from '../../config/features.js'
import QuickFeedbackModal from '../ui/QuickFeedbackModal'
import SidebarSpaceTree from './SidebarSpaceTree'
import SpaceModal from '../../features/spaces/components/SpaceModal'
import CreateListModal from '../../features/spaces/components/CreateListModal'
import CreateFolderModal from '../../features/spaces/components/CreateFolderModal'
import SprintModal from '../../features/sprints/components/SprintModal'
import { useSprints } from '../../features/sprints/SprintsContext'
import { useEventConfig } from '../../features/registration/EventConfigContext'
import { useMyTaskCounts } from '../../features/tasks/hooks/useMyTaskCounts'
import { CACHE_KEYS, getItemSafe, setItemSafe } from '../../lib/cacheUtils'
import { preloadRoute } from '../../lib/routePreload'
import { RegionalUpdateCompose } from '../../features/regional-updates/components/RegionalUpdateCompose'
import { FONT_BODY, FONT_HEADING } from '../../lib/fonts'

const SECTION_LABEL_STYLE = {
  padding: '4px 9px 5px',
  fontFamily: FONT_HEADING,
  fontSize: 9.5,
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.14em',
  color: 'var(--ink-3)',
}

const ITEM_BASE_STYLE = {
  width: '100%',
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '7px 9px',
  borderRadius: 7,
  marginBottom: 2,
  border: 'none',
  textAlign: 'left',
  fontSize: 13,
  cursor: 'pointer',
  background: 'transparent',
}

const SPACE_GROUPS = ['department', 'program', 'group', 'personal', 'sandbox']

function getInitials(name = '') {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('') || '?'
}

function slugifySpaceName(value = '') {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function isPathActive(pathname, to) {
  if (to === '/') return pathname === '/'
  return pathname === to || pathname.startsWith(`${to}/`)
}

const SidebarSectionLabel = memo(function SidebarSectionLabel({ children, onAdd, collapsible, expanded, onToggle }) {
  return (
    <div
      style={{ ...SECTION_LABEL_STYLE, display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingRight: 9, cursor: collapsible ? 'pointer' : 'default' }}
      onClick={collapsible ? onToggle : undefined}
    >
      <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        {children}
        {collapsible && (
          <ChevronDown size={11} style={{ opacity: 0.7, transform: expanded ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.15s' }} />
        )}
      </span>
      {onAdd && (
        <button
          type="button"
          onClick={onAdd}
          aria-label={`Add ${String(children).toLowerCase()}`}
          style={{ border: 'none', background: 'none', color: '#7A6F5E', fontSize: 15, lineHeight: 1, cursor: 'pointer', padding: '0 2px', display: 'flex', alignItems: 'center', fontWeight: 700 }}
          onMouseEnter={(e) => { e.currentTarget.style.color = '#4C2A92' }}
          onMouseLeave={(e) => { e.currentTarget.style.color = '#7A6F5E' }}
        >
          +
        </button>
      )}
    </div>
  )
})

// Styling lives in .sidebar-item classes (index.css) so re-renders don't
// rebuild style objects and hover doesn't mutate the DOM (BLW-04). Prefer the
// `to` prop over an inline onClick closure for plain navigation items — a
// stable string keeps React.memo effective when the parent re-renders.
const SidebarItem = memo(function SidebarItem({
  active,
  label,
  icon: Icon,
  badge,
  glyph,
  to,
  href,
  onClick,
  trailing,
}) {
  const navigate = useNavigate()

  function handleActivate() {
    if (onClick) onClick()
    else if (to) navigate(to)
  }

  if (href) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={active ? 'sidebar-item sidebar-item--active' : 'sidebar-item'}
      >
        {glyph ? (
          glyph
        ) : Icon ? (
          <Icon size={15} style={{ opacity: 0.85, color: 'inherit', flexShrink: 0 }} />
        ) : null}
        <span className="sidebar-item__label">
          {label}
        </span>
        {badge > 0 ? (
          <span className="sidebar-item__badge">
            {badge}
          </span>
        ) : null}
        {trailing ?? null}
      </a>
    )
  }

  return (
    <div
      role="button"
      tabIndex={0}
      className={active ? 'sidebar-item sidebar-item--active' : 'sidebar-item'}
      onClick={handleActivate}
      onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); handleActivate() } }}
      onMouseEnter={to ? () => preloadRoute(to) : undefined}
    >
      {glyph ? (
        glyph
      ) : Icon ? (
        <Icon size={15} style={{ opacity: 0.85, color: 'inherit', flexShrink: 0 }} />
      ) : null}
      <span className="sidebar-item__label">
        {label}
      </span>
      {badge > 0 ? (
        <span className="sidebar-item__badge">
          {badge}
        </span>
      ) : null}
      {trailing ?? null}
    </div>
  )
})

const SpaceGlyph = memo(function SpaceGlyph({ color, label }) {
  return (
    <span
      style={{
        width: 20,
        height: 20,
        borderRadius: 5,
        background: `#${color ?? '4C2A92'}`,
        color: '#FFFFFF',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 10,
        fontWeight: 700,
        flexShrink: 0,
      }}
    >
      {label}
    </span>
  )
})

const SprintGlyph = memo(function SprintGlyph({ label }) {
  return (
    <span
      style={{
        width: 20,
        height: 20,
        borderRadius: 5,
        background: '#4C2A92',
        color: '#FFFFFF',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 10,
        fontWeight: 700,
        flexShrink: 0,
      }}
    >
      {label}
    </span>
  )
})

const EmojiGlyph = memo(function EmojiGlyph({ emoji }) {
  return (
    <span
      style={{
        width: 20,
        height: 20,
        borderRadius: 5,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 14,
        flexShrink: 0,
      }}
    >
      {emoji || '🔗'}
    </span>
  )
})

export default function Sidebar({ isMobileDrawer = false }) {
  const { profile, role, signOut } = useAuth()
  const { inboxCount } = useInboxCount()
  const { activeSprints, planningSprints } = useSprints()
  const myTaskCounts = useMyTaskCounts(profile?.id)
  const navigate = useNavigate()
  const location = useLocation()
  const isExternalMember = Boolean(profile?.is_temporary)

  const [spaceGroups, setSpaceGroups] = useState({
    department: [],
    program: [],
    group: [],
    personal: [],
    sandbox: [],
    archived: [],
  })
  const [integrations, setIntegrations] = useState([])
  const [archivedOpen, setArchivedOpen] = useState(false)
  const [showSpaceModal, setShowSpaceModal] = useState(false)
  const [showSprintModal, setShowSprintModal] = useState(false)
  const [myTasksExpanded, setMyTasksExpanded] = useState(false)
  const [platformExpanded, setPlatformExpanded] = useState(false)
  const [editingSpace, setEditingSpace] = useState(null)
  const [hoveredSpaceId, setHoveredSpaceId] = useState(null)
  const [inlineRenameId, setInlineRenameId] = useState(null)
  const [inlineRenameValue, setInlineRenameValue] = useState('')
  // { type: 'list' | 'folder', space } → which create modal is open
  const [createModal, setCreateModal] = useState(null)
  // spaceId → bump count; forces SidebarSpaceTree reload after create
  const [treeVersions, setTreeVersions] = useState({})
  const [openQuickAddMenuId, setOpenQuickAddMenuId] = useState(null)
  const [spaceActionsOpenId, setSpaceActionsOpenId] = useState(null)
  const [openSpaceMenuId, setOpenSpaceMenuId] = useState(null)
  const [toolsExpanded, setToolsExpanded] = useState(false)
  const [adminExpanded, setAdminExpanded] = useState(false)
  const [helpExpanded, setHelpExpanded] = useState(false)
  const [feedbackOpen, setFeedbackOpen] = useState(false)
  const [regionalUpdatesExpanded, setRegionalUpdatesExpanded] = useState(false)
  const [hiddenSpaceIds, setHiddenSpaceIds] = useState(() => {
    // Defer to profile load, will initialize after
    return []
  })
  const [collapsedPref, setCollapsedPref] = useState(() => getItemSafe(CACHE_KEYS.SIDEBAR_COLLAPSED) === true)
  const collapsed = !isMobileDrawer && collapsedPref
  const [featureSearch, setFeatureSearch] = useState('')

  const [hasRegistrationAccess, setHasRegistrationAccess] = useState(false)
  const { config: eventConfig } = useEventConfig()
  useEffect(() => {
    let cancelled = false
    setHasRegistrationAccess(false)
    if (!profile?.id) return undefined
    const legacyTii = !eventConfig
    if ((legacyTii && ['pastor', 'super_admin', 'regional_secretary'].includes(role)) || (!legacyTii && ['super_admin', 'regional_secretary'].includes(role))) {
      setHasRegistrationAccess(true)
      return undefined
    }
    const sprintPattern = eventConfig?.sprint_pattern || '%This Is It 2.0%'
    const sidebarTeams = eventConfig?.sidebar_teams || [
      'Foundation School Graduation and Baptism', 'Secretariat and Planning', 'Registration', 'Secretariat Programs',
      'Finance', 'Transportation', 'Delegates Compliance', 'Accommodation and Room Coordination', 'Hospitality — Delegates',
    ]
    ;(async () => {
      const { data: sprint } = await supabase
        .from('sprints').select('id').ilike('name', sprintPattern).limit(1).maybeSingle()
      if (!sprint?.id) return
      const { data: teams } = await supabase
        .from('sprint_teams').select('id, name').eq('sprint_id', sprint.id)
      if (!teams?.length) return
      const allowed = teams.filter(t => sidebarTeams.some(a => t.name.toLowerCase().includes(a.toLowerCase()))).map(t => t.id)
      if (!allowed.length) return
      const { data: membership } = await supabase
        .from('sprint_team_members').select('team_id').in('team_id', allowed).eq('user_id', profile.id).limit(1)
      if (!cancelled && membership?.length) setHasRegistrationAccess(true)
    })()
    return () => { cancelled = true }
  }, [profile?.id, role, eventConfig])
  const sidebarRef = useRef(null)

  // ors/programs/media/dept_lead authority comes from space_roles rows
  // (Phase 3); users.role only ever holds the base roles now.
  const isSpaceManager = ['ors', 'programs', 'media', 'dept_lead'].some((r) => hasSpaceRole(profile, null, r))
  const canCreateSpace = ['super_admin', 'dept_lead', 'regional_secretary', 'pastor'].includes(role) || isSpaceManager
  const canManageSpaces = canCreateSpace
  const showPeople = ['super_admin', 'dept_lead', 'regional_secretary', 'pastor'].includes(role) || isSpaceManager
  const showAdminPlatform = role === 'super_admin' || role === 'regional_secretary' || role === 'dept_lead' ||
    hasSpaceRole(profile, null, 'dept_lead') || hasGrant(profile, 'regional_secretary_access')
  // Group members are restricted: no platform access (meetings, calendar tools,
  // communications, map), no people management, and no Sprints unless they've
  // been added to a specific sprint (RLS scopes displayedSprints to theirs).
  const isGroupMember = role === 'group_member'
  const hasAnyPlatformAccess =
    showAdminPlatform ||
    role === 'pastor' ||
    (INSTAGRAM_GRADING_ENABLED && (['super_admin', 'regional_secretary'].includes(role) || hasSpaceRole(profile, null, 'media'))) ||
    hasSpaceRole(profile, null, 'ors') ||
    FLOCK_CRM_CONFIG.checkAccess(role)
  const isPlatformExpanded = platformExpanded

  async function loadSpaces() {
    if (!profile?.id || !role) return
    const groups = await getSpacesByType(profile.id, role, profile.department_id)
    setSpaceGroups(groups)
  }

  useEffect(() => {
    loadSpaces().catch((error) => {
      console.error('Failed to load spaces', error)
    })
  }, [profile?.department_id, profile?.id, role])

  useEffect(() => {
    if (profile?.id) {
      const cacheKey = CACHE_KEYS.HIDDEN_SPACES(profile.id)
      const cached = getItemSafe(cacheKey)
      if (cached && Array.isArray(cached)) {
        setHiddenSpaceIds(cached)
      }
    }
  }, [profile?.id])

  useEffect(() => {
    if (profile?.id) {
      const cacheKey = CACHE_KEYS.HIDDEN_SPACES(profile.id)
      setItemSafe(cacheKey, hiddenSpaceIds)
    }
  }, [hiddenSpaceIds, profile?.id])

  function toggleCollapsed() {
    setCollapsedPref((value) => {
      const next = !value
      setItemSafe(CACHE_KEYS.SIDEBAR_COLLAPSED, next)
      return next
    })
  }

  useEffect(() => {
    let active = true
    if (!profile?.id) return

    supabase
      .from('external_integrations')
      .select('id, name, type, enabled, show_in_sidebar, sort_order, icon_emoji, launch_url, description, scope, department_ids, user_ids')
      .eq('enabled', true)
      .eq('show_in_sidebar', true)
      .order('sort_order')
      .then(({ data, error }) => {
        if (error) {
          console.error('Failed to load integrations', error)
          return
        }

        if (!active) return

        // Client-side scope filter — guards against stale JWT claims missing
        // department from RLS, ensuring department-scoped integrations are shown
        // to the right users even if their token hasn't refreshed yet.
        const userId = profile.id
        const deptId = profile.department_id ?? null

        const filtered = (data ?? []).filter((integration) => {
          const scope = integration.scope ?? 'global'
          if (scope === 'global') return true
          if (scope === 'departments') {
            const ids = integration.department_ids ?? []
            return ids.length === 0 || (deptId && ids.includes(deptId))
          }
          if (scope === 'users') {
            const ids = integration.user_ids ?? []
            return ids.length === 0 || ids.includes(userId)
          }
          return true
        })

        setIntegrations(filtered)
      })

    return () => {
      active = false
    }
  }, [profile?.id, profile?.department_id])

  const hideUnassignedExternalSpaces = isExternalMember && !profile?.department_id
  const displaySpaces = useMemo(
    () => SPACE_GROUPS
      .flatMap((groupKey) => spaceGroups[groupKey] ?? [])
      .filter((space) => !hiddenSpaceIds.includes(space.id))
      .filter((space) => !hideUnassignedExternalSpaces || ['group', 'personal'].includes(space.space_type)),
    [hiddenSpaceIds, hideUnassignedExternalSpaces, spaceGroups],
  )
  const archivedSpaces = (spaceGroups.archived ?? [])
    .filter((space) => !hiddenSpaceIds.includes(space.id))
    .filter((space) => !hideUnassignedExternalSpaces || ['group', 'personal'].includes(space.space_type))
  const shouldShowSpaces = displaySpaces.length > 0 || archivedSpaces.length > 0 || !hideUnassignedExternalSpaces
  const displayedSprints = useMemo(
    () => [...activeSprints, ...planningSprints].slice(0, 8),
    [activeSprints, planningSprints],
  )
  const initials = getInitials(profile?.name)

  function go(path) {
    navigate(path)
  }

  function openExternal(path) {
    window.open(path, '_blank', 'noopener,noreferrer')
  }

  useEffect(() => {
    function handleDocumentClick(event) {
      if (!sidebarRef.current?.contains(event.target) && !openSpaceMenuId && !openQuickAddMenuId) {
        setSpaceActionsOpenId(null)
      }
    }

    document.addEventListener('mousedown', handleDocumentClick)
    return () => document.removeEventListener('mousedown', handleDocumentClick)
  }, [openSpaceMenuId, openQuickAddMenuId])

  function bumpTreeVersion(spaceId) {
    setTreeVersions((current) => ({ ...current, [spaceId]: (current[spaceId] ?? 0) + 1 }))
  }

  async function handleArchiveSpace(space) {
    const { error } = await supabase.from('departments').update({ status: 'archived' }).eq('id', space.id)
    if (error) throw error
    await loadSpaces()
  }

  async function handleRestoreSpace(space) {
    const { error } = await supabase.from('departments').update({ status: 'active' }).eq('id', space.id)
    if (error) throw error
    await loadSpaces()
  }

  async function handleCopySpaceLink(space) {
    const url = `${window.location.origin}/spaces/${space.id}`
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(url)
      return
    }
    window.prompt('Copy space link', url)
  }

  async function handleDeleteSpace(space) {
    if (!window.confirm(`Delete ${space.name}? This cannot be undone.`)) return
    const { error } = await supabase.from('departments').delete().eq('id', space.id)
    if (error) throw error
    await loadSpaces()
  }

  async function handleRenameSpace(space) {
    const nextName = inlineRenameValue.trim()
    if (!nextName) return

    const nextSlug = slugifySpaceName(nextName)
    const { error } = await supabase
      .from('departments')
      .update({ name: nextName, slug: nextSlug })
      .eq('id', space.id)

    if (error) throw error

    setInlineRenameId(null)
    setInlineRenameValue('')
    await loadSpaces()
  }

  function handleHideSpace(spaceId) {
    setHiddenSpaceIds((current) => (current.includes(spaceId) ? current : [...current, spaceId]))
  }

  return (
    <aside
      ref={sidebarRef}
      style={{
        position: 'relative',
        width: collapsed ? 64 : 222,
        background: '#FAFAF8',
        borderRight: '1px solid #EDE8DC',
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        flexShrink: 0,
        fontFamily: FONT_BODY,
        transition: 'width 0.16s ease',
      }}
    >
      <div
        style={{
          padding: collapsed ? '10px 8px' : '10px 10px 10px 14px',
          borderBottom: '1px solid #EDE8DC',
          display: 'flex',
          alignItems: 'center',
          justifyContent: collapsed ? 'center' : 'space-between',
          gap: 8,
        }}
      >
        {collapsed ? (
          <button
            type="button"
            onClick={!isMobileDrawer ? toggleCollapsed : undefined}
            aria-label="Expand sidebar"
            title="Expand sidebar"
            style={{
              border: 'none',
              background: 'none',
              padding: 6,
              borderRadius: 7,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#7A6F5E',
              cursor: 'pointer',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = '#EDE8DC'; e.currentTarget.style.color = '#4C2A92' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = '#7A6F5E' }}
          >
            <PanelLeft size={18} />
          </button>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  flexShrink: 0,
                  background: 'linear-gradient(135deg, #4C2A92 0%, #6B4BBE 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 2px 8px rgba(76,42,146,0.16)',
                }}
              >
                <img
                  src="/canada_sr.png"
                  alt="BLW CAN NEXUS"
                  width="22"
                  height="22"
                  style={{ width: 22, height: 22, objectFit: 'contain', filter: 'brightness(0) invert(1)' }}
                />
              </div>
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 800,
                    color: '#1C1610',
                    lineHeight: 1.15,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  BLW CAN NEXUS
                </div>
                <div
                  style={{
                    fontSize: 9,
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.16em',
                    color: '#B0A696',
                    marginTop: 2,
                  }}
                >
                  Operations
                </div>
              </div>
            </div>
            {!isMobileDrawer && (
              <button
                type="button"
                onClick={toggleCollapsed}
                aria-label="Collapse sidebar"
                title="Collapse sidebar"
                style={{
                  border: 'none',
                  background: 'none',
                  padding: 6,
                  borderRadius: 7,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#B0A696',
                  cursor: 'pointer',
                  flexShrink: 0,
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = '#EDE8DC'; e.currentTarget.style.color = '#4C2A92' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = '#B0A696' }}
              >
                <PanelLeft size={16} />
              </button>
            )}
          </>
        )}
      </div>

      <div className={collapsed ? 'sidebar-nav sidebar-nav--collapsed' : 'sidebar-nav'} style={{ flex: 1, overflowY: 'auto', padding: '8px 6px 12px' }}>
        {!collapsed && (
          <div style={{ position: 'relative', marginBottom: 8 }}>
            <Search size={12} color="#B0A696" style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
            <input
              type="text"
              value={featureSearch}
              onChange={(e) => setFeatureSearch(e.target.value)}
              placeholder="Search features…"
              style={{
                width: '100%', boxSizing: 'border-box',
                paddingLeft: 28, paddingRight: featureSearch ? 26 : 10,
                paddingTop: 6, paddingBottom: 6,
                border: '1px solid #EDE8DC', borderRadius: 7,
                fontSize: 12, fontFamily: 'inherit', outline: 'none',
                background: '#F7F4EF', color: '#2D2A22',
              }}
              onFocus={(e) => { e.currentTarget.style.borderColor = '#4C2A92'; e.currentTarget.style.background = '#fff' }}
              onBlur={(e) => { e.currentTarget.style.borderColor = '#EDE8DC'; e.currentTarget.style.background = '#F7F4EF' }}
            />
            {featureSearch && (
              <button
                onClick={() => setFeatureSearch('')}
                style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'transparent', color: '#B0A696', cursor: 'pointer', display: 'flex', padding: 1, lineHeight: 1 }}
              >
                ×
              </button>
            )}
            {featureSearch && (() => {
              const q = featureSearch.toLowerCase()
              const isAdmin = ['super_admin', 'regional_secretary'].includes(role)
              const isMeetingsRole = ['super_admin', 'regional_secretary', 'dept_lead', 'ors', 'programs'].includes(role)
              const all = [
                // Workspace
                { label: 'Dashboard', to: '/dashboard', icon: LayoutGrid },
                { label: 'Inbox', to: '/inbox', icon: Bell },
                { label: 'My Tasks', to: '/my-tasks', icon: CheckCircle2 },
                { label: 'Today & Tomorrow', to: '/my-tasks/today', icon: CalendarClock },
                { label: 'Personal List', to: '/personal-list', icon: Lock },
                { label: 'Planner', to: '/planner', icon: Clock },
                { label: 'Ministry Calendar', to: '/calendar', icon: CalendarDays },
                { label: 'Notifications', to: '/notifications', icon: Bell },
                { label: 'Activity Log', to: '/activity-log', icon: Zap },
                { label: 'Trash', to: '/trash', icon: Trash2 },
                // Apps (not in main sidebar nav)
                ...(!isExternalMember ? [{ label: 'Apps', to: '/apps', icon: Trophy }] : []),
                { label: 'Wins', to: '/wins', icon: Trophy },
                ...(['super_admin'].includes(role) ? [{ label: 'Growth Tracking', to: '/growth-tracking', icon: TrendingUp }] : []),
                // Sprints
                { label: 'All Sprints', to: '/sprints', icon: Zap },
                // Meetings
                ...(!isExternalMember ? [
                  { label: 'Meetings', to: '/meetings', icon: Video },
                  { label: 'Attendee Roster', to: '/meetings/expected-attendees', icon: Users },
                  ...(isMeetingsRole ? [
                    { label: 'Attendance Trends', to: '/meetings/attendance-trends', icon: TrendingUp },
                    { label: 'Absence Email Log', to: '/meetings/absence-email-log', icon: Mail },
                    { label: 'Meeting Minutes', to: '/meetings/minutes', icon: MailPlus },
                  ] : []),
                ] : []),
                // Communications
                ...(isMeetingsRole ? [
                  { label: 'Communications', to: '/communications', icon: Send },
                  { label: 'Campaigns', to: '/communications/campaigns', icon: Mail },
                  { label: 'Email Templates', to: '/communications/templates', icon: MailPlus },
                  { label: 'Recipients', to: '/communications/recipients', icon: Users },
                  { label: 'Segments', to: '/communications/segments', icon: Users2 },
                  { label: 'Email Analytics', to: '/communications/analytics', icon: TrendingUp },
                  { label: 'Invitations', to: '/communications/invitations', icon: Send },
                  { label: 'Absentee Follow-up', to: '/communications/absentees', icon: Mail },
                ] : []),
                // People
                ...(isAdmin ? [
                  { label: 'People Management', to: '/people', icon: Users2 },
                  { label: 'Users', to: '/people/users', icon: Users },
                  { label: 'Invitations', to: '/people/invitations', icon: MailPlus },
                  { label: 'Departments', to: '/people/departments', icon: Network },
                  { label: 'Pastoral Assignments', to: '/people/pastoral-assignments', icon: Users },
                  { label: 'Permissions', to: '/people/permissions', icon: Settings },
                ] : []),
                // My Flock
                ...(['regional_secretary', 'pastor', 'super_admin'].includes(role) ? [{ label: 'My Flock', to: '/flock', icon: Users }] : []),
                ...(role === 'super_admin' ? [{ label: 'Flock CRM', to: '/flock-crm', icon: Network }] : []),
                // Registration
                ...(hasRegistrationAccess ? [{ label: 'This Is It Registration', to: '/registration', icon: CheckCircle2 }] : []),
                // Admin tools
                ...(isAdmin ? [
                  { label: 'Instagram Grading', to: '/instagram', icon: Image },
                  { label: 'CAN Map', to: '/map', icon: Map },

                  { label: 'Org Chart', to: '/org', icon: Network },
                  { label: 'Automations', to: '/automations', icon: Zap },
                  { label: 'Calendar Management', to: '/calendar-management', icon: CalendarDays },
                  { label: 'Campus Photos', to: '/settings/campus-photos', icon: Image },
                  { label: 'Support Tickets', to: '/admin/tickets', icon: HeadphonesIcon },
                  { label: 'Email Management', to: '/admin/emails', icon: Mail },
                  { label: 'Nova Review', to: '/admin/nova-review', icon: Sparkles },
                ] : []),
                // Settings
                { label: 'Settings', to: '/settings', icon: Settings },
                { label: 'Integrations', to: '/settings/integrations', icon: Settings },
                { label: 'Personal Integrations', to: '/settings/personal-integrations', icon: Settings },
                // Learning
                ...(role === 'super_admin' ? [{ label: 'Books / Library', to: '/books', icon: Library }] : []),
                // Help
                { label: 'Help & FAQ', to: '/help', icon: HelpCircle },
                { label: 'Get Support', to: '/support', icon: HeadphonesIcon },
              ]
              const matches = all.filter((item) => item.label.toLowerCase().includes(q))
              if (!matches.length) return (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 200, background: '#fff', border: '1px solid #EDE8DC', borderRadius: 8, marginTop: 4, padding: '8px 6px', fontSize: 11.5, color: '#9E9488', textAlign: 'center' }}>
                  No features found
                </div>
              )
              return (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 200, background: '#fff', border: '1px solid #EDE8DC', borderRadius: 8, marginTop: 4, boxShadow: '0 4px 12px rgba(0,0,0,0.08)', overflow: 'hidden' }}>
                  {matches.map(({ label, to, icon: Icon }) => (
                    <div
                      key={to + label}
                      role="button"
                      tabIndex={0}
                      onClick={() => { navigate(to); setFeatureSearch('') }}
                      onKeyDown={(e) => { if (e.key === 'Enter') { navigate(to); setFeatureSearch('') } }}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', cursor: 'pointer', fontSize: 12.5, color: '#2D2A22', fontWeight: 500 }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = '#F7F4EF' }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                    >
                      <Icon size={13} style={{ color: '#9E9488', flexShrink: 0 }} />
                      {label}
                    </div>
                  ))}
                </div>
              )
            })()}
          </div>
        )}
        {!collapsed && !featureSearch && <SidebarSectionLabel>Workspace</SidebarSectionLabel>}
        <SidebarItem
          active={isPathActive(location.pathname, '/dashboard')}
          icon={LayoutGrid}
          label="Dashboard"
          to="/dashboard"
        />
        <SidebarItem
          active={isPathActive(location.pathname, '/inbox')}
          icon={Bell}
          label="Inbox"
          badge={inboxCount > 0 ? inboxCount : 0}
          to="/inbox"
        />
        {collapsed ? (
          <SidebarItem
            active={isPathActive(location.pathname, '/my-tasks')}
            icon={Check}
            label="My Tasks"
            onClick={() => go('/my-tasks')}
          />
        ) : (
          <>
            <div
              style={{
                ...ITEM_BASE_STYLE,
                borderLeft: location.pathname === '/my-tasks' ? '3px solid #4C2A92' : '3px solid transparent',
                background: location.pathname === '/my-tasks' ? '#EDE8F8' : 'transparent',
                color: location.pathname === '/my-tasks' ? '#4C2A92' : '#1C1610',
                fontWeight: location.pathname === '/my-tasks' ? 700 : 500,
                display: 'flex',
                alignItems: 'center',
                gap: 10,
              }}
              onMouseEnter={(e) => {
                if (location.pathname !== '/my-tasks') e.currentTarget.style.background = '#F2EEE6'
              }}
              onMouseLeave={(e) => {
                if (location.pathname !== '/my-tasks') e.currentTarget.style.background = 'transparent'
              }}
            >
              <Check size={15} style={{ opacity: 0.85, flexShrink: 0 }} />
              <button
                type="button"
                onClick={() => go('/my-tasks')}
                style={{ flex: 1, border: 'none', background: 'transparent', color: 'inherit', cursor: 'pointer', textAlign: 'left', padding: 0, fontFamily: 'inherit', fontSize: 'inherit' }}
              >
                My Tasks
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  setMyTasksExpanded(!myTasksExpanded)
                }}
                style={{ border: 'none', background: 'none', padding: '0 2px', display: 'flex', alignItems: 'center', cursor: 'pointer', color: 'inherit' }}
              >
                <ChevronDown size={15} style={{ opacity: 0.85, transform: myTasksExpanded ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.15s' }} />
              </button>
            </div>
            {myTasksExpanded ? (
              <div style={{ paddingLeft: 18 }}>
                <SidebarItem
                  active={isPathActive(location.pathname, '/my-tasks/today')}
                  icon={CalendarClock}
                  label="Today & Tomorrow"
                  badge={myTaskCounts.todayTomorrow}
                  to="/my-tasks/today"
                />
              </div>
            ) : null}
          </>
        )}
        <SidebarItem
          active={isPathActive(location.pathname, '/personal-list')}
          icon={Lock}
          label="Personal List"
          to="/personal-list"
        />
        <SidebarItem
          active={isPathActive(location.pathname, '/planner')}
          icon={Clock}
          label="Planner"
          to="/planner"
        />
        {!isExternalMember ? (
          <SidebarItem
            active={isPathActive(location.pathname, '/apps')}
            icon={Trophy}
            label="Apps"
            to="/apps"
          />
        ) : null}
        <SidebarItem
          active={isPathActive(location.pathname, '/calendar')}
          icon={CalendarDays}
          label="Ministry Calendar"
          to="/calendar"
        />
        {(['regional_secretary', 'pastor', 'super_admin'].includes(role)) ? (
          <SidebarItem
            active={isPathActive(location.pathname, '/flock')}
            icon={Users}
            label="My Flock"
            to="/flock"
          />
        ) : null}
        {hasRegistrationAccess && (
          <SidebarItem
            active={isPathActive(location.pathname, '/registration')}
            icon={CheckCircle2}
            label="This Is It Registration"
            to="/registration"
          />
        )}
        {!collapsed && shouldShowSpaces && <SidebarSectionLabel onAdd={canCreateSpace ? () => setShowSpaceModal(true) : undefined}>Spaces</SidebarSectionLabel>}
        {displaySpaces.map((space) => (
          <div
            key={space.id}
            style={{ position: 'relative' }}
            onMouseEnter={() => setHoveredSpaceId(space.id)}
            onMouseLeave={() => setHoveredSpaceId((current) => (current === space.id ? null : current))}
          >
            <SidebarItem
              active={isPathActive(location.pathname, `/spaces/${space.id}`)}
              label={inlineRenameId === space.id ? (
                <input
                  autoFocus
                  value={inlineRenameValue}
                  onChange={(event) => setInlineRenameValue(event.target.value)}
                  onClick={(event) => event.stopPropagation()}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      handleRenameSpace(space).catch(console.error)
                    }
                    if (event.key === 'Escape') {
                      setInlineRenameId(null)
                      setInlineRenameValue('')
                    }
                  }}
                  onBlur={() => {
                    if (inlineRenameValue.trim()) {
                      handleRenameSpace(space).catch(console.error)
                    } else {
                      setInlineRenameId(null)
                      setInlineRenameValue('')
                    }
                  }}
                  style={{
                    width: '100%',
                    border: '1px solid #D9D1C3',
                    borderRadius: 6,
                    padding: '4px 6px',
                    fontSize: 12,
                    background: '#FFFFFF',
                  }}
                />
              ) : space.name}
              glyph={<SpaceGlyph color={space.color} label={space.name?.charAt(0)?.toUpperCase() ?? '?'} />}
              trailing={!collapsed && (hoveredSpaceId === space.id || openSpaceMenuId === space.id || openQuickAddMenuId === space.id) ? (
                <motion.div
                  initial={{ opacity: 0, x: 4 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.14 }}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
                >
                  <DropdownMenu.Root open={openQuickAddMenuId === space.id} onOpenChange={(open) => setOpenQuickAddMenuId(open ? space.id : null)}>
                    <DropdownMenu.Trigger asChild>
                      {/* Hex literals in motion targets mirror tokens (CSS vars
                          aren't interpolable): #5F3BB8 = --purple-600 */}
                      <motion.button
                        type="button"
                        onClick={(event) => event.stopPropagation()}
                        aria-label={`Add to ${space.name}`}
                        whileHover={{ backgroundColor: '#5F3BB8', color: '#FFFFFF' }}
                        whileTap={{ scale: 0.9 }}
                        style={{
                          width: 22,
                          height: 22,
                          border: 'none',
                          background: openQuickAddMenuId === space.id ? '#5F3BB8' : 'rgba(95,59,184,0)',
                          borderRadius: 6,
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: openQuickAddMenuId === space.id ? '#FFFFFF' : '#6D6860',
                          cursor: 'pointer',
                          flexShrink: 0,
                        }}
                      >
                        <Plus size={14} />
                      </motion.button>
                    </DropdownMenu.Trigger>
                    <DropdownMenu.Portal>
                      <DropdownMenu.Content
                        side="right"
                        align="start"
                        sideOffset={8}
                        collisionPadding={8}
                        onCloseAutoFocus={(event) => event.preventDefault()}
                        style={{
                          minWidth: 180,
                          background: '#FFFFFF',
                          border: '1px solid var(--border-1)',
                          borderRadius: 12,
                          boxShadow: '0 8px 28px rgba(28,22,16,.14)',
                          padding: 6,
                          zIndex: 60,
                        }}
                      >
                        <DropdownMenu.Item
                          onSelect={() => setCreateModal({ type: 'list', space })}
                          className="cu-menu-item" style={{ display: 'flex', alignItems: 'center', gap: 8, borderRadius: 8, padding: '8px 10px', fontSize: 12.5, cursor: 'pointer', outline: 'none' }}
                        >
                          <LayoutGrid size={14} />
                          <div>
                            <div>List</div>
                            <div style={{ fontSize: 10.5, color: 'var(--ink-3)' }}>Track tasks, projects & more</div>
                          </div>
                        </DropdownMenu.Item>
                        <DropdownMenu.Item
                          onSelect={() => setCreateModal({ type: 'folder', space })}
                          className="cu-menu-item" style={{ display: 'flex', alignItems: 'center', gap: 8, borderRadius: 8, padding: '8px 10px', fontSize: 12.5, cursor: 'pointer', outline: 'none' }}
                        >
                          <Folder size={14} />
                          <div>
                            <div>Folder</div>
                            <div style={{ fontSize: 10.5, color: 'var(--ink-3)' }}>Group Lists & more</div>
                          </div>
                        </DropdownMenu.Item>
                      </DropdownMenu.Content>
                    </DropdownMenu.Portal>
                  </DropdownMenu.Root>
                  {canManageSpaces ? (
                    <DropdownMenu.Root open={openSpaceMenuId === space.id} onOpenChange={(open) => setOpenSpaceMenuId(open ? space.id : null)}>
                      <DropdownMenu.Trigger asChild>
                        <motion.button
                          type="button"
                          onClick={(event) => event.stopPropagation()}
                          aria-label={`More options for ${space.name}`}
                          whileHover={{ backgroundColor: '#5F3BB8', color: '#FFFFFF' }}
                          whileTap={{ scale: 0.9 }}
                          style={{
                            width: 22,
                            height: 22,
                            border: 'none',
                            background: openSpaceMenuId === space.id ? '#5F3BB8' : 'rgba(95,59,184,0)',
                            borderRadius: 6,
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: openSpaceMenuId === space.id ? '#FFFFFF' : '#6D6860',
                            cursor: 'pointer',
                            flexShrink: 0,
                          }}
                        >
                          <MoreHorizontal size={14} />
                        </motion.button>
                      </DropdownMenu.Trigger>
                      <DropdownMenu.Portal>
                        <DropdownMenu.Content
                          side="right"
                          align="start"
                          sideOffset={8}
                          collisionPadding={8}
                          onCloseAutoFocus={(event) => event.preventDefault()}
                          style={{
                            minWidth: 196,
                            background: '#FFFFFF',
                            border: '1px solid var(--border-1)',
                            borderRadius: 12,
                            boxShadow: '0 8px 28px rgba(28,22,16,.14)',
                            padding: 6,
                            zIndex: 60,
                          }}
                        >
                          <DropdownMenu.Item
                            onSelect={() => {
                              setInlineRenameId(space.id)
                              setInlineRenameValue(space.name)
                            }}
                            className="cu-menu-item" style={{ display: 'flex', alignItems: 'center', gap: 8, borderRadius: 8, padding: '8px 10px', fontSize: 12.5, cursor: 'pointer', outline: 'none' }}
                          >
                            <Pencil size={14} />
                            <span>Rename</span>
                          </DropdownMenu.Item>
                          <DropdownMenu.Item
                            onSelect={() => navigate(`/dept/${slugifySpaceName(space.slug ?? space.name)}`)}
                            className="cu-menu-item" style={{ display: 'flex', alignItems: 'center', gap: 8, borderRadius: 8, padding: '8px 10px', fontSize: 12.5, cursor: 'pointer', outline: 'none' }}
                          >
                            <Settings size={14} />
                            <span>Task Statuses</span>
                          </DropdownMenu.Item>
                          <DropdownMenu.Item
                            onSelect={() => handleHideSpace(space.id)}
                            className="cu-menu-item" style={{ display: 'flex', alignItems: 'center', gap: 8, borderRadius: 8, padding: '8px 10px', fontSize: 12.5, cursor: 'pointer', outline: 'none' }}
                          >
                            <EyeOff size={14} />
                            <span>Hide Space</span>
                          </DropdownMenu.Item>
                          {role === 'super_admin' ? (
                            <DropdownMenu.Item
                              onSelect={() => {
                                if (space.status === 'archived') {
                                  handleRestoreSpace(space).catch(console.error)
                                } else {
                                  handleArchiveSpace(space).catch(console.error)
                                }
                              }}
                              className="cu-menu-item" style={{ display: 'flex', alignItems: 'center', gap: 8, borderRadius: 8, padding: '8px 10px', fontSize: 12.5, cursor: 'pointer', outline: 'none' }}
                            >
                              <Archive size={14} />
                              <span>{space.status === 'archived' ? 'Restore' : 'Archive'}</span>
                            </DropdownMenu.Item>
                          ) : null}
                          {role === 'super_admin' ? (
                            <DropdownMenu.Item
                              onSelect={() => handleDeleteSpace(space).catch(console.error)}
                              className="cu-menu-item cu-menu-item-danger" style={{ display: 'flex', alignItems: 'center', gap: 8, borderRadius: 8, padding: '8px 10px', fontSize: 12.5, cursor: 'pointer', outline: 'none', color: 'var(--accent-red)' }}
                            >
                              <Trash2 size={14} />
                              <span>Delete</span>
                            </DropdownMenu.Item>
                          ) : null}
                        </DropdownMenu.Content>
                      </DropdownMenu.Portal>
                    </DropdownMenu.Root>
                  ) : null}
                </motion.div>
              ) : null}
              onClick={() => go(`/spaces/${space.id}`)}
            />
            {!collapsed && (
              <SidebarSpaceTree
                spaceId={space.id}
                spaceName={space.name}
                spaceColor={space.color}
                isActive={isPathActive(location.pathname, `/spaces/${space.id}`)}
                canManage={canManageSpaces}
                refreshToken={treeVersions[space.id] ?? 0}
              />
            )}
          </div>
        ))}
        {!collapsed && archivedSpaces.length > 0 ? (
          <>
            <button
              type="button"
              onClick={() => setArchivedOpen((value) => !value)}
              style={{
                ...ITEM_BASE_STYLE,
                padding: '5px 9px 4px',
                color: '#B0A696',
                fontSize: 11,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                marginTop: 2,
              }}
            >
              <span style={{ flex: 1 }}>Archived</span>
              <ChevronDown
                size={14}
                style={{
                  color: '#B0A696',
                  transform: archivedOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                  transition: 'transform 130ms ease',
                }}
              />
            </button>
            {archivedOpen
              ? archivedSpaces.map((space) => (
                  <div key={space.id} style={{ position: 'relative' }}>
                    <SidebarItem
                      active={isPathActive(location.pathname, `/spaces/${space.id}`)}
                      label={space.name}
                      glyph={<SpaceGlyph color={space.color} label={space.name?.charAt(0)?.toUpperCase() ?? '?'} />}
                      trailing={canManageSpaces ? (
                        <motion.button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation()
                            setOpenSpaceMenuId((current) => current === space.id ? null : space.id)
                          }}
                          aria-label={`More options for ${space.name}`}
                          title={`More options for ${space.name}`}
                          whileHover={{ backgroundColor: '#5F3BB8', color: '#FFFFFF' }}
                          whileTap={{ scale: 0.9 }}
                          style={{
                            width: 22,
                            height: 22,
                            border: 'none',
                            background: openSpaceMenuId === space.id ? '#5F3BB8' : 'rgba(95,59,184,0)',
                            borderRadius: 6,
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: openSpaceMenuId === space.id ? '#FFFFFF' : '#6D6860',
                            cursor: 'pointer',
                            flexShrink: 0,
                          }}
                        >
                          <MoreHorizontal size={14} />
                        </motion.button>
                      ) : null}
                      onClick={() => go(`/spaces/${space.id}`)}
                    />
                    {openSpaceMenuId === space.id ? (
                      <DropdownMenu.Root open={openSpaceMenuId === space.id} onOpenChange={(open) => setOpenSpaceMenuId(open ? space.id : null)}>
                        <DropdownMenu.Portal>
                          <DropdownMenu.Content
                            side="right"
                            align="start"
                            sideOffset={8}
                            collisionPadding={8}
                            onCloseAutoFocus={(event) => event.preventDefault()}
                            style={{
                              minWidth: 196,
                              background: '#FFFFFF',
                              border: '1px solid var(--border-1)',
                              borderRadius: 12,
                              boxShadow: '0 8px 28px rgba(28,22,16,.14)',
                              padding: 6,
                              zIndex: 60,
                            }}
                          >
                            <DropdownMenu.Item
                              onSelect={() => {
                                setInlineRenameId(space.id)
                                setInlineRenameValue(space.name)
                              }}
                              className="cu-menu-item" style={{ display: 'flex', alignItems: 'center', gap: 8, borderRadius: 8, padding: '8px 10px', fontSize: 12.5, cursor: 'pointer', outline: 'none' }}
                            >
                              <Pencil size={14} />
                              <span>Rename</span>
                            </DropdownMenu.Item>
                            <DropdownMenu.Item
                              onSelect={() => navigate(`/dept/${slugifySpaceName(space.slug ?? space.name)}?openStatuses=true`)}
                              className="cu-menu-item" style={{ display: 'flex', alignItems: 'center', gap: 8, borderRadius: 8, padding: '8px 10px', fontSize: 12.5, cursor: 'pointer', outline: 'none' }}
                            >
                              <Settings size={14} />
                              <span>Task Statuses</span>
                            </DropdownMenu.Item>
                            <DropdownMenu.Item
                              onSelect={() => handleHideSpace(space.id)}
                              className="cu-menu-item" style={{ display: 'flex', alignItems: 'center', gap: 8, borderRadius: 8, padding: '8px 10px', fontSize: 12.5, cursor: 'pointer', outline: 'none' }}
                            >
                              <EyeOff size={14} />
                              <span>Hide Space</span>
                            </DropdownMenu.Item>
                            {role === 'super_admin' ? (
                              <DropdownMenu.Item
                                onSelect={() => {
                                  if (space.status === 'archived') {
                                    handleRestoreSpace(space).catch(console.error)
                                  } else {
                                    handleArchiveSpace(space).catch(console.error)
                                  }
                                }}
                                className="cu-menu-item" style={{ display: 'flex', alignItems: 'center', gap: 8, borderRadius: 8, padding: '8px 10px', fontSize: 12.5, cursor: 'pointer', outline: 'none' }}
                              >
                                <Archive size={14} />
                                <span>{space.status === 'archived' ? 'Restore' : 'Archive'}</span>
                              </DropdownMenu.Item>
                            ) : null}
                            {role === 'super_admin' ? (
                              <DropdownMenu.Item
                                onSelect={() => handleDeleteSpace(space).catch(console.error)}
                                className="cu-menu-item cu-menu-item-danger" style={{ display: 'flex', alignItems: 'center', gap: 8, borderRadius: 8, padding: '8px 10px', fontSize: 12.5, cursor: 'pointer', outline: 'none', color: 'var(--accent-red)' }}
                              >
                                <Trash2 size={14} />
                                <span>Delete</span>
                              </DropdownMenu.Item>
                            ) : null}
                          </DropdownMenu.Content>
                        </DropdownMenu.Portal>
                      </DropdownMenu.Root>
                    ) : null}
                  </div>
                ))
              : null}
          </>
        ) : null}
        {/* Group members only see Sprints once added to one; otherwise the
            whole section (label + All Sprints browse link) is hidden. */}
        {!collapsed && (!isGroupMember || displayedSprints.length > 0) ? (
          <SidebarSectionLabel onAdd={canCreateSpace ? () => setShowSprintModal(true) : undefined}>Sprints</SidebarSectionLabel>
        ) : null}
        {displayedSprints.map((sprint) => (
          <SidebarItem
            key={sprint.id}
            active={isPathActive(location.pathname, `/sprints/${sprint.id}`)}
            label={sprint.name}
            glyph={<SprintGlyph label={sprint.name?.charAt(0)?.toUpperCase() ?? '?'} />}
            trailing={
              <span
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: 999,
                  background: sprint.status === 'active' ? '#2D8653' : '#C9C0B0',
                  flexShrink: 0,
                }}
              />
            }
            onClick={() => go(`/sprints/${sprint.id}`)}
          />
        ))}
        {!isGroupMember ? (
          <SidebarItem
            active={location.pathname === '/sprints'}
            label="All Sprints"
            glyph={
              <span style={{ width: 20, flex: '0 0 20px', textAlign: 'center', fontSize: 14, opacity: 0.7 }}>◈</span>
            }
            to="/sprints"
          />
        ) : null}

        {/* Platform (meetings, communications, map, campus, flock) is hidden
            entirely for group members — they have no platform access. */}
        {!isGroupMember ? (
        <>
        {!collapsed && <SidebarSectionLabel>Tools</SidebarSectionLabel>}
        {!isExternalMember && (
        <>
        {collapsed ? (
          <SidebarItem
            active={isPathActive(location.pathname, '/meetings')}
            icon={Video}
            label="Meetings"
            onClick={() => {
              if (role === 'member' && profile?.department_id) {
                go(`/spaces/${profile.department_id}?action=meetings`)
              } else {
                go('/meetings')
              }
            }}
          />
        ) : (
          <SidebarItem
            active={isPathActive(location.pathname, '/meetings')}
            icon={Video}
            label="Meetings"
            onClick={() => {
              if (role === 'member' && profile?.department_id) {
                go(`/spaces/${profile.department_id}?action=meetings`)
              } else {
                go('/meetings')
              }
            }}
          />
        )}
        {(INSTAGRAM_GRADING_ENABLED && (['super_admin', 'regional_secretary'].includes(role) || hasSpaceRole(profile, null, 'media'))) && (
          <SidebarItem
            active={isPathActive(location.pathname, '/instagram')}
            icon={Image}
            label="Instagram Grading"
            to="/instagram"
          />
        )}
        {FLOCK_CRM_CONFIG.checkAccess(role) ? (
          <div style={{ borderTop: '1px solid #EDE8DC', marginTop: 12, paddingTop: 12 }}>
            {!collapsed && <div style={{ ...SECTION_LABEL_STYLE }}>Confidential</div>}
            <SidebarItem
              active={isPathActive(location.pathname, '/flock-crm')}
              icon={Phone}
              label="Flock CRM — Pastoral Outreach"
              to="/flock-crm"
            />
          </div>
        ) : null}
        </>)}
        </>
        ) : null}

        {(role === 'regional_secretary' || role === 'super_admin') ? (
          <div style={{ borderTop: '1px solid #EDE8DC', marginTop: 12, paddingTop: 12 }}>
            {!collapsed && <div style={{ ...SECTION_LABEL_STYLE }}>Learning</div>}
            {role === 'super_admin' ? (
              <SidebarItem
                active={isPathActive(location.pathname, '/books')}
                icon={Library}
                label="My Library"
                to="/books"
              />
            ) : (
              !collapsed && (
                <div
                  className="sidebar-item"
                  style={{ cursor: 'default', opacity: 0.75 }}
                >
                  <Library size={15} style={{ opacity: 0.85, flexShrink: 0 }} />
                  <span className="sidebar-item__label">Surprise</span>
                </div>
              )
            )}
          </div>
        ) : null}

        {!collapsed && (role === 'regional_secretary' || role === 'super_admin' || hasGrant(profile, 'regional_secretary_access')) ? (
          <div style={{ borderTop: '1px solid #EDE8DC', marginTop: 12, paddingTop: 12, paddingBottom: 12, paddingLeft: 10, paddingRight: 10 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontSize: 10,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                color: '#9E9488',
                marginBottom: 6,
                cursor: 'pointer',
              }}
              onClick={() => setRegionalUpdatesExpanded(!regionalUpdatesExpanded)}
            >
              <span>{role === 'super_admin' ? 'Regional Updates' : 'Regional Secretary'}</span>
              <ChevronDown
                size={12}
                style={{
                  transform: regionalUpdatesExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                  transition: 'transform 0.15s',
                }}
              />
            </div>
            {regionalUpdatesExpanded && (
              <div style={{ marginTop: 8 }}>
                <RegionalUpdateCompose />
              </div>
            )}
          </div>
        ) : null}

        {integrations.map((integration) => (
          <SidebarItem
            key={integration.id}
            active={false}
            label={integration.name}
            glyph={<EmojiGlyph emoji={integration.icon_emoji} />}
            href={integration.launch_url}
          />
        ))}

        {showPeople ? (
          <>
            {!collapsed && <SidebarSectionLabel>Settings & Admin</SidebarSectionLabel>}
            <SidebarItem
              active={isPathActive(location.pathname, '/settings')}
              icon={Settings}
              label="Settings"
              to="/settings"
            />
          </>
        ) : null}
        {/* Tools & Resources - SOPs and Tools */}
        {!collapsed && (() => {
          const sops = integrations.filter((i) => i.type === 'sop')
          const colorMap = {
            default: { bg: '#FDF3DC', bgHover: '#FBE8B8', color: '#B45309' },
          }
          const showCollapse = sops.length > 2

          return sops.length > 0 ? (
            <>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  fontSize: 10,
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  color: '#9E9488',
                  margin: '8px 0 6px',
                  cursor: showCollapse ? 'pointer' : 'default',
                }}
                onClick={() => showCollapse && setToolsExpanded(!toolsExpanded)}
              >
                <span>Tools & Resources</span>
                {showCollapse && (
                  <ChevronDown
                    size={12}
                    style={{
                      transform: toolsExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                      transition: 'transform 0.15s',
                    }}
                  />
                )}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 6 }}>
                {sops.map((sop, idx) => {
                  const colors = colorMap.default
                  const isHidden = showCollapse && !toolsExpanded && idx >= 2
                  return !isHidden ? (
                    <a
                      key={sop.id}
                      href={sop.launch_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={sop.description || sop.name}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        padding: '8px 10px',
                        borderRadius: 6,
                        background: colors.bg,
                        color: colors.color,
                        textDecoration: 'none',
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = colors.bgHover
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = colors.bg
                      }}
                    >
                      <span style={{ fontSize: 14 }}>{sop.icon_emoji || '📋'}</span>
                      <span>{sop.name}</span>
                    </a>
                  ) : null
                })}
              </div>
            </>
          ) : null
        })()}

        {/* Org - standalone */}
        <SidebarItem
          active={isPathActive(location.pathname, '/org')}
          icon={Network}
          label="Org"
          to="/org"
        />

        {/* Administration - collapsible */}
        {showPeople && (
          <>
            {!collapsed && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  fontSize: 10,
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  color: '#9E9488',
                  margin: '8px 0 6px',
                  cursor: 'pointer',
                }}
                onClick={() => setAdminExpanded(!adminExpanded)}
              >
                <span>Administration</span>
                <ChevronDown
                  size={12}
                  style={{
                    transform: adminExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                    transition: 'transform 0.15s',
                  }}
                />
              </div>
            )}
            {(collapsed || adminExpanded) && (
              <>
                <SidebarItem
                  active={isPathActive(location.pathname, '/people')}
                  icon={Users2}
                  label="People Management"
                  to="/people/users"
                />
                <SidebarItem
                  active={isPathActive(location.pathname, '/trash')}
                  icon={Trash2}
                  label="Trash"
                  to="/trash"
                />
              </>
            )}
          </>
        )}

        {/* Help & Support - collapsible */}
        {!collapsed && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: 10,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              color: '#9E9488',
              margin: '8px 0 6px',
              cursor: 'pointer',
            }}
            onClick={() => setHelpExpanded(!helpExpanded)}
          >
            <span>Help & Support</span>
            <ChevronDown
              size={12}
              style={{
                transform: helpExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                transition: 'transform 0.15s',
              }}
            />
          </div>
        )}
        {(collapsed || helpExpanded) && (
          <>
            <SidebarItem
              active={isPathActive(location.pathname, '/help')}
              icon={HelpCircle}
              label="Help & FAQ"
              to="/help"
            />
            <SidebarItem
              icon={HeadphonesIcon}
              label="Get Support"
              onClick={() => setFeedbackOpen(true)}
            />
            {role === 'super_admin' && (
              <SidebarItem
                active={isPathActive(location.pathname, '/admin/tickets')}
                icon={Ticket}
                label="Support Tickets"
                to="/admin/tickets"
              />
            )}
          </>
        )}
      </div>

      <div style={{ borderTop: '1px solid #EDE8DC', padding: 10, marginTop: 'auto' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: collapsed ? 'center' : 'flex-start',
            gap: 10,
            background: '#F9F7F3',
            border: '1px solid #EDE8DC',
            borderRadius: 10,
            padding: collapsed ? '8px' : '8px 10px',
            width: '100%',
            cursor: 'pointer',
          }}
          onClick={() => go('/settings')}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = '#F2EEE6'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = '#F9F7F3'
          }}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter') go('/settings') }}
        >
          <div
            style={{
              width: 30,
              height: 30,
              borderRadius: 999,
              background: '#4C2A92',
              color: '#FFFFFF',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 11,
              fontWeight: 700,
              flexShrink: 0,
            }}
          >
            {initials}
          </div>
          {!collapsed && (
            <>
              <div style={{ minWidth: 0, flex: 1, textAlign: 'left' }}>
                <div
                  style={{
                    fontSize: 12.5,
                    fontWeight: 700,
                    color: '#1C1610',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {(profile?.name ?? 'User').replace(/_/g, ' ')}
                </div>
                <div
                  style={{
                    fontSize: 9.5,
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    color: '#7A6F5E',
                  }}
                >
                  {role?.replace('_', ' ') ?? ''}
                </div>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  signOut()
                }}
                style={{
                  border: 'none',
                  background: 'transparent',
                  padding: 0,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#B0A696',
                  cursor: 'pointer',
                  flexShrink: 0,
                }}
                aria-label="Sign out"
                title="Sign out"
              >
                <ChevronDown size={14} />
              </button>
            </>
          )}
        </div>
      </div>

      {showSpaceModal ? <SpaceModal onSaved={loadSpaces} onClose={() => setShowSpaceModal(false)} /> : null}
      {createModal?.type === 'list' ? (
        <CreateListModal
          space={createModal.space}
          onCreated={(list) => {
            bumpTreeVersion(createModal.space.id)
            navigate(`/spaces/${createModal.space.id}?list=${list.id}`)
          }}
          onClose={() => setCreateModal(null)}
        />
      ) : null}
      {createModal?.type === 'folder' ? (
        <CreateFolderModal
          space={createModal.space}
          onCreated={() => {
            bumpTreeVersion(createModal.space.id)
            navigate(`/spaces/${createModal.space.id}`)
          }}
          onClose={() => setCreateModal(null)}
        />
      ) : null}
      {editingSpace ? <SpaceModal mode="edit" space={editingSpace} onSaved={async () => { setEditingSpace(null); await loadSpaces() }} onClose={() => setEditingSpace(null)} /> : null}
      {showSprintModal ? (
        <SprintModal
          mode="create"
          initialDepartmentId={profile?.department_id ?? null}
          onSaved={() => { setShowSprintModal(false); go('/sprints') }}
          onClose={() => setShowSprintModal(false)}
        />
      ) : null}
      {feedbackOpen && (
        <QuickFeedbackModal
          userId={profile?.id}
          userName={profile?.name ?? 'A team member'}
          onClose={() => setFeedbackOpen(false)}
        />
      )}
    </aside>
  )
}
