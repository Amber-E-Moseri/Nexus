// Sidebar space tree (ClickUp UI refresh pass) — collapsible folder → list
// hierarchy under each space. Navigation + lightweight quick-management
// (rename / visibility / delete). Heavy actions (member-level sharing) live
// in the roomy Overview "Folders & Lists" manager.
// Hex literals inside framer-motion animate targets mirror tokens
// (CSS vars aren't interpolable): #EDE8F8 = --purple-tint.

import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronRight, Folder, List, MoreHorizontal } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { CACHE_KEYS, getItemSafe, setItemSafe } from '../../lib/cacheUtils'
import { FONT_BODY } from '../../lib/fonts'
import { deleteFolder, deleteList, updateFolder, updateList } from '../../features/spaces'
import { updateFolderVisibility, updateListVisibility } from '../../features/spaces/lib/spaces.js'
import CreateListModal from '../../features/spaces/components/CreateListModal'

const HOVER_BG = 'rgba(237, 232, 248, 1)'
const HOVER_BG_OFF = 'rgba(237, 232, 248, 0)'

const TREE_ITEM_STYLE = {
  width: '100%',
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  padding: '5px 8px',
  borderRadius: 6,
  marginBottom: 1,
  border: 'none',
  textAlign: 'left',
  fontSize: 12,
  cursor: 'pointer',
  background: HOVER_BG_OFF,
  color: 'var(--ink-1)',
  fontFamily: FONT_BODY,
}

const MENU_CONTENT_STYLE = {
  minWidth: 150,
  background: '#fff',
  border: '1px solid var(--border, #E5E0D8)',
  borderRadius: 8,
  boxShadow: '0 8px 24px rgba(28,22,16,0.16)',
  padding: 4,
  zIndex: 60,
  fontFamily: FONT_BODY,
}

const MENU_ITEM_STYLE = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '6px 8px',
  fontSize: 12,
  borderRadius: 6,
  cursor: 'pointer',
  color: 'var(--ink-1)',
  outline: 'none',
}

// Small hover-reveal "⋯" menu shared by folder + list rows.
function QuickMenu({ label, isPrivate, onAddList, onRename, onToggleVisibility, onDelete }) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          aria-label={`Manage ${label}`}
          style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--ink-3)', padding: 2, borderRadius: 4, display: 'flex', flexShrink: 0 }}
        >
          <MoreHorizontal size={13} />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content side="bottom" align="end" sideOffset={4} style={MENU_CONTENT_STYLE}>
          {onAddList ? (
            <DropdownMenu.Item style={MENU_ITEM_STYLE} onSelect={onAddList}
              onMouseEnter={(e) => { e.currentTarget.style.background = HOVER_BG }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}>
              ➕ Add list
            </DropdownMenu.Item>
          ) : null}
          <DropdownMenu.Item style={MENU_ITEM_STYLE} onSelect={onRename}
            onMouseEnter={(e) => { e.currentTarget.style.background = HOVER_BG }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}>
            ✏️ Rename
          </DropdownMenu.Item>
          <DropdownMenu.Item style={MENU_ITEM_STYLE} onSelect={onToggleVisibility}
            onMouseEnter={(e) => { e.currentTarget.style.background = HOVER_BG }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}>
            {isPrivate ? '🔓 Make Public' : '🔒 Make Private'}
          </DropdownMenu.Item>
          <DropdownMenu.Item style={{ ...MENU_ITEM_STYLE, color: '#C0392B' }} onSelect={onDelete}
            onMouseEnter={(e) => { e.currentTarget.style.background = '#FEE2E2' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}>
            🗑️ Delete
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}

export default function SidebarSpaceTree({ spaceId, spaceName, spaceColor, isActive, canManage = false, refreshToken = 0 }) {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const [folders, setFolders] = useState([])
  const [lists, setLists] = useState([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState({})
  // folder id to preselect in the Create List modal; false = closed
  const [addListFolderId, setAddListFolderId] = useState(false)

  const listsByFolder = useMemo(
    () => folders.reduce((acc, folder) => ({ ...acc, [folder.id]: lists.filter((list) => list.folder_id === folder.id) }), {}),
    [folders, lists],
  )
  const unfoldedLists = useMemo(() => lists.filter((list) => !list.folder_id), [lists])

  async function loadTree() {
    setLoading(true)
    try {
      const [folderRes, listRes] = await Promise.all([
        supabase.from('folders').select('id, name, sort_order, created_by, visibility').eq('department_id', spaceId).order('sort_order'),
        supabase.from('lists').select('id, name, folder_id, sort_order, created_by, visibility').eq('department_id', spaceId).order('sort_order'),
      ])

      setFolders(folderRes.data ?? [])
      setLists(listRes.data ?? [])
    } catch (error) {
      console.error('Failed to load space tree:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadTree()
  }, [spaceId, refreshToken])

  useEffect(() => {
    if (profile?.id) {
      const cacheKey = CACHE_KEYS.SPACE_TREE_EXPANDED(profile.id, spaceId)
      const cached = getItemSafe(cacheKey)
      if (cached && typeof cached === 'object') {
        setExpanded(cached)
      }
    }
  }, [profile?.id, spaceId])

  useEffect(() => {
    if (profile?.id) {
      const cacheKey = CACHE_KEYS.SPACE_TREE_EXPANDED(profile.id, spaceId)
      setItemSafe(cacheKey, expanded)
    }
  }, [expanded, profile?.id, spaceId])

  function toggleFolder(folderId) {
    setExpanded((current) => ({
      ...current,
      [folderId]: !current[folderId],
    }))
  }

  function navigateToList(listId) {
    navigate(`/spaces/${spaceId}?list=${listId}`)
  }

  const canManageItem = (item) => canManage || item.created_by === profile?.id

  async function renameFolder(folder) {
    const name = window.prompt('Rename folder', folder.name)?.trim()
    if (!name || name === folder.name) return
    try { await updateFolder(folder.id, { name }); await loadTree() }
    catch (err) { window.alert(`Failed to rename folder: ${err.message}`) }
  }

  async function renameList(list) {
    const name = window.prompt('Rename list', list.name)?.trim()
    if (!name || name === list.name) return
    try { await updateList(list.id, { name }); await loadTree() }
    catch (err) { window.alert(`Failed to rename list: ${err.message}`) }
  }

  async function toggleFolderVisibility(folder) {
    try { await updateFolderVisibility(folder.id, folder.visibility === 'private' ? 'public' : 'private'); await loadTree() }
    catch (err) { window.alert(`Failed to update visibility: ${err.message}`) }
  }

  async function toggleListVisibility(list) {
    try { await updateListVisibility(list.id, list.visibility === 'private' ? 'public' : 'private'); await loadTree() }
    catch (err) { window.alert(`Failed to update visibility: ${err.message}`) }
  }

  async function removeFolder(folder) {
    if (!window.confirm(`Delete folder "${folder.name}"? This also deletes all lists inside it.`)) return
    try { await deleteFolder(folder.id); await loadTree() }
    catch (err) { window.alert(`Failed to delete folder: ${err.message}`) }
  }

  async function removeList(list) {
    if (!window.confirm(`Delete list "${list.name}"? This cannot be undone.`)) return
    try { await deleteList(list.id); await loadTree() }
    catch (err) { window.alert(`Failed to delete list: ${err.message}`) }
  }

  if (loading || !isActive) return null
  if (folders.length === 0 && unfoldedLists.length === 0) return null

  const renderListRow = (list, paddingLeft) => (
    <div
      key={list.id}
      className="tree-row"
      style={{ display: 'flex', alignItems: 'center' }}
      onMouseEnter={(e) => { const m = e.currentTarget.querySelector('.tree-row-menu'); if (m) m.style.opacity = '1' }}
      onMouseLeave={(e) => { const m = e.currentTarget.querySelector('.tree-row-menu'); if (m) m.style.opacity = '0' }}
    >
      <motion.button
        type="button"
        onClick={() => navigateToList(list.id)}
        whileHover={{ backgroundColor: HOVER_BG }}
        whileTap={{ scale: 0.98 }}
        style={{ ...TREE_ITEM_STYLE, paddingLeft, fontSize: 11, color: 'var(--ink-2)', gap: 7, marginBottom: 0 }}
      >
        <List size={12} style={{ flexShrink: 0, color: 'var(--ink-3)' }} />
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{list.name}</span>
        {list.visibility === 'private' ? <span title="Private" style={{ fontSize: 9, flexShrink: 0 }}>🔒</span> : null}
      </motion.button>
      {canManageItem(list) ? (
        <span className="tree-row-menu" style={{ opacity: 0, transition: 'opacity 0.12s', marginLeft: -2, marginRight: 4 }}>
          <QuickMenu
            label={list.name}
            isPrivate={list.visibility === 'private'}
            onRename={() => renameList(list)}
            onToggleVisibility={() => toggleListVisibility(list)}
            onDelete={() => removeList(list)}
          />
        </span>
      ) : null}
    </div>
  )

  return (
    <div style={{ marginLeft: 12, marginTop: 4, marginBottom: 6 }}>
      {folders.map((folder) => {
        const isOpen = expanded[folder.id] ?? true
        const folderLists = listsByFolder[folder.id] ?? []

        return (
          <div key={folder.id}>
            <div
              className="tree-row"
              style={{ display: 'flex', alignItems: 'center' }}
              onMouseEnter={(e) => { const m = e.currentTarget.querySelector('.tree-row-menu'); if (m) m.style.opacity = '1' }}
              onMouseLeave={(e) => { const m = e.currentTarget.querySelector('.tree-row-menu'); if (m) m.style.opacity = '0' }}
            >
              <motion.button
                type="button"
                onClick={() => toggleFolder(folder.id)}
                whileHover={{ backgroundColor: HOVER_BG }}
                whileTap={{ scale: 0.98 }}
                style={{ ...TREE_ITEM_STYLE, paddingLeft: 4, marginBottom: 0 }}
              >
                <motion.span
                  animate={{ rotate: isOpen ? 90 : 0 }}
                  transition={{ type: 'spring', stiffness: 480, damping: 32 }}
                  style={{ display: 'inline-flex', flexShrink: 0, color: 'var(--ink-3)' }}
                >
                  <ChevronRight size={14} />
                </motion.span>
                <Folder size={12} style={{ flexShrink: 0, color: 'var(--accent-teal)' }} />
                <span style={{ flex: 1, fontSize: 11, fontWeight: 500, color: 'var(--ink-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{folder.name}</span>
                {folder.visibility === 'private' ? <span title="Private" style={{ fontSize: 9, flexShrink: 0 }}>🔒</span> : null}
              </motion.button>
              {canManageItem(folder) ? (
                <span className="tree-row-menu" style={{ opacity: 0, transition: 'opacity 0.12s', marginLeft: -2, marginRight: 4 }}>
                  <QuickMenu
                    label={folder.name}
                    isPrivate={folder.visibility === 'private'}
                    onAddList={() => setAddListFolderId(folder.id)}
                    onRename={() => renameFolder(folder)}
                    onToggleVisibility={() => toggleFolderVisibility(folder)}
                    onDelete={() => removeFolder(folder)}
                  />
                </span>
              ) : null}
            </div>

            <AnimatePresence initial={false}>
              {isOpen ? (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ type: 'spring', stiffness: 380, damping: 36 }}
                  style={{ overflow: 'hidden' }}
                >
                  {folderLists.map((list) => renderListRow(list, 32))}
                  {folderLists.length === 0 ? (
                    <div style={{ paddingLeft: 32, padding: '4px 8px', fontSize: 10, color: 'var(--ink-3)', fontStyle: 'italic', fontFamily: FONT_BODY }}>
                      No lists
                    </div>
                  ) : null}
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>
        )
      })}

      {unfoldedLists.map((list) => renderListRow(list, 8))}

      {addListFolderId !== false ? (
        <CreateListModal
          space={{ id: spaceId, name: spaceName, color: spaceColor }}
          defaultFolderId={addListFolderId}
          onCreated={async (list) => {
            await loadTree()
            navigateToList(list.id)
          }}
          onClose={() => setAddListFolderId(false)}
        />
      ) : null}
    </div>
  )
}
