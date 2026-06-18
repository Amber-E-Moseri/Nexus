import { ChevronRight } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

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
  background: 'transparent',
  color: '#1C1610',
}

export default function SidebarSpaceTree({ spaceId, spaceName, isActive }) {
  const navigate = useNavigate()
  const [folders, setFolders] = useState([])
  const [lists, setLists] = useState([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(() => {
    try {
      const raw = window.localStorage.getItem(`space-tree-expanded-${spaceId}`)
      return raw ? JSON.parse(raw) : {}
    } catch {
      return {}
    }
  })

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
    try {
      window.localStorage.setItem(`space-tree-expanded-${spaceId}`, JSON.stringify(expanded))
    } catch {
      // ignore
    }
  }, [expanded, spaceId])

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
            <button
              type="button"
              onClick={() => toggleFolder(folder.id)}
              style={{
                ...TREE_ITEM_STYLE,
                paddingLeft: 4,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#F2EEE6'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent'
              }}
            >
              <ChevronRight
                size={14}
                style={{
                  flexShrink: 0,
                  transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)',
                  transition: 'transform 0.15s',
                  color: '#B0A696',
                }}
              />
              <span style={{ fontSize: 11, fontWeight: 500, color: '#666' }}>📁 {folder.name}</span>
            </button>

            {isOpen ? (
              <div>
                {folderLists.map((list) => (
                  <button
                    key={list.id}
                    type="button"
                    onClick={() => navigateToList(list.id)}
                    style={{
                      ...TREE_ITEM_STYLE,
                      paddingLeft: 32,
                      fontSize: 11,
                      color: '#666',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = '#F2EEE6'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'transparent'
                    }}
                  >
                    <span>📋 {list.name}</span>
                  </button>
                ))}
                {folderLists.length === 0 ? (
                  <div style={{ paddingLeft: 32, padding: '4px 8px', fontSize: 10, color: '#B0A696', fontStyle: 'italic' }}>
                    No lists
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}
