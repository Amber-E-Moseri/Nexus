import { lazy, Suspense, useEffect } from 'react'
import { ErrorBoundary } from 'react-error-boundary'
import { Navigate, Route, Routes } from 'react-router-dom'
import AppError from './components/layout/AppError'
import ProtectedRoute from './components/layout/ProtectedRoute'
import Shell from './components/layout/Shell'
import PageSpinner from './components/ui/PageSpinner'
import { PWAInstallPrompt } from './components/PWAInstallPrompt'
import { OfflineIndicator } from './components/OfflineIndicator'

// Register service worker for PWA (offline support, caching, push notifications)
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/service-worker.js')
    .then(registration => console.log('[PWA] Service Worker registered successfully'))
    .catch(err => console.warn('[PWA] Service Worker registration failed:', err))
}

const Dashboard = lazy(() => import('./pages/Dashboard'))
const Home = lazy(() => import('./pages/Home'))
const Inbox = lazy(() => import('./pages/Inbox'))
const ActivateInvitation = lazy(() => import('./pages/ActivateInvitation'))
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'))
const MinistryCalendar = lazy(() => import('./pages/calendar/MinistryCalendar'))
const CalendarPage = lazy(() => import('./pages/calendar/CalendarPage'))
const CalendarManagementPage = lazy(() => import('./pages/calendar/CalendarManagementPage'))
const CalendarReviewPage = lazy(() => import('./pages/calendar/CalendarReviewPage'))
const CalendarSettingsPage = lazy(() => import('./pages/calendar/CalendarSettingsPage'))
const CommunicationsPage = lazy(() => import('./pages/communications/CommunicationsPage'))
const RecipientsPage = lazy(() => import('./pages/communications/RecipientsPage'))
const AnalyticsPage = lazy(() => import('./pages/communications/AnalyticsPage'))
const CampaignPage = lazy(() => import('./pages/communications/CampaignPage'))
const SegmentsPage = lazy(() => import('./pages/communications/SegmentsPage'))
const DeptSpace = lazy(() => import('./pages/dept/DeptSpace'))
const FlockView = lazy(() => import('./pages/flock/FlockView'))
const FlockCRMPage = lazy(() => import('./pages/flock/FlockCRMPage'))
const Login = lazy(() => import('./pages/Login'))
const CanMapPage = lazy(() => import('./pages/map/CanMapPage'))
const MeetingsModule = lazy(() => import('./pages/meetings/MeetingsModule'))
const MeetingDetailView = lazy(() => import('./pages/meetings/MeetingDetailView'))
const MeetingWizardPage = lazy(() => import('./pages/meetings/MeetingWizardPage'))
const ExpectedAttendeesPage = lazy(() => import('./pages/meetings/ExpectedAttendeesPage'))
const AbsenceEmailLogPage = lazy(() => import('./pages/meetings/AbsenceEmailLogPage'))
const AttendanceTrendsDashboard = lazy(() => import('./pages/AttendanceTrendsDashboard'))
const MyTasks = lazy(() => import('./pages/personal/MyTasks'))
const Planner = lazy(() => import('./pages/Planner'))
const AllPeoplePage = lazy(() => import('./pages/people/AllPeoplePage'))
const DepartmentsPage = lazy(() => import('./pages/people/DepartmentsPage'))
const InvitationsPage = lazy(() => import('./pages/people/InvitationsPage'))
const PastoralAssignmentsPage = lazy(() => import('./pages/people/PastoralAssignmentsPage'))
const PermissionsPage = lazy(() => import('./pages/people/PermissionsPage'))
const UsersPage = lazy(() => import('./pages/people/UsersPage'))
const AutomationsPage = lazy(() => import('./pages/platform/AutomationsPage'))
const ResetPassword = lazy(() => import('./pages/ResetPassword'))
const ConfirmInvite = lazy(() => import('./pages/auth/ConfirmInvite'))
const SetPassword = lazy(() => import('./pages/auth/SetPassword'))
const SignupInvite = lazy(() => import('./pages/auth/SignupInvite'))
const SpacesList = lazy(() => import('./pages/spaces/SpacesList'))
const SpaceOverview = lazy(() => import('./pages/spaces/SpaceOverview'))
const SprintOverview = lazy(() => import('./pages/sprints/SprintOverview'))
const SprintsList = lazy(() => import('./pages/sprints/SprintsList'))
const NotificationsPage = lazy(() => import('./pages/NotificationsPage'))
const Settings = lazy(() => import('./pages/settings/Settings'))
const IntegrationStatusPage = lazy(() => import('./pages/settings/IntegrationStatusPage'))
const GoogleDriveAuthCallback = lazy(() => import('./pages/auth/GoogleDriveAuthCallback'))
const GoogleCalendarCallback = lazy(() => import('./pages/auth/GoogleCalendarCallback'))
const SlackCallback = lazy(() => import('./pages/auth/SlackCallback'))
const OutlookCalendarCallback = lazy(() => import('./pages/auth/OutlookCalendarCallback'))
const TeamsCallback = lazy(() => import('./pages/auth/TeamsCallback'))
const ApiDocumentationPage = lazy(() => import('./pages/ApiDocumentationPage'))
const ActivityLogPage = lazy(() => import('./pages/ActivityLogPage'))
const FilesPage = lazy(() => import('./pages/FilesPage'))
const MeetingReportPublicPage = lazy(() => import('./pages/reports/MeetingReportPublicPage'))
const PersonalIntegrationsPage = lazy(() => import('./pages/settings/PersonalIntegrationsPage'))
const CampusEditsPage = lazy(() => import('./pages/admin/CampusEditsPage'))
const AdminPermissionsPage = lazy(() => import('./pages/admin/PermissionsPage'))
const RSVPPage = lazy(() => import('./pages/communications/RSVPPage'))
const InvitationWizard = lazy(() => import('./pages/communications/InvitationWizard'))
const InvitationDetailPage = lazy(() => import('./pages/communications/InvitationDetailPage'))
const InstagramGradingPage = lazy(() => import('./features/instagram/pages/InstagramGradingPage'))

function onError(error, errorInfo) {
  console.error('[AppErrorBoundary]', error, errorInfo)
}

export default function App() {
  return (
    <ErrorBoundary FallbackComponent={AppError} onError={onError}>
      <OfflineIndicator />
      <PWAInstallPrompt />
      <Suspense fallback={<PageSpinner />}>
        <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<SignupInvite />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/set-password" element={<SetPassword />} />
      <Route path="/confirm-invite" element={<ConfirmInvite />} />
      <Route path="/activate" element={<ActivateInvitation />} />
      <Route path="/accept-invite" element={<ActivateInvitation />} />
      <Route path="/auth/google-drive/callback" element={<GoogleDriveAuthCallback />} />
      <Route path="/auth/google_calendar-callback" element={<GoogleCalendarCallback />} />
      <Route path="/auth/slack-callback" element={<SlackCallback />} />
      <Route path="/auth/outlook_calendar-callback" element={<OutlookCalendarCallback />} />
      <Route path="/auth/teams-callback" element={<TeamsCallback />} />
      <Route path="/reports/:share_token" element={<MeetingReportPublicPage />} />
      <Route path="/rsvp" element={<RSVPPage />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<Shell />}>
          <Route path="/" element={<Home />} />
          <Route path="/inbox" element={<Inbox />} />
          <Route path="/notifications" element={<NotificationsPage />} />
          <Route
            path="/activity-log"
            element={
              <ProtectedRoute roles={['super_admin', 'dept_lead']}>
                <ActivityLogPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/files"
            element={
              <ProtectedRoute roles={['super_admin', 'dept_lead']}>
                <FilesPage />
              </ProtectedRoute>
            }
          />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/my-tasks" element={<MyTasks />} />
          <Route path="/planner" element={<Planner />} />
          <Route path="/calendar" element={<MinistryCalendar />} />
          <Route
            path="/calendar-management"
            element={
              <ProtectedRoute roles={['super_admin']}>
                <CalendarManagementPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/calendar/review"
            element={
              <ProtectedRoute roles={['super_admin', 'regional_secretary', 'dept_lead']}>
                <CalendarReviewPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/calendar/settings"
            element={
              <ProtectedRoute roles={['super_admin', 'dept_lead']}>
                <CalendarSettingsPage />
              </ProtectedRoute>
            }
          />
          <Route path="/map" element={<CanMapPage />} />
          <Route
            path="/admin/campus-edits"
            element={
              <ProtectedRoute roles={['super_admin', 'ors']}>
                <CampusEditsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/permissions"
            element={
              <ProtectedRoute roles={['super_admin']}>
                <AdminPermissionsPage />
              </ProtectedRoute>
            }
          />
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
          <Route
            path="/flock-crm"
            element={
              <ProtectedRoute roles={['regional_secretary']}>
                <FlockCRMPage />
              </ProtectedRoute>
            }
          />
          <Route path="/meetings" element={<MeetingsModule />} />
          <Route path="/meetings/:meetingId" element={<MeetingDetailView />} />
          <Route
            path="/meetings/wizard"
            element={
              <ProtectedRoute roles={['super_admin', 'dept_lead']}>
                <MeetingWizardPage />
              </ProtectedRoute>
            }
          />
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
          <Route
            path="/communications/campaigns"
            element={
              <ProtectedRoute roles={['super_admin', 'dept_lead']}>
                <CampaignPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/communications/segments"
            element={
              <ProtectedRoute roles={['super_admin', 'dept_lead']}>
                <SegmentsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/communications/analytics"
            element={
              <ProtectedRoute roles={['super_admin', 'dept_lead']}>
                <AnalyticsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/communications/invitations/new"
            element={
              <ProtectedRoute roles={['super_admin', 'dept_lead']}>
                <InvitationWizard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/communications/invitations/:id"
            element={
              <ProtectedRoute roles={['super_admin', 'dept_lead']}>
                <InvitationDetailPage />
              </ProtectedRoute>
            }
          />
          <Route path="/settings" element={<Settings />} />
          <Route path="/settings/personal-integrations" element={<PersonalIntegrationsPage />} />
          <Route
            path="/settings/integrations"
            element={
              <ProtectedRoute roles={['super_admin']}>
                <IntegrationStatusPage />
              </ProtectedRoute>
            }
          />
          <Route path="/settings/api-docs" element={<ApiDocumentationPage />} />
          <Route
            path="/instagram"
            element={
              <ProtectedRoute roles={['super_admin', 'regional_secretary', 'media']}>
                <InstagramGradingPage />
              </ProtectedRoute>
            }
          />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </Suspense>
    </ErrorBoundary>
  )
}
// Test comment
