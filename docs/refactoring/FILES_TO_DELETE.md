# Files Ready for Deletion - Complete Listing

**Total Files to Delete: 103**
- **src/modules/** - 94 component files (10 directories)
- **src/lib/** - 10 library files

---

## 📁 src/modules/ (10 directories, 94 files)

### 1. src/modules/automations/ (3 files)
```
automations/
├── ApiKeyManager.jsx
├── AutomationBuilder.jsx
└── AutomationCard.jsx
```

### 2. src/modules/notifications/ (2 files)
```
notifications/
├── NotificationBell.jsx
└── NotificationItem.jsx
```

### 3. src/modules/spaces/ (4 files)
```
spaces/
├── SpaceAutomationsTab.jsx
├── SpaceIntegrationsTab.jsx
├── SpaceModal.jsx
└── SpaceStatusSettings.jsx
```

### 4. src/modules/agendas/ (6 files)
```
agendas/
├── AgendaItemDndContext.jsx
├── AgendaTable.jsx
├── SortableAgendaRow.jsx
├── Step1MeetingSetup.jsx
├── Step2BuildAgenda.jsx
└── Step3PreviewExport.jsx
```

### 5. src/modules/calendar/ (10 files)
```
calendar/
├── CalendarDraggableEvent.jsx
├── CalendarEventCard.jsx
├── CalendarGrid.jsx
├── CalendarSettingsPanel.jsx
├── CalendarView.jsx
├── EventDetailModal.jsx
├── EventModal.jsx
├── EventSubmitModal.jsx
├── MiniCalendar.jsx
└── SubmissionsPanel.jsx
```

### 6. src/modules/communications/ (14 files)
```
communications/
├── BounceManagement.jsx
├── CampaignEditor.jsx
├── CampaignStatus.jsx
├── EmailComposer.jsx
├── EmailPreviewModal.jsx
├── EmailSignatureEditor.jsx
├── RecipientField.jsx
├── SchedulePicker.jsx
├── SegmentBuilder.jsx
├── SegmentBuilderAdvanced.jsx
├── SegmentsList.jsx
├── SendConfirmationModal.jsx
├── SuppressionList.jsx
└── TemplateEditor.jsx
```

### 7. src/modules/dashboard/ (9 files)
```
dashboard/
├── ActivityFeedWidget.jsx
├── AttendanceSummaryWidget.jsx
├── CompletionRateWidget.jsx
├── MemberActivityWidget.jsx
├── OrgReportExport.jsx
├── OverdueByMemberWidget.jsx
├── SprintProgressWidget.jsx
├── UpcomingEventsWidget.jsx
└── UpcomingMeetingsWidget.jsx
```

### 8. src/modules/meetings/ (12 files)
```
meetings/
├── ActionItemBridge.jsx
├── DepartmentFilter.jsx
├── LiveMinutesMode.jsx
├── LogView.jsx
├── MeetingCard.jsx
├── MeetingModal.jsx
├── MeetingRecordTabs.jsx
├── MeetingReportTab.jsx
├── MeetingsList.jsx
├── MeetingsWorkspace.jsx
└── (2 more JSX files)
```

### 9. src/modules/tasks/ (19 files) - LARGEST
```
tasks/
├── AssigneeSelector.jsx
├── InlineTaskComposer.jsx
├── KanbanBoard.jsx
├── KanbanColumn.jsx
├── PersonalTaskList.jsx
├── PlainKanbanBoard.jsx
├── QuickAddTaskCard.jsx
├── SubtaskList.jsx
├── TaskCard.jsx
├── TaskComments.jsx
├── TaskDetailSidebar.jsx
├── TaskFilters.jsx
├── TaskList.jsx
├── TaskModal.jsx
├── TaskTimeline.jsx
├── TaskCalendar.jsx
└── (3 more JSX files)
```

### 10. src/modules/sprints/ (15 files)
```
sprints/
├── AssignTeamToSprintModal.jsx
├── ImportTeamModal.jsx
├── InviteExternalModal.jsx
├── NewTeamModal.jsx
├── SprintCard.jsx
├── SprintMemberPanel.jsx
├── SprintModal.jsx
├── SprintOverview.jsx
├── SprintProgressBar.jsx
├── SprintReview.jsx
├── TaskDetailSidebar.jsx
├── TeamPanel.jsx
└── (3 more JSX files)
```

---

## 📄 src/lib/ (10 library files)

```
lib/
├── automations.js          → moved to src/features/automations/lib/
├── notifications.js        → moved to src/features/notifications/lib/
├── spaces.js              → moved to src/features/spaces/lib/
├── agendas.js             → moved to src/features/agendas/lib/
├── calendar.js            → moved to src/features/calendar/lib/
├── communications.js      → moved to src/features/communications/lib/
├── dashboards.js          → moved to src/features/dashboard/lib/
├── meetings.js            → moved to src/features/meetings/lib/
├── tasks.js               → moved to src/features/tasks/lib/
└── sprints.js             → moved to src/features/sprints/lib/
```

---

## ✅ Cleanup Command

Copy and run this single command to delete all 103 files:

```bash
# Delete all old modules (10 directories)
rm -rf src/modules/{automations,notifications,spaces,agendas,calendar,communications,dashboard,meetings,tasks,sprints}

# Delete all old lib files (10 files)
rm src/lib/{automations,notifications,spaces,agendas,calendar,communications,dashboards,meetings,tasks,sprints}.js

# Verify cleanup
echo "✅ All 103 files deleted successfully"
```

---

## 🎯 Verification

After deletion, run:

```bash
# Should show 0 directories
ls -1d src/modules/*/ 2>/dev/null | wc -l

# Should show no deleted lib files
ls src/lib/{automations,notifications,spaces,agendas,calendar,communications,dashboards,meetings,tasks,sprints}.js 2>/dev/null | wc -l
```

---

**Status:** Ready to delete after testing ✅
