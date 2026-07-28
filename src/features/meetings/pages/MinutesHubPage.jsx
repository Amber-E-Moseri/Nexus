import { useState, lazy, Suspense } from 'react'
import { useAuth } from '../../../hooks/useAuth'
import PageSpinner from '../../../components/ui/PageSpinner'

const MinutesTimelinePage = lazy(() => import('./MinutesTimelinePage'))
const MinutesCalendarPage = lazy(() => import('./MinutesCalendarPage'))
const MinutesSearchPage   = lazy(() => import('./MinutesSearchPage'))

const TABS = [
  { id: 'timeline', label: '📋 Timeline' },
  { id: 'calendar', label: '📅 Calendar' },
  { id: 'search',   label: '🔍 Search'   },
]

export default function MinutesHubPage() {
  const { role, profile } = useAuth()
  const [activeTab, setActiveTab] = useState('timeline')

  const isAdmin = ['super_admin', 'regional_secretary'].includes(role)
  const userDeptId = profile?.department_id

  // Super admin / regional_secretary start on 'all' and can switch.
  // Regular users are always pinned to their own dept.
  const [selectedDept, setSelectedDept] = useState(isAdmin ? 'all' : userDeptId)

  // departmentId passed to sub-pages
  const departmentId = isAdmin ? selectedDept : (userDeptId ?? 'all')

  return (
    <div style={{ maxWidth: 820, margin: '0 auto', padding: '28px 20px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: 'var(--text-primary, #1C1610)' }}>
            Meeting Minutes
          </h1>
          <div style={{ fontSize: 12, color: 'var(--text-secondary, #7A6F5E)', marginTop: 3 }}>
            Browse, search, and explore published notes
          </div>
        </div>

        {/* Department filter — admins only */}
        {isAdmin && profile?.departments && (
          <select
            value={selectedDept}
            onChange={e => setSelectedDept(e.target.value)}
            style={{
              padding: '7px 10px',
              border: '1px solid var(--border, #E9E4D8)',
              borderRadius: 7,
              fontSize: 12,
              fontFamily: 'inherit',
              color: 'var(--text-primary, #1C1610)',
              background: 'var(--surface, #FFFFFF)',
              cursor: 'pointer',
            }}
          >
            <option value="all">All departments</option>
            {(profile.departments ?? []).map(d => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        )}
      </div>

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 2, borderBottom: '1px solid var(--border, #E9E4D8)', marginBottom: 24 }}>
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: '9px 16px',
              border: 'none',
              borderBottom: activeTab === tab.id ? '2px solid var(--color-primary, #4C2A92)' : '2px solid transparent',
              background: 'none',
              fontFamily: 'inherit',
              fontSize: 13,
              fontWeight: activeTab === tab.id ? 700 : 500,
              color: activeTab === tab.id ? 'var(--color-primary, #4C2A92)' : 'var(--text-secondary, #7A6F5E)',
              cursor: 'pointer',
              marginBottom: -1,
              whiteSpace: 'nowrap',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <Suspense fallback={<PageSpinner />}>
        {activeTab === 'timeline' && <MinutesTimelinePage departmentId={departmentId} />}
        {activeTab === 'calendar' && <MinutesCalendarPage departmentId={departmentId} />}
        {activeTab === 'search'   && <MinutesSearchPage   departmentId={departmentId} />}
      </Suspense>
    </div>
  )
}
