import { useEffect } from 'react'
import { useAuth } from '../../hooks/useAuth'

export default function ReportingPage() {
  const { profile } = useAuth()

  useEffect(() => {
    // Redirect non-super_admin to dashboard
    if (profile && profile.role !== 'super_admin') {
      window.location.href = '/'
    }
  }, [profile])

  if (!profile || profile.role !== 'super_admin') {
    return null
  }

  return (
    <div style={{ minHeight: '100vh', background: '#FAFAF8', padding: '20px' }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 20 }}>Reporting Dashboard</h1>
      <p style={{ color: '#9E9488' }}>Member intelligence data synced from LWCanada CMP — coming soon</p>
    </div>
  )
}
