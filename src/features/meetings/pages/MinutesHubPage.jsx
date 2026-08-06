import { useState, lazy, Suspense } from 'react'
import { Building2, CalendarDays, FileText, Plus, Search } from 'lucide-react'
import { useAuth } from '../../../hooks/useAuth'
import PageSpinner from '../../../components/ui/PageSpinner'
import MeetingModal from '../components/MeetingModal'
import { MeetingsProvider } from '../MeetingsContext'

const MinutesTimelinePage = lazy(() => import('./MinutesTimelinePage'))
const MinutesCalendarPage = lazy(() => import('./MinutesCalendarPage'))
const MinutesSearchPage = lazy(() => import('./MinutesSearchPage'))

const TABS = [
  { id: 'timeline', label: 'Timeline', Icon: FileText },
  { id: 'calendar', label: 'Calendar', Icon: CalendarDays },
  { id: 'search', label: 'Search', Icon: Search },
]

const MEETING_TYPES = [
  { value: 'general', label: 'General' },
  { value: 'manager_meeting', label: 'Managers Meeting' },
  { value: 'regional', label: 'Regional' },
  { value: 'group', label: 'Group' },
  { value: 'team', label: 'Team' },
  { value: 'department', label: 'Department' },
  { value: 'media', label: 'Media' },
  { value: 'staff_meeting', label: 'Staff Meeting' },
  { value: '1_on_1_meeting', label: '1:1 Meeting' },
]

export default function MinutesHubPage() {
  const { role, profile } = useAuth()
  const isExternalMember = Boolean(profile?.is_temporary)
  const tabs = isExternalMember ? TABS.filter((tab) => tab.id !== 'calendar') : TABS
  const [activeTab, setActiveTab] = useState('timeline')
  const isAdmin = ['super_admin', 'regional_secretary'].includes(role)
  const [selectedDept, setSelectedDept] = useState('all')
  const [meetingType, setMeetingType] = useState('all')
  const [showLogMeeting, setShowLogMeeting] = useState(false)
  const [minutesVersion, setMinutesVersion] = useState(0)
  // The meeting query runs as the signed-in user. "all" therefore means every
  // meeting that user can read under RLS, including private meetings they own
  // or were explicitly invited to.
  const departmentId = isAdmin ? selectedDept : 'all'
  const logDepartmentId = departmentId === 'all' ? profile?.department_id ?? null : departmentId
  const departmentName = profile?.departments?.find((department) => department.id === departmentId)?.name
  const scopeLabel = departmentId === 'all' ? 'All meetings you can access' : (departmentName || 'Accessible meetings in this department')

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

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
              {isAdmin && (
                <label style={{ display: 'grid', gap: 5, fontSize: 11, fontWeight: 700, color: 'var(--text-secondary, #7A6F5E)' }}>
                  View minutes for
                  <select
                    aria-label="Department scope"
                    value={selectedDept}
                    onChange={(event) => setSelectedDept(event.target.value)}
                    style={{ minWidth: 190, padding: '8px 10px', border: '1px solid var(--border, #E9E4D8)', borderRadius: 7, fontSize: 13, fontFamily: 'inherit', color: 'var(--text-primary, #1C1610)', background: '#FFFFFF', cursor: 'pointer' }}
                  >
                    <option value="all">All spaces</option>
                    {(profile?.departments ?? []).map((department) => (
                      <option key={department.id} value={department.id}>{department.name}</option>
                    ))}
                  </select>
                </label>
              )}
              <label style={{ display: 'grid', gap: 5, fontSize: 11, fontWeight: 700, color: 'var(--text-secondary, #7A6F5E)' }}>
                Meeting type
                <select
                  aria-label="Meeting type"
                  value={meetingType}
                  onChange={(event) => setMeetingType(event.target.value)}
                  style={{ minWidth: 170, padding: '8px 10px', border: '1px solid var(--border, #E9E4D8)', borderRadius: 7, fontSize: 13, fontFamily: 'inherit', color: 'var(--text-primary, #1C1610)', background: '#FFFFFF', cursor: 'pointer' }}
                >
                  <option value="all">All meeting types</option>
                  {MEETING_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
                </select>
              </label>
            </div>
            {!isExternalMember && (
              <button
                type="button"
                onClick={() => setShowLogMeeting(true)}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 7, border: 'none', borderRadius: 7, padding: '9px 13px', background: '#4C2A92', color: '#FFFFFF', fontFamily: 'inherit', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
              >
                <Plus size={16} /> Log meeting
              </button>
            )}
          </div>

          <div style={{ display: 'flex', gap: 4, overflowX: 'auto' }}>
            {tabs.map(({ id, label, Icon }) => (
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
          {activeTab === 'timeline' && <MinutesTimelinePage key={`timeline:${minutesVersion}`} departmentId={departmentId} meetingType={meetingType} readOnly={isExternalMember} profileId={profile?.id} isSuperAdmin={role === 'super_admin'} />}
          {activeTab === 'calendar' && <MinutesCalendarPage key={`calendar:${minutesVersion}`} departmentId={departmentId} meetingType={meetingType} readOnly={isExternalMember} />}
          {activeTab === 'search' && <MinutesSearchPage key={`search:${minutesVersion}`} departmentId={departmentId} meetingType={meetingType} readOnly={isExternalMember} profileId={profile?.id} isSuperAdmin={role === 'super_admin'} />}
        </Suspense>
      </main>
      {showLogMeeting && (
        <MeetingsProvider departmentId={logDepartmentId}>
          <MeetingModal
            departmentId={logDepartmentId}
            onClose={() => {
              setShowLogMeeting(false)
              setMinutesVersion((version) => version + 1)
            }}
          />
        </MeetingsProvider>
      )}
    </div>
  )
}
