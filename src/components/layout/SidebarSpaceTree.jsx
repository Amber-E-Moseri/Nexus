// Sidebar space tree (ClickUp UI refresh pass) — collapsible folder → list
// hierarchy under each space. Visual layer only: data loading, expansion
// persistence (localStorage cache), and navigation are unchanged.
// Hex literals inside framer-motion animate targets mirror tokens
// (CSS vars aren't interpolable): #EDE8F8 = --purple-tint.

import { AnimatePresence, motion } from 'framer-motion'
import { ChevronRight, Folder, List } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { CACHE_KEYS, getItemSafe, setItemSafe } from '../../lib/cacheUtils'
import { FONT_BODY } from '../../lib/fonts'

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

export default function SidebarSpaceTree({ spaceId, spaceName, isActive }) {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const [folders, setFolders] = useState([])
  const [lists, setLists] = useState([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState({})

  const listsByFolder = useMemo(
    () => folders.reduce((acc, folder) => ({ ...acc, [folder.id]: lists.filter((list) => list.folder_id === folder.id) }), {}),
    [folders, lists],
  )

  useEffect(() => {
    async function loadTree() {
      setLoading(true)
      try {
        const [folderRes, listRes] = await Promise.all([
          supabase.from('folders').select('id, name, sort_order').eq('department_id', spaceId).order('sort_order'),
          supabase.from('lists').select('id, name, folder_id, sort_order').eq('department_id', spaceId).order('sort_order'),
        ])

        setFolders(folderRes.data ?? [])
        setLists(listRes.data ?? [])
      } catch (error) {
        console.error('Failed to load space tree:', error)
      } finally {
        setLoading(false)
      }
    }

    loadTree()
  }, [spaceId])

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

  if (loading || !isActive) return null
  if (folders.length === 0) return null

  return (
    <div style={{ marginLeft: 12, marginTop: 4, marginBottom: 6 }}>
      {folders.map((folder) => {
        const isOpen = expanded[folder.id] ?? true
        const folderLists = listsByFolder[folder.id] ?? []

        return (
          <div key={folder.id}>
            <motion.button
              type="button"
              onClick={() => toggleFolder(folder.id)}
              whileHover={{ backgroundColor: HOVER_BG }}
              whileTap={{ scale: 0.98 }}
              style={{
                ...TREE_ITEM_STYLE,
                paddingLeft: 4,
              }}
            >
              <motion.span
                animate={{ rotate: isOpen ? 90 : 0 }}
                transition={{ type: 'spring', stiffness: 480, damping: 32 }}
                style={{ display: 'inline-flex', flexShrink: 0, color: 'var(--ink-3)' }}
              >
                <ChevronRight size={14} />
              </motion.span>
              <Folder size={12} style={{ flexShrink: 0, color: 'var(--accent-teal)' }} />
              <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--ink-2)' }}>{folder.name}</span>
            </motion.button>

            <AnimatePresence initial={false}>
              {isOpen ? (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ type: 'spring', stiffness: 380, damping: 36 }}
                  style={{ overflow: 'hidden' }}
                >
                  {folderLists.map((list) => (
                    <motion.button
                      key={list.id}
                      type="button"
                      onClick={() => navigateToList(list.id)}
                      whileHover={{ backgroundColor: HOVER_BG }}
                      whileTap={{ scale: 0.98 }}
                      style={{
                        ...TREE_ITEM_STYLE,
                        paddingLeft: 32,
                        fontSize: 11,
                        color: 'var(--ink-2)',
                        gap: 7,
                      }}
                    >
                      <List size={12} style={{ flexShrink: 0, color: 'var(--ink-3)' }} />
                      <span>{list.name}</span>
                    </motion.button>
                  ))}
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
    </div>
  )
}
