import { useState, useEffect, useCallback } from 'react'
import { DndContext, closestCorners, DragOverlay, useDroppable, useDraggable } from '@dnd-kit/core'
import { useDndSensors } from '../../../dnd/sensors'
import { getOpenItemsBySpace, updateOpenItemStatus, deleteOpenItem, convertOpenItemToTask } from '../lib/openItems'
import { getOrgUsers } from '../lib/ownerMatching'
import { useAuth } from '../../../hooks/useAuth'

const TYPE_LABELS = {
  question: '❓ Question',
  exploration: '🔍 Exploration',
  blocker: '🚫 Blocker',
  decision_point: '⚖️ Decision',
  future_consideration: '💡 Future',
}

const STATUS_META = {
  open:        { label: 'Open',        color: '#7A6F5E', bg: 'rgba(0,0,0,.06)' },
  in_progress: { label: 'In Progress', color: '#E8A020', bg: 'rgba(232,160,32,.15)' },
  resolved:    { label: 'Resolved',    color: '#2D8653', bg: 'rgba(45,134,83,.12)' },
}

const COLUMNS = ['open', 'in_progress', 'resolved']

export default function SpaceOpenItemsTab({ spaceId, canManage }) {
  const { profile } = useAuth()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState('kanban')
  const [statusFilter, setStatusFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [sortBy, setSortBy] = useState('last_mentioned')
  const [expandedItem, setExpandedItem] = useState(null)
  const [convertingItem, setConvertingItem] = useState(null)
  const [convertAssignee, setConvertAssignee] = useState('')
  const [convertDueDate, setConvertDueDate] = useState('')
  const [orgUsers, setOrgUsers] = useState([])
  const [dragActiveId, setDragActiveId] = useState(null)

  const sensors = useDndSensors()

  const fetchItems = useCallback(async () => {
    setLoading(true)
    try {
      const data = await getOpenItemsBySpace(spaceId, { sortBy })
      setItems(data)
    } catch (err) {
      console.warn('Failed to fetch open items:', err)
    } finally {
      setLoading(false)
    }
  }, [spaceId, sortBy])

  useEffect(() => { fetchItems() }, [fetchItems])

  const filteredItems = items.filter(item => {
    if (statusFilter && item.status !== statusFilter) return false
    if (typeFilter && item.item_type !== typeFilter) return false
    return true
  })

  async function handleStatusChange(itemId, newStatus) {
    await updateOpenItemStatus(itemId, newStatus)
    setItems(prev => prev.map(item =>
      item.id === itemId ? { ...item, status: newStatus } : item
    ))
  }

  async function handleDelete(itemId) {
    await deleteOpenItem(itemId)
    setItems(prev => prev.filter(item => item.id !== itemId))
  }

  async function handleConvert() {
    if (!convertingItem) return
    try {
      await convertOpenItemToTask(convertingItem, {
        assigneeId: convertAssignee || null,
        dueDate: convertDueDate || null,
        spaceId,
      })
      setConvertingItem(null)
      setConvertAssignee('')
      setConvertDueDate('')
      fetchItems()
    } catch (err) {
      console.warn('Failed to convert:', err)
    }
  }

  async function openConvertModal(item) {
    setConvertingItem(item)
    setConvertAssignee('')
    setConvertDueDate('')
    if (!orgUsers.length) {
      try { setOrgUsers(await getOrgUsers()) } catch {}
    }
  }

  function handleDragStart(event) {
    setDragActiveId(event.active.id)
  }

  function handleDragEnd(event) {
    setDragActiveId(null)
    const { active, over } = event
    if (!over) return
    const targetStatus = over.id
    if (!COLUMNS.includes(targetStatus)) return
    const item = items.find(i => i.id === active.id)
    if (item && item.status !== targetStatus) {
      handleStatusChange(item.id, targetStatus)
    }
  }

  const draggedItem = dragActiveId ? items.find(i => i.id === dragActiveId) : null

  if (loading) {
    return <div style={{ padding: 32, textAlign: 'center', color: '#7A6F5E', fontSize: 13 }}>Loading open items...</div>
  }

  return (
    <div style={{ padding: 20 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#1C1C1C' }}>Open Discussion Items</h3>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Filters */}
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={filterStyle}>
            <option value="">All statuses</option>
            <option value="open">Open</option>
            <option value="in_progress">In Progress</option>
            <option value="resolved">Resolved</option>
          </select>
          <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} style={filterStyle}>
            <option value="">All types</option>
            <option value="question">Question</option>
            <option value="exploration">Exploration</option>
            <option value="blocker">Blocker</option>
            <option value="decision_point">Decision Point</option>
            <option value="future_consideration">Future</option>
          </select>
          <select value={sortBy} onChange={e => setSortBy(e.target.value)} style={filterStyle}>
            <option value="last_mentioned">Last mentioned</option>
            <option value="first_mentioned">First mentioned</option>
            <option value="item_type">Type</option>
          </select>
          {/* View toggle */}
          <div style={{ display: 'flex', border: '1px solid #E5DDD0', borderRadius: 6, overflow: 'hidden' }}>
            <button onClick={() => setViewMode('kanban')} style={{ ...toggleBtn, background: viewMode === 'kanban' ? '#4C2A92' : '#fff', color: viewMode === 'kanban' ? '#fff' : '#7A6F5E' }}>Board</button>
            <button onClick={() => setViewMode('list')} style={{ ...toggleBtn, background: viewMode === 'list' ? '#4C2A92' : '#fff', color: viewMode === 'list' ? '#fff' : '#7A6F5E' }}>List</button>
          </div>
        </div>
      </div>

      {filteredItems.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 0', color: '#B0A89A', fontSize: 14 }}>
          {items.length === 0 ? 'No open items yet. Extract from meeting transcripts to get started.' : 'No items match current filters.'}
        </div>
      ) : viewMode === 'kanban' ? (
        <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, minHeight: 200 }}>
            {COLUMNS.map(status => {
              const colItems = filteredItems.filter(i => i.status === status)
              const meta = STATUS_META[status]
              return (
                <KanbanColumn key={status} status={status} meta={meta} items={colItems} expandedItem={expandedItem} onToggleExpand={setExpandedItem} onConvert={openConvertModal} onDelete={handleDelete} canManage={canManage} />
              )
            })}
          </div>
          <DragOverlay>
            {draggedItem && <OpenItemCard item={draggedItem} isDragging />}
          </DragOverlay>
        </DndContext>
      ) : (
        <ListView items={filteredItems} expandedItem={expandedItem} onToggleExpand={setExpandedItem} onStatusChange={handleStatusChange} onConvert={openConvertModal} onDelete={handleDelete} canManage={canManage} />
      )}

      {/* Convert modal */}
      {convertingItem && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setConvertingItem(null)}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 24, maxWidth: 420, width: '90%', boxShadow: '0 8px 30px rgba(0,0,0,.2)' }} onClick={e => e.stopPropagation()}>
            <h4 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 700 }}>Convert to Task</h4>
            <p style={{ margin: '0 0 16px', fontSize: 13, color: '#7A6F5E' }}>"{convertingItem.item_text}"</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <select value={convertAssignee} onChange={e => setConvertAssignee(e.target.value)} style={{ padding: '8px 10px', border: '1px solid #E5DDD0', borderRadius: 6, fontSize: 13, fontFamily: 'inherit' }}>
                <option value="">Unassigned</option>
                {orgUsers.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
              <input type="date" value={convertDueDate} onChange={e => setConvertDueDate(e.target.value)} style={{ padding: '8px 10px', border: '1px solid #E5DDD0', borderRadius: 6, fontSize: 13, fontFamily: 'inherit' }} />
              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <button onClick={handleConvert} style={{ flex: 1, padding: '10px 0', border: 'none', borderRadius: 6, background: '#4C2A92', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Create Task</button>
                <button onClick={() => setConvertingItem(null)} style={{ flex: 1, padding: '10px 0', border: '1px solid #E5DDD0', borderRadius: 6, background: '#fff', color: '#1C1C1C', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const filterStyle = {
  padding: '6px 10px',
  border: '1px solid #E5DDD0',
  borderRadius: 6,
  fontSize: 12,
  fontFamily: 'inherit',
  background: '#fff',
  color: '#1C1C1C',
}

const toggleBtn = {
  padding: '6px 14px',
  border: 'none',
  fontSize: 12,
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'inherit',
}

function KanbanColumn({ status, meta, items, expandedItem, onToggleExpand, onConvert, onDelete, canManage }) {
  const { setNodeRef, isOver } = useDroppable({ id: status })

  return (
    <div
      ref={setNodeRef}
      style={{
        background: isOver ? 'rgba(76,42,146,.06)' : '#FAFAF8',
        borderRadius: 10,
        border: `1px solid ${isOver ? '#4C2A92' : '#E5DDD0'}`,
        padding: 12,
        minHeight: 120,
        transition: 'border-color .15s, background .15s',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: meta.color, flexShrink: 0 }} />
        <span style={{ fontSize: 12, fontWeight: 700, color: meta.color, textTransform: 'uppercase', letterSpacing: '.04em' }}>{meta.label}</span>
        <span style={{ fontSize: 11, color: '#B0A89A', marginLeft: 'auto' }}>{items.length}</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {items.map(item => (
          <OpenItemCard
            key={item.id}
            item={item}
            expanded={expandedItem === item.id}
            onToggleExpand={() => onToggleExpand(expandedItem === item.id ? null : item.id)}
            onConvert={() => onConvert(item)}
            onDelete={() => onDelete(item.id)}
            canManage={canManage}
            draggable
          />
        ))}
      </div>
    </div>
  )
}

function OpenItemCard({ item, expanded, onToggleExpand, onConvert, onDelete, canManage, isDragging, draggable }) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: item.id,
    disabled: !draggable,
  })
  const style = {
    background: '#fff',
    borderRadius: 8,
    border: '1px solid #EDE8DC',
    padding: '10px 12px',
    cursor: draggable ? 'grab' : 'default',
    opacity: isDragging ? 0.7 : 1,
    boxShadow: isDragging ? '0 4px 16px rgba(0,0,0,.15)' : '0 1px 2px rgba(0,0,0,.04)',
    transition: 'box-shadow .15s',
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
  }
  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={onToggleExpand}
      {...(draggable ? { ...attributes, ...listeners } : {})}
      data-id={item.id}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <span style={{ fontSize: 13, flexShrink: 0 }}>{TYPE_LABELS[item.item_type]?.slice(0, 2) || '📌'}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#1C1C1C', lineHeight: 1.4 }}>{item.item_text}</div>
          <div style={{ fontSize: 11, color: '#B0A89A', marginTop: 3 }}>
            {item.meeting?.title && <span>{item.meeting.title} · </span>}
            {item.last_mentioned && new Date(item.last_mentioned).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })}
          </div>
        </div>
      </div>

      {expanded && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid #EDE8DC' }}>
          {item.transcript_excerpt && (
            <div style={{ fontSize: 12, color: '#7A6F5E', fontStyle: 'italic', marginBottom: 8, lineHeight: 1.5 }}>
              "{item.transcript_excerpt}"
            </div>
          )}
          <div style={{ fontSize: 11, color: '#B0A89A', marginBottom: 8 }}>
            <span style={{ padding: '1px 6px', borderRadius: 4, background: '#E8F5E9', color: '#2D8653', fontSize: 10, fontWeight: 600 }}>
              {TYPE_LABELS[item.item_type] || item.item_type}
            </span>
          </div>
          {canManage && (
            <div style={{ display: 'flex', gap: 6 }} onClick={e => e.stopPropagation()}>
              {!item.converted_to_task_id && (
                <button onClick={onConvert} style={{ padding: '4px 10px', border: '1px solid #E5DDD0', borderRadius: 6, fontSize: 11, fontWeight: 600, background: '#fff', color: '#4C2A92', cursor: 'pointer', fontFamily: 'inherit' }}>
                  Convert to Task
                </button>
              )}
              {item.converted_to_task_id && (
                <span style={{ fontSize: 10, fontWeight: 700, color: '#2D8653', background: 'rgba(45,134,83,.12)', borderRadius: 999, padding: '2px 7px' }}>Converted</span>
              )}
              <button onClick={onDelete} style={{ padding: '4px 10px', border: 'none', borderRadius: 6, fontSize: 11, fontWeight: 600, background: 'transparent', color: '#B0A89A', cursor: 'pointer', fontFamily: 'inherit' }}>Delete</button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function ListView({ items, expandedItem, onToggleExpand, onStatusChange, onConvert, onDelete, canManage }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {items.map(item => {
        const meta = STATUS_META[item.status] || STATUS_META.open
        const isExpanded = expandedItem === item.id
        return (
          <div
            key={item.id}
            style={{
              padding: '12px 16px',
              borderRadius: 10,
              border: '1px solid #E5DDD0',
              background: '#FAFAF8',
              cursor: 'pointer',
            }}
            onClick={() => onToggleExpand(isExpanded ? null : item.id)}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 14, flexShrink: 0 }}>{TYPE_LABELS[item.item_type]?.slice(0, 2) || '📌'}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#1C1C1C' }}>{item.item_text}</div>
                <div style={{ fontSize: 11, color: '#B0A89A', marginTop: 2 }}>
                  {item.meeting?.title && <span>{item.meeting.title} · </span>}
                  Last mentioned: {item.last_mentioned ? new Date(item.last_mentioned).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' }) : 'N/A'}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                <select
                  value={item.status}
                  onChange={e => onStatusChange(item.id, e.target.value)}
                  style={{ padding: '3px 8px', border: '1px solid #E5DDD0', borderRadius: 6, fontSize: 11, fontWeight: 600, background: meta.bg, color: meta.color, cursor: 'pointer', fontFamily: 'inherit' }}
                >
                  <option value="open">Open</option>
                  <option value="in_progress">In Progress</option>
                  <option value="resolved">Resolved</option>
                </select>
                <span style={{ padding: '2px 7px', borderRadius: 4, background: '#E8F5E9', color: '#2D8653', fontSize: 10, fontWeight: 600 }}>
                  {TYPE_LABELS[item.item_type]?.split(' ')[1] || item.item_type}
                </span>
              </div>
            </div>

            {isExpanded && (
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid #EDE8DC' }}>
                {item.transcript_excerpt && (
                  <div style={{ fontSize: 12, color: '#7A6F5E', fontStyle: 'italic', marginBottom: 8, lineHeight: 1.5 }}>
                    "{item.transcript_excerpt}"
                  </div>
                )}
                {canManage && (
                  <div style={{ display: 'flex', gap: 6 }} onClick={e => e.stopPropagation()}>
                    {!item.converted_to_task_id && (
                      <button onClick={() => onConvert(item)} style={{ padding: '4px 10px', border: '1px solid #E5DDD0', borderRadius: 6, fontSize: 11, fontWeight: 600, background: '#fff', color: '#4C2A92', cursor: 'pointer', fontFamily: 'inherit' }}>
                        Convert to Task
                      </button>
                    )}
                    {item.converted_to_task_id && (
                      <span style={{ fontSize: 10, fontWeight: 700, color: '#2D8653', background: 'rgba(45,134,83,.12)', borderRadius: 999, padding: '2px 7px' }}>Converted to task</span>
                    )}
                    <button onClick={() => onDelete(item.id)} style={{ padding: '4px 10px', border: 'none', borderRadius: 6, fontSize: 11, fontWeight: 600, background: 'transparent', color: '#B0A89A', cursor: 'pointer', fontFamily: 'inherit' }}>Delete</button>
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
