import { useAuth } from '../../hooks/useAuth'
import { FLOCK_CRM_CONFIG } from '../../lib/permissions'
import FlockCRMWrapper from '../../components/flock/FlockCRMWrapper'

export default function FlockCRMPage() {
  const { profile, role } = useAuth()

  if (!FLOCK_CRM_CONFIG.enabled) {
    return (
      <div style={{ padding: '24px', textAlign: 'center' }}>
        <h2>Flock CRM Unavailable</h2>
        <p>Flock CRM is not currently enabled.</p>
      </div>
    )
  }

  if (!FLOCK_CRM_CONFIG.checkAccess(role)) {
    return (
      <div style={{ padding: '24px', textAlign: 'center' }}>
        <h2>Access Denied</h2>
        <p>You do not have permission to access Flock CRM.</p>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '16px 24px', borderBottom: '1px solid #EDE8DC', background: '#FBF8F2' }}>
        <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 600, color: '#1C1610' }}>Flock CRM</h1>
        <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#7A6F5E' }}>Pastoral outreach tracking</p>
      </div>
      <div style={{ flex: 1, overflow: 'hidden' }}>
        <FlockCRMWrapper
          flockApiUrl={FLOCK_CRM_CONFIG.apiUrl}
          userId={profile?.id}
          userRole={role}
        />
      </div>
    </div>
  )
}
