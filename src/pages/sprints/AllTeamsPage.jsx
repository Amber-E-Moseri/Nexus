import { useState, useEffect } from 'react'
import { listAllTeams } from '../../lib/sprints'
import TeamCard from '../../modules/sprints/TeamCard'
import NewTeamModal from '../../modules/sprints/NewTeamModal'
import ImportTeamModal from '../../modules/sprints/ImportTeamModal'

export default function AllTeamsPage() {
  const [teams, setTeams] = useState([])
  const [loading, setLoading] = useState(true)
  const [showNewTeamModal, setShowNewTeamModal] = useState(false)
  const [showImportModal, setShowImportModal] = useState(false)

  useEffect(() => {
    loadTeams()
  }, [])

  async function loadTeams() {
    try {
      setLoading(true)
      const data = await listAllTeams()
      setTeams(data)
    } catch (err) {
      console.error('Failed to load teams:', err)
      alert('Failed to load teams')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <p>Loading teams...</p>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 style={{ margin: '0 0 4px 0', fontSize: '24px', fontWeight: 600 }}>Sprint Teams</h1>
          <p style={{ margin: '0', fontSize: '13px', color: 'var(--text-tertiary)' }}>
            Manage independent teams and assign them to sprints
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => setShowNewTeamModal(true)}
            style={{
              padding: '10px 16px',
              borderRadius: '8px',
              border: 'none',
              background: '#4C2A92',
              color: 'white',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: 500,
            }}
          >
            + New Team
          </button>
          <button
            onClick={() => setShowImportModal(true)}
            style={{
              padding: '10px 16px',
              borderRadius: '8px',
              border: '1px solid var(--border)',
              background: 'white',
              color: 'var(--text-primary)',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: 500,
            }}
          >
            Import from Space
          </button>
        </div>
      </div>

      {teams.length === 0 ? (
        <div
          style={{
            textAlign: 'center',
            padding: '40px 20px',
            background: 'var(--surface-secondary)',
            borderRadius: '16px',
            color: 'var(--text-tertiary)',
          }}
        >
          <p style={{ margin: '0 0 16px 0' }}>No teams yet</p>
          <p style={{ margin: '0', fontSize: '13px' }}>Create your first team or import one from a space</p>
        </div>
      ) : (
        <div>
          {teams.map((team) => (
            <TeamCard key={team.id} team={team} onRefresh={loadTeams} />
          ))}
        </div>
      )}

      {showNewTeamModal && <NewTeamModal onClose={() => setShowNewTeamModal(false)} onSuccess={loadTeams} />}

      {showImportModal && <ImportTeamModal onClose={() => setShowImportModal(false)} onSuccess={loadTeams} />}
    </div>
  )
}
