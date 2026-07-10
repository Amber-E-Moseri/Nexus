import { lazy, Suspense, useEffect } from 'react'
import { ErrorBoundary } from 'react-error-boundary'
import { Navigate, Route, Routes } from 'react-router-dom'
import { preloadOnIdle, registerRoutePreload } from './lib/routePreload'
import { INSTAGRAM_GRADING_ENABLED } from './config/features.js'
import AppError from './components/layout/AppError'
import ProtectedRoute from './components/layout/ProtectedRoute'
import Shell from './components/layout/Shell'
import PageSpinner from './components/ui/PageSpinner'
import { PWAInstallPrompt } from './components/PWAInstallPrompt'
import { OfflineIndicator } from './components/OfflineIndicator'

// Register service worker for PWA (offline support, caching, push notifications).
// Production only — in dev its cache-first .js handling can mask code changes
// behind a stale cached module for up to 7 days.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  navigator.serviceWorker.register('/service-worker.js')
    .then(registration => console.log('[PWA] Service Worker registered successfully'))
    .catch(err => console.warn('[PWA] Service Worker registration failed:', err))
}

// lazyRoute registers the import for hover/idle prefetching (BLW-07);
// plain lazy() routes load on first navigation only.
function lazyRoute(pathPrefix, importFn) {
  registerRoutePreload(pathPrefix, importFn)
  return lazy(importFn)
}

const Dashboard = lazyRoute('/dashboard', () => import('./pages/Dashboard'))
const Inbox = lazyRoute('/inbox', () => import('./pages/Inbox'))
const ActivateInvitation = lazy(() => import('./pages/ActivateInvitation'))
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'))
const MinistryCalendar = lazyRoute('/calendar', () => import('./pages/calendar/MinistryCalendar'))
const CalendarManagementPage = lazy(() => import('./pages/calendar/CalendarManagementPage'))
const CalendarReviewPage = lazy(() => import('./pages/calendar/CalendarReviewPage'))
const CalendarSettingsPage = lazy(() => import('./pages/calendar/CalendarSettingsPage'))
const CommunicationsLayout = lazyRoute('/communications', () => import('./pages/communications/CommunicationsLayout'))
const CommunicationsOverview = lazy(() => import('./pages/communications/CommunicationsOverview'))
const RecipientsPage = lazy(() => import('./pages/communications/RecipientsPage'))
const AnalyticsPage = lazy(() => import('./pages/communications/AnalyticsPage'))
const CampaignPage = lazy(() => import('./pages/communications/CampaignPage'))
const EmailComposerPage = lazy(() => import('./pages/communications/EmailComposerPage'))
const EmailTemplatesPage = lazy(() => import('./pages/communications/EmailTemplatesPage'))
const SegmentsPage = lazy(() => import('./pages/communications/SegmentsPage'))
const AbsenteeFollowUpPage = lazy(() => import('./pages/communications/AbsenteeFollowUpPage'))
const DeptSpace = lazy(() => import('./pages/dept/DeptSpace'))
const FlockView = lazyRoute('/flock', () => import('./pages/flock/FlockView'))
const FlockCRMPage = lazyRoute('/flock-crm', () => import('./pages/flock/FlockCRMPage'))
const Login = lazy(() => import('./pages/Login'))
const CanMapPage = lazyRoute('/map', () => import('./pages/map/CanMapPage'))
const MeetingsModule = lazyRoute('/meetings', () => import('./pages/meetings/MeetingsModule'))
const MeetingDetailView = lazy(() => import('./pages/meetings/MeetingDetailView'))
const MeetingWizardPage = lazy(() => import('./pages/meetings/MeetingWizardPage'))
const ExpectedAttendeesPage = lazy(() => import('./pages/meetings/ExpectedAttendeesPage'))
const AbsenceEmailLogPage = lazy(() => import('./pages/meetings/AbsenceEmailLogPage'))
const AttendanceTrendsDashboard = lazy(() => import('./pages/AttendanceTrendsDashboard'))
const MyTasks = lazyRoute('/my-tasks', () => import('./pages/personal/MyTasks'))
const PersonalList = lazyRoute('/personal-list', () => import('./pages/personal/PersonalListPage'))
const Planner = lazyRoute('/planner', () => import('./pages/Planner'))
const AllPeoplePage = lazy(() => import('./pages/people/AllPeoplePage'))
const DepartmentsPage = lazy(() => import('./pages/people/DepartmentsPage'))
const InvitationsPage = lazy(() => import('./pages/people/InvitationsPage'))
const PastoralAssignmentsPage = lazy(() => import('./pages/people/PastoralAssignmentsPage'))
const PermissionsPage = lazy(() => import('./pages/people/PermissionsPage'))
const UsersPage = lazyRoute('/people', () => import('./pages/people/UsersPage'))
const AutomationsPage = lazy(() => import('./pages/platform/AutomationsPage'))
const ResetPassword = lazy(() => import('./pages/ResetPassword'))
const ConfirmInvite = lazy(() => import('./pages/auth/ConfirmInvite'))
const SetPassword = lazy(() => import('./pages/auth/SetPassword'))
const SignupInvite = lazy(() => import('./pages/auth/SignupInvite'))
const SpacesList = lazy(() => import('./pages/spaces/SpacesList'))
const SpaceOverview = lazyRoute('/spaces', () => import('./pages/spaces/SpaceOverview'))
const SprintOverview = lazy(() => import('./pages/sprints/SprintOverview'))
const SprintsList = lazyRoute('/sprints', () => import('./pages/sprints/SprintsList'))
const NotificationsPage = lazyRoute('/notifications', () => import('./pages/NotificationsPage'))
const Settings = lazyRoute('/settings', () => import('./pages/settings/Settings'))
const IntegrationStatusPage = lazy(() => import('./pages/settings/IntegrationStatusPage'))
const GoogleDriveAuthCallback = lazy(() => import('./pages/auth/GoogleDriveAuthCallback'))
const GoogleCalendarCallback = lazy(() => import('./pages/auth/GoogleCalendarCallback'))
const MinistryCalendarConnectionCallback = lazy(() => import('./pages/calendar/MinistryCalendarConnectionCallback'))
const SlackCallback = lazy(() => import('./pages/auth/SlackCallback'))
const OutlookCalendarCallback = lazy(() => import('./pages/auth/OutlookCalendarCallback'))
const TeamsCallback = lazy(() => import('./pages/auth/TeamsCallback'))
const ApiDocumentationPage = lazy(() => import('./pages/ApiDocumentationPage'))
const ActivityLogPage = lazy(() => import('./pages/ActivityLogPage'))
const FilesPage = lazy(() => import('./pages/FilesPage'))
const MeetingReportPublicPage = lazy(() => import('./pages/reports/MeetingReportPublicPage'))
const PersonalIntegrationsPage = lazy(() => import('./pages/settings/PersonalIntegrationsPage'))
const CampusEditsPage = lazy(() => import('./pages/admin/CampusEditsPage'))
const CampusPhotosSettings = lazy(() => import('./pages/settings/CampusPhotosSettings'))
const AdminPermissionsPage = lazy(() => import('./pages/admin/PermissionsPage'))
const RSVPPage = lazy(() => import('./pages/communications/RSVPPage'))
const SubscribePage = lazy(() => import('./pages/communications/SubscribePage'))
const ConfirmSubscriptionPage = lazy(() => import('./pages/communications/ConfirmSubscriptionPage'))
const InvitationWizard = lazy(() => import('./pages/communications/InvitationWizard'))
const InvitationDetailPage = lazy(() => import('./pages/communications/InvitationDetailPage'))
const InvitationsListPage = lazy(() => import('./pages/communications/InvitationsListPage'))
const InstagramGradingPage = lazyRoute('/instagram', () => import('./features/instagram/pages/InstagramGradingPage'))
const HelpPage = lazyRoute('/help', () => import('./pages/HelpPage'))

function onError(error, errorInfo) {
  console.error('[AppErrorBoundary]', error, errorInfo)
}

export default function App() {
  // Warm the most likely first destinations once the browser goes idle after
  // initial paint (BLW-07); sidebar hover preloads the rest on intent.
  useEffect(() => {
    preloadOnIdle(['/dashboard', '/inbox', '/my-tasks'])
  }, [])

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
      <Route path="/auth/ministry-calendar-callback" element={<MinistryCalendarConnectionCallback />} />
      <Route path="/auth/slack-callback" element={<SlackCallback />} />
      <Route path="/auth/outlook_calendar-callback" element={<OutlookCalendarCallback />} />
      <Route path="/auth/teams-callback" element={<TeamsCallback />} />
      <Route path="/reports/:share_token" element={<MeetingReportPublicPage />} />
      <Route path="/rsvp" element={<RSVPPage />} />
      <Route path="/subscribe" element={<SubscribePage />} />
      <Route path="/confirm-subscription/:token" element={<ConfirmSubscriptionPage />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<Shell />}>
          {/* Home merged into Dashboard (experiment/clickup-ui-refresh) */}
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
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
          <Route path="/my-tasks/:view" element={<MyTasks />} />
          <Route path="/personal-list" element={<PersonalList />} />
          <Route path="/planner" element={<Planner />} />
          <Route path="/calendar" element={<MinistryCalendar />} />
          <Route
            path="/calendar-management"
            element={
              <ProtectedRoute roles={['super_admin', 'dept_lead']}>
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
          <Route
            path="/admin/campus-edits"
            element={
              <ProtectedRoute roles={['super_admin', 'ors']}>
                <CampusEditsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/settings/campus-photos"
            element={
              <ProtectedRoute roles={['super_admin', 'ors']}>
                <CampusPhotosSettings />
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
              <ProtectedRoute roles={['regional_secretary', 'pastor', 'super_admin']}>
                <FlockView />
              </ProtectedRoute>
            }
          />
          <Route
            path="/flock-crm"
            element={
              <ProtectedRoute roles={['regional_secretary', 'super_admin']}>
                <FlockCRMPage />
              </ProtectedRoute>
            }
          />
          <Route path="/meetings" element={<MeetingsModule />} />
          <Route path="/meetings/:meetingId" element={<MeetingDetailView />} />
          <Route
            path="/meetings/wizard"
            element={
              <ProtectedRoute roles={['super_admin', 'dept_lead', 'ors']}>
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
              <ProtectedRoute roles={['super_admin', 'dept_lead', 'regional_secretary', 'pastor']}>
                <AllPeoplePage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/people/users"
            element={
              <ProtectedRoute roles={['super_admin', 'dept_lead', 'regional_secretary', 'pastor']}>
                <UsersPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/people/invitations"
            element={
              <ProtectedRoute roles={['super_admin', 'dept_lead', 'regional_secretary']}>
                <InvitationsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/people/departments"
            element={
              <ProtectedRoute roles={['super_admin', 'dept_lead', 'regional_secretary', 'pastor']}>
                <DepartmentsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/people/pastoral-assignments"
            element={
              <ProtectedRoute roles={['super_admin', 'dept_lead', 'regional_secretary', 'pastor']}>
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
              <ProtectedRoute roles={['super_admin', 'regional_secretary', 'ors', 'dept_lead', 'programs']}>
                <CommunicationsLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<CommunicationsOverview />} />
            <Route path="campaigns" element={<CampaignPage />} />
            <Route path="compose" element={<EmailComposerPage />} />
            <Route path="campaigns/:campaignId/edit" element={<EmailComposerPage />} />
            <Route path="templates" element={<EmailTemplatesPage />} />
            <Route path="recipients" element={<RecipientsPage />} />
            <Route path="segments" element={<SegmentsPage />} />
            <Route path="analytics" element={<AnalyticsPage />} />
            <Route path="absentees" element={<AbsenteeFollowUpPage />} />
            <Route path="invitations" element={<InvitationsListPage />} />
            <Route path="invitations/new" element={<InvitationWizard />} />
            <Route path="invitations/:id" element={<InvitationDetailPage />} />
          </Route>
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
          <Route path="/help" element={<HelpPage />} />
          {/* Instagram Grading is paused (2026-07-09). Re-enable via the
              INSTAGRAM_GRADING_ENABLED flag in src/config/features.js. While
              disabled, the route redirects to the dashboard. */}
          <Route
            path="/instagram"
            element={
              INSTAGRAM_GRADING_ENABLED ? (
                <ProtectedRoute roles={['super_admin', 'regional_secretary', 'media']}>
                  <InstagramGradingPage />
                </ProtectedRoute>
              ) : (
                <Navigate to="/dashboard" replace />
              )
            }
          />
        </Route>
        {/* Map rendered fullscreen — no sidebar shell */}
        <Route path="/map" element={<CanMapPage />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </Suspense>
    </ErrorBoundary>
  )
}
// Test comment
