import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import TaskExpandable from './TaskExpandable'
import WinsSheet from '../../wins/components/WinsSheet'
import { BORDER, MUTED, PRIMARY, PRIORITY_DOT, TEXT, SLOT_HOVER } from '../lib/plannerTheme'

function TaskGroup({ name, count, defaultOpen, children }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div style={{ marginBottom: 10 }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{ display: 'flex', alignItems: 'center', gap: 5, width: '100%', border: 'none', background: 'transparent', padding: '4px 0', cursor: 'pointer', color: TEXT }}
      >
        {open ? <ChevronDown size={13} color={MUTED} /> : <ChevronRight size={13} color={MUTED} />}
        <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.05em', textTransform: 'uppercase' }}>{name}</span>
        <span style={{ fontSize: 10.5, fontWeight: 700, color: MUTED }}>{count}</span>
      </button>
      {open && <div style={{ marginTop: 4 }}>{children}</div>}
    </div>
  )
}

function KpiTile({ label, value, accent }) {
  return (
    <div style={{ flex: '1 1 45%', background: 'white', border: `1px solid ${BORDER}`, borderRadius: 10, padding: '8px 10px' }}>
      <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: MUTED }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color: accent, marginTop: 2, lineHeight: 1 }}>{value}</div>
    </div>
  )
}

const PRIORITY_FILTERS = ['urgent', 'high', 'medium', 'low']

/**
 * Left sidebar: priority filters, grouped unschedulable-vs-backlog tasks with
 * expandable subtasks, and KPI tiles.
 */
export default function PlannerSidebar({
  groups, // [{ name, tasks, defaultOpen }]
  kpis, // { dueThisWeek, overdue, completedThisWeek, unscheduled }
  priorityFilter, // Set of enabled priorities (empty = all)
  onTogglePriority,
  expandedTaskIds,
  subtasksByParentId,
  scheduledTaskIds,
  onToggleExpand,
  onOpenTask,
  departmentId,
  weekStart,
}) {
  const [winsOpen, setWinsOpen] = useState(true)
  return (
    <div style={{ width: 280, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 10, overflow: 'hidden' }}>
      {/* Priority filters */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {PRIORITY_FILTERS.map((p) => {
          const active = priorityFilter.size === 0 || priorityFilter.has(p)
          return (
            <button
              key={p}
              type="button"
              onClick={() => onTogglePriority(p)}
              aria-pressed={priorityFilter.has(p)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                border: `1px solid ${priorityFilter.has(p) ? PRIMARY : BORDER}`,
                background: priorityFilter.has(p) ? SLOT_HOVER : 'white',
                borderRadius: 999,
                padding: '3px 9px',
                fontSize: 10.5,
                fontWeight: 600,
                color: active ? TEXT : MUTED,
                cursor: 'pointer',
                textTransform: 'capitalize',
              }}
            >
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: PRIORITY_DOT[p] }} />
              {p}
            </button>
          )
        })}
      </div>

      {/* Task groups */}
      <div style={{ flex: 1, overflowY: 'auto', paddingRight: 2 }}>
        {groups.map((group) => (
          <TaskGroup key={group.name} name={group.name} count={group.tasks.length} defaultOpen={group.defaultOpen}>
            {group.tasks.length === 0 && (
              <div style={{ fontSize: 11.5, color: MUTED, padding: '4px 2px' }}>Nothing here.</div>
            )}
            {group.tasks.map((task) => (
              <TaskExpandable
                key={task.id}
                task={task}
                subtaskCount={task.subtask_count?.[0]?.count ?? 0}
                expanded={expandedTaskIds.has(task.id)}
                scheduled={scheduledTaskIds.has(task.id)}
                onToggleExpand={onToggleExpand}
                onOpen={onOpenTask}
              >
                {(subtasksByParentId[task.id] ?? []).map((sub) => (
                  <TaskExpandable
                    key={sub.id}
                    task={sub}
                    isSubtask
                    scheduled={scheduledTaskIds.has(sub.id)}
                    onOpen={onOpenTask}
                  />
                ))}
                {expandedTaskIds.has(task.id) && !subtasksByParentId[task.id] && (
                  <div style={{ fontSize: 11, color: MUTED, marginLeft: 18, padding: '3px 0' }}>Loading subtasks…</div>
                )}
              </TaskExpandable>
            ))}
          </TaskGroup>
        ))}
      </div>

      {/* KPI tiles */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        <KpiTile label="Due this week" value={kpis.dueThisWeek} accent={PRIMARY} />
        <KpiTile label="Overdue" value={kpis.overdue} accent="#C94830" />
        <KpiTile label="Done this week" value={kpis.completedThisWeek} accent="#3E7C4F" />
        <KpiTile label="Unscheduled" value={kpis.unscheduled} accent="#E8A020" />
      </div>

      {/* Weekly wins / testimonies (department-shared, follows visible week) */}
      <div style={{ background: 'white', border: `1px solid ${BORDER}`, borderRadius: 10, padding: '8px 10px' }}>
        <button
          type="button"
          onClick={() => setWinsOpen((o) => !o)}
          style={{ display: 'flex', alignItems: 'center', gap: 5, width: '100%', border: 'none', background: 'transparent', padding: 0, cursor: 'pointer', color: TEXT }}
        >
          {winsOpen ? <ChevronDown size={13} color={MUTED} /> : <ChevronRight size={13} color={MUTED} />}
          <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.05em', textTransform: 'uppercase' }}>Wins this week</span>
          <span aria-hidden="true" style={{ fontSize: 12 }}>🙌</span>
        </button>
        {winsOpen && (
          <div style={{ marginTop: 6 }}>
            <WinsSheet departmentId={departmentId} weekStart={weekStart} />
          </div>
        )}
      </div>
    </div>
  )
}
