-- Nova KB: initial seed data covering all end-user-facing Nexus features.
-- All roles: ARRAY['super_admin','regional_secretary','dept_lead','pastor','member']
-- Admin+:    ARRAY['super_admin','regional_secretary','dept_lead']
-- SA+RS:     ARRAY['super_admin','regional_secretary']
-- Pastor:    ARRAY['super_admin','regional_secretary','pastor']

insert into public.nova_kb_entries
  (slug, question, answer, feature_area, applicable_roles)
values

-- =====================================================================
-- TASKS
-- =====================================================================

(
  'tasks-create',
  'How do I create a new task?',
  'You have two main ways to create a task:

**Option 1 — Quick Create button (fastest):** Click the blue ✚ button in the top navigation bar. A task creation modal will open. Fill in the task name (required), then optionally set the list it belongs to, the assignee, due date, priority, and starting status before clicking Save.

**Option 2 — From inside a List:** Go to the space and list where the task should live, scroll to the bottom of the task list, and click "Add task" (or press N on your keyboard while the list is in focus). The task will be created inline so you can type its name right away.

**Tips:**
- You can fill in the assignee, due date, and priority right in the creation modal — you don''t have to open the task again afterward.
- If you''re not sure which list to put the task in, create it anywhere and move it later using the List field inside the task.
- If you leave the Assignee field blank, the task is unassigned until someone picks it up.',
  'tasks',
  ARRAY['super_admin','regional_secretary','dept_lead','pastor','member']
),

(
  'tasks-assign',
  'How do I assign a task to someone?',
  'Open the task by clicking on its name. In the task detail panel, look for the **Assignee** field (usually near the top, below the task title). Click on it and type the person''s name — Nexus will show matching users from your department. Click the person''s name to assign the task to them.

**To reassign:** Click the current assignee''s avatar or name in the Assignee field, then choose someone else from the list.

**To remove an assignee:** Open the Assignee field and click the X next to the current assignee''s name, or select "Unassigned."

You can also assign tasks directly from list view by clicking the empty avatar icon on the left side of any task row and selecting a person from the dropdown.',
  'tasks',
  ARRAY['super_admin','regional_secretary','dept_lead','pastor','member']
),

(
  'tasks-change-status',
  'How do I change a task''s status?',
  'There are two quick ways:

**From list/kanban view:** Click the colored status badge (e.g. "To Do", "In Progress") directly on the task card or row. A status dropdown will appear — click the new status you want.

**From inside the task:** Open the task by clicking its name. At the top of the task panel, click the status badge. Select the new status from the dropdown.

**Available statuses** typically include: To Do, In Progress, Review, Completed, and Cancelled, plus any department-specific statuses your dept lead has set up. Completed and Cancelled are final statuses — completed tasks stop appearing in active views.

If you don''t see a status you expect, check with your department lead — they control which custom statuses are available in your space.',
  'tasks',
  ARRAY['super_admin','regional_secretary','dept_lead','pastor','member']
),

(
  'tasks-due-date',
  'How do I set or change a task''s due date?',
  'Open the task by clicking its name. In the task panel, find the **Due Date** field (look for the calendar icon). Click it to open a date picker. Select the date you want and it will be saved automatically.

**To clear a due date:** Click the due date shown, then click the X or "Clear" button that appears.

**From list view:** You can also click the due date column on any task row to set or change it directly without opening the task.

Tasks that are past their due date will appear highlighted in red in list view. If a task is due today it will be highlighted in amber.',
  'tasks',
  ARRAY['super_admin','regional_secretary','dept_lead','pastor','member']
),

(
  'tasks-subtasks',
  'How do I add subtasks to a task?',
  'Open the parent task by clicking its name. Scroll down to the **Subtasks** section inside the task panel. Click "Add subtask" and type the subtask name. Press Enter to create it and immediately add another, or click Save.

Each subtask can have its own assignee, due date, and status — click on a subtask to expand its detail panel and fill those in.

**Completing subtasks:** Check off the checkbox next to each subtask''s name. The parent task''s progress indicator (a small progress ring) updates automatically to show what percentage of subtasks are done.

**Note:** Subtasks are part of the same department space as the parent task. They follow the same permission rules — you can only assign subtasks to people who have access to that space.',
  'tasks',
  ARRAY['super_admin','regional_secretary','dept_lead','pastor','member']
),

(
  'tasks-followers',
  'How do I follow a task to get notified about it?',
  'Open the task and click the **Followers** section (usually shown as a bell icon or "Follow" button near the top of the task panel). Click "Follow" to subscribe yourself to the task''s activity.

Once you follow a task, you''ll receive a notification whenever someone:
- Comments on the task
- Changes its status
- Changes the due date
- Adds or removes an assignee
- Completes it or moves it to a different list

**To stop following:** Open the task and click "Following" (it toggles to unfollow). You can also manage all your followed tasks from My Tasks view.

**Auto-follow:** You are automatically added as a follower when you are assigned to a task or when you comment on one.',
  'tasks',
  ARRAY['super_admin','regional_secretary','dept_lead','pastor','member']
),

(
  'tasks-views',
  'How do I switch between kanban, list, table, and calendar views?',
  'At the top of any List page, look for the **view switcher icons** in the toolbar — usually represented by small icons for Board (kanban), List, Table, and Calendar.

- **Board/Kanban view:** Tasks are shown as cards in columns by status. Drag cards between columns to change their status. Best for visualizing workflow.
- **List view:** Tasks appear as rows, one per line. Good for quick scanning and bulk editing.
- **Table view:** Shows tasks in a spreadsheet-like grid with all fields as columns. Best for comparing multiple fields side by side.
- **Calendar view:** Tasks with due dates appear on a calendar. Best for planning around dates.

Your selected view is saved per list — switching to Kanban in one list won''t affect other lists.',
  'tasks',
  ARRAY['super_admin','regional_secretary','dept_lead','pastor','member']
),

(
  'tasks-filter',
  'How do I filter tasks to show only what I need?',
  'From any task list or view, click the **Filter** button in the toolbar (funnel icon). A filter panel opens where you can add one or more filters:

- **Assignee:** Show only tasks assigned to a specific person (or to you)
- **Status:** Show only tasks in certain statuses (e.g., only "In Progress" tasks)
- **Priority:** Show only urgent, high, medium, or low priority tasks
- **Due date:** Show tasks due within a date range (e.g., "due this week")
- **Tags or labels:** If your department uses tags, filter by them

Multiple filters combine with AND logic — a task must match all active filters to appear.

**To remove a filter:** Click the X on each filter chip, or click "Clear all" to reset.

**My Tasks view** has pre-built quick views (Today, Tomorrow) that apply common filters automatically — those are often faster than building custom filters manually.',
  'tasks',
  ARRAY['super_admin','regional_secretary','dept_lead','pastor','member']
),

(
  'tasks-department-visibility',
  'Why can''t I see tasks from another department?',
  'Nexus scopes task visibility to your own department by default — this is by design to keep each team''s workspace clean and private.

If you need to see a task from another department:
1. The other department must explicitly share it with you. Once shared, it will appear in your task views with a small "shared" indicator.
2. If you think you should have access to something and don''t, contact your department lead first — they can request a cross-department share.

**Super admins and Regional Secretaries** can see all tasks across all departments without needing a share.

This restriction only applies to tasks — the Ministry Calendar, Org Chart, and People directory are visible org-wide.',
  'tasks',
  ARRAY['super_admin','regional_secretary','dept_lead','pastor','member']
),

(
  'tasks-dependencies',
  'How do task dependencies work?',
  'A dependency links two tasks so that one must be completed before the other can start. Open a task and look for the **Dependencies** section. Click "Add dependency," then search for the task that must be done first. Once linked, the dependent task will show a warning indicator if its predecessor is still open.

**Types of links:**
- **Blocks:** The current task is blocking another task (the other task can''t start until this one is done)
- **Blocked by:** The current task is blocked by another task that must finish first

Dependencies are visual reminders, not hard locks — Nexus won''t prevent you from working on a blocked task, but it will flag it so you''re aware.

If you''re trying to link tasks across different lists or spaces, both tasks must be in spaces you have access to.',
  'tasks',
  ARRAY['super_admin','regional_secretary','dept_lead','pastor','member']
),

(
  'tasks-comment',
  'How do I comment on a task?',
  'Open the task by clicking its name. Scroll to the **Comments** section at the bottom of the task panel. Click in the comment input box and type your message. Press the send button (or Ctrl+Enter on Windows, Cmd+Enter on Mac) to post.

**@mentioning someone:** Type @ followed by their name in your comment to mention a specific person. They will receive a notification in their Inbox and (if enabled) a desktop/push notification. The mention will appear as a highlighted name in the comment.

**Rich text:** You can bold text (**bold**), use bullet points, and paste links into comments. The comment box supports basic markdown-style formatting.

**Editing and deleting:** You can edit or delete your own comments by hovering over the comment and clicking the three-dot (⋯) menu. Other people''s comments can only be edited or deleted by that person or by a super admin.',
  'tasks',
  ARRAY['super_admin','regional_secretary','dept_lead','pastor','member']
),

(
  'tasks-attach-file',
  'How do I attach a file to a task?',
  'Open the task and look for the **Attachments** section (usually below the description, marked with a paperclip icon). Click "Add attachment" or drag and drop a file directly into the task panel.

You can attach:
- Files from your computer (uploaded directly)
- Links to Google Drive documents (if Drive integration is enabled)

**Size limit:** Individual file uploads are limited to the platform''s configured size cap (check with your admin if large files are being rejected).

**Viewing attachments:** All attachments are listed in the Attachments section of the task. Click a file name to preview it or download it. Images are shown as thumbnail previews.',
  'tasks',
  ARRAY['super_admin','regional_secretary','dept_lead','pastor','member']
),

(
  'tasks-priority',
  'How do I set a task''s priority?',
  'Open the task and click the **Priority** field (usually shown as a flag icon). Choose from: Urgent, High, Medium, or Low. The priority can also be set during task creation in the New Task modal.

**From list view:** Click the priority flag icon on any task row to change it without opening the task.

Priority affects how tasks are sorted when you choose "Sort by Priority" in list or board view. Urgent tasks sort to the top. Tasks with no priority set sort to the bottom.

If you''re unsure what priority to set, a general rule of thumb: **Urgent** = must be done today or something breaks; **High** = important this week; **Medium** = normal work; **Low** = nice to have when time allows.',
  'tasks',
  ARRAY['super_admin','regional_secretary','dept_lead','pastor','member']
),

(
  'tasks-move',
  'How do I move a task to a different list?',
  'Open the task and find the **List** field near the top of the task panel (it shows the current list name, e.g. "Q3 Projects"). Click on it to open a dropdown showing all lists you have access to in your department. Select the destination list and the task will be moved.

**Note:** Moving a task to a list in a different space means the task will now follow that space''s permission rules. If you move a task out of a shared space into a private one, people who previously had access may lose visibility.',
  'tasks',
  ARRAY['super_admin','regional_secretary','dept_lead','pastor','member']
),

-- =====================================================================
-- MEETINGS
-- =====================================================================

(
  'meetings-schedule',
  'How do I schedule a meeting?',
  'Go to the **Meetings** section in the sidebar. Click the "New Meeting" or "+" button. Fill in the meeting details:

1. **Title** — give it a clear name
2. **Date and time** — set when it will happen
3. **Location or link** — add a room or video call URL
4. **Department/Space** — choose which team this meeting belongs to
5. **Expected attendees** — add the people who should attend

Click Save to create the meeting. The attendees you listed will be able to see the meeting and its agenda in the Meetings section.

If your meeting has a recurring agenda (e.g., a weekly team check-in), you can create it once and reuse the template for future occurrences.',
  'meetings',
  ARRAY['super_admin','regional_secretary','dept_lead','pastor','member']
),

(
  'meetings-agenda',
  'How do I add an agenda to a meeting?',
  'Open the meeting by clicking on it in the Meetings list. Inside the meeting detail, find the **Agenda** section. Click "Add agenda item" and type the topic. You can add multiple items, drag them to reorder, and assign a time estimate to each item.

For each agenda item you can also:
- Mark it as a discussion point, decision point, or information item
- Link it to a task so the conversation stays connected to the work
- Add prep notes or materials that attendees should review beforehand

Agenda items are visible to all attendees before the meeting, so everyone can prepare.',
  'meetings',
  ARRAY['super_admin','regional_secretary','dept_lead','pastor','member']
),

(
  'meetings-minutes',
  'How do I record minutes during a meeting?',
  'Open the meeting and click the **Minutes** tab (or "Record Minutes" button if minutes haven''t been started yet). You''ll see a document editor alongside the agenda. For each agenda item, click into the notes area and type what was discussed.

**Tips for clean minutes:**
- Use bullet points for each point made
- Decisions made should be clearly marked (you can tag them as "Decision")
- Action items should be captured using the Action Items section (not just written in the notes) so they get tracked as assignable tasks

Minutes auto-save as you type. Once the meeting is done, you can mark it as "Minutes complete" which notifies attendees that they can review what was recorded.',
  'meetings',
  ARRAY['super_admin','regional_secretary','dept_lead','pastor','member']
),

(
  'meetings-transcription',
  'How does meeting transcription work?',
  'Nexus includes an audio transcription feature powered by AI. To use it:

1. Open the meeting while it''s in progress (or when you''re ready to transcribe recorded audio)
2. Look for the **Transcription** panel or tab
3. Click "Start transcription" — your browser will ask permission to use your microphone
4. Speak normally; the transcription appears in real time
5. When done, click "Stop" — the transcript is saved to the meeting record automatically

**What the transcription is good for:** Capturing the gist of discussions quickly, especially when you can''t type fast enough. The transcript isn''t perfect — it''s a starting point you should review and clean up before sharing.

**Privacy note:** Transcription only runs when you actively start it — it doesn''t record automatically. The audio is uploaded to Nexus storage and sent to Deepgram, an external speech-to-text service, to generate the transcript — it is not processed locally in your browser. If you have sensitive material you don''t want leaving Nexus in any form, use the "Paste transcript" option instead and type or paste your own notes.',
  'meetings',
  ARRAY['super_admin','regional_secretary','dept_lead','pastor','member']
),

(
  'meetings-attendance',
  'How do I mark attendance at a meeting?',
  'Open the meeting and go to the **Attendance** tab (or scroll to the Attendance section in the meeting detail). You''ll see a list of expected attendees. Check the box next to each person who was present. People not on the expected list can be added as walk-ins by clicking "Add person."

**Who should mark attendance:** Whoever is running or organizing the meeting typically marks it, though any attendee can do so.

Attendance records feed into the Attendance Trends dashboard (visible to dept leads and above), which tracks participation patterns over time.',
  'meetings',
  ARRAY['super_admin','regional_secretary','dept_lead','pastor','member']
),

(
  'meetings-action-items',
  'How do I assign action items from a meeting?',
  'During or after the meeting, open the **Action Items** section (usually at the bottom of the meeting detail or in its own tab). Click "Add action item," type the task description, then:

1. **Assign it** to a specific person using the Assignee field
2. **Set a due date** so it doesn''t fall through the cracks
3. Optionally link it to an existing task or sprint

Once created, action items are tracked separately from meeting notes — the assignee will see them in their task views and Nova can surface them in the "What do I need to follow up on today?" briefing.

**Important:** Write action items as concrete, doable steps ("Update the slides by Thursday") not vague summaries ("Slides"). Clear action items actually get done.',
  'meetings',
  ARRAY['super_admin','regional_secretary','dept_lead','pastor','member']
),

(
  'meetings-past',
  'Where do I find past meetings and their minutes?',
  'Go to **Meetings** in the sidebar. By default, you''ll see upcoming and recent meetings. Look for a filter or tab to switch to "Past" meetings. You can search by meeting name, date range, or department.

Click on any past meeting to see its full record: the agenda, minutes, action items, attendance, and any transcription. Minutes are viewable by all attendees.

**Meeting reports:** For completed meetings, there''s an option to generate a shareable PDF report (look for "Export" or "Share report" in the meeting actions menu). These can be shared with people who weren''t attendees.',
  'meetings',
  ARRAY['super_admin','regional_secretary','dept_lead','pastor','member']
),

(
  'meetings-absence-email',
  'What happens if someone misses a meeting — is there an automated follow-up?',
  'Yes. For meetings where absence tracking is enabled, Nexus can automatically send a follow-up email to people who were marked absent. This is configured in the **Communications** section under Absence Emails.

The email reminds them of what was discussed and any action items they were assigned. Department leads and above can customize the email template and set the rules for when absence emails are sent.

If you receive an absence email and think you were marked absent by mistake, contact your department lead to have the attendance record corrected.',
  'meetings',
  ARRAY['super_admin','regional_secretary','dept_lead','pastor','member']
),

-- =====================================================================
-- SPRINTS
-- =====================================================================

(
  'sprints-what',
  'What is a sprint in Nexus?',
  'A sprint is a focused work period — typically one to four weeks — where a group of people commit to completing a defined set of tasks together. Sprints in Nexus help teams coordinate on high-priority projects, track progress day to day, and stay accountable to each other.

Each sprint has:
- A name and date range
- A sprint team (the people in it)
- A list of tasks assigned to the sprint
- A status: Upcoming, Active, or Completed

Sprints are used by teams running project-style work. Not every task needs to be in a sprint — they''re best for coordinated efforts where a group is working toward a shared goal.',
  'sprints',
  ARRAY['super_admin','regional_secretary','dept_lead','pastor','member']
),

(
  'sprints-join',
  'How do I join a sprint?',
  'You can join a sprint in two ways:

**By invitation:** A sprint organizer or department lead sends you a sprint invite. You''ll receive a notification in your Inbox. Open it and click "Accept" to join. Once accepted, the sprint appears in your Sprints list and tasks assigned to you in the sprint show up in your My Tasks view.

**By request:** Go to **Sprints** in the sidebar and browse active or upcoming sprints. If a sprint has open membership, you can click "Join" to request access. The sprint organizer will receive your request and can approve it.

Once you''re a sprint member, you can see all tasks in the sprint (not just your own).',
  'sprints',
  ARRAY['super_admin','regional_secretary','dept_lead','pastor','member']
),

(
  'sprints-view-mine',
  'How do I see what''s in my current sprint?',
  'Go to **Sprints** in the sidebar. Your active sprint(s) will be listed at the top. Click on a sprint to open the sprint detail view, which shows:

- All tasks in the sprint and their current status
- Your specific tasks highlighted or filterable
- Sprint progress (how many tasks are completed vs. total)
- Upcoming tasks by due date

You can also filter the sprint view to "My tasks only" to see just the items assigned to you.

**From My Tasks:** If you''re in an active sprint, your sprint tasks also appear in the "My Tasks" section, clearly marked with the sprint name.',
  'sprints',
  ARRAY['super_admin','regional_secretary','dept_lead','pastor','member']
),

(
  'sprints-add-tasks',
  'How do I add tasks to a sprint?',
  'There are two ways:

**From inside the sprint:** Open the sprint, click "Add task," and either create a new task or search for an existing one to pull into the sprint.

**From a task:** Open any task, find the **Sprint** field, and select the sprint you want to assign it to.

**Note:** Only sprint members and dept leads can add tasks to a sprint. If you''re not a member yet, join the sprint first (or ask the organizer to add you).',
  'sprints',
  ARRAY['super_admin','regional_secretary','dept_lead','pastor','member']
),

(
  'sprints-invites',
  'How do sprint invites work?',
  'When a sprint organizer or dept lead adds you to a sprint, you receive a **Sprint Invite** notification in your Inbox (the envelope icon in the top nav). Open the notification and choose:

- **Accept** — you''re added to the sprint immediately
- **Decline** — you won''t be added; the organizer is notified

If you accept, the sprint tasks become visible to you and your My Tasks view updates to include them.

**Pending invites:** You can see all pending sprint invites by going to Sprints → "My Invites" tab.',
  'sprints',
  ARRAY['super_admin','regional_secretary','dept_lead','pastor','member']
),

(
  'sprints-end',
  'What happens when a sprint ends?',
  'When a sprint''s end date passes, it moves to "Completed" status. Any tasks that weren''t finished remain as normal tasks in their lists — they don''t get deleted. The sprint organizer typically reviews incomplete tasks and either:

1. Carries them forward to the next sprint
2. Moves them back to the regular backlog
3. Closes them if they''re no longer needed

You can still view completed sprints and all their tasks in the Sprints section. Completed sprint records are kept permanently for reference.',
  'sprints',
  ARRAY['super_admin','regional_secretary','dept_lead','pastor','member']
),

(
  'sprints-multiple',
  'Can I be in more than one sprint at the same time?',
  'Yes, you can be a member of multiple active sprints simultaneously. This happens when you''re contributing to multiple projects at once. All your sprint tasks from all active sprints will appear in your My Tasks view and in Nova''s daily briefing.

However, if you find yourself spread across too many sprints, that''s worth flagging with your dept lead — it usually means something needs to be prioritized or the workload needs redistributing.',
  'sprints',
  ARRAY['super_admin','regional_secretary','dept_lead','pastor','member']
),

(
  'sprints-create',
  'How do I create a sprint?',
  'Go to **Sprints** in the sidebar and click the **New Sprint** button. A creation form opens.

**Step 1 — Sprint Scope.** Choose the type of sprint:

- **Single Department** — for one of our existing departments. Select which department and Nexus automatically creates a team for it, adding all active members from that department. Their tasks will appear within the sprint and also surface in that department''s space views.

- **Multi-Dept Collaboration** — for a sprint that brings together two or more of our existing departments. Select the departments to include and Nexus creates one team per department, auto-adding each department''s members. Tasks in a multi-dept sprint are visible across all the teams involved — the work "spills into" each participating department''s space, so members see sprint tasks alongside their regular department tasks.

- **Custom (no auto-teams)** — for a one-off or cross-functional group that doesn''t follow our standard department lines. No teams are auto-created and no members are auto-added; you build the team yourself after creation. Tasks in a Custom sprint are sprint-only — they don''t appear in any department space, keeping the work completely separate from the regular dept views.

**Step 2 — Fill in the sprint details:** Give the sprint a name (required), a goal, a description, and start and end dates.

**Step 3 — Save.** The sprint is created in Planning status. Open it to add tasks and manage the team.

**Inviting members to your sprint:**
Open the sprint and go to the **Members** tab. Click "Invite member."
- **Existing Nexus users:** search by name and add them directly.
- **External members (not yet on Nexus):** enter their email address and name. They''ll receive a temporary-access invitation by email. Their account is automatically deactivated when the sprint ends (or on the expiry date you set), so they don''t need a permanent account.

**Who can create sprints:** Department leads and above. If you''re a regular member and need a sprint created, ask your dept lead.

**Having an issue?** Submit a support ticket via **Help & Support** in the sidebar, or check the **FAQ** on the Help page for answers to common sprint setup questions.',
  'sprints',
  ARRAY['super_admin','regional_secretary','dept_lead','pastor','member']
),

(
  'sprints-custom-vs-multidept',
  'When should I use a Custom sprint vs a Multi-Dept sprint?',
  'Use **Multi-Dept sprints** when you''re bringing together teams from two or more of our existing departments for a specific project or initiative. Multi-Dept sprints are ideal when:

- The team structure follows our standard department lines (you''re pulling members from existing departments)
- Members need to see sprint tasks alongside their regular department work
- The sprint goals align with cross-department collaboration
- Examples: a campaign involving Media and ORS, an initiative with participation from multiple dept leads

Multi-Dept sprints automatically add all active members from each participating department, and sprint tasks will show up in each department''s space view.

Use **Custom sprints** when you''re assembling a one-off or cross-functional team that doesn''t fit your standard department structure. Custom sprints are ideal when:

- The group doesn''t align with existing departments (e.g., a special project team, an ad-hoc working group)
- You want to keep the work completely separate from regular department views
- You need to manually select exactly who participates (no auto-add from departments)
- Examples: a short-term task force, a volunteer initiative, an off-campus event planning committee

Custom sprints don''t appear in any department space — all work stays sprint-only, keeping department views focused on regular operations.',
  'sprints',
  ARRAY['super_admin','regional_secretary','dept_lead','pastor','member']
),

-- =====================================================================
-- CALENDAR
-- =====================================================================

(
  'calendar-add-event',
  'How do I add an event to the ministry calendar?',
  'Go to **Calendar** in the sidebar. Click the "+" button or click directly on a date in the calendar grid. A new event form opens. Fill in:

1. **Event name** (required)
2. **Date and time** (required)
3. **End time or duration**
4. **Event type** — choose the category that best describes the event (e.g. Service, Meeting, Training)
5. **Department** — which team is hosting this event
6. **Description or notes** — optional but helpful for attendees

Click Save to publish the event. It will appear on the shared ministry calendar visible to all staff.

**Who can create events:** Any authenticated staff member can add events to the calendar. Dept leads can additionally manage event types and calendar settings.',
  'calendar',
  ARRAY['super_admin','regional_secretary','dept_lead','pastor','member']
),

(
  'calendar-rsvp',
  'How do I RSVP to a calendar event?',
  'Find the event on the **Ministry Calendar** and click on it to open the event detail. Look for the RSVP section — it will show "Going / Maybe / Not Going" buttons. Click your response.

Your RSVP is saved automatically and the event organizer can see a list of who has responded.

**If you received an RSVP email invitation:** Click the link in the email. It will take you to a public RSVP page where you can confirm your attendance without needing to log in to Nexus.

**Changing your RSVP:** Click the event again and select a different response — you can update your RSVP anytime before the event.',
  'calendar',
  ARRAY['super_admin','regional_secretary','dept_lead','pastor','member']
),

(
  'calendar-google-sync',
  'How do I sync my Google Calendar with Nexus?',
  'Go to **Settings** → **Integrations** (or **Personal Integrations**). Find the Google Calendar section and click "Connect." You''ll be redirected to Google''s sign-in flow. Log in with your Google account and grant Nexus permission to read your calendar.

Once connected, your Google Calendar events will appear alongside the ministry calendar so you can see everything in one view. The sync is read-only from Google by default — events you create in Nexus don''t automatically create events in Google (unless push sync is enabled by an admin).

**If the connection breaks:** Go back to Settings → Integrations and click "Reconnect" next to Google Calendar.',
  'calendar',
  ARRAY['super_admin','regional_secretary','dept_lead','pastor','member']
),

(
  'calendar-subscribe',
  'How do I subscribe to a calendar category to see those events?',
  'Go to **Calendar** and look for the **Categories** panel on the left side (or the settings/filter button if using the compact view). Each event type or calendar source is listed with a toggle or checkbox. Check the categories you want to see and uncheck the ones you want to hide.

Your subscription preferences are saved — next time you open the calendar, it will show the same categories. This lets you, for example, hide categories that aren''t relevant to your role while keeping the ones you care about visible.',
  'calendar',
  ARRAY['super_admin','regional_secretary','dept_lead','pastor','member']
),

(
  'calendar-event-types',
  'What are event types and what is the difference between them?',
  'Event types are categories that help organize and filter calendar events. Each type has a color and name. Examples might include: Service, Meeting, Training, Outreach, Conference, Prayer.

The specific event types available depend on what your admin has configured. Event types serve two purposes:

1. **Visual filtering:** You can show/hide events by type on the calendar
2. **Department visibility:** Some event types may only be visible to specific departments (configured by admins)

When you create an event, pick the type that best describes it. If none of the available types fits well, contact a dept lead or super admin — they can add new event types.',
  'calendar',
  ARRAY['super_admin','regional_secretary','dept_lead','pastor','member']
),

(
  'calendar-rsvp-invitation',
  'How do I create a public RSVP invitation for an event?',
  'Go to **Communications** → **Invitations**. Click "New Invitation." You''ll be guided through a wizard:

1. Choose the event you''re creating the invitation for (or fill in the event details manually)
2. Customize the invitation message and design
3. Add the recipients who should receive the invite
4. Preview the invitation email
5. Send it

Recipients get an email with a unique link to a public RSVP page where they can confirm attendance without logging in. You can track RSVPs in real time from the Invitations dashboard.',
  'calendar',
  ARRAY['super_admin','regional_secretary','dept_lead','pastor','member']
),

(
  'calendar-department-events',
  'How do I view events for a specific department only?',
  'On the **Ministry Calendar**, use the **Filters** or **Category** panel to filter by department or source. Select only the department whose events you want to see. The calendar will update immediately to show only those events.

Alternatively, if you navigate to a specific department''s space in the sidebar, the calendar view there may show only that department''s events by default.',
  'calendar',
  ARRAY['super_admin','regional_secretary','dept_lead','pastor','member']
),

-- =====================================================================
-- COMMUNICATIONS
-- =====================================================================

(
  'comms-send-campaign',
  'How do I send an email campaign?',
  'Go to **Communications** in the sidebar and click **Campaigns**. Click "New Campaign." Fill in:

1. **Campaign name** — for your reference
2. **Subject line** — what recipients will see in their inbox
3. **Recipients** — choose a segment or list of people to send to
4. **Email content** — use the email editor to write your message; you can use a template as a starting point
5. **Schedule** — send immediately or schedule for a future date/time

Click "Preview" to see how the email will look before sending. When you''re ready, click "Send" (or "Schedule").

**After sending:** You can track opens and delivery in the Campaign Analytics view.',
  'communications',
  ARRAY['super_admin','regional_secretary','dept_lead','pastor','member']
),

(
  'comms-recipients',
  'How do I manage my email recipient list?',
  'Go to **Communications** → **Recipients**. You''ll see a list of all people in your recipient database. From here you can:

- **Search** for a specific person by name or email
- **Add recipients** manually (one by one or via import)
- **Organize into segments** — group recipients by criteria like department, event attendance, or custom tags
- **View delivery history** for each person

Segments let you target specific groups when sending campaigns. For example, you might create a "Summer Event Registrants" segment and send only to that group.',
  'communications',
  ARRAY['super_admin','regional_secretary','dept_lead','pastor','member']
),

(
  'comms-delivery-stats',
  'How do I check if my email campaign was delivered and opened?',
  'Go to **Communications** → **Campaigns** and click on the campaign you sent. The **Analytics** tab shows:

- **Sent:** Total number of emails sent
- **Delivered:** How many reached the inbox (vs. bounced)
- **Opened:** How many recipients opened the email (tracked via pixel)
- **Clicked:** If you included links, how many times they were clicked
- **Bounces:** Email addresses that failed to deliver (these are flagged for review)

If you see a high bounce rate, go to **Recipients** and look for flagged addresses that need to be cleaned up.',
  'communications',
  ARRAY['super_admin','regional_secretary','dept_lead','pastor','member']
),

(
  'comms-absence-emails',
  'How do absence follow-up emails work?',
  'Absence emails are automated messages sent to people who were marked absent at a meeting. The workflow:

1. A meeting organizer marks attendance (present/absent) in the Meetings section
2. Nexus identifies who was absent
3. An absence follow-up email is automatically sent (on the configured schedule — usually same day or next morning)
4. The email lets the absent person know they were missed and may include meeting notes or next steps

**Who controls this:** Dept leads and above can configure the absence email rules, customize the email template, and review the send log.

**If you received an absence email by mistake:** Let your dept lead know so they can correct the attendance record.',
  'communications',
  ARRAY['super_admin','regional_secretary','dept_lead','pastor','member']
),

(
  'comms-approve-absence',
  'How do I approve or deny an absence notification before it goes out?',
  'Some absence email setups require a dept lead or manager to approve the list of absent people before the emails are sent. If you''re an approver:

1. You''ll receive a notification when a batch of absence emails is ready for your approval
2. Go to **Communications** → **Absence Emails** → **Pending Approval**
3. Review the list of absent people and the draft email
4. Click "Approve" to send, or "Edit" to make changes first, or "Reject" to cancel the batch

If you approve, the emails go out immediately. If you reject, no emails are sent for that batch.',
  'communications',
  ARRAY['super_admin','regional_secretary','dept_lead']
),

(
  'comms-hub',
  'What is the Communications Hub and what can I do there?',
  'The Communications Hub is the central place for all outbound messaging in Nexus. From here you can:

- **Campaigns** — create and send email broadcasts to recipient lists
- **Invitations** — send RSVP invitations for events
- **Absence Emails** — manage automated absence follow-ups
- **Recipients** — manage your contact database
- **Templates** — create reusable email templates
- **Analytics** — see delivery and engagement stats across all campaigns

Think of it as your email marketing and communications center, built directly into Nexus so everything stays connected to your events and meetings.',
  'communications',
  ARRAY['super_admin','regional_secretary','dept_lead','pastor','member']
),

(
  'comms-invitation-wizard',
  'How do I create an RSVP invitation for a specific event?',
  'Go to **Communications** → **Invitations** → "New Invitation." The invitation wizard walks you through:

1. **Event details** — select an existing calendar event or enter the details manually
2. **Invitation design** — customize the subject line, message, and appearance
3. **Recipients** — add who should receive the invitation
4. **Send settings** — send now or schedule it

Once sent, each recipient gets a personalized email with a unique link. When they click the link, they land on a branded RSVP page where they can confirm attendance — no login required. You track responses from the Invitations dashboard in real time.',
  'communications',
  ARRAY['super_admin','regional_secretary','dept_lead','pastor','member']
),

-- =====================================================================
-- PERSONAL PLANNING
-- =====================================================================

(
  'personal-today-tomorrow',
  'How do I use the Today and Tomorrow views in My Tasks?',
  'Go to **My Tasks** in the sidebar. At the top, you''ll see quick view tabs including **Today** and **Tomorrow**.

- **Today** shows all tasks assigned to you with a due date of today, regardless of which space they''re in
- **Tomorrow** shows tasks due tomorrow so you can prepare ahead

These views pull tasks from every space you have access to and merge them into a single prioritized list. Use them as your daily starting point instead of clicking through each space separately.

**To mark a task done from here:** Click the checkmark/status button on any task and update its status to Completed. The task will disappear from the Today view once it''s closed.',
  'personal_planning',
  ARRAY['super_admin','regional_secretary','dept_lead','pastor','member']
),

(
  'personal-planner',
  'How does the Time-Blocking Planner work?',
  'The **Planner** (accessible from the sidebar) is a weekly calendar where you can block time for specific tasks. To use it:

1. Open the Planner — you''ll see a 7-day grid with hourly slots
2. Your tasks with due dates appear in the right-hand panel
3. Drag a task from the panel onto a time slot to block time for it
4. You can resize time blocks by dragging the bottom edge

This helps you be intentional about when you''ll work on each task, rather than having a flat to-do list with no sense of when things will actually happen.

**Wins:** The planner also connects to the Wins feature — you can log what you accomplished at the end of each day directly from the planner view.',
  'personal_planning',
  ARRAY['super_admin','regional_secretary','dept_lead','pastor','member']
),

(
  'personal-wins',
  'How do I log a win?',
  'Go to **Wins** in the sidebar (or access it from the Planner''s end-of-day prompt). Click "Add Win" and briefly describe what you accomplished. You can add:

- The win title
- The date it happened
- Which space/project it relates to (optional)
- Any notes

Wins are private to you by default — they''re your personal record of progress and accomplishments. Over time, the Wins page gives you a running log of what you''ve achieved, which is useful for performance reviews or just staying motivated.',
  'personal_planning',
  ARRAY['super_admin','regional_secretary','dept_lead','pastor','member']
),

(
  'personal-list',
  'What is My Personal List and how is it different from department tasks?',
  'My Personal List is a private space just for you — tasks you add there are not visible to your department or anyone else. It''s for things like personal reminders, private to-dos, or work you''re doing that doesn''t belong in a shared department space.

Access it from the sidebar under "Personal List." You can create tasks, set due dates, and organize them into sublists (like "This Week" or "Someday").

**Key difference from department tasks:** Department tasks live in shared spaces and are visible to your team. Personal List tasks are yours alone — no one else sees them, and they don''t appear in department boards or reports.',
  'personal_planning',
  ARRAY['super_admin','regional_secretary','dept_lead','pastor','member']
),

(
  'personal-sublists',
  'How do I create a sublist in My Personal List?',
  'Open **Personal List** from the sidebar. Look for the "New sublist" or "+" option near the list header. Type a name for your sublist (e.g. "This Week," "Someday," "Admin Tasks") and press Enter.

Sublists appear as nested sections inside your Personal List. You can:
- Drag tasks between sublists
- Collapse sublists you don''t need to see right now
- Delete a sublist (tasks inside it are moved back to the main list, not deleted)

Note: Sublists are only one level deep — you can''t nest sublists inside sublists.',
  'personal_planning',
  ARRAY['super_admin','regional_secretary','dept_lead','pastor','member']
),

(
  'personal-cross-space',
  'How do I see all tasks assigned to me across all departments in one view?',
  'Use the **My Tasks** section in the sidebar. It shows every task assigned to you across all spaces you have access to, regardless of which department they belong to. Use the **Today** and **Tomorrow** quick filters to narrow to what''s most urgent.

You can also filter My Tasks by space, priority, or due date to zero in on a specific project.

If you also want to see tasks shared with you from other departments, they appear in My Tasks with a small icon indicating they''re from a shared space.',
  'personal_planning',
  ARRAY['super_admin','regional_secretary','dept_lead','pastor','member']
),

-- =====================================================================
-- FLOCK CRM (pastor + super_admin + regional_secretary only)
-- =====================================================================

(
  'flock-what',
  'What is Flock CRM?',
  'Flock CRM is a pastoral relationship management tool built into Nexus for the Pastors department. It helps pastors track their congregation members, log pastoral visits, and manage follow-ups — all in one place connected to the rest of Nexus.

Each pastor has their own Flock — the group of people they''re responsible for. Flock CRM keeps a record of:
- Contact information for each member
- Visit history and notes
- Follow-up reminders
- Any specific needs or circumstances noted during pastoral care

Access it from the sidebar under "Flock" or "My Flock."',
  'flock_crm',
  ARRAY['super_admin','regional_secretary','pastor']
),

(
  'flock-view-members',
  'How do I view and search my congregation members in Flock CRM?',
  'Go to **Flock CRM** (or "My Flock") in the sidebar. You''ll see a list of the congregation members in your flock. Use the search bar at the top to find a specific person by name, phone number, or email.

You can filter the list by:
- Last contact date (e.g. "Not contacted in 30+ days")
- Follow-up status (pending, done)
- Custom tags or groups

Click on any person''s name to open their full profile — you''ll see their contact details, visit history, and any notes from previous conversations.',
  'flock_crm',
  ARRAY['super_admin','regional_secretary','pastor']
),

(
  'flock-log-visit',
  'How do I log a pastoral visit or follow-up in Flock CRM?',
  'Open the congregation member''s profile in Flock CRM. Click "Log Visit" or "Add Follow-up." Fill in:

1. **Date** — when the visit or contact happened
2. **Type** — in-person visit, phone call, text, email, etc.
3. **Notes** — what was discussed or any pastoral observations (these are private to you)
4. **Follow-up needed?** — set a reminder if you need to check in again

Click Save. The visit is added to that person''s contact history. You''ll be able to see a full timeline of all interactions when you open their profile later.',
  'flock_crm',
  ARRAY['super_admin','regional_secretary','pastor']
),

(
  'flock-followups',
  'How do I track which congregation members need follow-up?',
  'In Flock CRM, open the **Follow-ups** view (a tab or filter in the main Flock list). This shows everyone for whom you''ve set a follow-up reminder, sorted by when the follow-up is due.

You can also see members who haven''t been contacted recently by filtering by "Last contact date" — this helps you proactively reach out to people who might be slipping through the cracks.

When you complete a follow-up, log the visit and mark the follow-up as done. It will move out of the pending list.',
  'flock_crm',
  ARRAY['super_admin','regional_secretary','pastor']
),

(
  'flock-visibility',
  'Who can see my Flock CRM data?',
  'Your Flock CRM records are private to you by default. Only you can see your visit notes, follow-up details, and congregation member profiles in your flock.

Super Admins and Regional Secretaries can access Flock CRM data across all pastors for administrative and support purposes — but regular members, dept leads from other departments, and other pastors cannot see each other''s flock data.

ORS and Admin departments have restricted visibility into Flock CRM — they can see aggregate workload information but not individual pastoral notes or member details.',
  'flock_crm',
  ARRAY['super_admin','regional_secretary','pastor']
),

-- =====================================================================
-- REGISTRATION
-- =====================================================================

(
  'registration-access',
  'What is the Registration page and who can access it?',
  'The **Registration** page manages event registrations — it''s where you can see who has signed up for events, manage room assignments, check dietary restrictions, and handle logistics.

**Who can access it:** Pastors and active sprint/team members for the event, plus super admins and regional secretaries. Regular members who aren''t part of the event team don''t have access by default.

Access it from the sidebar or from **Apps → Registration**.',
  'registration',
  ARRAY['super_admin','regional_secretary','dept_lead','pastor','member']
),

(
  'registration-view-registrants',
  'How do I view the registrant list for an event?',
  'Go to **Registration** in the sidebar or App menu. Select the event you''re managing from the event selector at the top. The **Registrations** tab shows all registered participants with their:

- Name and contact information
- Registration date
- Payment/confirmation status
- Flight details (if applicable)

You can search, sort, and filter the list. There''s also a **Delegate Compliance** tab that flags any participants with outstanding requirements (like missing allergy information).',
  'registration',
  ARRAY['super_admin','regional_secretary','dept_lead','pastor','member']
),

(
  'registration-rooms',
  'How do I manage room assignments for registrants?',
  'In the **Registration** page, click the **Room Assignment** tab. You''ll see a list of unassigned registrants (sorted by gender) on one side, and available room cards on the other.

Drag participants from the unassigned list onto a room card to assign them. The room card updates in real time to show capacity.

**Reassigning:** Drag a person from one room to another. You can also click on a person to see their profile and manually edit their room assignment.

**Filters:** Use the gender filter to manage male and female rooms separately.',
  'registration',
  ARRAY['super_admin','regional_secretary','dept_lead','pastor','member']
),

(
  'registration-dietary',
  'How do I check dietary restrictions or allergies for registrants?',
  'Go to **Registration** → **Delegate Compliance** tab (or the Registrations tab and look for the allergy/dietary column). You can see each registrant''s declared dietary restrictions and allergies.

Use the filter to show only registrants with specific restrictions (e.g. "Gluten free," "Nut allergy") so you can plan catering appropriately.

If a registrant''s allergy information is missing, the Delegate Compliance view flags them in red. You may need to contact them directly to collect this information before the event.',
  'registration',
  ARRAY['super_admin','regional_secretary','dept_lead','pastor','member']
),

(
  'registration-data-sync',
  'How is registration data kept up to date?',
  'Registration data syncs automatically from the Google Apps Script that manages the registration form. When someone submits the registration form, their record appears in Nexus within a few minutes via the sync pipeline.

Changes made directly in the Nexus Registration page (like room assignments) are stored in Nexus''s database and do not automatically push back to Google Sheets — these are Nexus-only data points.

If you notice a registrant''s information is wrong or outdated, you can edit it directly in their registration profile in Nexus.',
  'registration',
  ARRAY['super_admin','regional_secretary','dept_lead','pastor','member']
),

-- =====================================================================
-- AUTOMATIONS (dept_lead+)
-- =====================================================================

(
  'automations-what',
  'What is an automation in Nexus?',
  'An automation is a rule you set up that tells Nexus to do something automatically when a specific condition is met — without you having to do it manually every time.

Example: "When a task is moved to Completed status, automatically notify the person who created it."

Automations are made of two parts:
- **Trigger** — the event that starts the automation (e.g. task status changes, a due date is passed, a new task is created)
- **Action** — what happens automatically (e.g. send a notification, change an assignee, update a field, create a sub-task)

Automations are managed per department and require dept lead access or above to create and edit.',
  'automations',
  ARRAY['super_admin','regional_secretary','dept_lead']
),

(
  'automations-create',
  'How do I create a new automation?',
  'Go to **Automations** in the sidebar (under the admin tools section — it''s a top-level link, not inside Settings). Click "New Automation."

The automation builder walks you through:
1. **Choose a trigger** — select what event should start the automation
2. **Add conditions** (optional) — narrow down when the trigger fires (e.g. only when priority is "Urgent")
3. **Choose an action** — what should happen when the trigger fires
4. **Name and enable** your automation

Test your automation by triggering the event manually and checking the Automation Run Log to confirm it fired.

Keep automations focused — one trigger, one action. Complex multi-step workflows can be chained as separate automations.',
  'automations',
  ARRAY['super_admin','regional_secretary','dept_lead']
),

(
  'automations-triggers',
  'What triggers are available for automations?',
  'Available triggers include:

- **Task status changes** — fires when a task moves to a specific status
- **Task created** — fires when any new task is added to a list
- **Task assigned** — fires when a task''s assignee changes
- **Due date approaching** — fires a set number of days before a task''s due date
- **Due date passed** — fires when a task is overdue
- **Comment added** — fires when someone comments on a task
- **Meeting created** — fires when a new meeting is scheduled
- **Sprint started / ended** — fires at the beginning or end of a sprint

The available triggers may vary depending on your department configuration. If you need a trigger that isn''t listed, contact your super admin.',
  'automations',
  ARRAY['super_admin','regional_secretary','dept_lead']
),

(
  'automations-actions',
  'What actions can an automation perform?',
  'Actions that can be automatically triggered include:

- **Send a notification** — notify a specific person or group
- **Send an email** — send a predefined email template to a recipient
- **Change task status** — update the task to a new status
- **Reassign a task** — change the assignee
- **Set a due date** — automatically apply a due date relative to the trigger
- **Create a sub-task** — generate a new sub-task under the triggered task
- **Add a comment** — automatically post a comment (useful for reminders or instructions)
- **Send a Slack message** — if Slack is connected, post to a channel

Combine a trigger with an action to build the automation you need.',
  'automations',
  ARRAY['super_admin','regional_secretary','dept_lead']
),

(
  'automations-toggle',
  'How do I enable or disable an automation?',
  'Go to **Automations** in the sidebar. You''ll see a list of all automations in your department. Each has a toggle switch on the right side.

- **Toggle on (green):** The automation is active and will fire when triggered
- **Toggle off (grey):** The automation is paused — it won''t fire even if the trigger condition is met

Disabling an automation is useful when you need to temporarily stop it without deleting it (e.g. during a special project period when the rules change).',
  'automations',
  ARRAY['super_admin','regional_secretary','dept_lead']
),

(
  'automations-history',
  'How do I see the history of when an automation ran?',
  'Go to **Automations** in the sidebar and click on any automation''s name (or look for a "View History" or "Run Log" button). This opens the **Automation Run Log**, which shows:

- The date and time it fired
- What triggered it (which task, meeting, etc.)
- What action was taken
- Whether the action succeeded or failed (and why, if failed)

If an automation isn''t working as expected, this is the first place to check — the run log will show you exactly what happened and when.',
  'automations',
  ARRAY['super_admin','regional_secretary','dept_lead']
),

-- =====================================================================
-- DASHBOARD
-- =====================================================================

(
  'dashboard-what',
  'What is the Dashboard?',
  'The **Dashboard** is your landing page after logging in to Nexus. It gives you a quick summary of what''s happening across your department: tasks in progress, upcoming events, sprint status, recent activity, and more.

Think of it as your daily briefing — you can see at a glance what needs attention without clicking through every section.',
  'dashboard',
  ARRAY['super_admin','regional_secretary','dept_lead','pastor','member']
),

(
  'dashboard-widgets',
  'What widgets are available on the Dashboard?',
  'The Dashboard includes widgets such as:

- **My Tasks Summary** — a count of your tasks by status (To Do, In Progress, Due Today, Overdue)
- **Department Utilization** — how tasks are distributed across statuses for your whole department
- **Sprint Progress** — current sprint(s) completion rate
- **Upcoming Events** — the next few calendar events for your department
- **Recent Activity** — a feed of recent changes across your spaces
- **People Online** — who from your department has been active recently

The specific widgets visible to you depend on your role and what your admin has configured for your department.',
  'dashboard',
  ARRAY['super_admin','regional_secretary','dept_lead','pastor','member']
),

(
  'dashboard-dept-utilization',
  'How does the Department Utilization widget work?',
  'The **Department Utilization** widget shows how your department''s tasks are distributed across the five canonical statuses: To Do, In Progress, Review, Completed, and Cancelled. It gives you a visual breakdown (usually a bar or donut chart) so you can quickly see if too many tasks are stuck in one status.

For example, if 80% of tasks are "In Progress" with almost nothing in "Completed," that signals a bottleneck — tasks are starting but not finishing.

This widget is most useful for dept leads and above, who need to see the whole team''s workload at a glance rather than just their own tasks.',
  'dashboard',
  ARRAY['super_admin','regional_secretary','dept_lead','pastor','member']
),

(
  'dashboard-navigate',
  'How do I navigate from the Dashboard to a specific space or section?',
  'From the Dashboard, you can:

- Click any task in the "My Tasks Summary" widget to open that task directly
- Click a sprint in "Sprint Progress" to open the full sprint view
- Click an event in "Upcoming Events" to open the calendar event detail
- Use the **sidebar** on the left to navigate to any section: Spaces, Meetings, Calendar, etc.

The Dashboard itself doesn''t have deep navigation built in — it''s a summary view. Use the sidebar for full navigation.',
  'dashboard',
  ARRAY['super_admin','regional_secretary','dept_lead','pastor','member']
),

(
  'dashboard-customize',
  'Can I customize my dashboard?',
  'Basic dashboard customization (like reordering or hiding widgets) depends on what your admin has enabled. If you see a "Customize" or "Edit Dashboard" button in the top-right of the dashboard, you can drag widgets to rearrange them or hide ones you don''t use.

If you don''t see a customize option, the dashboard layout is fixed for your role. You can still use the sidebar filters and views within each widget to see different data.',
  'dashboard',
  ARRAY['super_admin','regional_secretary','dept_lead','pastor','member']
),

-- =====================================================================
-- ORG CHART / DIRECTORY
-- =====================================================================

(
  'org-chart',
  'How do I view the org chart?',
  'Go to **Org** in the sidebar (or navigate to /org). The org chart shows the organizational hierarchy of BLW Canada with departments, roles, and people visualized as a tree.

You can:
- Click on a person''s card to see their profile, role, and contact information
- Zoom in/out to navigate the chart
- Filter by department to see just one team''s structure

The org chart is read-only for most users — only super_admin and regional_secretary can edit node and edge text. All other authenticated users (every role, every department) can view the full org chart with no restriction.',
  'org_directory',
  ARRAY['super_admin','regional_secretary','dept_lead','pastor','member']
),

(
  'org-find-contact',
  'How do I find someone''s contact information in Nexus?',
  'Go to **People** in the sidebar. You can search by name, department, or role. Click on a person''s name to see their profile, which includes:

- Email address
- Phone number (if provided)
- Department and role
- Profile photo

You can also find someone''s contact info by clicking their name or avatar wherever it appears in Nexus (in task assignees, meeting attendees, comments, etc.).',
  'org_directory',
  ARRAY['super_admin','regional_secretary','dept_lead','pastor','member']
),

(
  'org-update-profile',
  'How do I update my own profile?',
  'Go to **Settings** → **Profile** (or click your avatar in the top-right corner and choose "My Profile" or "Settings"). From there you can update:

- **Display name**
- **Profile photo** — click the photo area and upload a new image
- **Phone number**
- **Bio or role description** (if your admin has enabled this field)

Changes save automatically or when you click Save. Your updated profile is visible to everyone in the organization.',
  'org_directory',
  ARRAY['super_admin','regional_secretary','dept_lead','pastor','member']
),

(
  'org-people-page',
  'What is the People page?',
  'The **People** page (/people) is a searchable directory of all staff members. It shows each person''s name, photo, department, and role. From here you can:

- Search for someone quickly
- See all members of a specific department
- Click through to individual profiles for contact details

Super admins and regional secretaries can also manage invitations and permissions from the People page.',
  'org_directory',
  ARRAY['super_admin','regional_secretary','dept_lead','pastor','member']
),

-- =====================================================================
-- FILES
-- =====================================================================

(
  'files-attach',
  'How do I attach a file to a task or meeting?',
  'Open the task or meeting and find the **Attachments** section (paperclip icon). Click "Add attachment" or drag a file directly into the section.

For tasks: scroll down past the description to find Attachments.
For meetings: it''s typically in the meeting detail panel alongside minutes and agenda.

You can attach files from your computer or paste a link to a Google Drive document (if Drive is connected). Images will show as previews; other file types appear as download links.',
  'files',
  ARRAY['super_admin','regional_secretary','dept_lead','pastor','member']
),

(
  'files-find',
  'Where can I find files that have been shared in Nexus?',
  'Go to **Files** in the sidebar. This shows a consolidated view of all files attached to tasks and meetings in your department spaces. You can:

- Search by file name
- Filter by date uploaded
- Filter by which task or meeting the file belongs to

If you''re looking for a specific file, it''s often faster to go directly to the task or meeting it was attached to rather than browsing the Files page.',
  'files',
  ARRAY['super_admin','regional_secretary','dept_lead','pastor','member']
),

(
  'files-google-drive',
  'Does Nexus connect to Google Drive?',
  'Yes. If your admin has set up the Google Drive integration, you can link Google Drive documents to tasks and meetings rather than uploading files directly. The linked file stays in Drive — Nexus stores a reference to it and displays a thumbnail or link in the task.

**To link a Drive file:** In the Attachments section of a task or meeting, choose "Link from Google Drive" and search for or paste the document''s URL.

**To set up Drive integration:** Go to Settings → Integrations and connect your Google account.',
  'files',
  ARRAY['super_admin','regional_secretary','dept_lead','pastor','member']
),

-- =====================================================================
-- GROWTH TRACKING
-- =====================================================================

(
  'growth-what',
  'What is the Growth Tracking page?',
  'Growth Tracking is where the organization records and monitors key ministry metrics over time — attendance numbers, cell group growth, salvation counts, baptisms, and other indicators of organizational growth.

Access it from the sidebar under "Growth Tracking." The page shows trends over time in chart form so leadership can see whether growth goals are on track.',
  'growth_tracking',
  ARRAY['super_admin','regional_secretary','dept_lead','pastor','member']
),

(
  'growth-log',
  'How do I log growth data?',
  'Go to **Growth Tracking** and click "Log Entry" or the "+" button. Select the metric you''re recording (e.g. Sunday attendance), enter the value, and pick the date it corresponds to. Add any notes if relevant, then save.

The entry will appear on the growth chart immediately. If you made a mistake, click on the entry and edit or delete it.',
  'growth_tracking',
  ARRAY['super_admin','regional_secretary','dept_lead','pastor','member']
),

(
  'growth-visibility',
  'Who can view growth statistics?',
  'Growth Tracking data is visible to all authenticated staff members — it''s treated as organizational data shared across the whole team. The charts and historical records are read-only for regular members; only dept leads and above can add or edit entries.

If you believe certain growth metrics should be restricted, contact your super admin to discuss access controls.',
  'growth_tracking',
  ARRAY['super_admin','regional_secretary','dept_lead','pastor','member']
),

(
  'growth-usage',
  'How is growth data used in Nexus?',
  'Growth data is primarily used for reporting and planning. Leadership uses the trend charts to:

- Assess whether ministry programs are achieving their goals
- Identify which areas are growing or declining
- Inform staffing and resource decisions

The data does not automatically connect to tasks or sprints — it''s a separate record-keeping system. If you want to create a task related to a growth goal, do that manually in the relevant space.',
  'growth_tracking',
  ARRAY['super_admin','regional_secretary','dept_lead','pastor','member']
),

-- =====================================================================
-- IMMERSE READER
-- =====================================================================

(
  'immerse-what',
  'What is the Immerse reader?',
  'Immerse is a built-in reading and study tool in Nexus. It lets you upload your own PDFs and books into a personal library, then read them in a dedicated interface — with page-flip animations, highlights, notes, and a clean reading experience without distractions.

Access it from **Books** in the sidebar (or navigate to /books). This is a Super Admin-only feature — no other role, including Regional Secretary, has access to it.',
  'immerse',
  ARRAY['super_admin']
),

(
  'immerse-access',
  'How do I access reading materials in Immerse?',
  'Go to **Books** in the sidebar. The library shows all documents available to you. Click on a book or document cover to open it in the reading interface.

Use the page controls at the bottom to navigate: forward/back arrows, or click a specific page. The reading interface also supports keyboard shortcuts (left/right arrow keys to flip pages).',
  'immerse',
  ARRAY['super_admin']
),

(
  'immerse-share',
  'How do I share a reading with someone in Immerse?',
  'Sharing a book into someone else''s Immerse library is available from the Admin panel inside Immerse: choose the book and the recipient, and it creates a full independent copy in that person''s library (it is not a live link — the recipient gets their own copy to read, highlight, and annotate separately from yours). Immerse itself is Super Admin only, so this — like everything else in Immerse — is not available to any other role.',
  'immerse',
  ARRAY['super_admin']
),

(
  'immerse-manage',
  'How do I delete or rename a document in the Immerse library?',
  'For a book in your own library, hover over its card to reveal the rename/delete controls. Rename lets you type a new title; delete permanently removes it from your library (this cannot be undone). Immerse is Super Admin only, so this applies only to that role — no other role has a library to manage.',
  'immerse',
  ARRAY['super_admin']
),

-- =====================================================================
-- ROLES & PERMISSIONS
-- =====================================================================

(
  'roles-member-vs-lead',
  'What is the difference between a Member and a Dept Lead in Nexus?',
  'Both roles have access to their department''s tasks, meetings, calendar, and communications. The key differences:

**Member** can:
- Create, edit, and complete tasks in their space
- Join sprints (by invite or request)
- Comment on tasks and meetings
- View the calendar and RSVP to events
- Access personal planning tools

**Dept Lead** can do all of the above, plus:
- Create and manage automations
- Configure space settings and custom statuses
- Approve absence emails before they go out
- Manage calendar event types
- Invite people to sprints (not just request)
- View department analytics (utilization, attendance trends)

In short: members do the work; dept leads manage how the work is organized and ensure the team runs smoothly.',
  'roles_permissions',
  ARRAY['super_admin','regional_secretary','dept_lead','pastor','member']
),

(
  'roles-super-admin',
  'What is a Super Admin and what can they do?',
  'Super Admin is the highest access level in Nexus. Super admins can see and do everything across all departments:

- View all tasks, meetings, and spaces in every department
- Manage users: invite, deactivate, change roles
- Access admin tools: campus edits, email admin, permissions management
- Run all automations and manage platform-wide settings
- View all Nova query logs and manage the knowledge base
- Access all integrations and API settings

Super admins are typically IT or platform administrators, not regular staff. If you need something done that requires super admin access, contact IK Nwokem or your designated platform admin.',
  'roles_permissions',
  ARRAY['super_admin','regional_secretary','dept_lead','pastor','member']
),

(
  'roles-regional-secretary',
  'What is a Regional Secretary and what access do they have?',
  'Regional Secretary has near-super-admin access — they can see and act across all departments with a few exceptions (they can''t access campus photos settings, certain permission/integration management tools, or Immerse/Books, which is Super Admin only).

Regional Secretaries typically support the whole organization and need visibility across departments to do their job. If you have a request that requires someone to look across multiple departments, a Regional Secretary can often help.',
  'roles_permissions',
  ARRAY['super_admin','regional_secretary','dept_lead','pastor','member']
),

(
  'roles-pastor',
  'What is the Pastor role in Nexus?',
  'The Pastor role has access to the standard Nexus workspace (tasks, meetings, calendar, sprints) plus access to **Flock CRM** — the pastoral relationship management tool. Pastors can:

- Use Flock CRM to manage their congregation members and log visits
- Access the Registration page for events where they''re part of the team
- Participate in sprints and meetings like any other staff member

The Pastor role does not grant department admin or automation management rights — those require dept_lead or above.',
  'roles_permissions',
  ARRAY['super_admin','regional_secretary','dept_lead','pastor','member']
),

(
  'roles-missing-menu',
  'Why can''t I see certain menu items or pages?',
  'Menu items and pages in Nexus are shown based on your role. If you can''t see something, it''s likely because:

1. **Your role doesn''t include that feature** — e.g. Automations is only visible to dept_lead and above; Flock CRM is only visible to pastors and admins
2. **You''re not in the right department** — some spaces only appear in the sidebar if you''re a member of that department
3. **A feature is disabled for your org** — some features can be turned off at the platform level

If you believe you should have access to something and don''t, check with your department lead first. They can verify your role or escalate to a super admin if something needs to be changed.',
  'roles_permissions',
  ARRAY['super_admin','regional_secretary','dept_lead','pastor','member']
),

(
  'roles-report-permission-issue',
  'How do I report a permissions problem?',
  'If you''re unexpectedly blocked from something you think you should have access to:

1. **Check with your dept lead first** — they can confirm whether your access is correct for your role
2. **If your dept lead agrees you should have access:** Ask them to submit a request to the platform admin (IK Nwokem) or a super admin
3. **If it seems like a bug** (you had access before and it suddenly stopped working): Report it via the **Support** page in Nexus (sidebar → Support or Help) so it can be investigated

For urgent access issues that are blocking your work, contact IK Nwokem directly.',
  'roles_permissions',
  ARRAY['super_admin','regional_secretary','dept_lead','pastor','member']
),

(
  'roles-change-permissions',
  'Can my permissions be changed?',
  'Yes. Role changes and permission grants are made by super admins. Common scenarios:

- **Role upgrade** (e.g. member → dept_lead): Requires a super admin to update your profile
- **Access grant** (e.g. regional secretary access): Super admins can grant specific access grants on top of your base role
- **Temporary access**: Super admins can add you as a sprint member or share a space with you for cross-department work

To request a permissions change, talk to your dept lead who can make the request to a super admin on your behalf.',
  'roles_permissions',
  ARRAY['super_admin','regional_secretary','dept_lead','pastor','member']
),

(
  'roles-department-scope',
  'What does "access restricted to your department" mean?',
  'Most data in Nexus is scoped to your department. This means:

- You can only see tasks in spaces that belong to your department (unless someone shares a specific task or space with you)
- Meetings you''re not invited to won''t appear in your meeting list
- Calendar events for other departments are visible on the shared ministry calendar, but their details may be limited
- Your sprint and personal list data is private to you

This scoping is enforced at the database level for security — it''s not just a UI filter. Even if you know a task exists in another department, you can''t access it unless it''s been shared with you.

The exception is super admins and regional secretaries, who have cross-department visibility by design.',
  'roles_permissions',
  ARRAY['super_admin','regional_secretary','dept_lead','pastor','member']
),

-- =====================================================================
-- NOTIFICATIONS
-- =====================================================================

(
  'notif-mentions',
  'How do I get notified when someone @mentions me?',
  'Whenever someone types @YourName in a task comment, meeting note, or other Nexus text field, you will automatically receive:

1. **An Inbox notification** — visible in Nexus at the envelope icon in the top navigation bar
2. **A desktop or push notification** — if you''ve granted Nexus permission to send browser notifications

You''ll see the full context of the mention when you click the notification: who mentioned you, where, and what they said. Click "View" to jump directly to the task or meeting.',
  'notifications',
  ARRAY['super_admin','regional_secretary','dept_lead','pastor','member']
),

(
  'notif-types',
  'What types of notifications does Nexus send?',
  'Nexus sends notifications for:

- **@mentions** — someone mentioned you in a comment or note
- **Task assignment** — you were assigned to a task
- **Task status change** — a task you follow changed status
- **Comment on followed task** — someone commented on a task you follow
- **Sprint invite** — you''ve been invited to join a sprint
- **Meeting invite** — you''ve been added to a meeting
- **Action item assigned** — a meeting action item was assigned to you
- **Absence email approval needed** — (dept leads) a batch needs your review

Each notification type can appear in your Inbox and optionally as a desktop/push alert.',
  'notifications',
  ARRAY['super_admin','regional_secretary','dept_lead','pastor','member']
),

(
  'notif-settings',
  'How do I manage my desktop or push notification settings?',
  'The first time Nexus tries to send you a desktop notification, your browser will ask for permission. Click "Allow" to enable them.

To manage notification preferences after that: go to **Settings** → **Notifications** (if available). You may be able to turn off specific notification types or all push notifications.

If push notifications have stopped working: try going to Settings → Notifications and clicking "Re-enable notifications." This prompts the browser permission dialog again. Some browsers or systems may block notifications if you''ve toggled them off at the OS level — check your browser or phone notification settings as well.',
  'notifications',
  ARRAY['super_admin','regional_secretary','dept_lead','pastor','member']
),

(
  'notif-inbox',
  'What is the Inbox and how is it different from Notifications?',
  'The **Inbox** (envelope icon in the top nav bar) is your centralized feed of all activity that requires your attention — @mentions, task assignments, sprint invites, action items, and more.

**Notifications** (the bell icon, if separate) are typically transient alerts that pop up briefly. The Inbox is persistent — items stay there until you mark them as read or act on them.

Think of it this way: **Notifications** tell you something happened. **Inbox** is where you go to review and respond to everything that needs your attention, so nothing falls through the cracks.',
  'notifications',
  ARRAY['super_admin','regional_secretary','dept_lead','pastor','member']
),

-- =====================================================================
-- GENERAL PLATFORM
-- =====================================================================

(
  'general-search',
  'How do I search for content in Nexus?',
  'Click the **Search** bar at the top of the page (or press Ctrl+K / Cmd+K as a keyboard shortcut). Type what you''re looking for — Nexus searches across tasks, meetings, people, and spaces simultaneously.

**Search tips:**
- Use the full name or a distinctive phrase from the task title
- If you''re looking for a person, type their first or last name
- For meetings, try the meeting title or the date

Results are filtered by what you have access to — you won''t see results from departments you can''t access.',
  'general',
  ARRAY['super_admin','regional_secretary','dept_lead','pastor','member']
),

(
  'general-space-folder-list',
  'What is the difference between a Space, a Folder, and a List?',
  'These are the three levels of the task hierarchy in Nexus:

- **Space** — the top level, corresponds to a department (e.g. "Media," "Pastors"). Each department has one or more spaces. Spaces hold folders and lists.
- **Folder** — a group of related lists inside a space. Optional — not every space uses folders. Example: a "Q3 Projects" folder that contains several lists.
- **List** — where tasks actually live. A list is a collection of tasks around a theme or project (e.g. "Sunday Service Prep," "Weekly Admin").

So the hierarchy is: **Space → Folder → List → Tasks.**

When creating a task, you pick which list it goes in. Lists belong to a folder (or directly to a space if there are no folders).',
  'general',
  ARRAY['super_admin','regional_secretary','dept_lead','pastor','member']
),

(
  'general-navigate-departments',
  'How do I navigate between departments in the sidebar?',
  'The left sidebar shows **Spaces** — one per department you have access to. Click the space name to expand it and see its folders and lists. Click a list to open it.

If you have access to multiple departments, you''ll see all their spaces listed. You can favorite a space (click the star icon next to it) to keep it pinned at the top of your sidebar.

**Super admins and Regional Secretaries** see all department spaces automatically. Regular members see only their own department''s spaces.',
  'general',
  ARRAY['super_admin','regional_secretary','dept_lead','pastor','member']
),

(
  'general-quick-create',
  'How do I quickly create a task from anywhere in Nexus?',
  'Click the blue **✚** button in the top navigation bar. A "New Task" modal opens. Fill in the task name and any other details you want, then Save.

You can also use the keyboard shortcut **N** when a task list is in focus to create a task inline at the bottom of that list.

The Quick Create button is always visible regardless of what page you''re on — you don''t need to navigate to a specific list first.',
  'general',
  ARRAY['super_admin','regional_secretary','dept_lead','pastor','member']
),

(
  'general-get-help',
  'How do I get help if something is broken or I''m stuck?',
  'A few options depending on the situation:

1. **Ask Nova (me!):** For how-to questions about using Nexus features — that''s exactly what I''m here for.
2. **Help page:** Go to **Help** in the sidebar for written documentation and guides.
3. **Support page:** Go to **Support** in the sidebar to submit a support request that reaches the Nexus team.
4. **Your dept lead:** For department-specific questions (access, workflows, permissions) — they know your team''s setup.
5. **IK Nwokem:** For platform-level issues, technical bugs, or anything that needs a super admin — reach out directly.

For urgent issues blocking you from doing your job, don''t wait — contact IK Nwokem or a super admin directly rather than waiting for a support ticket response.',
  'general',
  ARRAY['super_admin','regional_secretary','dept_lead','pastor','member']
),

(
  'general-sidebar',
  'What does the sidebar show and how do I use it?',
  'The left sidebar is your main navigation panel. It''s organized into sections:

- **Personal** — My Tasks, Inbox, Personal List, Planner, Wins
- **Spaces** — your department''s spaces (expandable to show folders and lists)
- **Tools** — Meetings, Sprints, Calendar, Communications, People, and other feature sections
- **Platform** — Settings, Help, Support

Click any item to navigate there. Spaces can be expanded to show folders and lists inside them. Use the star icon to favorite spaces and pin them to the top.

On mobile, the sidebar is hidden by default — tap the menu icon at the top left to open it as a drawer.',
  'general',
  ARRAY['super_admin','regional_secretary','dept_lead','pastor','member']
),

(
  'general-profile-photo',
  'How do I change my profile picture or display name?',
  'Click your avatar or initials in the top-right corner of the screen. Choose "Settings" or "My Profile" from the dropdown. On the profile page:

- **Photo:** Click on your current photo (or the initials placeholder) to upload a new one from your device. Supported formats: JPG, PNG, GIF. Recommended size: at least 200x200 pixels.
- **Display name:** Click the name field and type your preferred name. Click Save when done.

Your updated photo and name will appear everywhere in Nexus: in task assignees, comments, meeting attendees, and the org chart.',
  'general',
  ARRAY['super_admin','regional_secretary','dept_lead','pastor','member']
);

-- =====================================================================
-- CORE FEATURE ENTRIES (detailed walkthrough style)
-- =====================================================================

insert into public.nova_kb_entries
  (slug, question, answer, feature_area, applicable_roles)
values

(
  'flock-crm-what-is',
  'What is Flock CRM?',
  'Flock CRM is a pastoral outreach tool built into Nexus for tracking and managing your relationships with contacts in your care. Think of it as a personal journal combined with a to-do list for people you''re following up with.

**What it does:**
- Stores a list of people you''re regularly in touch with — pastors, volunteers, or anyone you''re doing pastoral care for
- Tracks the last time you reached them (call, message, visit, prayer)
- Lets you add quick notes about conversations or prayer requests
- Shows you who''s due for a follow-up, so you never lose track of someone important
- Automatically suggests people overdue for contact based on how often you normally reach out to them

**How it''s scoped to you:**
- You can only see people assigned to you or to your pastoral scope — you won''t see another pastor''s contact list unless they share it with you
- If your role is pastor, Flock is visible in the sidebar under your name; if you''re staff, you''ll see it if you have pastoral responsibilities

**Real example:** You haven''t called Sarah in two weeks; Flock flags her as "Due today." You click her card, log a quick call note ("Prayer for her job interview"), and Flock resets the timer for the next expected follow-up.',
  'flock',
  ARRAY['super_admin','regional_secretary','pastor']
),

(
  'planner-what-is',
  'What is the Planner?',
  'The Planner is a time-blocking tool for visualizing your week at a glance — not a calendar sync like Google Calendar, but a personal weekly grid where you control exactly how you spend your time.

**What it does:**
- Shows your week (Monday–Sunday) as a grid with hourly time blocks
- Lets you drag your assigned tasks into specific time slots to plan when you''ll work on them
- Warns you if you''ve over-committed (e.g. booked 40 hours of work into 20 available hours) so you catch conflicts early
- Shows your "Done this week" count so you can see progress as you complete tasks

**How tasks connect to the Planner:**
- Any task assigned to you shows up on the left sidebar ready to be time-blocked
- Dragging a task onto a time slot creates a "time block" — a reservation of your time for that work
- Completing the task in Nexus (marking it Done) automatically closes out the time block, so your calendar stays in sync with reality
- You can unlink a task from its time block if plans change, so the task isn''t lost — it just goes back to "unscheduled"

**Mobile note:** On phones, the Planner shows one day at a time with a sidebar to navigate the week, since the full grid is too wide to fit.

**Common scenario:** You have 5 tasks due this week. The Planner helps you figure out when you can actually do them — if you only have 10 hours free but 30 hours of work, you''ll see the red warning before Wednesday rolls around and you''re drowning.',
  'planner',
  ARRAY['super_admin','regional_secretary','dept_lead','pastor','member']
),

(
  'planner-how-to-use',
  'How do I time-block my tasks in the Planner?',
  '**Step 1: Open the Planner and see your week**
- Click Planner in the sidebar (or tap the icon on mobile)
- You''ll see a weekly grid (Mon–Sun) with time slots from early morning to evening
- The left sidebar lists all tasks assigned to you that aren''t yet time-blocked

**Step 2: Drag a task into a time slot**
- Find the task you want to schedule in the left sidebar
- Click and hold the task, then drag it onto the day and time you want to work on it
- Drop it — it snaps into that time slot and reserves that time for that task
- The task now shows in the grid with its priority color and title

**Step 3: Adjust the block if needed**
- Once a task is in a slot, you can drag it to a different day/time by dragging again
- You can also resize a block by dragging its bottom edge — if a task will take 2 hours, make the block 2 hours tall
- If you change your mind, drag it back to the sidebar (or click the X) to unlink it from time and free up that slot

**Step 4: Watch for warnings**
- If you''ve booked more work than hours available in a day (or week), the Planner shows a warning banner at the top
- This means you''ve over-committed — you''ll need to either move tasks to another day, break them up, or delegate
- Red warnings are the most urgent; yellow warnings are cautions you can often work with

**Step 5: Complete tasks as you go**
- As you finish a task in Nexus (mark it Done), its time block automatically closes
- The block disappears from the Planner, freeing up that time visually
- You''ll see your "Done this week" count go up

**Pro tip:** The Planner isn''t a strict schedule — it''s a planning tool. You can move blocks around up to the day-of if something urgent comes up. The goal is to help you see realistic capacity for the week, not to lock you into a rigid schedule.',
  'planner',
  ARRAY['super_admin','regional_secretary','dept_lead','pastor','member']
),

(
  'personal-list-what-is',
  'What is my Personal List?',
  'Your Personal List is a private space for tasks and notes that aren''t part of the shared department work. Think of it as your personal to-do list within Nexus — no one else sees it, and it doesn''t show up in department task boards.

**What it''s for:**
- Personal reminders (e.g. "call mom," "buy groceries")
- Personal development tasks (e.g. "read chapter 3 of X book")
- Private notes to yourself that you want to keep in one place but don''t need to share with your team

**How it works:**
- Your Personal List appears in the sidebar under your name
- You can add tasks directly to it (no approval needed; it''s just for you)
- Tasks in your Personal List won''t show up when your team looks at the task board
- You can still time-block Personal List tasks in the Planner if you want to reserve time for personal work

**Important:** Your Personal List is read-only to others — even super_admin can''t see the contents. Only you can add, edit, or delete tasks here.',
  'tasks',
  ARRAY['super_admin','regional_secretary','dept_lead','pastor','member']
),

(
  'personal-list-sublists',
  'What are sublists, and how do I organize my Personal List?',
  'Sublists let you organize your Personal List into categories. Instead of one flat list of everything, you can group related tasks together.

**How sublists work:**
- A sublist is like a folder within your Personal List — it has its own name and can contain multiple tasks
- Example sublists: "Health & Fitness," "Learning," "Home Projects," "Ministry Ideas"
- Tasks live in sublists, not directly in the Personal List itself

**How to create and use sublists:**
1. Open your Personal List
2. Click "+ New Sublist" (or similar option, depending on the UI)
3. Give it a name (e.g. "Reading goals")
4. Add tasks to it by clicking "+ New task" within that sublist
5. Each task in the sublist can have its own due date, priority, and notes — just like a regular task

**Why sublists help:**
- **Organization:** Group similar tasks together so you can focus on one area at a time (e.g. look only at "Health" tasks)
- **Less overwhelming:** Instead of seeing a huge list of 50 personal tasks at once, you see them grouped by category
- **Quick scanning:** If you want to focus on "Learning" this week, you can expand only that sublist and ignore the others

**Can I move tasks between sublists?** Yes — drag and drop a task to move it to a different sublist, or edit the task and reassign it.',
  'tasks',
  ARRAY['super_admin','regional_secretary','dept_lead','pastor','member']
),

(
  'meetings-what-is',
  'What are Meetings in Nexus?',
  'Meetings is a module for tracking, documenting, and coordinating your department''s regular gatherings. It goes beyond just "when do we meet" — it captures agendas, minutes, action items, and attendance, all in one place.

**What Meetings does:**
- Lists all scheduled meetings for your department (or ones you''re invited to)
- Lets you build agendas before the meeting
- Records meeting minutes and action items during the meeting
- Tracks who attended (including whether they were planned to attend but didn''t show)
- Assigns follow-up tasks to people based on what was discussed
- Exports meeting docs and minutes as PDFs to save or share

**Who can see what:**
- Everyone in your department can see the meetings your department holds
- If a meeting is cross-department (involves multiple departments), visibility depends on who''s invited
- Action items assigned to you show up in your task list so you don''t forget the follow-up

**Real workflow:** Your team meets Monday morning. You build an agenda in Nexus on Friday. During the meeting, the person taking notes captures the key discussion points. You assign one action item to yourself and another to a team member. Both action items automatically appear in their task lists, and you can export the full minutes as a PDF afterward.',
  'meetings',
  ARRAY['super_admin','regional_secretary','dept_lead','pastor','member']
),

(
  'meetings-how-to-use',
  'How do I use Meetings to run a meeting?',
  '**Before the meeting: Build an agenda**
1. Click Meetings in the sidebar
2. Click "+ New Meeting" and fill in:
   - Title (e.g. "Weekly Staff Sync")
   - Date and time
   - Attendees (everyone expected to be there)
   - Meeting type (if your department has configured types, like "standup" or "planning")
3. Click "+ Add agenda item" to list what you''ll discuss
4. Agenda items are visible to all attendees before the meeting so everyone can prepare

**During the meeting: Record minutes**
1. Open the meeting from the Meetings list
2. Click "Live Minutes Mode" or "Start documenting"
3. For each agenda item:
   - Click the item to highlight it
   - Type notes on the discussion (key decisions, points discussed, questions raised)
   - If someone raised an action item, click "+ Add action item" and fill in: what needs to be done, who it''s assigned to, and when it''s due
4. If available, enable transcription: Nexus can record audio and create a transcript of the meeting
5. Click "End meeting" when done

**After the meeting: Export and assign**
1. Review the meeting minutes you just recorded
2. Click "Export to PDF" to save or share the full meeting doc
3. Action items are automatically turned into tasks and assigned to the people you listed — they see them in their task list and can mark them complete
4. If you need to add more action items after the fact, you can edit the meeting record

**Optional: Share the meeting**
- If this meeting involved people from other departments, you can explicitly share the meeting record with them
- Shared meetings show up in their "Meetings" view too

**Pro tip:** If your team regularly meets (e.g. Monday staff meeting), you can create a recurring meeting so Nexus remembers to create it automatically each week.',
  'meetings',
  ARRAY['super_admin','regional_secretary','dept_lead','pastor','member']
);
