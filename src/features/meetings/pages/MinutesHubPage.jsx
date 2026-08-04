import { useState, lazy, Suspense } from 'react'
import { Building2, CalendarDays, FileText, Search } from 'lucide-react'
import { useAuth } from '../../../hooks/useAuth'
import PageSpinner from '../../../components/ui/PageSpinner'

const MinutesTimelinePage = lazy(() => import('./MinutesTimelinePage'))
const MinutesCalendarPage = lazy(() => import('./MinutesCalendarPage'))
const MinutesSearchPage = lazy(() => import('./MinutesSearchPage'))

const TABS = [
  { id: 'timeline', label: 'Timeline', Icon: FileText },
  { id: 'calendar', label: 'Calendar', Icon: CalendarDays },
  { id: 'search', label: 'Search', Icon: Search },
]

export default function MinutesHubPage() {
  const { role, profile } = useAuth()
  const [activeTab, setActiveTab] = useState('timeline')
  const isAdmin = ['super_admin', 'regional_secretary'].includes(role)
  const userDeptId = profile?.department_id
  const [selectedDept, setSelectedDept] = useState(isAdmin ? 'all' : userDeptId)
  const departmentId = isAdmin ? selectedDept : (userDeptId ?? 'all')
  const departmentName = profile?.departments?.find((department) => department.id === departmentId)?.name
  const scopeLabel = departmentId === 'all' ? 'All accessible departments' : (departmentName || 'Your department and shared notes')

  return (
    <div style={{ minHeight: '100vh', background: '#FAFAF8' }}>
      <div style={{ background: '#FFFFFF', borderBottom: '1px solid var(--border, #E9E4D8)' }}>
        <div style={{ maxWidth: 960, margin: '0 auto', padding: '26px 20px 0' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16, marginBottom: 22 }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <div style={{ width: 40, height: 40, borderRadius: 8, background: '#F1EEF6', color: '#4C2A92', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                <FileText size={20} />
              </div>
              <div>
                <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: 'var(--text-primary, #1C1610)' }}>Meeting Minutes</h1>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--text-secondary, #7A6F5E)', marginTop: 5 }}>
                  <Building2 size={13} />
                  <span>{scopeLabel}</span>
                </div>
              </div>
            </div>

            {isAdmin && (
              <label style={{ display: 'grid', gap: 5, fontSize: 11, fontWeight: 700, color: 'var(--text-secondary, #7A6F5E)' }}>
                View minutes for
                <select
                  aria-label="Department scope"
                  value={selectedDept}
                  onChange={(event) => setSelectedDept(event.target.value)}
                  style={{ minWidth: 190, padding: '8px 10px', border: '1px solid var(--border, #E9E4D8)', borderRadius: 7, fontSize: 13, fontFamily: 'inherit', color: 'var(--text-primary, #1C1610)', background: '#FFFFFF', cursor: 'pointer' }}
                >
                  <option value="all">All departments</option>
                  {(profile?.departments ?? []).map((department) => (
                    <option key={department.id} value={department.id}>{department.name}</option>
                  ))}
                </select>
              </label>
            )}
          </div>

          <div style={{ display: 'flex', gap: 4, overflowX: 'auto' }}>
            {TABS.map(({ id, label, Icon }) => (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '10px 15px', border: 'none', borderBottom: activeTab === id ? '2px solid #4C2A92' : '2px solid transparent', background: 'none', fontFamily: 'inherit', fontSize: 13, fontWeight: activeTab === id ? 700 : 500, color: activeTab === id ? '#4C2A92' : 'var(--text-secondary, #7A6F5E)', cursor: 'pointer', whiteSpace: 'nowrap' }}
              >
                <Icon size={15} /> {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <main style={{ maxWidth: 960, margin: '0 auto', padding: '24px 20px 56px' }}>
        <Suspense fallback={<PageSpinner />}>
          {activeTab === 'timeline' && <MinutesTimelinePage departmentId={departmentId} />}
          {activeTab === 'calendar' && <MinutesCalendarPage departmentId={departmentId} />}
          {activeTab === 'search' && <MinutesSearchPage departmentId={departmentId} />}
        </Suspense>
      </main>
    </div>
  )
}
