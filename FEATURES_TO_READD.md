# Features Lost in UI Revert (f1812fd baseline)

## What Changed: e439d6e - CHUNK 4: Scheduled Sends & Bounce Management

### 🎯 KEY ISSUE - How the UI Got Broken
**Root Cause:** The entire `src/styles/index.css` was replaced in commit e439d6e
- Removed: 313 lines of detailed design system (DM Sans font, warm cream palette, comprehensive tokens)
- Replaced with: 112 lines of simplified theme (different colors, Inter font, minimal tokens)
- This overwrote the entire visual language

**How to Avoid:**
1. ✅ **Never replace `src/styles/index.css` entirely**
2. ✅ **Only append new CSS classes needed for features**
3. ✅ **Reuse existing CSS variables** - they're well-defined in the baseline
4. ✅ **Test UI after ANY CSS changes** - catch theme conflicts immediately
5. ✅ **Keep backup of working CSS** in a separate branch

---

## Features Added (Need Re-implementation)

### Communications Module (NEW)
```
src/modules/communications/
├── BounceManagement.jsx
├── CampaignStatus.jsx
├── EmailComposer.jsx
├── EmailPreviewModal.jsx
├── RecipientField.jsx
├── SchedulePicker.jsx
├── SegmentBuilder.jsx
├── SegmentBuilderAdvanced.jsx
└── TemplateEditor.jsx

src/pages/communications/
├── AnalyticsPage.jsx
├── CampaignPage.jsx
├── EmailComposerPage.jsx
├── EmailTemplatesPage.jsx
├── InvitationDetailPage.jsx
├── InvitationWizard.jsx
├── InvitationsListPage.jsx
└── SegmentsPage.jsx
```

### Invitations System (NEW)
```
src/components/invitations/
├── ClassicEnvelope.jsx
├── Step1PickTemplate.jsx
├── Step2EventDetails.jsx
├── Step3Recipients.jsx
└── Step4PreviewSend.jsx

src/components/emails/
└── InvitationEmail.tsx

src/hooks/
└── useInvitationData.ts

src/lib/invitations/
├── mergeTokens.ts
└── tokenReplace.ts
```

### Drag & Drop System (NEW)
```
src/dnd/ (complete folder)
├── DragOverlayTaskCard.jsx
├── DroppableStatusColumn.jsx
├── SortableTaskCard.jsx
├── SortableTaskRow.jsx
├── TaskBoardDndProvider.jsx
├── TaskDragHandle.jsx
├── TaskListDndProvider.jsx
├── index.js
├── persistDnd.js
├── sensors.js
└── sortOrderUtils.js
```

### Context & Search (NEW)
```
src/context/
├── SearchContext.jsx
├── SidebarContext.jsx
└── ToastContext.jsx

src/components/search/
└── SearchModal.jsx
```

### Pages & Features (NEW)
- `src/pages/InvitationViewerPage.jsx`
- `src/pages/Planner.jsx`
- `src/pages/Unsubscribe.jsx`
- `src/pages/meetings/EmailLogPage.jsx`
- `src/pages/meetings/EmailTemplatesPage.jsx`
- `src/pages/reports/MeetingReportPublicPage.jsx`
- `src/modules/tasks/QuickAddTaskCard.jsx`
- `src/modules/spaces/SpaceIntegrationsTab.jsx`

### Supabase Functions (NEW)
```
supabase/functions/
├── handle-unsubscribe/
├── resend-webhook/
├── rsvp/
├── send-communication-email/
├── send-invitations/
├── space-integrations/
└── track-click/
```

### Database Migrations (NEW - CHUNK 4)
```
20260717000001_seed_graduation_template.sql
20260720000000_public_report_access.sql
20260721000000_communication_infrastructure.sql
20260722000000_scheduled_sends.sql
20260723000000_fix_sprint_members_role.sql
20260724000000_task_sort_order.sql
20260724000001_fix_get_subgroup_ranking_rpc.sql
20260724000002_communications_composer.sql
20260725000000_relax_tasks_status_check.sql
20260725000001_space_integrations.sql
20260726000000_calendar_approval.sql
20260726000001_google_calendar_personal_sync.sql
20260727000000_click_tracking_and_bounces.sql
20260728000000_communication_email_templates.sql
20260729000000_scheduled_sends_retry_and_bounce_management.sql
```

---

## Features Removed (Were in f1812fd, now gone)

These existed in f1812fd but got deleted in e439d6e:
- `src/pages/AttendanceTrendsDashboard.jsx` (attendance feature)
- `src/pages/Home.jsx` & `src/pages/Inbox.jsx` (navigation pages)
- Dashboard widgets (CompletionRate, MemberActivity, OverdueByMember, SprintProgress, UpcomingEvents)
- Expected attendees features
- Various settings sections (Dashboard defaults, Integrations, Notifications, Profile, Security, etc.)

---

## Modified Files (Keep baseline styling)
```
M src/App.jsx
M src/components/layout/ProtectedRoute.jsx
M src/components/layout/Shell.jsx
M src/components/layout/Sidebar.jsx
M src/components/layout/TopBar.jsx
M src/components/ui/Avatar.jsx
M src/components/ui/Badge.jsx
M src/components/ui/LoadingSpinner.jsx
M src/context/AuthContext.jsx
M src/context/NotificationsContext.jsx
M src/lib/communications.js (NEW)
M src/lib/notifications.js
M src/lib/spaces.js
M src/lib/supabase.js
M src/lib/taskStatuses.js
M src/lib/tasks.js
M src/main.jsx
M src/modules/automations/*.jsx
M src/modules/calendar/EventModal.jsx
M src/modules/meetings/*.jsx
M src/modules/sprints/*.jsx
M src/modules/tasks/*.jsx
M src/pages/*.jsx
M src/pages/settings/Settings.jsx
M vite.config.js
```

---

## ✅ Best Practices to Prevent Future UI Breaks

### 1. CSS Management
- [ ] **Never overwrite** `src/styles/index.css` completely
- [ ] Document any new CSS variables in a comment block
- [ ] Test colors against the design system before committing
- [ ] Use existing `--fs-*` and custom tokens, don't add hardcoded colors

### 2. Component Styling
- [ ] Keep using CSS variables: `color: var(--text-primary)`
- [ ] Don't hardcode colors in JSX: `style={{ color: '#4C2A92' }}`
- [ ] Import from consistent design tokens

### 3. Git Workflow
- [ ] Create feature branch FROM correct commit: `git checkout f1812fd -b feature/name`
- [ ] **Commit UI changes separately** from feature logic
- [ ] Review CSS changes carefully in PR
- [ ] Test in browser BEFORE committing CSS changes

### 4. Testing
- [ ] Screenshot baseline after each CSS commit
- [ ] Visual regression testing (manual for now)
- [ ] Check dark/light mode if applicable
- [ ] Test on multiple pages (login, dashboard, spaces, etc.)

### 5. Documentation
- [ ] Keep a `DESIGN_SYSTEM.md` documenting tokens
- [ ] Link to it in commit messages when modifying styles
- [ ] Tag PRs with `[UI]` when making design changes

