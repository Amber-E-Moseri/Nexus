export default function SprintTeamPanel({ sprintId, teams, members, canEdit, isArchived, onChanged }) {

  const getTeamColor = (index) => {
    const colors = ['#5B34C7', '#1C87BE', '#E8A020', '#C94830', '#4A8F6C']
    return colors[index % colors.length]
  }

  const getInitials = (name) => {
    if (!name) return '?'
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
  }

  const getTeamMembers = (teamId) => {
    return members.filter((member) => (member.sprint_team_ids ?? []).includes(teamId))
  }

  return (
    <div className="grid gap-4 grid-cols-2">
      {teams.map((team, idx) => {
        const teamMembers = getTeamMembers(team.id)
        const teamColor = getTeamColor(idx)
        return (
          <div key={team.id} className="rounded-2xl border border-[var(--border)] bg-white p-4 shadow-[var(--card-shadow)]">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div
                  style={{ background: teamColor }}
                  className="h-3 w-3 rounded-full"
                />
                <div className="font-semibold text-[var(--text-primary)]">{team.name}</div>
              </div>
              <div className="text-xs text-[var(--text-tertiary)]">
                {teamMembers.length} {teamMembers.length === 1 ? 'member' : 'members'}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {teamMembers.map((member) => (
                <div key={member.user_id} className="flex items-center gap-1.5 rounded-full bg-[var(--surface-secondary)] px-2.5 py-1.5">
                  <div
                    style={{ background: teamColor }}
                    className="flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold text-white"
                  >
                    {getInitials(member.user?.name)}
                  </div>
                  <span className="text-xs font-medium text-[var(--text-primary)]">{member.user?.name?.split(' ')[0]}.</span>
                  {canEdit && !isArchived ? (
                    <button
                      type="button"
                      onClick={() => {
                        /* Remove member handler */
                      }}
                      className="ml-1 text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
                    >
                      ✕
                    </button>
                  ) : null}
                </div>
              ))}
              {canEdit && !isArchived ? (
                <button type="button" className="text-xs font-medium text-[var(--accent)]">
                  + Add
                </button>
              ) : null}
            </div>
          </div>
        )
      })}
    </div>
  )
}
