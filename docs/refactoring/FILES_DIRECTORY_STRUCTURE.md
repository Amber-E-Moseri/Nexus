# Complete Files Directory Structure

## 📊 Summary

**Total Migration:** 93 components + 10 library files + 4 contexts = **107 files migrated**

---

## 📁 BEFORE: Old Structure (src/modules/ + src/lib/)

```
src/
├── modules/
│   ├── automations/        (3 JSX files) ❌ DELETE
│   ├── notifications/      (2 JSX files) ❌ DELETE
│   ├── spaces/            (4 JSX files) ❌ DELETE
│   ├── agendas/           (6 JSX files) ❌ DELETE
│   ├── calendar/          (10 JSX files) ❌ DELETE
│   ├── communications/    (14 JSX files) ❌ DELETE
│   ├── dashboard/         (9 JSX files) ❌ DELETE
│   ├── meetings/          (12 JSX files) ❌ DELETE
│   ├── tasks/             (19 JSX files) ❌ DELETE
│   └── sprints/           (15 JSX files) ❌ DELETE
│
└── lib/
    ├── automations.js     ❌ DELETE
    ├── notifications.js   ❌ DELETE
    ├── spaces.js         ❌ DELETE
    ├── agendas.js        ❌ DELETE
    ├── calendar.js       ❌ DELETE
    ├── communications.js ❌ DELETE
    ├── dashboards.js     ❌ DELETE
    ├── meetings.js       ❌ DELETE
    ├── tasks.js          ❌ DELETE
    └── sprints.js        ❌ DELETE
```

---

## 📁 AFTER: New Feature-First Structure (src/features/)

```
src/features/ (✅ Complete - 10 Features)
│
├── automations/              ✅ PHASE 1
│   ├── components/
│   │   ├── ApiKeyManager.jsx
│   │   ├── AutomationBuilder.jsx
│   │   └── AutomationCard.jsx
│   ├── lib/
│   │   └── automations.js
│   └── index.ts
│
├── notifications/            ✅ PHASE 1
│   ├── components/
│   │   ├── NotificationBell.jsx
│   │   └── NotificationItem.jsx
│   ├── lib/
│   │   └── notifications.js
│   └── index.ts
│
├── spaces/                   ✅ PHASE 2
│   ├── components/
│   │   ├── SpaceAutomationsTab.jsx
│   │   ├── SpaceIntegrationsTab.jsx
│   │   ├── SpaceModal.jsx
│   │   └── SpaceStatusSettings.jsx
│   ├── lib/
│   │   └── spaces.js
│   └── index.ts
│
├── agendas/                  ✅ PHASE 2
│   ├── components/
│   │   ├── AgendaItemDndContext.jsx
│   │   ├── AgendaTable.jsx
│   │   ├── SortableAgendaRow.jsx
│   │   ├── Step1MeetingSetup.jsx
│   │   ├── Step2BuildAgenda.jsx
│   │   └── Step3PreviewExport.jsx
│   ├── lib/
│   │   └── agendas.js
│   └── index.ts
│
├── calendar/                 ✅ PHASE 3
│   ├── components/
│   │   ├── CalendarDraggableEvent.jsx
│   │   ├── CalendarEventCard.jsx
│   │   ├── CalendarGrid.jsx
│   │   ├── CalendarSettingsPanel.jsx
│   │   ├── CalendarView.jsx
│   │   ├── EventDetailModal.jsx
│   │   ├── EventModal.jsx
│   │   ├── EventSubmitModal.jsx
│   │   ├── MiniCalendar.jsx
│   │   └── SubmissionsPanel.jsx
│   ├── lib/
│   │   └── calendar.js
│   └── index.ts
│
├── communications/           ✅ PHASE 3
│   ├── components/
│   │   ├── BounceManagement.jsx
│   │   ├── CampaignEditor.jsx
│   │   ├── CampaignStatus.jsx
│   │   ├── EmailComposer.jsx
│   │   ├── EmailPreviewModal.jsx
│   │   ├── EmailSignatureEditor.jsx
│   │   ├── RecipientField.jsx
│   │   ├── SchedulePicker.jsx
│   │   ├── SegmentBuilder.jsx
│   │   ├── SegmentBuilderAdvanced.jsx
│   │   ├── SegmentsList.jsx
│   │   ├── SendConfirmationModal.jsx
│   │   ├── SuppressionList.jsx
│   │   └── TemplateEditor.jsx
│   ├── lib/
│   │   └── communications.js
│   └── index.ts
│
├── dashboard/                ✅ PHASE 4
│   ├── components/
│   │   ├── ActivityFeedWidget.jsx
│   │   ├── AttendanceSummaryWidget.jsx
│   │   ├── CompletionRateWidget.jsx
│   │   ├── MemberActivityWidget.jsx
│   │   ├── OrgReportExport.jsx
│   │   ├── OverdueByMemberWidget.jsx
│   │   ├── SprintProgressWidget.jsx
│   │   ├── UpcomingEventsWidget.jsx
│   │   └── UpcomingMeetingsWidget.jsx
│   ├── lib/
│   │   └── dashboards.js
│   └── index.ts
│
├── meetings/                 ✅ PHASE 4
│   ├── components/
│   │   ├── ActionItemBridge.jsx
│   │   ├── DepartmentFilter.jsx
│   │   ├── LiveMinutesMode.jsx
│   │   ├── LogView.jsx
│   │   ├── MeetingCard.jsx
│   │   ├── MeetingModal.jsx
│   │   ├── MeetingRecordTabs.jsx
│   │   ├── MeetingReportTab.jsx
│   │   ├── MeetingsList.jsx
│   │   ├── MeetingsWorkspace.jsx
│   │   └── (2 more)
│   ├── MeetingsContext.jsx
│   ├── lib/
│   │   └── meetings.js
│   └── index.ts
│
├── tasks/                    ✅ PHASE 4 (LARGEST - 18 components)
│   ├── components/
│   │   ├── AssigneeSelector.jsx
│   │   ├── InlineTaskComposer.jsx
│   │   ├── KanbanBoard.jsx
│   │   ├── KanbanColumn.jsx
│   │   ├── PersonalTaskList.jsx
│   │   ├── PlainKanbanBoard.jsx
│   │   ├── QuickAddTaskCard.jsx
│   │   ├── SubtaskList.jsx
│   │   ├── TaskCard.jsx
│   │   ├── TaskComments.jsx
│   │   ├── TaskDetailSidebar.jsx
│   │   ├── TaskFilters.jsx
│   │   ├── TaskList.jsx
│   │   ├── TaskModal.jsx
│   │   ├── TaskTimeline.jsx
│   │   ├── TaskCalendar.jsx
│   │   └── (3 more)
│   ├── TasksContext.jsx
│   ├── lib/
│   │   └── tasks.js
│   └── index.ts
│
└── sprints/                  ✅ PHASE 4
    ├── components/
    │   ├── AssignTeamToSprintModal.jsx
    │   ├── ImportTeamModal.jsx
    │   ├── InviteExternalModal.jsx
    │   ├── NewTeamModal.jsx
    │   ├── SprintCard.jsx
    │   ├── SprintMemberPanel.jsx
    │   ├── SprintModal.jsx
    │   ├── SprintOverview.jsx
    │   ├── SprintProgressBar.jsx
    │   ├── SprintReview.jsx
    │   ├── TaskDetailSidebar.jsx
    │   ├── TeamPanel.jsx
    │   └── (3 more)
    ├── SprintsContext.jsx
    ├── lib/
    │   └── sprints.js
    └── index.ts
```

---

## 📊 File Count by Feature

| Feature | Components | Context | Lib | Total |
|---------|-----------|---------|-----|-------|
| Automations | 3 | — | 1 | 4 |
| Notifications | 2 | — | 1 | 3 |
| Spaces | 4 | — | 1 | 5 |
| Agendas | 6 | — | 1 | 7 |
| Calendar | 10 | — | 1 | 11 |
| Communications | 14 | — | 1 | 15 |
| Dashboard | 9 | — | 1 | 10 |
| Meetings | 12 | 1 | 1 | 14 |
| Tasks | 18 | 1 | 1 | 20 |
| Sprints | 15 | 1 | 1 | 17 |
| **TOTAL** | **93** | **4** | **10** | **107** |

---

## 🗑️ Files to Delete (103 Total)

**Location:** `src/modules/` (10 directories) + `src/lib/` (10 files)

See `FILES_TO_DELETE.md` for the complete listing with filenames.

---

## ✅ Shared Code (KEEP - Not Deleted)

These directories stay in place as they're shared across features:

```
src/
├── context/              (Global contexts)
│   ├── AuthContext.jsx
│   ├── NotificationsContext.jsx
│   ├── ToastContext.jsx
│   ├── SearchContext.jsx
│   ├── InboxCountContext.jsx
│   └── SidebarContext.jsx
│
├── hooks/               (Global hooks)
│   ├── useAuth.js
│   ├── useMediaQuery.js
│   ├── useDeptMembers.js
│   ├── useExpectedAttendees.js
│   ├── useInvitationData.js
│   ├── useMatchReport.js
│   ├── useAttendanceTrends.js
│   └── useWindowWidth.js
│
├── lib/                 (Shared utilities - keep ~15 files)
│   ├── supabase.js
│   ├── permissions.js
│   ├── dateUtils.js
│   ├── apiKeys.js
│   ├── taskStatuses.js
│   ├── users.js
│   ├── activityLog.js
│   ├── constants.js
│   ├── people/
│   ├── csv/
│   └── ... (other shared utilities)
│
├── components/          (Shared UI library)
│   ├── ui/             (Badge, Button, Modal, etc.)
│   ├── layout/         (Sidebar, TopBar, etc.)
│   ├── invitations/
│   ├── files/
│   └── settings/
│
├── dnd/                 (Drag-and-drop infrastructure)
│   ├── TaskBoardDndProvider.jsx
│   ├── TaskListDndProvider.jsx
│   └── persistDnd.js
│
├── data/               (Data utilities)
├── shared/             (Other shared code)
└── styles/             (Global styles)
```

---

## 📈 Migration Summary

- **Phase 1:** 5 components migrated (2 features)
- **Phase 2:** 10 components migrated (2 features)
- **Phase 3:** 24 components migrated (2 features)
- **Phase 4:** 54 components migrated (4 features)
- **Total:** 93 components + 4 contexts + 10 libs = **107 files**

All features are now organized in a clean feature-first architecture under `src/features/`.

---

**Status:** ✅ Ready for cleanup after testing
