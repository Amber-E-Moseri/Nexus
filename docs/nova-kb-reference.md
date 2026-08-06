# Nexus Knowledge Base — Nova FAQ Reference

This is a human-readable export of the live Nova AI-assistant knowledge base
(`nova_kb_entries` in Supabase). Nova pulls directly from the database table —
**this file is a reference copy for humans, not the source of truth.** To add,
edit, or correct an answer, write a migration against `nova_kb_entries`; this
doc should be regenerated from the DB afterward, not hand-edited and expected
to sync back.

**Total active entries:** 99 (113 total rows, 14 archived — see below)  
**Source migrations:** `20270807000006_nova_knowledge_base.sql` (schema), `20270807000007_nova_kb_seed.sql`, `20270805000012_nova_sprint_comprehensive_kb.sql`, `20270808000001_nova_usecase_kb_entries.sql`, `20270807000009` / `20270807000010` (Immerse answer corrections, applied), `20270808000002_nova_kb_regional_updates_and_map.sql` (Regional Updates + CAN Map added), `20270808000003_nova_kb_fix_mention_delegation.sql` (mention-as-assignment correction), `20270808000004_nova_kb_archive_areas.sql` (14 entries archived, see below)

**Archived (excluded from this doc, status = 'archived' in the DB, not deleted):** Org Chart / Directory (4), Growth Tracking (4), Immerse (4), Regional Updates (2). BLW CAN Map — added the same week as Regional Updates — was kept active.

## Role legend

| Role | Who |
|---|---|
| Super Admin | Full org-wide access |
| Regional Secretary | Near-super-admin; a few named exceptions (campus photos, some permission tools, Immerse) |
| Dept Lead | Full access within their own department |
| Pastor | Pastoral tools (Flock CRM, meeting attendance) + assigned tasks |
| Member | Own department + assigned tasks only |
| ORS | Data-management role; has some admin access (e.g. campus edits) not yet modeled in Nova's 5-role system — see note below |

> **Known gap:** the `ors` role exists in the app and has real access (e.g. to CAN Map admin), but Nova's `applicable_roles` tagging only distinguishes the five roles above. An ORS user asking Nova about ORS-specific capabilities will get whatever the nearest tagged role's answer is, which may not be fully accurate for them.

---

## Table of Contents

- [Task Management](#task-management) (14)
- [Meetings](#meetings) (8)
- [Sprints](#sprints) (10)
- [Ministry Calendar](#ministry-calendar) (7)
- [Communications Hub](#communications-hub) (8)
- [Personal Planning](#personal-planning) (6)
- [People & Contacts (Flock CRM)](#people-contacts-flock-crm) (5)
- [Registration System](#registration-system) (5)
- [Automations & API](#automations-api) (7)
- [Dashboard](#dashboard) (5)
- [Files & Search](#files-search) (3)
- [BLW CAN Map](#blw-can-map) (2)
- [Roles & Permissions](#roles-permissions) (8)
- [Notifications](#notifications) (4)
- [General Platform](#general-platform) (7)

---

## Task Management

### How do I assign a task to someone?

`tasks-assign` — *All roles*

Open the task by clicking on its name. In the task detail panel, look for the **Assignee** field (usually near the top, below the task title). Click on it and type the person's name — Nexus will show matching users from your department. Click the person's name to assign the task to them.

**To reassign:** Click the current assignee's avatar or name in the Assignee field, then choose someone else from the list.

**To remove an assignee:** Open the Assignee field and click the X next to the current assignee's name, or select "Unassigned."

You can also assign tasks directly from list view by clicking the empty avatar icon on the left side of any task row and selecting a person from the dropdown.

### How do I attach a file to a task?

`tasks-attach-file` — *All roles*

Open the task and look for the **Attachments** section (usually below the description, marked with a paperclip icon). Click "Add attachment" or drag and drop a file directly into the task panel.

You can attach:
- Files from your computer (uploaded directly)
- Links to Google Drive documents (if Drive integration is enabled)

**Size limit:** Individual file uploads are limited to the platform's configured size cap (check with your admin if large files are being rejected).

**Viewing attachments:** All attachments are listed in the Attachments section of the task. Click a file name to preview it or download it. Images are shown as thumbnail previews.

### How do I change a task's status?

`tasks-change-status` — *All roles*

There are two quick ways:

**From list/kanban view:** Click the colored status badge (e.g. "To Do", "In Progress") directly on the task card or row. A status dropdown will appear — click the new status you want.

**From inside the task:** Open the task by clicking its name. At the top of the task panel, click the status badge. Select the new status from the dropdown.

**Available statuses** typically include: To Do, In Progress, Review, Completed, and Cancelled, plus any department-specific statuses your dept lead has set up. Completed and Cancelled are final statuses — completed tasks stop appearing in active views.

If you don't see a status you expect, check with your department lead — they control which custom statuses are available in your space.

### How do I comment on a task?

`tasks-comment` — *All roles*

Open the task by clicking its name. Scroll to the **Comments** section at the bottom of the task panel. Click in the comment input box and type your message. Press the send button (or Ctrl+Enter on Windows, Cmd+Enter on Mac) to post.

**@mentioning someone:** Type @ followed by their name in your comment. This does more than notify them — it actually assigns them to the task (added to the task's assignee list), and separately sends them a notification with the comment context, unless they've muted mention notifications or you mentioned yourself. The mention appears as a highlighted name in the comment. You need assign-permission on the task for this to work (creator, Super Admin/Regional Secretary, or that department's Dept Lead).

**Rich text:** You can bold text (**bold**), use bullet points, and paste links into comments. The comment box supports basic markdown-style formatting.

**Editing and deleting:** You can edit or delete your own comments by hovering over the comment and clicking the three-dot (⋯) menu. Other people's comments can only be edited or deleted by that person or by a super admin.

### How do I create a new task?

`tasks-create` — *All roles*

You have two main ways to create a task:

**Option 1 — Quick Create button (fastest):** Click the blue ✚ button in the top navigation bar. A task creation modal will open. Fill in the task name (required), then optionally set the list it belongs to, the assignee, due date, priority, and starting status before clicking Save.

**Option 2 — From inside a List:** Go to the space and list where the task should live, scroll to the bottom of the task list, and click "Add task" (or press N on your keyboard while the list is in focus). The task will be created inline so you can type its name right away.

**Tips:**
- You can fill in the assignee, due date, and priority right in the creation modal — you don't have to open the task again afterward.
- If you're not sure which list to put the task in, create it anywhere and move it later using the List field inside the task.
- If you leave the Assignee field blank, the task is unassigned until someone picks it up.

### Why can't I see tasks from another department?

`tasks-department-visibility` — *All roles*

Nexus scopes task visibility to your own department by default — this is by design to keep each team's workspace clean and private.

If you need to see a task from another department:
1. The other department must explicitly share it with you. Once shared, it will appear in your task views with a small "shared" indicator.
2. If you think you should have access to something and don't, contact your department lead first — they can request a cross-department share.

**Super admins and Regional Secretaries** can see all tasks across all departments without needing a share.

This restriction only applies to tasks — the Ministry Calendar, Org Chart, and People directory are visible org-wide.

### How do task dependencies work?

`tasks-dependencies` — *All roles*

A dependency links two tasks so that one must be completed before the other can start. Open a task and look for the **Dependencies** section. Click "Add dependency," then search for the task that must be done first. Once linked, the dependent task will show a warning indicator if its predecessor is still open.

**Types of links:**
- **Blocks:** The current task is blocking another task (the other task can't start until this one is done)
- **Blocked by:** The current task is blocked by another task that must finish first

Dependencies are visual reminders, not hard locks — Nexus won't prevent you from working on a blocked task, but it will flag it so you're aware.

If you're trying to link tasks across different lists or spaces, both tasks must be in spaces you have access to.

### How do I set or change a task's due date?

`tasks-due-date` — *All roles*

Open the task by clicking its name. In the task panel, find the **Due Date** field (look for the calendar icon). Click it to open a date picker. Select the date you want and it will be saved automatically.

**To clear a due date:** Click the due date shown, then click the X or "Clear" button that appears.

**From list view:** You can also click the due date column on any task row to set or change it directly without opening the task.

Tasks that are past their due date will appear highlighted in red in list view. If a task is due today it will be highlighted in amber.

### How do I filter tasks to show only what I need?

`tasks-filter` — *All roles*

From any task list or view, click the **Filter** button in the toolbar (funnel icon). A filter panel opens where you can add one or more filters:

- **Assignee:** Show only tasks assigned to a specific person (or to you)
- **Status:** Show only tasks in certain statuses (e.g., only "In Progress" tasks)
- **Priority:** Show only urgent, high, medium, or low priority tasks
- **Due date:** Show tasks due within a date range (e.g., "due this week")
- **Tags or labels:** If your department uses tags, filter by them

Multiple filters combine with AND logic — a task must match all active filters to appear.

**To remove a filter:** Click the X on each filter chip, or click "Clear all" to reset.

**My Tasks view** has pre-built quick views (Today, Tomorrow) that apply common filters automatically — those are often faster than building custom filters manually.

### How do I follow a task to get notified about it?

`tasks-followers` — *All roles*

Open the task and click the **Followers** section (usually shown as a bell icon or "Follow" button near the top of the task panel). Click "Follow" to subscribe yourself to the task's activity.

Once you follow a task, you'll receive a notification whenever someone:
- Comments on the task
- Changes its status
- Changes the due date
- Adds or removes an assignee
- Completes it or moves it to a different list

**To stop following:** Open the task and click "Following" (it toggles to unfollow). You can also manage all your followed tasks from My Tasks view.

**Auto-follow:** You are automatically added as a follower when you are assigned to a task or when you comment on one.

### How do I move a task to a different list?

`tasks-move` — *All roles*

Open the task and find the **List** field near the top of the task panel (it shows the current list name, e.g. "Q3 Projects"). Click on it to open a dropdown showing all lists you have access to in your department. Select the destination list and the task will be moved.

**Note:** Moving a task to a list in a different space means the task will now follow that space's permission rules. If you move a task out of a shared space into a private one, people who previously had access may lose visibility.

### How do I set a task's priority?

`tasks-priority` — *All roles*

Open the task and click the **Priority** field (usually shown as a flag icon). Choose from: Urgent, High, Medium, or Low. The priority can also be set during task creation in the New Task modal.

**From list view:** Click the priority flag icon on any task row to change it without opening the task.

Priority affects how tasks are sorted when you choose "Sort by Priority" in list or board view. Urgent tasks sort to the top. Tasks with no priority set sort to the bottom.

If you're unsure what priority to set, a general rule of thumb: **Urgent** = must be done today or something breaks; **High** = important this week; **Medium** = normal work; **Low** = nice to have when time allows.

### How do I add subtasks to a task?

`tasks-subtasks` — *All roles*

Open the parent task by clicking its name. Scroll down to the **Subtasks** section inside the task panel. Click "Add subtask" and type the subtask name. Press Enter to create it and immediately add another, or click Save.

Each subtask can have its own assignee, due date, and status — click on a subtask to expand its detail panel and fill those in.

**Completing subtasks:** Check off the checkbox next to each subtask's name. The parent task's progress indicator (a small progress ring) updates automatically to show what percentage of subtasks are done.

**Note:** Subtasks are part of the same department space as the parent task. They follow the same permission rules — you can only assign subtasks to people who have access to that space.

### How do I switch between kanban, list, table, and calendar views?

`tasks-views` — *All roles*

At the top of any List page, look for the **view switcher icons** in the toolbar — usually represented by small icons for Board (kanban), List, Table, and Calendar.

- **Board/Kanban view:** Tasks are shown as cards in columns by status. Drag cards between columns to change their status. Best for visualizing workflow.
- **List view:** Tasks appear as rows, one per line. Good for quick scanning and bulk editing.
- **Table view:** Shows tasks in a spreadsheet-like grid with all fields as columns. Best for comparing multiple fields side by side.
- **Calendar view:** Tasks with due dates appear on a calendar. Best for planning around dates.

Your selected view is saved per list — switching to Kanban in one list won't affect other lists.

---

## Meetings

### What happens if someone misses a meeting — is there an automated follow-up?

`meetings-absence-email` — *All roles*

Yes. For meetings where absence tracking is enabled, Nexus can automatically send a follow-up email to people who were marked absent. This is configured in the **Communications** section under Absence Emails.

The email reminds them of what was discussed and any action items they were assigned. Department leads and above can customize the email template and set the rules for when absence emails are sent.

If you receive an absence email and think you were marked absent by mistake, contact your department lead to have the attendance record corrected.

### How do I assign action items from a meeting?

`meetings-action-items` — *All roles*

During or after the meeting, open the **Action Items** section (usually at the bottom of the meeting detail or in its own tab). Click "Add action item," type the task description, then:

1. **Assign it** to a specific person using the Assignee field
2. **Set a due date** so it doesn't fall through the cracks
3. Optionally link it to an existing task or sprint

Once created, action items are tracked separately from meeting notes — the assignee will see them in their task views and Nova can surface them in the "What do I need to follow up on today?" briefing.

**Important:** Write action items as concrete, doable steps ("Update the slides by Thursday") not vague summaries ("Slides"). Clear action items actually get done.

### How do I add an agenda to a meeting?

`meetings-agenda` — *All roles*

Open the meeting by clicking on it in the Meetings list. Inside the meeting detail, find the **Agenda** section. Click "Add agenda item" and type the topic. You can add multiple items, drag them to reorder, and assign a time estimate to each item.

For each agenda item you can also:
- Mark it as a discussion point, decision point, or information item
- Link it to a task so the conversation stays connected to the work
- Add prep notes or materials that attendees should review beforehand

Agenda items are visible to all attendees before the meeting, so everyone can prepare.

### How do I mark attendance at a meeting?

`meetings-attendance` — *All roles*

Open the meeting and go to the **Attendance** tab (or scroll to the Attendance section in the meeting detail). You'll see a list of expected attendees. Check the box next to each person who was present. People not on the expected list can be added as walk-ins by clicking "Add person."

**Who should mark attendance:** Whoever is running or organizing the meeting typically marks it, though any attendee can do so.

Attendance records feed into the Attendance Trends dashboard (visible to dept leads and above), which tracks participation patterns over time.

### How do I record minutes during a meeting?

`meetings-minutes` — *All roles*

Open the meeting and click the **Minutes** tab (or "Record Minutes" button if minutes haven't been started yet). You'll see a document editor alongside the agenda. For each agenda item, click into the notes area and type what was discussed.

**Tips for clean minutes:**
- Use bullet points for each point made
- Decisions made should be clearly marked (you can tag them as "Decision")
- Action items should be captured using the Action Items section (not just written in the notes) so they get tracked as assignable tasks

Minutes auto-save as you type. Once the meeting is done, you can mark it as "Minutes complete" which notifies attendees that they can review what was recorded.

### Where do I find past meetings and their minutes?

`meetings-past` — *All roles*

Go to **Meetings** in the sidebar. By default, you'll see upcoming and recent meetings. Look for a filter or tab to switch to "Past" meetings. You can search by meeting name, date range, or department.

Click on any past meeting to see its full record: the agenda, minutes, action items, attendance, and any transcription. Minutes are viewable by all attendees.

**Meeting reports:** For completed meetings, there's an option to generate a shareable PDF report (look for "Export" or "Share report" in the meeting actions menu). These can be shared with people who weren't attendees.

### How do I schedule a meeting?

`meetings-schedule` — *All roles*

Go to the **Meetings** section in the sidebar. Click the "New Meeting" or "+" button. Fill in the meeting details:

1. **Title** — give it a clear name
2. **Date and time** — set when it will happen
3. **Location or link** — add a room or video call URL
4. **Department/Space** — choose which team this meeting belongs to
5. **Expected attendees** — add the people who should attend

Click Save to create the meeting. The attendees you listed will be able to see the meeting and its agenda in the Meetings section.

If your meeting has a recurring agenda (e.g., a weekly team check-in), you can create it once and reuse the template for future occurrences.

### How does meeting transcription work?

`meetings-transcription` — *All roles*

Nexus includes an audio transcription feature powered by AI. To use it:

1. Open the meeting while it's in progress (or when you're ready to transcribe recorded audio)
2. Look for the **Transcription** panel or tab
3. Click "Start transcription" — your browser will ask permission to use your microphone
4. Speak normally; the transcription appears in real time
5. When done, click "Stop" — the transcript is saved to the meeting record automatically

**What the transcription is good for:** Capturing the gist of discussions quickly, especially when you can't type fast enough. The transcript isn't perfect — it's a starting point you should review and clean up before sharing.

**Privacy note:** Transcription only runs when you actively start it — it doesn't record automatically. The audio is uploaded to Nexus storage and sent to Deepgram, an external speech-to-text service, to generate the transcript — it is not processed locally in your browser. If you have sensitive material you don't want leaving Nexus in any form, use the "Paste transcript" option instead and type or paste your own notes.

---

## Sprints

### How do I add tasks to a sprint?

`sprints-add-tasks` — *All roles*

There are two ways:

**From inside the sprint:** Open the sprint, click "Add task," and either create a new task or search for an existing one to pull into the sprint.

**From a task:** Open any task, find the **Sprint** field, and select the sprint you want to assign it to.

**Note:** Only sprint members and dept leads can add tasks to a sprint. If you're not a member yet, join the sprint first (or ask the organizer to add you).

### How do I create a sprint?

`sprints-create` — *All roles*

Go to **Sprints** in the sidebar and click the **New Sprint** button. A creation form opens.

**Step 1 — Sprint Scope.** Choose the type of sprint:

- **Single Department** — for one of our existing departments. Select which department and Nexus automatically creates a team for it, adding all active members from that department. Their tasks will appear within the sprint and also surface in that department's space views.

- **Multi-Dept Collaboration** — for a sprint that brings together two or more of our existing departments. Select the departments to include and Nexus creates one team per department, auto-adding each department's members. Tasks in a multi-dept sprint are visible across all the teams involved — the work "spills into" each participating department's space, so members see sprint tasks alongside their regular department tasks.

- **Custom (no auto-teams)** — for a one-off or cross-functional group that doesn't follow our standard department lines. No teams are auto-created and no members are auto-added; you build the team yourself after creation. Tasks in a Custom sprint are sprint-only — they don't appear in any department space, keeping the work completely separate from the regular dept views.

**Step 2 — Fill in the sprint details:** Give the sprint a name (required), a goal, a description, and start and end dates.

**Step 3 — Save.** The sprint is created in Planning status. Open it to add tasks and manage the team.

**Inviting members to your sprint:**
Open the sprint and go to the **Members** tab. Click "Invite member."
- **Existing Nexus users:** search by name and add them directly.
- **External members (not yet on Nexus):** enter their email address and name. They'll receive a temporary-access invitation by email. Their account is automatically deactivated when the sprint ends (or on the expiry date you set), so they don't need a permanent account.

**Who can create sprints:** Department leads and above. If you're a regular member and need a sprint created, ask your dept lead.

**Having an issue?** Submit a support ticket via **Help & Support** in the sidebar, or check the **FAQ** on the Help page for answers to common sprint setup questions.

### Should I create a custom sprint or a multi-department sprint?

`sprints-custom-vs-multi-dept` — *All roles*

Both types have no department owner (neither is tied to a single department space), but they are meant for different situations.

**Multi-Department sprint** — choose this when your project explicitly spans two or more of our existing BLW Canada departments and you want Nexus to handle the team structure automatically. When you create a multi-department sprint you select which departments are involved; Nexus creates one team per department and auto-adds every active member from each. Sprint tasks become visible in each participating department's space alongside that team's regular tasks, so members see them without navigating to the Sprints section.

**Custom sprint** — choose this when the working group does not map to existing departments, or when you want complete control over who is in the sprint. No teams are auto-created, no members are auto-added. You hand-pick every participant after creation. Tasks in a custom sprint are sprint-only — they do not surface in any department space, so the work stays contained inside the Sprints section unless a member navigates there directly.

**Decision guide:**
- Cross-dept initiative where you want all dept members automatically in? → Multi-Department.
- Ad-hoc project team, external collaborators, or a group that crosses departments in a non-standard way? → Custom.
- Unsure who should be in it yet? → Custom is safer; add members incrementally.

In both cases you can still invite additional people (including external/temporary members) after creation via the Members tab.

### What happens when a sprint ends?

`sprints-end` — *All roles*

When a sprint's end date passes, it moves to "Completed" status. Any tasks that weren't finished remain as normal tasks in their lists — they don't get deleted. The sprint organizer typically reviews incomplete tasks and either:

1. Carries them forward to the next sprint
2. Moves them back to the regular backlog
3. Closes them if they're no longer needed

You can still view completed sprints and all their tasks in the Sprints section. Completed sprint records are kept permanently for reference.

### How do sprint invites work?

`sprints-invites` — *All roles*

When a sprint organizer or dept lead adds you to a sprint, you receive a **Sprint Invite** notification in your Inbox (the envelope icon in the top nav). Open the notification and choose:

- **Accept** — you're added to the sprint immediately
- **Decline** — you won't be added; the organizer is notified

If you accept, the sprint tasks become visible to you and your My Tasks view updates to include them.

**Pending invites:** You can see all pending sprint invites by going to Sprints → "My Invites" tab.

### How do I join a sprint?

`sprints-join` — *All roles*

You can join a sprint in two ways:

**By invitation:** A sprint organizer or department lead sends you a sprint invite. You'll receive a notification in your Inbox. Open it and click "Accept" to join. Once accepted, the sprint appears in your Sprints list and tasks assigned to you in the sprint show up in your My Tasks view.

**By request:** Go to **Sprints** in the sidebar and browse active or upcoming sprints. If a sprint has open membership, you can click "Join" to request access. The sprint organizer will receive your request and can approve it.

Once you're a sprint member, you can see all tasks in the sprint (not just your own).

### Can I be in more than one sprint at the same time?

`sprints-multiple` — *All roles*

Yes, you can be a member of multiple active sprints simultaneously. This happens when you're contributing to multiple projects at once. All your sprint tasks from all active sprints will appear in your My Tasks view and in Nova's daily briefing.

However, if you find yourself spread across too many sprints, that's worth flagging with your dept lead — it usually means something needs to be prioritized or the workload needs redistributing.

### How do I see what's in my current sprint?

`sprints-view-mine` — *All roles*

Go to **Sprints** in the sidebar. Your active sprint(s) will be listed at the top. Click on a sprint to open the sprint detail view, which shows:

- All tasks in the sprint and their current status
- Your specific tasks highlighted or filterable
- Sprint progress (how many tasks are completed vs. total)
- Upcoming tasks by due date

You can also filter the sprint view to "My tasks only" to see just the items assigned to you.

**From My Tasks:** If you're in an active sprint, your sprint tasks also appear in the "My Tasks" section, clearly marked with the sprint name.

### What is a sprint in Nexus?

`sprints-what` — *All roles*

A sprint is a focused work period — typically one to four weeks — where a group of people commit to completing a defined set of tasks together. Sprints in Nexus help teams coordinate on high-priority projects, track progress day to day, and stay accountable to each other.

Each sprint has:
- A name and date range
- A sprint team (the people in it)
- A list of tasks assigned to the sprint
- A status: Upcoming, Active, or Completed

Sprints are used by teams running project-style work. Not every task needs to be in a sprint — they're best for coordinated efforts where a group is working toward a shared goal.

### What is a sprint?

`sprints-what-is` — *All roles*

A sprint is a fixed time-box (usually 1-4 weeks) where your team commits to completing a set of tasks. Sprints help organize work, track progress, and create clear boundaries for planning and delivery.

In Nexus, sprints:
- Group related tasks for your team
- Have start and end dates
- Track attendance and participation
- Can link to meetings where sprint planning or reviews happen
- Show real-time progress as tasks move through your status workflow
- Support external members who join temporarily for specific work

Each sprint belongs to a department/space and has its own settings, member roster, and task list.

---

## Ministry Calendar

### How do I add an event to the ministry calendar?

`calendar-add-event` — *All roles*

Go to **Calendar** in the sidebar. Click the "+" button or click directly on a date in the calendar grid. A new event form opens. Fill in:

1. **Event name** (required)
2. **Date and time** (required)
3. **End time or duration**
4. **Event type** — choose the category that best describes the event (e.g. Service, Meeting, Training)
5. **Department** — which team is hosting this event
6. **Description or notes** — optional but helpful for attendees

Click Save to publish the event. It will appear on the shared ministry calendar visible to all staff.

**Who can create events:** Any authenticated staff member can add events to the calendar. Dept leads can additionally manage event types and calendar settings.

### How do I view events for a specific department only?

`calendar-department-events` — *All roles*

On the **Ministry Calendar**, use the **Filters** or **Category** panel to filter by department or source. Select only the department whose events you want to see. The calendar will update immediately to show only those events.

Alternatively, if you navigate to a specific department's space in the sidebar, the calendar view there may show only that department's events by default.

### What are event types and what is the difference between them?

`calendar-event-types` — *All roles*

Event types are categories that help organize and filter calendar events. Each type has a color and name. Examples might include: Service, Meeting, Training, Outreach, Conference, Prayer.

The specific event types available depend on what your admin has configured. Event types serve two purposes:

1. **Visual filtering:** You can show/hide events by type on the calendar
2. **Department visibility:** Some event types may only be visible to specific departments (configured by admins)

When you create an event, pick the type that best describes it. If none of the available types fits well, contact a dept lead or super admin — they can add new event types.

### How do I sync my Google Calendar with Nexus?

`calendar-google-sync` — *All roles*

Go to **Settings** → **Integrations** (or **Personal Integrations**). Find the Google Calendar section and click "Connect." You'll be redirected to Google's sign-in flow. Log in with your Google account and grant Nexus permission to read your calendar.

Once connected, your Google Calendar events will appear alongside the ministry calendar so you can see everything in one view. The sync is read-only from Google by default — events you create in Nexus don't automatically create events in Google (unless push sync is enabled by an admin).

**If the connection breaks:** Go back to Settings → Integrations and click "Reconnect" next to Google Calendar.

### How do I RSVP to a calendar event?

`calendar-rsvp` — *All roles*

Find the event on the **Ministry Calendar** and click on it to open the event detail. Look for the RSVP section — it will show "Going / Maybe / Not Going" buttons. Click your response.

Your RSVP is saved automatically and the event organizer can see a list of who has responded.

**If you received an RSVP email invitation:** Click the link in the email. It will take you to a public RSVP page where you can confirm your attendance without needing to log in to Nexus.

**Changing your RSVP:** Click the event again and select a different response — you can update your RSVP anytime before the event.

### How do I create a public RSVP invitation for an event?

`calendar-rsvp-invitation` — *All roles*

Go to **Communications** → **Invitations**. Click "New Invitation." You'll be guided through a wizard:

1. Choose the event you're creating the invitation for (or fill in the event details manually)
2. Customize the invitation message and design
3. Add the recipients who should receive the invite
4. Preview the invitation email
5. Send it

Recipients get an email with a unique link to a public RSVP page where they can confirm attendance without logging in. You can track RSVPs in real time from the Invitations dashboard.

### How do I subscribe to a calendar category to see those events?

`calendar-subscribe` — *All roles*

Go to **Calendar** and look for the **Categories** panel on the left side (or the settings/filter button if using the compact view). Each event type or calendar source is listed with a toggle or checkbox. Check the categories you want to see and uncheck the ones you want to hide.

Your subscription preferences are saved — next time you open the calendar, it will show the same categories. This lets you, for example, hide categories that aren't relevant to your role while keeping the ones you care about visible.

---

## Communications Hub

### How do absence follow-up emails work?

`comms-absence-emails` — *All roles*

Absence emails are automated messages sent to people who were marked absent at a meeting. The workflow:

1. A meeting organizer marks attendance (present/absent) in the Meetings section
2. Nexus identifies who was absent
3. An absence follow-up email is automatically sent (on the configured schedule — usually same day or next morning)
4. The email lets the absent person know they were missed and may include meeting notes or next steps

**Who controls this:** Dept leads and above can configure the absence email rules, customize the email template, and review the send log.

**If you received an absence email by mistake:** Let your dept lead know so they can correct the attendance record.

### How do I approve or deny an absence notification before it goes out?

`comms-approve-absence` — *Super Admin, Regional Secretary, Dept Lead only*

Some absence email setups require a dept lead or manager to approve the list of absent people before the emails are sent. If you're an approver:

1. You'll receive a notification when a batch of absence emails is ready for your approval
2. Go to **Communications** → **Absence Emails** → **Pending Approval**
3. Review the list of absent people and the draft email
4. Click "Approve" to send, or "Edit" to make changes first, or "Reject" to cancel the batch

If you approve, the emails go out immediately. If you reject, no emails are sent for that batch.

### Should I send this as a campaign or as an RSVP invitation?

`comms-campaign-vs-invitation` — *All roles*

Both live in the Communications Hub, but they serve different purposes.

**Email Campaign** — use this when you are broadcasting news, updates, or announcements and do not need recipients to respond or RSVP. Campaigns support rich email templates, recipient segment targeting, and analytics (opens, clicks, delivery rates). There is no RSVP link or response-tracking built in — it is a one-way send.

**RSVP Invitation** — use this when you need to know who is coming. An invitation sends each recipient a personalised link to a branded RSVP page (no login required). When they click it they confirm attendance, and you see real-time response counts in the Invitations dashboard. Invitations are tied to a specific calendar event.

**Decision guide:**
- Announcing a policy change, sharing meeting notes, or sending a general newsletter? → Campaign.
- Inviting people to an event and need a headcount? → Invitation.
- Need both (announce AND collect RSVPs)? → Create the calendar event first, then use Invitations for the invite itself and a separate Campaign for any follow-up broadcasts to the same group.

One practical tip: if you already sent an invitation but want to follow up with non-responders, use a Campaign targeted to the segment of people who have not yet replied — the Communications Hub lets you filter recipients by RSVP status.

### How do I check if my email campaign was delivered and opened?

`comms-delivery-stats` — *All roles*

Go to **Communications** → **Campaigns** and click on the campaign you sent. The **Analytics** tab shows:

- **Sent:** Total number of emails sent
- **Delivered:** How many reached the inbox (vs. bounced)
- **Opened:** How many recipients opened the email (tracked via pixel)
- **Clicked:** If you included links, how many times they were clicked
- **Bounces:** Email addresses that failed to deliver (these are flagged for review)

If you see a high bounce rate, go to **Recipients** and look for flagged addresses that need to be cleaned up.

### What is the Communications Hub and what can I do there?

`comms-hub` — *All roles*

The Communications Hub is the central place for all outbound messaging in Nexus. From here you can:

- **Campaigns** — create and send email broadcasts to recipient lists
- **Invitations** — send RSVP invitations for events
- **Absence Emails** — manage automated absence follow-ups
- **Recipients** — manage your contact database
- **Templates** — create reusable email templates
- **Analytics** — see delivery and engagement stats across all campaigns

Think of it as your email marketing and communications center, built directly into Nexus so everything stays connected to your events and meetings.

### How do I create an RSVP invitation for a specific event?

`comms-invitation-wizard` — *All roles*

Go to **Communications** → **Invitations** → "New Invitation." The invitation wizard walks you through:

1. **Event details** — select an existing calendar event or enter the details manually
2. **Invitation design** — customize the subject line, message, and appearance
3. **Recipients** — add who should receive the invitation
4. **Send settings** — send now or schedule it

Once sent, each recipient gets a personalized email with a unique link. When they click the link, they land on a branded RSVP page where they can confirm attendance — no login required. You track responses from the Invitations dashboard in real time.

### How do I manage my email recipient list?

`comms-recipients` — *All roles*

Go to **Communications** → **Recipients**. You'll see a list of all people in your recipient database. From here you can:

- **Search** for a specific person by name or email
- **Add recipients** manually (one by one or via import)
- **Organize into segments** — group recipients by criteria like department, event attendance, or custom tags
- **View delivery history** for each person

Segments let you target specific groups when sending campaigns. For example, you might create a "Summer Event Registrants" segment and send only to that group.

### How do I send an email campaign?

`comms-send-campaign` — *All roles*

Go to **Communications** in the sidebar and click **Campaigns**. Click "New Campaign." Fill in:

1. **Campaign name** — for your reference
2. **Subject line** — what recipients will see in their inbox
3. **Recipients** — choose a segment or list of people to send to
4. **Email content** — use the email editor to write your message; you can use a template as a starting point
5. **Schedule** — send immediately or schedule for a future date/time

Click "Preview" to see how the email will look before sending. When you're ready, click "Send" (or "Schedule").

**After sending:** You can track opens and delivery in the Campaign Analytics view.

---

## Personal Planning

### How do I see all tasks assigned to me across all departments in one view?

`personal-cross-space` — *All roles*

Use the **My Tasks** section in the sidebar. It shows every task assigned to you across all spaces you have access to, regardless of which department they belong to. Use the **Today** and **Tomorrow** quick filters to narrow to what's most urgent.

You can also filter My Tasks by space, priority, or due date to zero in on a specific project.

If you also want to see tasks shared with you from other departments, they appear in My Tasks with a small icon indicating they're from a shared space.

### What is My Personal List and how is it different from department tasks?

`personal-list` — *All roles*

My Personal List is a private space just for you — tasks you add there are not visible to your department or anyone else. It's for things like personal reminders, private to-dos, or work you're doing that doesn't belong in a shared department space.

Access it from the sidebar under "Personal List." You can create tasks, set due dates, and organize them into sublists (like "This Week" or "Someday").

**Key difference from department tasks:** Department tasks live in shared spaces and are visible to your team. Personal List tasks are yours alone — no one else sees them, and they don't appear in department boards or reports.

### How does the Time-Blocking Planner work?

`personal-planner` — *All roles*

The **Planner** (accessible from the sidebar) is a weekly calendar where you can block time for specific tasks. To use it:

1. Open the Planner — you'll see a 7-day grid with hourly slots
2. Your tasks with due dates appear in the right-hand panel
3. Drag a task from the panel onto a time slot to block time for it
4. You can resize time blocks by dragging the bottom edge

This helps you be intentional about when you'll work on each task, rather than having a flat to-do list with no sense of when things will actually happen.

**Wins:** The planner also connects to the Wins feature — you can log what you accomplished at the end of each day directly from the planner view.

### How do I create a sublist in My Personal List?

`personal-sublists` — *All roles*

Open **Personal List** from the sidebar. Look for the "New sublist" or "+" option near the list header. Type a name for your sublist (e.g. "This Week," "Someday," "Admin Tasks") and press Enter.

Sublists appear as nested sections inside your Personal List. You can:
- Drag tasks between sublists
- Collapse sublists you don't need to see right now
- Delete a sublist (tasks inside it are moved back to the main list, not deleted)

Note: Sublists are only one level deep — you can't nest sublists inside sublists.

### How do I use the Today and Tomorrow views in My Tasks?

`personal-today-tomorrow` — *All roles*

Go to **My Tasks** in the sidebar. At the top, you'll see quick view tabs including **Today** and **Tomorrow**.

- **Today** shows all tasks assigned to you with a due date of today, regardless of which space they're in
- **Tomorrow** shows tasks due tomorrow so you can prepare ahead

These views pull tasks from every space you have access to and merge them into a single prioritized list. Use them as your daily starting point instead of clicking through each space separately.

**To mark a task done from here:** Click the checkmark/status button on any task and update its status to Completed. The task will disappear from the Today view once it's closed.

### How do I log a win?

`personal-wins` — *All roles*

Go to **Wins** in the sidebar (or access it from the Planner's end-of-day prompt). Click "Add Win" and briefly describe what you accomplished. You can add:

- The win title
- The date it happened
- Which space/project it relates to (optional)
- Any notes

Wins are private to you by default — they're your personal record of progress and accomplishments. Over time, the Wins page gives you a running log of what you've achieved, which is useful for performance reviews or just staying motivated.

---

## People & Contacts (Flock CRM)

### How do I track which congregation members need follow-up?

`flock-followups` — *Super Admin, Regional Secretary, Pastor only*

In Flock CRM, open the **Follow-ups** view (a tab or filter in the main Flock list). This shows everyone for whom you've set a follow-up reminder, sorted by when the follow-up is due.

You can also see members who haven't been contacted recently by filtering by "Last contact date" — this helps you proactively reach out to people who might be slipping through the cracks.

When you complete a follow-up, log the visit and mark the follow-up as done. It will move out of the pending list.

### How do I log a pastoral visit or follow-up in Flock CRM?

`flock-log-visit` — *Super Admin, Regional Secretary, Pastor only*

Open the congregation member's profile in Flock CRM. Click "Log Visit" or "Add Follow-up." Fill in:

1. **Date** — when the visit or contact happened
2. **Type** — in-person visit, phone call, text, email, etc.
3. **Notes** — what was discussed or any pastoral observations (these are private to you)
4. **Follow-up needed?** — set a reminder if you need to check in again

Click Save. The visit is added to that person's contact history. You'll be able to see a full timeline of all interactions when you open their profile later.

### How do I view and search my congregation members in Flock CRM?

`flock-view-members` — *Super Admin, Regional Secretary, Pastor only*

Go to **Flock CRM** (or "My Flock") in the sidebar. You'll see a list of the congregation members in your flock. Use the search bar at the top to find a specific person by name, phone number, or email.

You can filter the list by:
- Last contact date (e.g. "Not contacted in 30+ days")
- Follow-up status (pending, done)
- Custom tags or groups

Click on any person's name to open their full profile — you'll see their contact details, visit history, and any notes from previous conversations.

### Who can see my Flock CRM data?

`flock-visibility` — *Super Admin, Regional Secretary, Pastor only*

Your Flock CRM records are private to you by default. Only you can see your visit notes, follow-up details, and congregation member profiles in your flock.

Super Admins and Regional Secretaries can access Flock CRM data across all pastors for administrative and support purposes — but regular members, dept leads from other departments, and other pastors cannot see each other's flock data.

ORS and Admin departments have restricted visibility into Flock CRM — they can see aggregate workload information but not individual pastoral notes or member details.

### What is Flock CRM?

`flock-what` — *Super Admin, Regional Secretary, Pastor only*

Flock CRM is a pastoral relationship management tool built into Nexus for the Pastors department. It helps pastors track their congregation members, log pastoral visits, and manage follow-ups — all in one place connected to the rest of Nexus.

Each pastor has their own Flock — the group of people they're responsible for. Flock CRM keeps a record of:
- Contact information for each member
- Visit history and notes
- Follow-up reminders
- Any specific needs or circumstances noted during pastoral care

Access it from the sidebar under "Flock" or "My Flock."

---

## Registration System

### What is the Registration page and who can access it?

`registration-access` — *All roles*

The **Registration** page manages event registrations — it's where you can see who has signed up for events, manage room assignments, check dietary restrictions, and handle logistics.

**Who can access it:** Pastors and active sprint/team members for the event, plus super admins and regional secretaries. Regular members who aren't part of the event team don't have access by default.

Access it from the sidebar or from **Apps → Registration**.

### How is registration data kept up to date?

`registration-data-sync` — *All roles*

Registration data syncs automatically from the Google Apps Script that manages the registration form. When someone submits the registration form, their record appears in Nexus within a few minutes via the sync pipeline.

Changes made directly in the Nexus Registration page (like room assignments) are stored in Nexus's database and do not automatically push back to Google Sheets — these are Nexus-only data points.

If you notice a registrant's information is wrong or outdated, you can edit it directly in their registration profile in Nexus.

### How do I check dietary restrictions or allergies for registrants?

`registration-dietary` — *All roles*

Go to **Registration** → **Delegate Compliance** tab (or the Registrations tab and look for the allergy/dietary column). You can see each registrant's declared dietary restrictions and allergies.

Use the filter to show only registrants with specific restrictions (e.g. "Gluten free," "Nut allergy") so you can plan catering appropriately.

If a registrant's allergy information is missing, the Delegate Compliance view flags them in red. You may need to contact them directly to collect this information before the event.

### How do I manage room assignments for registrants?

`registration-rooms` — *All roles*

In the **Registration** page, click the **Room Assignment** tab. You'll see a list of unassigned registrants (sorted by gender) on one side, and available room cards on the other.

Drag participants from the unassigned list onto a room card to assign them. The room card updates in real time to show capacity.

**Reassigning:** Drag a person from one room to another. You can also click on a person to see their profile and manually edit their room assignment.

**Filters:** Use the gender filter to manage male and female rooms separately.

### How do I view the registrant list for an event?

`registration-view-registrants` — *All roles*

Go to **Registration** in the sidebar or App menu. Select the event you're managing from the event selector at the top. The **Registrations** tab shows all registered participants with their:

- Name and contact information
- Registration date
- Payment/confirmation status
- Flight details (if applicable)

You can search, sort, and filter the list. There's also a **Delegate Compliance** tab that flags any participants with outstanding requirements (like missing allergy information).

---

## Automations & API

### What actions can an automation perform?

`automations-actions` — *Super Admin, Regional Secretary, Dept Lead only*

Actions that can be automatically triggered include:

- **Send a notification** — notify a specific person or group
- **Send an email** — send a predefined email template to a recipient
- **Change task status** — update the task to a new status
- **Reassign a task** — change the assignee
- **Set a due date** — automatically apply a due date relative to the trigger
- **Create a sub-task** — generate a new sub-task under the triggered task
- **Add a comment** — automatically post a comment (useful for reminders or instructions)
- **Send a Slack message** — if Slack is connected, post to a channel

Combine a trigger with an action to build the automation you need.

### How do I create a new automation?

`automations-create` — *Super Admin, Regional Secretary, Dept Lead only*

Go to **Automations** in the sidebar (under the admin tools section — it's a top-level link, not inside Settings). Click "New Automation."

The automation builder walks you through:
1. **Choose a trigger** — select what event should start the automation
2. **Add conditions** (optional) — narrow down when the trigger fires (e.g. only when priority is "Urgent")
3. **Choose an action** — what should happen when the trigger fires
4. **Name and enable** your automation

Test your automation by triggering the event manually and checking the Automation Run Log to confirm it fired.

Keep automations focused — one trigger, one action. Complex multi-step workflows can be chained as separate automations.

### How do I see the history of when an automation ran?

`automations-history` — *Super Admin, Regional Secretary, Dept Lead only*

Go to **Automations** in the sidebar and click on any automation's name (or look for a "View History" or "Run Log" button). This opens the **Automation Run Log**, which shows:

- The date and time it fired
- What triggered it (which task, meeting, etc.)
- What action was taken
- Whether the action succeeded or failed (and why, if failed)

If an automation isn't working as expected, this is the first place to check — the run log will show you exactly what happened and when.

### When should I use a due-date trigger versus an event trigger for an automation?

`automations-scheduled-vs-event` — *Super Admin, Regional Secretary, Dept Lead only*

The choice comes down to whether you want the automation to react to something happening, or to react to when something is due.

**Event triggers** (task status changed, task created, task assigned, comment added, meeting created, sprint started/ended) fire the moment that action occurs in Nexus. Use these when you want an immediate response to a change — for example, "when a task moves to Review status, notify the reviewer" or "when a new meeting is created, post to our Slack channel." The automation is reactive.

**Due-date triggers** (due date approaching, due date passed) fire based on a task's due date relative to today's date. Use these for time-based nudges — for example, "2 days before a task is due, send a reminder to the assignee" or "when a task is overdue, notify the department lead." The automation is time-driven.

**Decision guide:**
- React to a person doing something (status change, assignment, comment)? → Event trigger.
- React to time passing (overdue, approaching deadline)? → Due-date trigger.
- Want to do both? Create two separate automations — one event-based, one time-based — and chain them.

One nuance: due-date triggers only fire for tasks that have a due date set. If many of your tasks are created without due dates, a due-date trigger will silently skip those tasks. Consider pairing it with a "task created without a due date" alert if that is a real risk in your workflow.

### How do I enable or disable an automation?

`automations-toggle` — *Super Admin, Regional Secretary, Dept Lead only*

Go to **Automations** in the sidebar. You'll see a list of all automations in your department. Each has a toggle switch on the right side.

- **Toggle on (green):** The automation is active and will fire when triggered
- **Toggle off (grey):** The automation is paused — it won't fire even if the trigger condition is met

Disabling an automation is useful when you need to temporarily stop it without deleting it (e.g. during a special project period when the rules change).

### What triggers are available for automations?

`automations-triggers` — *Super Admin, Regional Secretary, Dept Lead only*

Available triggers include:

- **Task status changes** — fires when a task moves to a specific status
- **Task created** — fires when any new task is added to a list
- **Task assigned** — fires when a task's assignee changes
- **Due date approaching** — fires a set number of days before a task's due date
- **Due date passed** — fires when a task is overdue
- **Comment added** — fires when someone comments on a task
- **Meeting created** — fires when a new meeting is scheduled
- **Sprint started / ended** — fires at the beginning or end of a sprint

The available triggers may vary depending on your department configuration. If you need a trigger that isn't listed, contact your super admin.

### What is an automation in Nexus?

`automations-what` — *Super Admin, Regional Secretary, Dept Lead only*

An automation is a rule you set up that tells Nexus to do something automatically when a specific condition is met — without you having to do it manually every time.

Example: "When a task is moved to Completed status, automatically notify the person who created it."

Automations are made of two parts:
- **Trigger** — the event that starts the automation (e.g. task status changes, a due date is passed, a new task is created)
- **Action** — what happens automatically (e.g. send a notification, change an assignee, update a field, create a sub-task)

Automations are managed per department and require dept lead access or above to create and edit.

---

## Dashboard

### Can I customize my dashboard?

`dashboard-customize` — *All roles*

Basic dashboard customization (like reordering or hiding widgets) depends on what your admin has enabled. If you see a "Customize" or "Edit Dashboard" button in the top-right of the dashboard, you can drag widgets to rearrange them or hide ones you don't use.

If you don't see a customize option, the dashboard layout is fixed for your role. You can still use the sidebar filters and views within each widget to see different data.

### How does the Department Utilization widget work?

`dashboard-dept-utilization` — *All roles*

The **Department Utilization** widget shows how your department's tasks are distributed across the five canonical statuses: To Do, In Progress, Review, Completed, and Cancelled. It gives you a visual breakdown (usually a bar or donut chart) so you can quickly see if too many tasks are stuck in one status.

For example, if 80% of tasks are "In Progress" with almost nothing in "Completed," that signals a bottleneck — tasks are starting but not finishing.

This widget is most useful for dept leads and above, who need to see the whole team's workload at a glance rather than just their own tasks.

### How do I navigate from the Dashboard to a specific space or section?

`dashboard-navigate` — *All roles*

From the Dashboard, you can:

- Click any task in the "My Tasks Summary" widget to open that task directly
- Click a sprint in "Sprint Progress" to open the full sprint view
- Click an event in "Upcoming Events" to open the calendar event detail
- Use the **sidebar** on the left to navigate to any section: Spaces, Meetings, Calendar, etc.

The Dashboard itself doesn't have deep navigation built in — it's a summary view. Use the sidebar for full navigation.

### What is the Dashboard?

`dashboard-what` — *All roles*

The **Dashboard** is your landing page after logging in to Nexus. It gives you a quick summary of what's happening across your department: tasks in progress, upcoming events, sprint status, recent activity, and more.

Think of it as your daily briefing — you can see at a glance what needs attention without clicking through every section.

### What widgets are available on the Dashboard?

`dashboard-widgets` — *All roles*

The Dashboard includes widgets such as:

- **My Tasks Summary** — a count of your tasks by status (To Do, In Progress, Due Today, Overdue)
- **Department Utilization** — how tasks are distributed across statuses for your whole department
- **Sprint Progress** — current sprint(s) completion rate
- **Upcoming Events** — the next few calendar events for your department
- **Recent Activity** — a feed of recent changes across your spaces
- **People Online** — who from your department has been active recently

The specific widgets visible to you depend on your role and what your admin has configured for your department.

---

## Files & Search

### How do I attach a file to a task or meeting?

`files-attach` — *All roles*

Open the task or meeting and find the **Attachments** section (paperclip icon). Click "Add attachment" or drag a file directly into the section.

For tasks: scroll down past the description to find Attachments.
For meetings: it's typically in the meeting detail panel alongside minutes and agenda.

You can attach files from your computer or paste a link to a Google Drive document (if Drive is connected). Images will show as previews; other file types appear as download links.

### Where can I find files that have been shared in Nexus?

`files-find` — *All roles*

Go to **Files** in the sidebar. This shows a consolidated view of all files attached to tasks and meetings in your department spaces. You can:

- Search by file name
- Filter by date uploaded
- Filter by which task or meeting the file belongs to

If you're looking for a specific file, it's often faster to go directly to the task or meeting it was attached to rather than browsing the Files page.

### Does Nexus connect to Google Drive?

`files-google-drive` — *All roles*

Yes. If your admin has set up the Google Drive integration, you can link Google Drive documents to tasks and meetings rather than uploading files directly. The linked file stays in Drive — Nexus stores a reference to it and displays a thumbnail or link in the task.

**To link a Drive file:** In the Attachments section of a task or meeting, choose "Link from Google Drive" and search for or paste the document's URL.

**To set up Drive integration:** Go to Settings → Integrations and connect your Google account.

---

## BLW CAN Map

### How do I add or edit a campus on the CAN Map?

`can-map-edit` — *Super Admin, Regional Secretary only*

Campus data is managed from the admin edits page, not from the map itself — go to **Settings → Admin → Campus Edits** (or `/admin/campus-edits`). From there you can add a new campus, edit an existing one's details, or delete one.

This page is restricted to Super Admins, Regional Secretaries, and the ORS (Data Management) role. If you need a campus added or corrected and don't have access, reach out to one of those.

Campus photo management is a separate, narrower page (**Settings → Campus Photos**) restricted to Super Admins and ORS only — Regional Secretaries can edit campus details but not manage campus photos.

### What is the CAN Map?

`can-map-what` — *All roles*

The CAN Map (BLW Canada Map) is an interactive map of Canadian post-secondary institutions showing where BLW Canada has (or is pursuing) campus ministry presence. Nearby campuses cluster together as you zoom out; click a marker to see details for that campus — name, region, ministry presence status, contact person, and photos.

You can find it at **Map** in the sidebar, or go directly to `/map`. Anyone signed in can view it, regardless of role.

---

## Roles & Permissions

### Can my permissions be changed?

`roles-change-permissions` — *All roles*

Yes. Role changes and permission grants are made by super admins. Common scenarios:

- **Role upgrade** (e.g. member → dept_lead): Requires a super admin to update your profile
- **Access grant** (e.g. regional secretary access): Super admins can grant specific access grants on top of your base role
- **Temporary access**: Super admins can add you as a sprint member or share a space with you for cross-department work

To request a permissions change, talk to your dept lead who can make the request to a super admin on your behalf.

### What does "access restricted to your department" mean?

`roles-department-scope` — *All roles*

Most data in Nexus is scoped to your department. This means:

- You can only see tasks in spaces that belong to your department (unless someone shares a specific task or space with you)
- Meetings you're not invited to won't appear in your meeting list
- Calendar events for other departments are visible on the shared ministry calendar, but their details may be limited
- Your sprint and personal list data is private to you

This scoping is enforced at the database level for security — it's not just a UI filter. Even if you know a task exists in another department, you can't access it unless it's been shared with you.

The exception is super admins and regional secretaries, who have cross-department visibility by design.

### What is the difference between a Member and a Dept Lead in Nexus?

`roles-member-vs-lead` — *All roles*

Both roles have access to their department's tasks, meetings, calendar, and communications. The key differences:

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

In short: members do the work; dept leads manage how the work is organized and ensure the team runs smoothly.

### Why can't I see certain menu items or pages?

`roles-missing-menu` — *All roles*

Menu items and pages in Nexus are shown based on your role. If you can't see something, it's likely because:

1. **Your role doesn't include that feature** — e.g. Automations is only visible to dept_lead and above; Flock CRM is only visible to pastors and admins
2. **You're not in the right department** — some spaces only appear in the sidebar if you're a member of that department
3. **A feature is disabled for your org** — some features can be turned off at the platform level

If you believe you should have access to something and don't, check with your department lead first. They can verify your role or escalate to a super admin if something needs to be changed.

### What is the Pastor role in Nexus?

`roles-pastor` — *All roles*

The Pastor role has access to the standard Nexus workspace (tasks, meetings, calendar, sprints) plus access to **Flock CRM** — the pastoral relationship management tool. Pastors can:

- Use Flock CRM to manage their congregation members and log visits
- Access the Registration page for events where they're part of the team
- Participate in sprints and meetings like any other staff member

The Pastor role does not grant department admin or automation management rights — those require dept_lead or above.

### What is a Regional Secretary and what access do they have?

`roles-regional-secretary` — *All roles*

Regional Secretary has near-super-admin access — they can see and act across all departments with a few exceptions (they can't access campus photos settings, certain permission/integration management tools, or Immerse/Books, which is Super Admin only).

Regional Secretaries typically support the whole organization and need visibility across departments to do their job. If you have a request that requires someone to look across multiple departments, a Regional Secretary can often help.

### How do I report a permissions problem?

`roles-report-permission-issue` — *All roles*

If you're unexpectedly blocked from something you think you should have access to:

1. **Check with your dept lead first** — they can confirm whether your access is correct for your role
2. **If your dept lead agrees you should have access:** Ask them to submit a request to the platform admin (IK Nwokem) or a super admin
3. **If it seems like a bug** (you had access before and it suddenly stopped working): Report it via the **Support** page in Nexus (sidebar → Support or Help) so it can be investigated

For urgent access issues that are blocking your work, contact IK Nwokem directly.

### What is a Super Admin and what can they do?

`roles-super-admin` — *All roles*

Super Admin is the highest access level in Nexus. Super admins can see and do everything across all departments:

- View all tasks, meetings, and spaces in every department
- Manage users: invite, deactivate, change roles
- Access admin tools: campus edits, email admin, permissions management
- Run all automations and manage platform-wide settings
- View all Nova query logs and manage the knowledge base
- Access all integrations and API settings

Super admins are typically IT or platform administrators, not regular staff. If you need something done that requires super admin access, contact IK Nwokem or your designated platform admin.

---

## Notifications

### What is the Inbox and how is it different from Notifications?

`notif-inbox` — *All roles*

The **Inbox** (envelope icon in the top nav bar) is your centralized feed of all activity that requires your attention — @mentions, task assignments, sprint invites, action items, and more.

**Notifications** (the bell icon, if separate) are typically transient alerts that pop up briefly. The Inbox is persistent — items stay there until you mark them as read or act on them.

Think of it this way: **Notifications** tell you something happened. **Inbox** is where you go to review and respond to everything that needs your attention, so nothing falls through the cracks.

### How do I get notified when someone @mentions me?

`notif-mentions` — *All roles*

Type @ followed by their name in a task or subtask comment, then post it. This does two things:

1. **It assigns them to the task.** Every person you @mention is added to the task's assignee list — this happens whether or not they get notified. Mentioning someone already assigned is harmless (it just doesn't duplicate them).
2. **It (usually) notifies them.** They get an Inbox notification with the commenter's name, the task title, and a preview of your comment, plus a desktop/push notification if they've enabled that. Two exceptions: mentioning yourself never sends a notification (nothing to tell yourself), and if someone has muted mention notifications, they won't be notified — but they are still assigned either way.

**Who can @mention-assign:** you need to already be able to assign the task — the task's creator, a Super Admin/Regional Secretary, or the Dept Lead of that task's department. For personal tasks, only the task owner or a Super Admin can do it.

Note: this assign-on-mention behavior is specific to **task and subtask comments**. Nexus doesn't currently support @mentions in meeting notes or other text fields.

### How do I manage my desktop or push notification settings?

`notif-settings` — *All roles*

The first time Nexus tries to send you a desktop notification, your browser will ask for permission. Click "Allow" to enable them.

To manage notification preferences after that: go to **Settings** → **Notifications** (if available). You may be able to turn off specific notification types or all push notifications.

If push notifications have stopped working: try going to Settings → Notifications and clicking "Re-enable notifications." This prompts the browser permission dialog again. Some browsers or systems may block notifications if you've toggled them off at the OS level — check your browser or phone notification settings as well.

### What types of notifications does Nexus send?

`notif-types` — *All roles*

Nexus sends notifications for:

- **@mentions** — someone mentioned you in a comment or note
- **Task assignment** — you were assigned to a task
- **Task status change** — a task you follow changed status
- **Comment on followed task** — someone commented on a task you follow
- **Sprint invite** — you've been invited to join a sprint
- **Meeting invite** — you've been added to a meeting
- **Action item assigned** — a meeting action item was assigned to you
- **Absence email approval needed** — (dept leads) a batch needs your review

Each notification type can appear in your Inbox and optionally as a desktop/push alert.

---

## General Platform

### How do I get help if something is broken or I'm stuck?

`general-get-help` — *All roles*

A few options depending on the situation:

1. **Ask Nova (me!):** For how-to questions about using Nexus features — that's exactly what I'm here for.
2. **Help page:** Go to **Help** in the sidebar for written documentation and guides.
3. **Support page:** Go to **Support** in the sidebar to submit a support request that reaches the Nexus team.
4. **Your dept lead:** For department-specific questions (access, workflows, permissions) — they know your team's setup.
5. **IK Nwokem:** For platform-level issues, technical bugs, or anything that needs a super admin — reach out directly.

For urgent issues blocking you from doing your job, don't wait — contact IK Nwokem or a super admin directly rather than waiting for a support ticket response.

### How do I navigate between departments in the sidebar?

`general-navigate-departments` — *All roles*

The left sidebar shows **Spaces** — one per department you have access to. Click the space name to expand it and see its folders and lists. Click a list to open it.

If you have access to multiple departments, you'll see all their spaces listed. You can favorite a space (click the star icon next to it) to keep it pinned at the top of your sidebar.

**Super admins and Regional Secretaries** see all department spaces automatically. Regular members see only their own department's spaces.

### How do I change my profile picture or display name?

`general-profile-photo` — *All roles*

Click your avatar or initials in the top-right corner of the screen. Choose "Settings" or "My Profile" from the dropdown. On the profile page:

- **Photo:** Click on your current photo (or the initials placeholder) to upload a new one from your device. Supported formats: JPG, PNG, GIF. Recommended size: at least 200x200 pixels.
- **Display name:** Click the name field and type your preferred name. Click Save when done.

Your updated photo and name will appear everywhere in Nexus: in task assignees, comments, meeting attendees, and the org chart.

### How do I quickly create a task from anywhere in Nexus?

`general-quick-create` — *All roles*

Click the blue **✚** button in the top navigation bar. A "New Task" modal opens. Fill in the task name and any other details you want, then Save.

You can also use the keyboard shortcut **N** when a task list is in focus to create a task inline at the bottom of that list.

The Quick Create button is always visible regardless of what page you're on — you don't need to navigate to a specific list first.

### How do I search for content in Nexus?

`general-search` — *All roles*

Click the **Search** bar at the top of the page (or press Ctrl+K / Cmd+K as a keyboard shortcut). Type what you're looking for — Nexus searches across tasks, meetings, people, and spaces simultaneously.

**Search tips:**
- Use the full name or a distinctive phrase from the task title
- If you're looking for a person, type their first or last name
- For meetings, try the meeting title or the date

Results are filtered by what you have access to — you won't see results from departments you can't access.

### What does the sidebar show and how do I use it?

`general-sidebar` — *All roles*

The left sidebar is your main navigation panel. It's organized into sections:

- **Personal** — My Tasks, Inbox, Personal List, Planner, Wins
- **Spaces** — your department's spaces (expandable to show folders and lists)
- **Tools** — Meetings, Sprints, Calendar, Communications, People, and other feature sections
- **Platform** — Settings, Help, Support

Click any item to navigate there. Spaces can be expanded to show folders and lists inside them. Use the star icon to favorite spaces and pin them to the top.

On mobile, the sidebar is hidden by default — tap the menu icon at the top left to open it as a drawer.

### What is the difference between a Space, a Folder, and a List?

`general-space-folder-list` — *All roles*

These are the three levels of the task hierarchy in Nexus:

- **Space** — the top level, corresponds to a department (e.g. "Media," "Pastors"). Each department has one or more spaces. Spaces hold folders and lists.
- **Folder** — a group of related lists inside a space. Optional — not every space uses folders. Example: a "Q3 Projects" folder that contains several lists.
- **List** — where tasks actually live. A list is a collection of tasks around a theme or project (e.g. "Sunday Service Prep," "Weekly Admin").

So the hierarchy is: **Space → Folder → List → Tasks.**

When creating a task, you pick which list it goes in. Lists belong to a folder (or directly to a space if there are no folders).

---

*Generated from the live `nova_kb_entries` migration set. Re-export after any KB migration to keep this in sync.*
