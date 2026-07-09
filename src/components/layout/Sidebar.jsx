import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import {
  Archive,
  Bell,
  CalendarDays,
  Check,
  ChevronDown,
  Clock,
  Copy,
  Folder,
  HelpCircle,
  LayoutGrid,
  Mail,
  MailPlus,
  Map,
  MoreHorizontal,
  Phone,
  Pencil,
  Plus,
  Settings,
  EyeOff,
  Trash2,
  UserCheck,
  Users,
  Users2,
  Image,
} from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import { useCallback, useEffect, useMemo, useRef, useState, memo } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useInboxCount } from '../../context/InboxCountContext'
import { useAuth } from '../../hooks/useAuth'
import { archiveSpace, getSpacesByType, restoreSpace, updateSpace } from '../../features/spaces'
import { supabase } from '../../lib/supabase'
import { FLOCK_CRM_CONFIG, hasFeatureRole } from '../../lib/permissions'
import SidebarSpaceTree from './SidebarSpaceTree'
import SpaceModal from '../../features/spaces/components/SpaceModal'
import SprintModal from '../../features/sprints/components/SprintModal'
import { useSprints } from '../../features/sprints/SprintsContext'
import { CACHE_KEYS, getItemSafe, setItemSafe } from '../../lib/cacheUtils'
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

const SPACE_GROUPS = ['department', 'program', 'personal', 'sandbox']

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

const SidebarSectionLabel = memo(function SidebarSectionLabel({ children, onAdd }) {
  return (
    <div style={{ ...SECTION_LABEL_STYLE, display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingRight: 9 }}>
      <span>{children}</span>
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
  onClick,
  trailing,
}) {
  const navigate = useNavigate()

  function handleActivate() {
    if (onClick) onClick()
    else if (to) navigate(to)
  }

  return (
    <div
      role="button"
      tabIndex={0}
      className={active ? 'sidebar-item sidebar-item--active' : 'sidebar-item'}
      onClick={handleActivate}
      onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); handleActivate() } }}
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


export default function Sidebar() {
  const { profile, role, signOut } = useAuth()
  const { inboxCount } = useInboxCount()
  const { activeSprints, planningSprints } = useSprints()
  const navigate = useNavigate()
  const location = useLocation()

  const [spaceGroups, setSpaceGroups] = useState({
    department: [],
    program: [],
    personal: [],
    sandbox: [],
    archived: [],
  })
  const [integrations, setIntegrations] = useState([])
  const [archivedOpen, setArchivedOpen] = useState(false)
  const [showSpaceModal, setShowSpaceModal] = useState(false)
  const [showSprintModal, setShowSprintModal] = useState(false)
  const [meetingsExpanded, setMeetingsExpanded] = useState(false)
  const [communicationsExpanded, setCommunicationsExpanded] = useState(false)
  const [editingSpace, setEditingSpace] = useState(null)
  const [hoveredSpaceId, setHoveredSpaceId] = useState(null)
  const [inlineRenameId, setInlineRenameId] = useState(null)
  const [inlineRenameValue, setInlineRenameValue] = useState('')
  const [quickAddSpaceId, setQuickAddSpaceId] = useState(null)
  const [quickAddListName, setQuickAddListName] = useState('')
  const [quickAddSaving, setQuickAddSaving] = useState(false)
  const [quickAddType, setQuickAddType] = useState(null)
  const [quickAddFolderName, setQuickAddFolderName] = useState('')
  const [openQuickAddMenuId, setOpenQuickAddMenuId] = useState(null)
  const [spaceActionsOpenId, setSpaceActionsOpenId] = useState(null)
  const [openSpaceMenuId, setOpenSpaceMenuId] = useState(null)
  const [toolsExpanded, setToolsExpanded] = useState(false)
  const [hiddenSpaceIds, setHiddenSpaceIds] = useState(() => {
    // Defer to profile load, will initialize after
    return []
  })
  const sidebarRef = useRef(null)

  const DEPT_LEAD_ROLES = ['super_admin', 'dept_lead', 'ors', 'programs', 'media', 'regional_secretary']
  const canCreateSpace = DEPT_LEAD_ROLES.includes(role)
  const canManageSpaces = DEPT_LEAD_ROLES.includes(role)
  const showPeople = ['super_admin', 'dept_lead', 'regional_secretary'].includes(role)
  const showAdminPlatform = role === 'super_admin' || role === 'dept_lead'

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

  useEffect(() => {
    let active = true

    supabase
      .from('external_integrations')
      .select('id, name, type, enabled, show_in_sidebar, sort_order, icon_emoji, launch_url, description')
      .eq('enabled', true)
      .eq('show_in_sidebar', true)
      .order('sort_order')
      .then(({ data, error }) => {
        if (error) {
          console.error('Failed to load integrations', error)
          return
        }

        if (active) {
          setIntegrations(data ?? [])
        }
      })

    return () => {
      active = false
    }
  }, [profile?.department_id])

  const displaySpaces = useMemo(
    () => SPACE_GROUPS.flatMap((groupKey) => spaceGroups[groupKey] ?? []).filter((space) => !hiddenSpaceIds.includes(space.id)),
    [hiddenSpaceIds, spaceGroups],
  )
  const archivedSpaces = (spaceGroups.archived ?? []).filter((space) => !hiddenSpaceIds.includes(space.id))
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
        setQuickAddSpaceId(null)
      }
    }

    document.addEventListener('mousedown', handleDocumentClick)
    return () => document.removeEventListener('mousedown', handleDocumentClick)
  }, [openSpaceMenuId, openQuickAddMenuId])

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

  async function handleDeleteSpace(space) {
    if (!window.confirm(`Delete ${space.name}? This cannot be undone.`)) return
    const { error } = await supabase.from('departments').delete().eq('id', space.id)
    if (error) throw error
    await loadSpaces()
  }

  async function handleQuickAddFolder(space) {
    const name = quickAddFolderName.trim()
    if (!name) return
    setQuickAddSaving(true)
    try {
      const { data: maxOrder } = await supabase
        .from('folders')
        .select('sort_order')
        .eq('department_id', space.id)
        .order('sort_order', { ascending: false })
        .limit(1)
        .maybeSingle()

      const { error: folderError } = await supabase
        .from('folders')
        .insert({
          name,
          department_id: space.id,
          sort_order: (maxOrder?.sort_order ?? -1) + 1,
          created_by: profile?.id ?? null,
        })

      if (folderError) throw folderError

      setQuickAddFolderName('')
      setQuickAddType(null)
      setQuickAddSpaceId(null)
      navigate(`/spaces/${space.id}`)
    } finally {
      setQuickAddSaving(false)
    }
  }

  async function handleQuickAddList(space) {
    const name = quickAddListName.trim()
    if (!name) return
    setQuickAddSaving(true)
    try {
      const { data: existingFolders, error: folderError } = await supabase
        .from('folders')
        .select('id, sort_order')
        .eq('department_id', space.id)
        .order('sort_order')

      if (folderError) throw folderError

      let folderId = existingFolders?.[0]?.id ?? null

      if (!folderId) {
        const { data: folder, error: createFolderError } = await supabase
          .from('folders')
          .insert({
            name: 'General',
            department_id: space.id,
            sort_order: 0,
            created_by: profile?.id ?? null,
          })
          .select('id')
          .single()

        if (createFolderError) throw createFolderError
        folderId = folder.id
      }

      const { data: maxOrder } = await supabase
        .from('lists')
        .select('sort_order')
        .eq('department_id', space.id)
        .order('sort_order', { ascending: false })
        .limit(1)
        .maybeSingle()

      const { error: listError } = await supabase
        .from('lists')
        .insert({
          name,
          department_id: space.id,
          folder_id: folderId,
          sort_order: (maxOrder?.sort_order ?? -1) + 1,
          created_by: profile?.id ?? null,
        })

      if (listError) throw listError

      setQuickAddListName('')
      setQuickAddType(null)
      setQuickAddSpaceId(null)
      navigate(`/spaces/${space.id}`)
    } finally {
      setQuickAddSaving(false)
    }
  }

  return (
    <aside
      ref={sidebarRef}
      style={{
        width: 222,
        background: '#FAFAF8',
        borderRight: '1px solid #EDE8DC',
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        flexShrink: 0,
        fontFamily: FONT_BODY,
      }}
    >
      <div
        style={{
          padding: '14px 16px',
          borderBottom: '1px solid #EDE8DC',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}
      >
        <div
          style={{
            width: 36,
            height: 36,
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
            width="24"
            height="24"
            style={{
              width: 24,
              height: 24,
              objectFit: 'contain',
              filter: 'brightness(0) invert(1)',
            }}
          />
        </div>
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: 13.5,
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

      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 6px 12px' }}>
        <SidebarSectionLabel>Workspace</SidebarSectionLabel>
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
        <SidebarItem
          active={isPathActive(location.pathname, '/my-tasks')}
          icon={Check}
          label="My Tasks"
          to="/my-tasks"
        />
        <SidebarItem
          active={isPathActive(location.pathname, '/planner')}
          icon={CalendarDays}
          label="Planner"
          to="/planner"
        />
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

        <SidebarSectionLabel onAdd={canCreateSpace ? () => setShowSpaceModal(true) : undefined}>Spaces</SidebarSectionLabel>
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
              trailing={canManageSpaces && (hoveredSpaceId === space.id || quickAddSpaceId === space.id || openSpaceMenuId === space.id || openQuickAddMenuId === space.id) ? (
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
                          onSelect={() => {
                            setQuickAddSpaceId(space.id)
                            setQuickAddType('folder')
                            setQuickAddFolderName('')
                          }}
                          className="cu-menu-item" style={{ display: 'flex', alignItems: 'center', gap: 8, borderRadius: 8, padding: '8px 10px', fontSize: 12.5, cursor: 'pointer', outline: 'none' }}
                        >
                          <Folder size={14} />
                          <span>Create folder</span>
                        </DropdownMenu.Item>
                        <DropdownMenu.Item
                          onSelect={() => {
                            setQuickAddSpaceId(space.id)
                            setQuickAddType('list')
                            setQuickAddListName('')
                          }}
                          className="cu-menu-item" style={{ display: 'flex', alignItems: 'center', gap: 8, borderRadius: 8, padding: '8px 10px', fontSize: 12.5, cursor: 'pointer', outline: 'none' }}
                        >
                          <LayoutGrid size={14} />
                          <span>Create list</span>
                        </DropdownMenu.Item>
                      </DropdownMenu.Content>
                    </DropdownMenu.Portal>
                  </DropdownMenu.Root>
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
                </motion.div>
              ) : null}
              onClick={() => go(`/spaces/${space.id}`)}
            />
            {quickAddSpaceId === space.id ? (
              <motion.div
                initial={{ opacity: 0, y: -4, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ type: 'spring', stiffness: 480, damping: 34 }}
                style={{
                  marginTop: 4,
                  marginLeft: 34,
                  marginRight: 8,
                  background: '#FFFFFF',
                  border: '1px solid var(--border-1)',
                  borderRadius: 10,
                  padding: 10,
                  boxShadow: '0 8px 28px rgba(28,22,16,.10)',
                }}
              >
                <div style={{ fontSize: 11, fontWeight: 700, color: '#7A6F5E', marginBottom: 6 }}>
                  {quickAddType === 'folder' ? `New folder in ${space.name}` : `New list in ${space.name}`}
                </div>
                <input
                  autoFocus
                  value={quickAddType === 'folder' ? quickAddFolderName : quickAddListName}
                  onChange={(event) => quickAddType === 'folder' ? setQuickAddFolderName(event.target.value) : setQuickAddListName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      if (quickAddType === 'folder') {
                        handleQuickAddFolder(space).catch(console.error)
                      } else {
                        handleQuickAddList(space).catch(console.error)
                      }
                    }
                    if (event.key === 'Escape') {
                      setQuickAddSpaceId(null)
                      setQuickAddListName('')
                      setQuickAddFolderName('')
                      setQuickAddType(null)
                    }
                  }}
                  placeholder={quickAddType === 'folder' ? 'Folder name' : 'List name'}
                  style={{
                    width: '100%',
                    border: '1px solid #D9D1C3',
                    borderRadius: 8,
                    padding: '7px 9px',
                    fontSize: 12,
                    background: '#FFFFFF',
                  }}
                />
                <div style={{ marginTop: 8, fontSize: 11, color: 'var(--ink-3)' }}>{quickAddSaving ? 'Saving…' : 'Press Enter to save'}</div>
              </motion.div>
            ) : null}
            <SidebarSpaceTree spaceId={space.id} spaceName={space.name} isActive={isPathActive(location.pathname, `/spaces/${space.id}`)} />
          </div>
        ))}
        {archivedSpaces.length > 0 ? (
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
        <SidebarSectionLabel onAdd={canCreateSpace ? () => setShowSprintModal(true) : undefined}>Sprints</SidebarSectionLabel>
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
        <SidebarItem
          active={location.pathname === '/sprints'}
          label="All Sprints"
          glyph={
            <span style={{ width: 20, flex: '0 0 20px', textAlign: 'center', fontSize: 14, opacity: 0.7 }}>◈</span>
          }
          to="/sprints"
        />

        <SidebarSectionLabel>Platform</SidebarSectionLabel>
        <div
          style={{
            ...ITEM_BASE_STYLE,
            borderLeft: isPathActive(location.pathname, '/meetings') ? '3px solid #4C2A92' : '3px solid transparent',
            background: isPathActive(location.pathname, '/meetings') ? '#EDE8F8' : 'transparent',
            color: isPathActive(location.pathname, '/meetings') ? '#4C2A92' : '#1C1610',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
          onMouseEnter={(e) => {
            if (!isPathActive(location.pathname, '/meetings')) e.currentTarget.style.background = '#F2EEE6'
          }}
          onMouseLeave={(e) => {
            if (!isPathActive(location.pathname, '/meetings')) e.currentTarget.style.background = 'transparent'
          }}
        >
          <button
            type="button"
            onClick={() => go('/meetings')}
            style={{ flex: 1, border: 'none', background: 'transparent', color: 'inherit', cursor: 'pointer', textAlign: 'left', padding: 0, fontFamily: 'inherit', fontSize: 'inherit' }}
          >
            Meetings
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              setMeetingsExpanded(!meetingsExpanded)
            }}
            style={{ border: 'none', background: 'none', padding: '0 2px', display: 'flex', alignItems: 'center', cursor: 'pointer', color: 'inherit' }}
          >
            <ChevronDown size={15} style={{ opacity: 0.85, transform: meetingsExpanded ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.15s' }} />
          </button>
        </div>
        {meetingsExpanded ? (
          <>
            {showAdminPlatform ? (
              <SidebarItem
                active={isPathActive(location.pathname, '/meetings/wizard')}
                label="Plan meeting"
                to="/meetings/wizard"
              />
            ) : null}
            <SidebarItem
              active={isPathActive(location.pathname, '/meetings/expected-attendees')}
              label="Attendee Roster"
              to="/meetings/expected-attendees"
            />
            {(showAdminPlatform || role === 'pastor') ? (
              <SidebarItem
                active={isPathActive(location.pathname, '/meetings/attendance-trends')}
                label="Attendance Trends"
                to="/meetings/attendance-trends"
              />
            ) : null}
            <SidebarItem
              active={isPathActive(location.pathname, '/meetings/absence-email-log')}
              label="Absence Email Send Log"
              to="/meetings/absence-email-log"
            />
          </>
        ) : null}
        {(['super_admin', 'ors'].includes(role) || hasFeatureRole(profile, null, 'programs')) && (
        <div
          style={{
            ...ITEM_BASE_STYLE,
            borderLeft: isPathActive(location.pathname, '/communications') ? '3px solid #4C2A92' : '3px solid transparent',
            background: isPathActive(location.pathname, '/communications') ? '#EDE8F8' : 'transparent',
            color: isPathActive(location.pathname, '/communications') ? '#4C2A92' : '#1C1610',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
          onMouseEnter={(e) => {
            if (!isPathActive(location.pathname, '/communications')) e.currentTarget.style.background = '#F2EEE6'
          }}
          onMouseLeave={(e) => {
            if (!isPathActive(location.pathname, '/communications')) e.currentTarget.style.background = 'transparent'
          }}
        >
          <button
            type="button"
            onClick={() => go('/communications')}
            style={{ flex: 1, border: 'none', background: 'transparent', color: 'inherit', cursor: 'pointer', textAlign: 'left', padding: 0, fontFamily: 'inherit', fontSize: 'inherit' }}
          >
            Communications
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              setCommunicationsExpanded(!communicationsExpanded)
            }}
            style={{ border: 'none', background: 'none', padding: '0 2px', display: 'flex', alignItems: 'center', cursor: 'pointer', color: 'inherit' }}
          >
            <ChevronDown size={15} style={{ opacity: 0.85, transform: communicationsExpanded ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.15s' }} />
          </button>
        </div>
        )}
        {(communicationsExpanded && (['super_admin', 'ors'].includes(role) || hasFeatureRole(profile, null, 'programs'))) ? (
          <>
            <SidebarItem
              active={isPathActive(location.pathname, '/communications/campaigns')}
              label="Campaigns"
              to="/communications/campaigns"
            />
            <SidebarItem
              active={isPathActive(location.pathname, '/communications/segments')}
              label="Segments"
              to="/communications/segments"
            />
            <SidebarItem
              active={isPathActive(location.pathname, '/communications/recipients')}
              label="Recipients"
              to="/communications/recipients"
            />
            <SidebarItem
              active={isPathActive(location.pathname, '/communications/analytics')}
              label="Analytics"
              to="/communications/analytics"
            />
          </>
        ) : null}
        {(['super_admin', 'regional_secretary', 'media'].includes(role)) && (
          <SidebarItem
            active={isPathActive(location.pathname, '/instagram')}
            icon={Image}
            label="Instagram Grading"
            to="/instagram"
          />
        )}
        <SidebarItem
          active={isPathActive(location.pathname, '/map')}
          icon={Map}
          label="CAN Map"
          to="/map"
        />
        {['super_admin', 'ors'].includes(role) && (
          <SidebarItem
            active={isPathActive(location.pathname, '/settings/campus-photos')}
            icon={Image}
            label="Campus Photos"
            to="/settings/campus-photos"
          />
        )}
        {FLOCK_CRM_CONFIG.checkAccess(role) ? (
          <div style={{ borderTop: '1px solid #EDE8DC', marginTop: 12, paddingTop: 12 }}>
            <div style={{ ...SECTION_LABEL_STYLE }}>Confidential</div>
            <SidebarItem
              active={isPathActive(location.pathname, '/flock-crm')}
              icon={Phone}
              label="Flock CRM — Pastoral Outreach"
              to="/flock-crm"
            />
          </div>
        ) : null}

        {role === 'regional_secretary' ? (
          <div style={{ borderTop: '1px solid #EDE8DC', marginTop: 12, paddingTop: 12, paddingBottom: 12, paddingLeft: 10, paddingRight: 10 }}>
            <div style={{ ...SECTION_LABEL_STYLE }}>Regional Secretary</div>
            <div style={{ marginTop: 8 }}>
              <RegionalUpdateCompose />
            </div>
          </div>
        ) : null}

        {integrations.map((integration) => (
          <SidebarItem
            key={integration.id}
            active={false}
            label={integration.name}
            glyph={<EmojiGlyph emoji={integration.icon_emoji} />}
            onClick={() => openExternal(integration.launch_url)}
          />
        ))}

        {showPeople ? (
          <>
            <SidebarSectionLabel>Settings & Admin</SidebarSectionLabel>
            <SidebarItem
              active={isPathActive(location.pathname, '/settings')}
              icon={Settings}
              label="Settings"
              to="/settings"
            />
            <SidebarItem
              active={isPathActive(location.pathname, '/people')}
              icon={Users2}
              label="People Management"
              to="/people/users"
            />
          </>
        ) : null}
        <SidebarItem
          active={isPathActive(location.pathname, '/help')}
          icon={HelpCircle}
          label="Help & FAQ"
          to="/help"
        />
      </div>

      {/* Tools & Resources - SOPs and Tools */}
      {(() => {
        const sops = integrations.filter((i) => i.type === 'sop')
        const colorMap = {
          default: { bg: '#FDF3DC', bgHover: '#FBE8B8', color: '#B45309' },
        }
        const showCollapse = sops.length > 2

        return sops.length > 0 ? (
          <div style={{ padding: '12px 16px', borderTop: '1px solid #EDE8DC' }}>
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
                marginBottom: 8,
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
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
          </div>
        ) : null
      })()}

      <div style={{ borderTop: '1px solid #EDE8DC', padding: 10, marginTop: 'auto' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            background: '#F9F7F3',
            border: '1px solid #EDE8DC',
            borderRadius: 10,
            padding: '8px 10px',
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
              color: '#E8A020',
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
              {profile?.name ?? 'User'}
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
        </div>
      </div>

      {showSpaceModal ? <SpaceModal onSaved={loadSpaces} onClose={() => setShowSpaceModal(false)} /> : null}
      {editingSpace ? <SpaceModal mode="edit" space={editingSpace} onSaved={async () => { setEditingSpace(null); await loadSpaces() }} onClose={() => setEditingSpace(null)} /> : null}
      {showSprintModal ? (
        <SprintModal
          mode="create"
          initialDepartmentId={profile?.department_id ?? null}
          onSaved={() => { setShowSprintModal(false); go('/sprints') }}
          onClose={() => setShowSprintModal(false)}
        />
      ) : null}
    </aside>
  )
}
