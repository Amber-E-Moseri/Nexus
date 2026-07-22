import { useMemo } from 'react'
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
  if (!tasksByTeam || Object.keys(tasksByTeam).length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-tertiary)', fontSize: 13 }}>
        <p>No teams yet. Create teams to get started.</p>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {Object.entries(tasksByTeam).map(([teamId, { team, tasks: teamTasks }]) => (
        <div key={teamId}>
          <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
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

          {/* Team's Kanban board */}
          <div style={{ background: 'var(--surface-secondary)', borderRadius: 12, padding: 12 }}>
            {teamTasks.length === 0 ? (
              <p style={{ fontSize: 12, color: 'var(--text-tertiary)', textAlign: 'center', padding: '2rem 0', margin: 0 }}>
                No tasks assigned to this team
              </p>
            ) : (
              <KanbanBoard
                filteredTasks={teamTasks}
                onTaskClick={onTaskClick}
                onCreateTask={onCreateTask}
                readOnly={readOnly}
                teamMembers={teamMembers}
                statusesOverride={statuses}
              />
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
