import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import KanbanBoard from '../../tasks/components/KanbanBoard'

export default function AllTeamsBoard({
  tasks,
  tasksByTeam,
  sprint,
  currentUser,
  onTaskClick,
  onCreateTask,
  readOnly,
  teamMembers,
  statuses,
}) {
  // Teams with no tasks start collapsed -- an empty 5-column board per team
  // buries the teams that actually have work under a wall of blank columns.
  const [collapsedTeams, setCollapsedTeams] = useState(
    () => new Set(
      Object.entries(tasksByTeam ?? {})
        .filter(([, { tasks: teamTasks }]) => teamTasks.length === 0)
        .map(([teamId]) => teamId),
    ),
  )

  function toggleTeam(teamId) {
    setCollapsedTeams((prev) => {
      const next = new Set(prev)
      if (next.has(teamId)) next.delete(teamId)
      else next.add(teamId)
      return next
    })
  }

  if (!tasksByTeam || Object.keys(tasksByTeam).length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-tertiary)', fontSize: 13 }}>
        <p>No teams yet. Create teams to get started.</p>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {Object.entries(tasksByTeam).map(([teamId, { team, tasks: teamTasks }]) => {
        const collapsed = collapsedTeams.has(teamId)
        return (
        <div key={teamId}>
          <div
            onClick={() => toggleTeam(teamId)}
            style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none' }}
          >
            <ChevronDown
              size={14}
              style={{ color: 'var(--text-tertiary)', transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)', transition: 'transform 0.15s', flexShrink: 0 }}
            />
            <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
              {team.name}
            </h3>
            <span
              style={{
                fontSize: 11,
                background: 'var(--surface-secondary)',
                color: 'var(--text-secondary)',
                padding: '2px 8px',
                borderRadius: 4,
              }}
            >
              {teamTasks.length} task{teamTasks.length !== 1 ? 's' : ''}
            </span>
            {team.lead_user_id && (
              <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                Lead: {team.lead_user_id === currentUser?.id ? 'You' : 'TBD'}
              </span>
            )}
          </div>

          {/* Team's Kanban board — KanbanBoard renders empty columns with their
              own add-task composer, so it's safe to render even with 0 tasks;
              a bare "no tasks" message here would be a dead end with no way
              to add one. */}
          {!collapsed && (
            <div style={{ background: 'var(--surface-secondary)', borderRadius: 12, padding: 12 }}>
              <KanbanBoard
                filteredTasks={teamTasks}
                onTaskClick={onTaskClick}
                onCreateTask={onCreateTask}
                readOnly={readOnly}
                teamMembers={teamMembers}
                statusesOverride={statuses}
              />
            </div>
          )}
        </div>
        )
      })}
    </div>
  )
}
