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
  Home,
  LayoutGrid,
  Mail,
  MailPlus,
  Map,
  MoreHorizontal,
  Pencil,
  Plus,
  Settings,
  EyeOff,
  Trash2,
  UserCheck,
  Users,
  Users2,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useInboxCount } from '../../context/InboxCountContext'
import { useAuth } from '../../hooks/useAuth'
import { archiveSpace, getSpacesByType, restoreSpace, updateSpace } from '../../lib/spaces'
import { supabase } from '../../lib/supabase'
import SidebarSpaceTree from './SidebarSpaceTree'
import SpaceModal from '../../modules/spaces/SpaceModal'
import SprintModal from '../../modules/sprints/SprintModal'
import { useSprints } from '../../modules/sprints/SprintsContext'

const SECTION_LABEL_STYLE = {
  padding: '4px 9px 5px',
  fontSize: 9.5,
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.14em',
  color: '#B0A696',
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

function SidebarSectionLabel({ children, onAdd }) {
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
}

function SidebarItem({
  active,
  label,
  icon: Icon,
  badge,
  glyph,
  onClick,
  trailing,
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        ...ITEM_BASE_STYLE,
        borderLeft: `3px solid ${active ? '#4C2A92' : 'transparent'}`,
        background: active ? '#EDE8F8' : 'transparent',
        color: active ? '#4C2A92' : '#1C1610',
        fontWeight: active ? 700 : 500,
      }}
      onMouseEnter={(event) => {
        if (!active) event.currentTarget.style.background = '#F2EEE6'
      }}
      onMouseLeave={(event) => {
        if (!active) event.currentTarget.style.background = 'transparent'
      }}
    >
      {glyph ? (
        glyph
      ) : Icon ? (
        <Icon size={15} style={{ opacity: 0.85, color: 'inherit', flexShrink: 0 }} />
      ) : null}
      <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {label}
      </span>
      {badge > 0 ? (
        <span
          style={{
            background: '#F06449',
            color: '#FFFFFF',
            fontSize: 9.5,
            fontWeight: 700,
            borderRadius: 999,
            padding: '1px 6px',
            lineHeight: 1.3,
          }}
        >
          {badge}
        </span>
      ) : null}
      {trailing ?? null}
    </button>
  )
}

function SpaceGlyph({ color, label }) {
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
}

function SprintGlyph({ label }) {
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
}

function EmojiGlyph({ emoji }) {
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
}


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
  const [meetingsExpanded, setMeetingsExpanded] = useState(true)
  const [communicationsExpanded, setCommunicationsExpanded] = useState(true)
  const [editingSpace, setEditingSpace] = useState(null)
  const [hoveredSpaceId, setHoveredSpaceId] = useState(null)
  const [inlineRenameId, setInlineRenameId] = useState(null)
  const [inlineRenameValue, setInlineRenameValue] = useState('')
  const [quickAddSpaceId, setQuickAddSpaceId] = useState(null)
  const [quickAddListName, setQuickAddListName] = useState('')
  const [quickAddSaving, setQuickAddSaving] = useState(false)
  const [spaceActionsOpenId, setSpaceActionsOpenId] = useState(null)
  const [openSpaceMenuId, setOpenSpaceMenuId] = useState(null)
  const [hiddenSpaceIds, setHiddenSpaceIds] = useState(() => {
    try {
      const raw = window.localStorage.getItem('hidden-space-ids')
      return raw ? JSON.parse(raw) : []
    } catch {
      return []
    }
  })
  const sidebarRef = useRef(null)

  const canCreateSpace = role === 'super_admin' || role === 'dept_lead'
  const canManageSpaces = role === 'super_admin' || role === 'dept_lead'
  const showPeople = role !== 'member'
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
    try {
      window.localStorage.setItem('hidden-space-ids', JSON.stringify(hiddenSpaceIds))
    } catch {
      // ignore local preference persistence failures
    }
  }, [hiddenSpaceIds])

  useEffect(() => {
    let active = true

    supabase
      .from('external_integrations')
      .select('id, name, type, enabled, show_in_sidebar, sort_order, config, icon_url')
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
      if (!sidebarRef.current?.contains(event.target)) {
        setSpaceActionsOpenId(null)
        setQuickAddSpaceId(null)
      }
    }

    document.addEventListener('mousedown', handleDocumentClick)
    return () => document.removeEventListener('mousedown', handleDocumentClick)
  }, [])

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
        background: '#FBF8F2',
        borderRight: '1px solid #EDE8DC',
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        flexShrink: 0,
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
            alt="BLW Canada"
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
            BLW Canada OS
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
          onClick={() => go('/dashboard')}
        />
        <SidebarItem
          active={isPathActive(location.pathname, '/inbox')}
          icon={Bell}
          label="Inbox"
          badge={inboxCount > 0 ? inboxCount : 0}
          onClick={() => go('/inbox')}
        />
        <SidebarItem
          active={isPathActive(location.pathname, '/')}
          icon={Home}
          label="Home"
          onClick={() => go('/')}
        />
        {role === 'super_admin' || role === 'dept_lead' ? (
          <>
            <SidebarItem
              active={isPathActive(location.pathname, '/activity-log')}
              icon={Clock}
              label="Activity Log"
              onClick={() => go('/activity-log')}
            />
            <SidebarItem
              active={isPathActive(location.pathname, '/files')}
              icon={Folder}
              label="Files"
              onClick={() => go('/files')}
            />
          </>
        ) : null}
        <SidebarItem
          active={isPathActive(location.pathname, '/my-tasks')}
          icon={Check}
          label="My Tasks"
          onClick={() => go('/my-tasks')}
        />
        <SidebarItem
          active={isPathActive(location.pathname, '/planner')}
          icon={CalendarDays}
          label="Planner"
          onClick={() => go('/planner')}
        />
        <SidebarItem
          active={isPathActive(location.pathname, '/calendar')}
          icon={CalendarDays}
          label="Ministry Calendar"
          onClick={() => go('/calendar')}
        />
        {role === 'super_admin' || role === 'dept_lead' ? (
          <SidebarItem
            active={isPathActive(location.pathname, '/calendar-management')}
            icon={Settings}
            label="Calendar Management"
            onClick={() => go('/calendar-management')}
          />
        ) : null}
        {role === 'pastor' ? (
          <SidebarItem
            active={isPathActive(location.pathname, '/flock')}
            icon={Users}
            label="My Flock"
            onClick={() => go('/flock')}
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
              trailing={canManageSpaces && (hoveredSpaceId === space.id || quickAddSpaceId === space.id) ? (
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation()
                      setQuickAddSpaceId((current) => current === space.id ? null : space.id)
                      setQuickAddListName('')
                    }}
                    aria-label={`Add list to ${space.name}`}
                    style={{
                      width: 22,
                      height: 22,
                      border: 'none',
                      background: quickAddSpaceId === space.id ? '#F2EEE6' : 'transparent',
                      borderRadius: 6,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#B0A696',
                      cursor: 'pointer',
                      flexShrink: 0,
                    }}
                  >
                    <Plus size={14} />
                  </button>
                  <DropdownMenu.Root open={openSpaceMenuId === space.id} onOpenChange={(open) => setOpenSpaceMenuId(open ? space.id : null)}>
                    <DropdownMenu.Trigger asChild>
                      <button
                        type="button"
                        onClick={(event) => event.stopPropagation()}
                        aria-label={`More options for ${space.name}`}
                        style={{
                          width: 22,
                          height: 22,
                          border: 'none',
                          background: openSpaceMenuId === space.id ? '#F2EEE6' : 'transparent',
                          borderRadius: 6,
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: openSpaceMenuId === space.id ? '#4C2A92' : '#B0A696',
                          cursor: 'pointer',
                          flexShrink: 0,
                        }}
                      >
                        <MoreHorizontal size={14} />
                      </button>
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
                          border: '1px solid #E9E4D8',
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
                          style={{ display: 'flex', alignItems: 'center', gap: 8, borderRadius: 8, padding: '8px 10px', fontSize: 12.5, cursor: 'pointer', outline: 'none' }}
                        >
                          <Pencil size={14} />
                          <span>Rename</span>
                        </DropdownMenu.Item>
                        <DropdownMenu.Item
                          onSelect={() => navigate(`/dept/${slugifySpaceName(space.slug ?? space.name)}?openStatuses=true`)}
                          style={{ display: 'flex', alignItems: 'center', gap: 8, borderRadius: 8, padding: '8px 10px', fontSize: 12.5, cursor: 'pointer', outline: 'none' }}
                        >
                          <Settings size={14} />
                          <span>Task Statuses</span>
                        </DropdownMenu.Item>
                        <DropdownMenu.Item
                          onSelect={() => handleHideSpace(space.id)}
                          style={{ display: 'flex', alignItems: 'center', gap: 8, borderRadius: 8, padding: '8px 10px', fontSize: 12.5, cursor: 'pointer', outline: 'none' }}
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
                            style={{ display: 'flex', alignItems: 'center', gap: 8, borderRadius: 8, padding: '8px 10px', fontSize: 12.5, cursor: 'pointer', outline: 'none' }}
                          >
                            <Archive size={14} />
                            <span>{space.status === 'archived' ? 'Restore' : 'Archive'}</span>
                          </DropdownMenu.Item>
                        ) : null}
                        {role === 'super_admin' ? (
                          <DropdownMenu.Item
                            onSelect={() => handleDeleteSpace(space).catch(console.error)}
                            style={{ display: 'flex', alignItems: 'center', gap: 8, borderRadius: 8, padding: '8px 10px', fontSize: 12.5, cursor: 'pointer', outline: 'none', color: '#C94830' }}
                          >
                            <Trash2 size={14} />
                            <span>Delete</span>
                          </DropdownMenu.Item>
                        ) : null}
                      </DropdownMenu.Content>
                    </DropdownMenu.Portal>
                  </DropdownMenu.Root>
                </div>
              ) : null}
              onClick={() => go(`/spaces/${space.id}`)}
            />
            {quickAddSpaceId === space.id ? (
              <div
                style={{
                  marginTop: 4,
                  marginLeft: 34,
                  marginRight: 8,
                  background: '#FFFFFF',
                  border: '1px solid #E9E4D8',
                  borderRadius: 10,
                  padding: 10,
                  boxShadow: '0 8px 28px rgba(28,22,16,.10)',
                }}
              >
                <div style={{ fontSize: 11, fontWeight: 700, color: '#7A6F5E', marginBottom: 6 }}>New list in {space.name}</div>
                <input
                  autoFocus
                  value={quickAddListName}
                  onChange={(event) => setQuickAddListName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      handleQuickAddList(space).catch(console.error)
                    }
                    if (event.key === 'Escape') {
                      setQuickAddSpaceId(null)
                      setQuickAddListName('')
                    }
                  }}
                  placeholder="List name"
                  style={{
                    width: '100%',
                    border: '1px solid #D9D1C3',
                    borderRadius: 8,
                    padding: '7px 9px',
                    fontSize: 12,
                    background: '#FFFFFF',
                  }}
                />
                <div style={{ marginTop: 8, fontSize: 11, color: '#B0A696' }}>{quickAddSaving ? 'Saving…' : 'Press Enter to save'}</div>
              </div>
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
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation()
                            setOpenSpaceMenuId((current) => current === space.id ? null : space.id)
                          }}
                          aria-label={`More options for ${space.name}`}
                          title={`More options for ${space.name}`}
                          style={{
                            width: 22,
                            height: 22,
                            border: 'none',
                            background: openSpaceMenuId === space.id ? '#F2EEE6' : 'transparent',
                            borderRadius: 6,
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: openSpaceMenuId === space.id ? '#4C2A92' : '#B0A696',
                            cursor: 'pointer',
                            flexShrink: 0,
                          }}
                          onMouseEnter={(event) => { event.currentTarget.style.background = '#F2EEE6'; event.currentTarget.style.color = '#4C2A92' }}
                          onMouseLeave={(event) => {
                            event.currentTarget.style.background = openSpaceMenuId === space.id ? '#F2EEE6' : 'transparent'
                            event.currentTarget.style.color = openSpaceMenuId === space.id ? '#4C2A92' : '#B0A696'
                          }}
                        >
                          <MoreHorizontal size={14} />
                        </button>
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
                              border: '1px solid #E9E4D8',
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
                              style={{ display: 'flex', alignItems: 'center', gap: 8, borderRadius: 8, padding: '8px 10px', fontSize: 12.5, cursor: 'pointer', outline: 'none' }}
                            >
                              <Pencil size={14} />
                              <span>Rename</span>
                            </DropdownMenu.Item>
                            <DropdownMenu.Item
                              onSelect={() => navigate(`/dept/${slugifySpaceName(space.slug ?? space.name)}?openStatuses=true`)}
                              style={{ display: 'flex', alignItems: 'center', gap: 8, borderRadius: 8, padding: '8px 10px', fontSize: 12.5, cursor: 'pointer', outline: 'none' }}
                            >
                              <Settings size={14} />
                              <span>Task Statuses</span>
                            </DropdownMenu.Item>
                            <DropdownMenu.Item
                              onSelect={() => handleHideSpace(space.id)}
                              style={{ display: 'flex', alignItems: 'center', gap: 8, borderRadius: 8, padding: '8px 10px', fontSize: 12.5, cursor: 'pointer', outline: 'none' }}
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
                                style={{ display: 'flex', alignItems: 'center', gap: 8, borderRadius: 8, padding: '8px 10px', fontSize: 12.5, cursor: 'pointer', outline: 'none' }}
                              >
                                <Archive size={14} />
                                <span>{space.status === 'archived' ? 'Restore' : 'Archive'}</span>
                              </DropdownMenu.Item>
                            ) : null}
                            {role === 'super_admin' ? (
                              <DropdownMenu.Item
                                onSelect={() => handleDeleteSpace(space).catch(console.error)}
                                style={{ display: 'flex', alignItems: 'center', gap: 8, borderRadius: 8, padding: '8px 10px', fontSize: 12.5, cursor: 'pointer', outline: 'none', color: '#C94830' }}
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
          onClick={() => go('/sprints')}
        />

        <SidebarSectionLabel>Platform</SidebarSectionLabel>
        <button
          type="button"
          onClick={() => go('/meetings')}
          style={{
            ...ITEM_BASE_STYLE,
            borderLeft: isPathActive(location.pathname, '/meetings') ? '3px solid #4C2A92' : '3px solid transparent',
            background: isPathActive(location.pathname, '/meetings') ? '#EDE8F8' : 'transparent',
            color: isPathActive(location.pathname, '/meetings') ? '#4C2A92' : '#1C1610',
          }}
          onMouseEnter={(e) => {
            if (!isPathActive(location.pathname, '/meetings')) e.currentTarget.style.background = '#F2EEE6'
          }}
          onMouseLeave={(e) => {
            if (!isPathActive(location.pathname, '/meetings')) e.currentTarget.style.background = 'transparent'
          }}
        >
          <span style={{ flex: 1 }}>Meetings</span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              setMeetingsExpanded(!meetingsExpanded)
            }}
            style={{ border: 'none', background: 'none', padding: '0 2px', display: 'flex', alignItems: 'center', cursor: 'pointer' }}
          >
            <ChevronDown size={15} style={{ opacity: 0.85, transform: meetingsExpanded ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.15s' }} />
          </button>
        </button>
        {meetingsExpanded ? (
          <>
            <SidebarItem
              active={isPathActive(location.pathname, '/meetings') && !isPathActive(location.pathname, '/meetings/expected-attendees')}
              label="Dashboard"
              glyph={
                <span style={{ width: 20, flex: '0 0 20px', textAlign: 'center', fontSize: 13, opacity: 0.7 }}>📊</span>
              }
              onClick={() => go('/meetings')}
            />
            {showAdminPlatform ? (
              <SidebarItem
                active={isPathActive(location.pathname, '/meetings/wizard')}
                label="Plan meeting"
                glyph={
                  <span style={{ width: 20, flex: '0 0 20px', textAlign: 'center', fontSize: 13, opacity: 0.7 }}>📋</span>
                }
                onClick={() => go('/meetings/wizard')}
              />
            ) : null}
            <SidebarItem
              active={isPathActive(location.pathname, '/meetings/expected-attendees')}
              label="Attendee Roster"
              glyph={
                <span style={{ width: 20, flex: '0 0 20px', textAlign: 'center', fontSize: 13, opacity: 0.7 }}>☑</span>
              }
              onClick={() => go('/meetings/expected-attendees')}
            />
            {(showAdminPlatform || role === 'pastor') ? (
              <SidebarItem
                active={isPathActive(location.pathname, '/meetings/attendance-trends')}
                label="Attendance Trends"
                glyph={
                  <span style={{ width: 20, flex: '0 0 20px', textAlign: 'center', fontSize: 13, opacity: 0.7 }}>📈</span>
                }
                onClick={() => go('/meetings/attendance-trends')}
              />
            ) : null}
            <SidebarItem
              active={isPathActive(location.pathname, '/meetings/absence-email-log')}
              label="Absence Email Send Log"
              glyph={
                <span style={{ width: 20, flex: '0 0 20px', textAlign: 'center', fontSize: 13, opacity: 0.7 }}>✉</span>
              }
              onClick={() => go('/meetings/absence-email-log')}
            />
          </>
        ) : null}
        <button
          type="button"
          onClick={() => go('/communications')}
          style={{
            ...ITEM_BASE_STYLE,
            borderLeft: isPathActive(location.pathname, '/communications') ? '3px solid #4C2A92' : '3px solid transparent',
            background: isPathActive(location.pathname, '/communications') ? '#EDE8F8' : 'transparent',
            color: isPathActive(location.pathname, '/communications') ? '#4C2A92' : '#1C1610',
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
            onClick={(e) => {
              e.stopPropagation()
              setCommunicationsExpanded(!communicationsExpanded)
            }}
            style={{ border: 'none', background: 'none', padding: '0 2px', display: 'flex', alignItems: 'center', cursor: 'pointer' }}
          >
            <ChevronDown size={15} style={{ opacity: 0.85, transform: communicationsExpanded ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.15s' }} />
          </button>
          <span style={{ flex: 1 }}>Communications</span>
        </button>
        {communicationsExpanded && showAdminPlatform ? (
          <>
            <SidebarItem
              active={isPathActive(location.pathname, '/communications/campaigns')}
              label="Campaigns"
              onClick={() => go('/communications/campaigns')}
            />
            <SidebarItem
              active={isPathActive(location.pathname, '/communications/segments')}
              label="Segments"
              onClick={() => go('/communications/segments')}
            />
            <SidebarItem
              active={isPathActive(location.pathname, '/communications/recipients')}
              label="Recipients"
              onClick={() => go('/communications/recipients')}
            />
            <SidebarItem
              active={isPathActive(location.pathname, '/communications/analytics')}
              label="Analytics"
              onClick={() => go('/communications/analytics')}
            />
          </>
        ) : null}
        <SidebarItem
          active={false}
          icon={Map}
          label="CAN Map"
          onClick={() => openExternal('/apps/map/index.html')}
        />
        <SidebarItem
          active={isPathActive(location.pathname, '/settings')}
          icon={Settings}
          label="Settings"
          onClick={() => go('/settings')}
        />
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
            <SidebarSectionLabel>People</SidebarSectionLabel>
            <SidebarItem
              active={isPathActive(location.pathname, '/people/users')}
              icon={Users2}
              label="Users"
              onClick={() => go('/people/users')}
            />
            <SidebarItem
              active={isPathActive(location.pathname, '/people/invitations')}
              icon={Mail}
              label="Invitations"
              onClick={() => go('/people/invitations')}
            />
            <SidebarItem
              active={isPathActive(location.pathname, '/people/pastoral-assignments')}
              icon={UserCheck}
              label="Pastoral"
              onClick={() => go('/people/pastoral-assignments')}
            />
          </>
        ) : null}
      </div>

      <div style={{ borderTop: '1px solid #EDE8DC', padding: 10 }}>
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
