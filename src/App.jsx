import { lazy, Suspense } from 'react'
import { ErrorBoundary } from 'react-error-boundary'
import { Navigate, Route, Routes } from 'react-router-dom'
import AppError from './components/layout/AppError'
import ProtectedRoute from './components/layout/ProtectedRoute'
import Shell from './components/layout/Shell'
import PageSpinner from './components/ui/PageSpinner'

const Dashboard = lazy(() => import('./pages/Dashboard'))
const Home = lazy(() => import('./pages/Home'))
const Inbox = lazy(() => import('./pages/Inbox'))
const ActivateInvitation = lazy(() => import('./pages/ActivateInvitation'))
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'))
const MinistryCalendar = lazy(() => import('./pages/calendar/MinistryCalendar'))
const CalendarPage = lazy(() => import('./pages/calendar/CalendarPage'))
const CommunicationsPage = lazy(() => import('./pages/communications/CommunicationsPage'))
const RecipientsPage = lazy(() => import('./pages/communications/RecipientsPage'))
const DeptSpace = lazy(() => import('./pages/dept/DeptSpace'))
const FlockView = lazy(() => import('./pages/flock/FlockView'))
const Login = lazy(() => import('./pages/Login'))
const CanMapPage = lazy(() => import('./pages/map/CanMapPage'))
const MeetingsModule = lazy(() => import('./pages/meetings/MeetingsModule'))
const ExpectedAttendeesPage = lazy(() => import('./pages/meetings/ExpectedAttendeesPage'))
const AbsenceEmailLogPage = lazy(() => import('./pages/meetings/AbsenceEmailLogPage'))
const AttendanceTrendsDashboard = lazy(() => import('./pages/AttendanceTrendsDashboard'))
const MyTasks = lazy(() => import('./pages/personal/MyTasks'))
const AllPeoplePage = lazy(() => import('./pages/people/AllPeoplePage'))
const DepartmentsPage = lazy(() => import('./pages/people/DepartmentsPage'))
const InvitationsPage = lazy(() => import('./pages/people/InvitationsPage'))
const PastoralAssignmentsPage = lazy(() => import('./pages/people/PastoralAssignmentsPage'))
const PermissionsPage = lazy(() => import('./pages/people/PermissionsPage'))
const UsersPage = lazy(() => import('./pages/people/UsersPage'))
const AutomationsPage = lazy(() => import('./pages/platform/AutomationsPage'))
const ResetPassword = lazy(() => import('./pages/ResetPassword'))
const SpacesList = lazy(() => import('./pages/spaces/SpacesList'))
const SpaceOverview = lazy(() => import('./pages/spaces/SpaceOverview'))
const SprintOverview = lazy(() => import('./pages/sprints/SprintOverview'))
const SprintsList = lazy(() => import('./pages/sprints/SprintsList'))
const Settings = lazy(() => import('./pages/settings/Settings'))

function onError(error, errorInfo) {
  console.error('[AppErrorBoundary]', error, errorInfo)
}

export default function App() {
  return (
    <ErrorBoundary FallbackComponent={AppError} onError={onError}>
    <Suspense fallback={<PageSpinner />}>
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/activate" element={<ActivateInvitation />} />
      <Route path="/accept-invite" element={<ActivateInvitation />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<Shell />}>
          <Route path="/" element={<Home />} />
          <Route path="/inbox" element={<Inbox />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/my-tasks" element={<MyTasks />} />
          <Route path="/calendar" element={<MinistryCalendar />} />
          <Route
            path="/calendar-management"
            element={
              <ProtectedRoute roles={['super_admin']}>
                <CalendarPage />
              </ProtectedRoute>
            }
          />
          <Route path="/map" element={<CanMapPage />} />
          <Route path="/spaces" element={<SpacesList />} />
          <Route path="/spaces/:spaceId" element={<SpaceOverview />} />
          <Route path="/sprints" element={<SprintsList />} />
          <Route path="/sprints/:sprintId" element={<SprintOverview />} />
          <Route path="/dept/:deptSlug" element={<DeptSpace />} />
          <Route
            path="/flock"
            element={
              <ProtectedRoute roles={['pastor']}>
                <FlockView />
              </ProtectedRoute>
            }
          />
          <Route path="/meetings" element={<MeetingsModule />} />
          <Route
            path="/meetings/expected-attendees"
            element={
              <ProtectedRoute roles={['super_admin', 'dept_lead']}>
                <ExpectedAttendeesPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/meetings/attendance-trends"
            element={
              <ProtectedRoute roles={['super_admin', 'dept_lead', 'pastor']}>
                <AttendanceTrendsDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/meetings/absence-email-log"
            element={
              <AbsenceEmailLogPage />
            }
          />
          <Route
            path="/people"
            element={
              <ProtectedRoute roles={['super_admin', 'dept_lead', 'pastor']}>
                <AllPeoplePage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/people/users"
            element={
              <ProtectedRoute roles={['super_admin', 'dept_lead', 'pastor']}>
                <UsersPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/people/invitations"
            element={
              <ProtectedRoute roles={['super_admin', 'dept_lead']}>
                <InvitationsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/people/departments"
            element={
              <ProtectedRoute roles={['super_admin', 'dept_lead', 'pastor']}>
                <DepartmentsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/people/pastoral-assignments"
            element={
              <ProtectedRoute roles={['super_admin', 'dept_lead', 'pastor']}>
                <PastoralAssignmentsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/people/permissions"
            element={
              <ProtectedRoute roles={['super_admin']}>
                <PermissionsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/automations"
            element={
              <ProtectedRoute roles={['super_admin', 'dept_lead']}>
                <AutomationsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/communications"
            element={
              <ProtectedRoute roles={['super_admin', 'dept_lead']}>
                <CommunicationsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/communications/recipients"
            element={
              <ProtectedRoute roles={['super_admin', 'dept_lead']}>
                <RecipientsPage />
              </ProtectedRoute>
            }
          />
          <Route path="/settings" element={<Settings />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </Suspense>
    </ErrorBoundary>
  )
}
