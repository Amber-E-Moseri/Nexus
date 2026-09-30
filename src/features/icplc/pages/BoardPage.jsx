import React, { useState, useMemo } from 'react'
import { useICPLC } from '../ICPLCContext.jsx'
import { useICPLCWorkingList } from '../hooks/useICPLCWorkingList.js'
import ParticipantFilters from '../components/ParticipantFilters.jsx'
import { applyClientFilters, countAttentionCategories } from '../lib/participantFilters.js'
import { filterParticipantsByWorkingListView } from '../lib/reconciliation.js'
import { deriveReadiness, readinessLabel } from '../lib/readinessEngine.js'
import ParticipantProfileDrawer from '../components/ParticipantProfileDrawer.jsx'
import { useQueryClient } from '@tanstack/react-query'
import { DndContext, DragOverlay, PointerSensor, KeyboardSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors } from '@dnd-kit/core'
import { useUpdateProfile } from '../hooks/useICPLCProfile.js'
import { isParticipationMove, applyParticipationMove } from '../lib/boardMove.js'
import { useMediaQuery } from '../../../hooks/useMediaQuery.js'

const PARTICIPATION_COLUMNS = ['tracking', 'likely', 'confirmed', 'uncertain', 'not_attending']
const READINESS_COLUMNS = ['unknown', 'waiting_itinerary', 'in_progress', 'action_required', 'blocked', 'ready']

const PARTICIPATION_DOTS = {
  tracking: '#6B7280', likely: '#2563EB', confirmed: '#2D8653',
  uncertain: '#C97820', not_attending: '#C94830',
}
const READINESS_DOTS = {
  unknown: '#9CA3AF', waiting_itinerary: '#0EA5E9', in_progress: '#2563EB',
  action_required: '#C97820', blocked: '#C94830', ready: '#2D8653',
}

const PARTICIPATION_LABELS = {
  tracking: 'Tracking', likely: 'Likely', confirmed: 'Confirmed',
  uncertain: 'Uncertain', not_attending: 'Not Attending',
}

function humanizeReadiness(r) {
  return { unknown: 'Unknown', waiting_itinerary: 'Waiting on itinerary', in_progress: 'In Progress', action_required: 'Action Required', blocked: 'Blocked', ready: 'Ready' }[r] || r
}

function BoardCard({ p, canDrag, onOpen }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: p.id, disabled: !canDrag })
  return (
    <div
      ref={setNodeRef}
      {...(canDrag ? { ...attributes, ...listeners } : {})}
      onClick={() => onOpen(p.id)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onOpen(p.id) } }}
      aria-label={`Open profile: ${p.full_name}`}
      style={{
        padding: '12px 14px', background: 'var(--icplc-surface, #fff)', borderRadius: 8,
        border: '1px solid var(--icplc-border, var(--border))', cursor: canDrag ? 'grab' : 'pointer', fontSize: 12,
        boxShadow: '0 1px 3px rgba(0,0,0,0.06)', opacity: isDragging ? 0.35 : 1, touchAction: canDrag ? 'none' : undefined,
      }}
    >
      <CardBody p={p} />
    </div>
  )
}

// Phone card: no drag (it fights with scrolling). Tap opens the profile; a native select moves the person.
function MobileBoardCard({ p, onOpen, onMove, canMove }) {
  return (
    <div style={{ padding: 14, background: 'var(--icplc-surface, #fff)', borderRadius: 10, border: '1px solid var(--icplc-border, var(--border))', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
      <div
        role="button"
        tabIndex={0}
        onClick={() => onOpen(p.id)}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onOpen(p.id) } }}
        aria-label={`Open profile: ${p.full_name}`}
        style={{ cursor: 'pointer', minHeight: 44 }}
      >
        <CardBody p={p} />
      </div>
      {canMove && (
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, fontSize: 12, color: 'var(--icplc-text-soft, var(--text-secondary))' }}>
          Move to
          <select
            className="icplc-input"
            aria-label={`Move ${p.full_name} to another column`}
            value={p.participation_status}
            onChange={(e) => onMove(p, e.target.value)}
            style={{ flex: 1, minHeight: 40 }}
          >
            {PARTICIPATION_COLUMNS.map((c) => <option key={c} value={c}>{PARTICIPATION_LABELS[c]}</option>)}
          </select>
        </label>
      )}
    </div>
  )
}

function CardBody({ p }) {
  return (
    <>
      <div style={{ fontWeight: 600, marginBottom: 3, fontSize: 13.5 }}>{p.full_name}</div>
      {p.subgroup && <div style={{ color: 'var(--text-secondary)', fontSize: 11 }}>{p.subgroup}</div>}
      {p.tags?.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginTop: 4 }}>
          {p.tags.slice(0, 3).map((t) => (
            <span
              key={t.id}
              style={{
                fontSize: 10, padding: '1px 6px', borderRadius: 10,
                background: t.color ? `${t.color}22` : 'var(--surface-2)',
                color: t.color || 'var(--text-secondary)',
                border: `1px solid ${t.color ? `${t.color}44` : 'var(--border)'}`,
              }}
            >
              {t.name}
            </span>
          ))}
        </div>
      )}
    </>
  )
}

function BoardColumn({ col, label, dotColor, count, droppable, children }) {
  const { setNodeRef, isOver } = useDroppable({ id: col, disabled: !droppable })
  return (
    <div
      ref={setNodeRef}
      style={{
        minWidth: 220, width: 220, flexShrink: 0,
        background: isOver ? 'var(--icplc-purple-bg, #F5F2FB)' : 'var(--icplc-grey-bg, var(--surface-2))', borderRadius: 8,
        border: `1px solid ${isOver ? 'var(--icplc-purple, #4C2A92)' : 'var(--icplc-border, var(--border))'}`,
        transition: 'background 0.1s, border-color 0.1s',
      }}
    >
      <div style={{ padding: '9px 12px', borderBottom: '1px solid var(--icplc-border, var(--border))', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: dotColor, flexShrink: 0 }} />
        <span style={{ flex: 1, fontSize: 13.5, fontWeight: 600, color: 'var(--icplc-text, var(--text-primary))' }}>{label}</span>
        <span style={{
          fontSize: 11, fontWeight: 700, color: 'var(--icplc-text-soft, var(--text-secondary))',
          background: 'var(--icplc-surface, #fff)', border: '1px solid var(--icplc-border, var(--border))',
          borderRadius: 10, padding: '1px 7px', minWidth: 20, textAlign: 'center',
        }}>{count}</span>
      </div>
      <div style={{ padding: 8, display: 'flex', flexDirection: 'column', gap: 6, minHeight: 56 }}>{children}</div>
    </div>
  )
}

export default function BoardPage({ canWrite }) {
  const { config, filters, setFilters, activeProfileId, activeProfileTab, closeProfile, openProfile } = useICPLC()
  const [groupBy, setGroupBy] = useState('participation')
  const isMobile = useMediaQuery('(max-width: 768px)')
  const [mobileCol, setMobileCol] = useState(null)
  const qc = useQueryClient()
  // Same data pipeline and shared filters as the Working List, so a filter set there also applies here.
  const {
    participants: allParticipants,
    registrations,
    registrationMaps,
    isLoading,
    error,
  } = useICPLCWorkingList(config?.id, {
    search: filters.search,
    participation_status: filters.participation_status,
    passport_readiness: filters.passport_readiness,
    visa_process_status: filters.visa_process_status,
    subgroup: filters.subgroup,
  })
  const attentionCounts = useMemo(() => countAttentionCategories(allParticipants), [allParticipants])
  const participants = useMemo(() => applyClientFilters(
    filterParticipantsByWorkingListView(
      allParticipants, registrations, registrationMaps, config?.id,
      filters.working_list_view || 'all',
      (participant) => deriveReadiness(participant).readiness,
    ),
    filters,
  ), [allParticipants, registrations, registrationMaps, config?.id, filters])
  const refetch = () => qc.invalidateQueries({ queryKey: ['icplc_participants', config?.id] })
  const updateProfile = useUpdateProfile()
  const [dragged, setDragged] = useState(null)
  const [moveError, setMoveError] = useState(null)
  // Drag only on the Participation view: Readiness is derived, so there is nothing to drop into.
  const dragEnabled = !!canWrite && groupBy === 'participation'
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), // a plain click still opens the profile
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
    useSensor(KeyboardSensor),
  )

  function moveParticipant(person, target) {
    if (!person || !isParticipationMove(person, target)) return
    setMoveError(null)
    const key = ['icplc_participants', config?.id]
    const previous = qc.getQueriesData({ queryKey: key })
    qc.setQueriesData({ queryKey: key }, (old) => (Array.isArray(old) ? applyParticipationMove(old, person.id, target) : old))
    updateProfile.mutate(
      { id: person.id, fields: { participation_status: target } },
      {
        onError: (err) => {
          previous.forEach(([k, data]) => qc.setQueryData(k, data))
          setMoveError(`Couldn't move ${person.full_name}: ${err.message || 'save failed'}`)
        },
      },
    )
  }

  function handleDragEnd({ active, over }) {
    setDragged(null)
    if (!over) return
    moveParticipant((participants || []).find((p) => p.id === active.id), over.id)
  }

  const columns = groupBy === 'participation' ? PARTICIPATION_COLUMNS : READINESS_COLUMNS
  const dots = groupBy === 'participation' ? PARTICIPATION_DOTS : READINESS_DOTS
  const colLabels = groupBy === 'participation'
    ? PARTICIPATION_LABELS
    : Object.fromEntries(READINESS_COLUMNS.map((c) => [c, humanizeReadiness(c)]))

  const grouped = useMemo(() => {
    if (!participants) return {}
    return columns.reduce((acc, col) => {
      if (groupBy === 'participation') {
        acc[col] = participants.filter((p) => p.participation_status === col)
      } else {
        acc[col] = participants.filter((p) => deriveReadiness(p).readiness === col)
      }
      return acc
    }, {})
  }, [participants, groupBy, columns])

  const activeCol = columns.includes(mobileCol) ? mobileCol : columns.find((c) => (grouped[c] || []).length) || columns[0]

  const loadingSkeleton = (
    <div style={{ display: 'flex', gap: 12, paddingBottom: 16 }}>
      {[1,2,3,4,5].map((i) => (
        <div key={i} style={{
          minWidth: 220, width: 220, flexShrink: 0, background: 'var(--surface-2)',
          borderRadius: 8, border: '1px solid var(--border)', height: 200,
          animation: 'pulse 1.5s ease-in-out infinite',
        }} />
      ))}
    </div>
  )

  if (error) return (
    <div style={{
      border: '1px solid #F3BDB8', borderRadius: 8, padding: '16px 20px',
      background: '#FEF2F2', display: 'flex', alignItems: 'flex-start', gap: 12,
    }}>
      <span style={{ fontSize: 18, lineHeight: 1 }}>⚠</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#991B1B', marginBottom: 4 }}>Failed to load board</div>
        <div style={{ fontSize: 12, color: '#B91C1C', marginBottom: 10 }}>
          {error?.message || 'An error occurred while fetching participant data.'}
        </div>
        <button
          type="button"
          onClick={() => refetch()}
          style={{
            padding: '5px 12px', background: '#991B1B', color: '#fff',
            border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12,
          }}
        >
          Retry
        </button>
      </div>
    </div>
  )

  return (
    <div>
      <ParticipantFilters
        resultCount={participants.length}
        attentionCounts={attentionCounts}
        searchSlot={(
          <input
            type="search"
            aria-label="Search the board by name or email"
            className="icplc-input icplc-search"
            placeholder="Search by name or email…"
            value={filters.search || ''}
            onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
          />
        )}
      />

      {/* Group by toolbar */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16, alignItems: 'center' }}>
        <span style={{ fontSize: 12, color: 'var(--icplc-text-soft, var(--text-secondary))' }}>Group by:</span>
        {['participation', 'readiness'].map((opt) => (
          <button
            key={opt}
            onClick={() => setGroupBy(opt)}
            className="icplc-chip"
            aria-pressed={groupBy === opt}
          >
            {opt === 'participation' ? 'Participation' : 'Readiness'}
          </button>
        ))}
      </div>

      {groupBy === 'readiness' && (
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 10 }}>
          Readiness is worked out automatically, so cards can't be moved here. Switch to Participation to drag people between columns.
        </div>
      )}
      {dragEnabled && !isMobile && (
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 10 }}>
          Drag a card to another column to change that person's participation status.
        </div>
      )}
      {moveError && (
        <div role="alert" style={{ marginBottom: 10, fontSize: 12, color: '#991B1B', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 6, padding: '6px 10px' }}>
          {moveError}
        </div>
      )}

      {/* Board columns */}
      {isMobile && !isLoading && (
        <>
          <div role="tablist" aria-label="Board columns" style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 8, marginBottom: 10, scrollbarWidth: 'thin' }}>
            {columns.map((col) => (
              <button
                key={col}
                type="button"
                role="tab"
                aria-selected={activeCol === col}
                className="icplc-chip"
                onClick={() => setMobileCol(col)}
                style={{ flexShrink: 0, whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                <span aria-hidden style={{ width: 8, height: 8, borderRadius: '50%', background: dots[col] || '#9CA3AF' }} />
                {colLabels[col]} <strong>{(grouped[col] || []).length}</strong>
              </button>
            ))}
          </div>
          <div role="tabpanel" style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingBottom: 16 }}>
            {(grouped[activeCol] || []).map((p) => (
              <MobileBoardCard key={p.id} p={p} onOpen={openProfile} onMove={moveParticipant} canMove={dragEnabled} />
            ))}
            {(grouped[activeCol] || []).length === 0 && (
              <div style={{ padding: '24px 8px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: 13, borderRadius: 8, border: '1px dashed var(--border)' }}>
                No participants in {colLabels[activeCol]}
              </div>
            )}
          </div>
        </>
      )}

      {isMobile ? (isLoading ? loadingSkeleton : null) : isLoading ? loadingSkeleton : (
      <DndContext
        sensors={sensors}
        onDragStart={({ active }) => setDragged((participants || []).find((p) => p.id === active.id) || null)}
        onDragEnd={handleDragEnd}
        onDragCancel={() => setDragged(null)}
      >
        <div style={{ display: 'flex', gap: 10, overflowX: 'auto', alignItems: 'flex-start', paddingBottom: 16 }}>
          {columns.map((col) => {
            const cards = grouped[col] || []
            return (
              <BoardColumn key={col} col={col} label={colLabels[col]} dotColor={dots[col] || '#9CA3AF'} count={cards.length} droppable={dragEnabled}>
                {cards.map((p) => <BoardCard key={p.id} p={p} canDrag={dragEnabled} onOpen={openProfile} />)}
                {cards.length === 0 && (
                  <div style={{
                    padding: '16px 8px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: 11,
                    borderRadius: 6, border: '1px dashed var(--border)',
                  }}>
                    {dragEnabled ? 'Drop here' : 'No participants'}
                  </div>
                )}
              </BoardColumn>
            )
          })}
        </div>
        <DragOverlay>
          {dragged ? (
            <div style={{ padding: '12px 14px', background: 'var(--icplc-surface, #fff)', borderRadius: 8, border: '1px solid var(--icplc-purple, #4C2A92)', fontSize: 12, boxShadow: '0 8px 20px rgba(0,0,0,0.18)', width: 204, cursor: 'grabbing' }}>
              <CardBody p={dragged} />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
      )}

      {activeProfileId && (
        <ParticipantProfileDrawer
          participantId={activeProfileId}
          initialTab={activeProfileTab}
          onClose={closeProfile}
          canWrite={canWrite}
        />
      )}
    </div>
  )
}
