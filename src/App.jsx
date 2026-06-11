import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import ProtectedRoute from './components/layout/ProtectedRoute'
import Shell from './components/layout/Shell'

const Dashboard = lazy(() => import('./pages/Dashboard'))
const ActivateInvitation = lazy(() => import('./pages/ActivateInvitation'))
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'))
const MinistryCalendar = lazy(() => import('./pages/calendar/MinistryCalendar'))
const CommunicationsPage = lazy(() => import('./pages/communications/CommunicationsPage'))
const DeptSpace = lazy(() => import('./pages/dept/DeptSpace'))
const FlockView = lazy(() => import('./pages/flock/FlockView'))
const Login = lazy(() => import('./pages/Login'))
const CanMapPage = lazy(() => import('./pages/map/CanMapPage'))
const MeetingsModule = lazy(() => import('./pages/meetings/MeetingsModule'))
const MyTasks = lazy(() => import('./pages/personal/MyTasks'))
const DepartmentsPage = lazy(() => import('./pages/people/DepartmentsPage'))
const InvitationsPage = lazy(() => import('./pages/people/InvitationsPage'))
const PastoralAssignmentsPage = lazy(() => import('./pages/people/PastoralAssignmentsPage'))
const UsersPage = lazy(() => import('./pages/people/UsersPage'))
const AutomationsPage = lazy(() => import('./pages/platform/AutomationsPage'))
const ResetPassword = lazy(() => import('./pages/ResetPassword'))
const SpacesList = lazy(() => import('./pages/spaces/SpacesList'))
const SpaceOverview = lazy(() => import('./pages/spaces/SpaceOverview'))
const SprintOverview = lazy(() => import('./pages/sprints/SprintOverview'))
const SprintsList = lazy(() => import('./pages/sprints/SprintsList'))
const Settings = lazy(() => import('./pages/settings/Settings'))

const Spinner = () => (
  <div className="flex h-full w-full items-center justify-center">
    <div className="h-8 w-8 animate-spin rounded-full border-4 border-(--accent) border-t-transparent" />
  </div>
)

export default function App() {
  return (
    <Suspense fallback={<Spinner />}>
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/activate" element={<ActivateInvitation />} />
      <Route path="/accept-invite" element={<ActivateInvitation />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<Shell />}>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/my-tasks" element={<MyTasks />} />
          <Route path="/calendar" element={<MinistryCalendar />} />
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
          <Route path="/settings" element={<Settings />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
    </Suspense>
  )
}
