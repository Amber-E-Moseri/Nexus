-- Nova KB: Comprehensive getting started and feature guides
-- Covers: Getting started, Navigation, Tasks, Sprints, Meetings, Notifications, Permissions, Health concepts

insert into public.nova_kb_entries (slug, question, answer, feature_area, applicable_roles, related_slugs)
values

-- ─── GETTING STARTED ──────────────────────────────────────────────────

(
  'what-is-nexus',
  'What is Nexus?',
  'Nexus is BLW Canada''s internal operations platform. It replaces ClickUp and serves the ~50-person team across 5 departments (Admin, Media, ORS, Pastors, PFCC). Nexus manages tasks, sprints, meetings, communications, calendars, and automations — all in one place with real-time collaboration and secure multi-tenant data isolation.',
  'getting-started',
  ARRAY['super_admin','regional_secretary','dept_lead','pastor','member'],
  ARRAY[]::text[]
),

(
  'what-can-i-do-in-nexus',
  'What can I do in Nexus?',
  'In Nexus you can:
• **Tasks** — Create, assign, and track tasks across your department or personally
• **Sprints** — Run multi-week projects with sprint boards and status tracking
• **Meetings** — Schedule, record minutes, assign action items, and track follow-ups
• **Calendar** — Sync with Google Calendar and manage ministry events with RSVP
• **Communications** — Send campaigns, manage newsletters, and track communications
• **My Tasks** — View your personal task board with Today, Tomorrow, and custom views
• **Notifications** — Stay updated with real-time mentions, assignments, and activity
• **Reports** — View adoption metrics, health scores, and meeting reports
• **Automations** — Set up rules to auto-complete tasks, send messages, and more',
  'getting-started',
  ARRAY['super_admin','regional_secretary','dept_lead','pastor','member'],
  ARRAY['what-is-nexus']
),

(
  'what-is-nova',
  'What is Nova?',
  'Nova is your AI assistant within Nexus. Ask Nova questions about how to use Nexus, get help with specific features, understand your tasks and meetings, and receive guidance on best practices. Nova has access to your department''s tasks and can provide personalized recommendations based on what you''re working on. You can chat with Nova in the sidebar or ask questions about any page in Nexus.',
  'getting-started',
  ARRAY['super_admin','regional_secretary','dept_lead','pastor','member'],
  ARRAY['what-can-i-do-in-nexus']
),

(
  'how-do-i-get-started',
  'How do I get started?',
  'Follow these steps:
1. **Sign in** with your Nexus account
2. **Complete your profile** — Upload a photo and add your contact info (Onboarding step 1)
3. **Open your department** — Click Dashboard or your department in the sidebar (Onboarding step 2)
4. **View your tasks** — Navigate to My Tasks to see what you''re assigned (Onboarding step 3)
5. **Make an edit** — Update a task status, add a comment, or make a change (Onboarding step 4)

Your onboarding checklist will track these steps. If you dismiss it, it reappears after 3 days as a reminder.',
  'getting-started',
  ARRAY['super_admin','regional_secretary','dept_lead','pastor','member'],
  ARRAY['what-is-nexus']
),

(
  'what-should-i-do-after-signing-in',
  'What should I do after signing in?',
  'After signing in:
1. **Check Dashboard** — See your department overview, recent tasks, and upcoming meetings
2. **Update your profile** — Go to Settings > Profile to add a photo and update your info
3. **Review My Tasks** — Check what''s assigned to you in My Tasks (Today & Tomorrow or full list)
4. **Browse your department** — Open your department space to see folders, lists, and team tasks
5. **Enable notifications** — Go to Settings > Notifications to enable push and email alerts
6. **Sync your calendar** — If you use Google Calendar, connect it in Settings > Integrations

The onboarding modal will guide you through the key steps.',
  'getting-started',
  ARRAY['super_admin','regional_secretary','dept_lead','pastor','member'],
  ARRAY['how-do-i-get-started']
),

(
  'how-do-i-complete-onboarding',
  'How do I complete onboarding?',
  'Onboarding is automatic — you don''t need to do anything special. As you use Nexus, the system tracks these events:
• **Profile Complete** — Upload a photo in Settings > Profile
• **Open Department** — Visit your department dashboard
• **View Tasks** — Open My Tasks
• **Update a Task** — Change status, add a comment, or make an edit

When you complete all 4 steps, the onboarding modal will show "You''re all set!" If you dismiss the modal, it reappears after 3 days as a gentle reminder, then permanently disappears on the second dismiss.',
  'getting-started',
  ARRAY['super_admin','regional_secretary','dept_lead','pastor','member'],
  ARRAY['how-do-i-get-started']
),

-- ─── NAVIGATION ───────────────────────────────────────────────────────

(
  'where-are-my-tasks',
  'Where are my tasks?',
  '**My Tasks** is your personal task board. Get there:
• Click **My Tasks** in the sidebar (left menu)
• Quick views: **Today & Tomorrow** tab shows urgent items
• Full view: Shows all tasks assigned to you across the org

You can also see tasks in:
• **Your department space** — Tasks for your team
• **Sprints** — Tasks in active sprints
• **Dashboard** — Recent and overdue tasks',
  'navigation',
  ARRAY['super_admin','regional_secretary','dept_lead','pastor','member'],
  ARRAY[]::text[]
),

(
  'where-is-meeting-hub',
  'Where is Meeting Hub?',
  '**Meetings** is in the sidebar under Workspace. Click **Meetings** to see:
• **Upcoming meetings** — scheduled for your department
• **Recent meetings** — past meetings and their minutes
• **Meeting hub** — organized by team/department
• Create button — to schedule a new meeting

You can also access meetings from:
• **Calendar** — View as events on ministry calendar
• **Dashboard** — Upcoming meetings card
• **Department space** — Meeting list in sidebar',
  'navigation',
  ARRAY['super_admin','regional_secretary','dept_lead','pastor','member'],
  ARRAY[]::text[]
),

(
  'where-can-i-find-members',
  'Where can I find members?',
  '**People** section is in the sidebar. Click to see:
• **All People** — Every active user in Nexus
• **Users by Department** — Browse members of each department
• **Departments** — View department structure and leads
• **Invitations** — Manage pending invites to Nexus
• **Pastoral Assignments** — Assign pastor roles and responsibilities

You can also @ mention people when commenting on tasks — start typing @ to see the list.',
  'navigation',
  ARRAY['super_admin','regional_secretary','dept_lead','pastor','member'],
  ARRAY[]::text[]
),

(
  'where-are-reports',
  'Where are reports?',
  'Reports depend on your role:
• **Admin/Regional Secretary** — **Reporting** in sidebar shows adoption metrics, health scores, meeting reports, and team analytics
• **Department Lead** — View health scores in **Settings > Organisation** and department overview in your space
• **Members** — Reports are not available (admin-only feature)

Common reports:
• **Adoption Dashboard** — User engagement and feature adoption
• **Operational Health** — Department task execution, action follow-through, and activity
• **Meeting Reports** — Attendance trends, action item completion rates
• **Communications** — Email campaign analytics and bounce tracking',
  'navigation',
  ARRAY['super_admin','regional_secretary','dept_lead','pastor'],
  ARRAY[]::text[]
),

(
  'where-are-sprints',
  'Where are sprints?',
  '**Sprints** is in the sidebar under Workspace. Click to see:
• **All Sprints** — Active and completed sprints across the org
• **Sprints List** — Browse sprints by status (Planning, Active, Closed)
• **Create Sprint** — Start a new sprint (dept leads and admins only)
• **Sprint Board** — See tasks organized by status once you open a sprint

Sprints can be:
• **Department sprints** — Owned by a single department
• **Multi-department sprints** — Span multiple teams
• **Custom sprints** — Hand-picked team members',
  'navigation',
  ARRAY['super_admin','regional_secretary','dept_lead','pastor','member'],
  ARRAY[]::text[]
),

(
  'where-do-i-manage-notifications',
  'Where do I manage notifications?',
  'Go to **Settings > Notifications**. There you can:
• **Turn on/off push notifications** — Browser pop-up alerts (enable once to use)
• **Turn on/off email notifications** — Summary emails for assignments, mentions, etc.
• **Manage notification types** — Choose which events trigger alerts (mentions, assignments, task updates, etc.)
• **Set quiet hours** — Mute notifications during specific times
• **Opt out of announcements** — Unsubscribe from feature announcements and newsletters

You can also **Unsubscribe from specific campaigns** — Look for the unsubscribe link in email footers.',
  'navigation',
  ARRAY['super_admin','regional_secretary','dept_lead','pastor','member'],
  ARRAY[]::text[]
),

(
  'where-can-i-edit-my-profile',
  'Where can I edit my profile?',
  'Go to **Settings > Profile**. You can edit:
• **Full name** — Your display name
• **Photo** — Upload a profile picture (JPG, PNG, or WebP, max 2MB)
• **Email** — View only (can''t change; contact admin)
• **Role** — View only (department lead or member)
• **Timezone** — Auto-detected from your device
• **Ministry Group** — Your group/region (Central, Central-East, or West)
• **Email Signature** — Plain text or HTML signature for emails you send

Click **Save changes** when done.',
  'navigation',
  ARRAY['super_admin','regional_secretary','dept_lead','pastor','member'],
  ARRAY[]::text[]
),

-- ─── TASKS ────────────────────────────────────────────────────────────

(
  'how-do-i-create-a-task',
  'How do I create a task?',
  'To create a task:
1. Go to your **Department space** or **My Tasks**
2. Click the **+ New Task** button (or **+ Create** in a list)
3. Fill in:
   • **Title** (required)
   • **Description** (optional)
   • **Assign to** (optional, defaults to you)
   • **Due date** (optional)
   • **Priority** (Low, Medium, High, Critical)
   • **Status** (defaults to "To Do")
4. Click **Create Task**

You can also:
• Create tasks from **meeting action items** — automatically become tasks
• Drag-and-drop to create in **sprint boards**
• Use **action items** as quick tasks',
  'tasks',
  ARRAY['super_admin','regional_secretary','dept_lead','pastor','member'],
  ARRAY[]::text[]
),

(
  'how-do-i-assign-a-task',
  'How do I assign a task?',
  'To assign a task:
1. **Open the task** by clicking on it
2. Click **Assign to** or the assignee field
3. **Search for a person** by name or type to filter
4. **Click their name** to assign

To assign to yourself:
• Click the **Assign to me** button or your name

To reassign:
• Click the current assignee and select a new person

To unassign:
• Click the assignee and select **Unassigned**

**Note:** You can only assign tasks to people in your department or team. Admins and regional secretaries can assign across departments.',
  'tasks',
  ARRAY['super_admin','regional_secretary','dept_lead','pastor','member'],
  ARRAY[]::text[]
),

(
  'how-do-i-change-task-status',
  'How do I change task status?',
  'To change task status:
1. **In a list or board** — Click the status pill and select a new status
2. **In task detail** — Click the status at the top and select from the dropdown
3. **Drag-and-drop on a board** — Drag the card to a different column

**Common statuses:**
• **To Do** — Not started, waiting for work to begin
• **In Progress** — Actively being worked on
• **Review** — Waiting for review or feedback
• **Completed** — Done (auto-marks as closed)
• **Cancelled** — No longer needed

Departments may have custom statuses. Check your department space to see what''s available.',
  'tasks',
  ARRAY['super_admin','regional_secretary','dept_lead','pastor','member'],
  ARRAY[]::text[]
),

(
  'what-does-blocked-mean',
  'What does Blocked mean?',
  '"Blocked" is a retired status that is no longer used in Nexus. If you see a task marked as Blocked, it''s likely a legacy task that wasn''t updated.

**What to do with blocked tasks:**
• Change the status to **In Progress** (if work is happening but waiting for something)
• Change to **On Hold** if available in your department
• If truly not needed, mark as **Cancelled**
• Add a comment explaining what''s blocking progress

**For future tasks:** Use comment threads to explain blockers instead of relying on a Blocked status. Tag the relevant person with @ to notify them.',
  'tasks',
  ARRAY['super_admin','regional_secretary','dept_lead','pastor','member'],
  ARRAY[]::text[]
),

(
  'how-do-i-comment-on-a-task',
  'How do I comment on a task?',
  'To comment on a task:
1. **Open the task** by clicking on it
2. Scroll to the **Comments** section at the bottom
3. Click the **comment box** and type your message
4. **Mention someone** by typing @ and their name (e.g., @John)
5. **Add attachments** by clicking the attachment icon
6. Click **Send** or press Ctrl+Enter

**Mentions:**
• Use @ to notify someone directly
• They''ll get a notification and see the comment in their Needs Attention
• Great for asking questions or requesting updates

**Replying:**
• Click **Reply** under a comment to respond inline
• Everyone on the thread gets notified',
  'tasks',
  ARRAY['super_admin','regional_secretary','dept_lead','pastor','member'],
  ARRAY[]::text[]
),

(
  'how-do-i-add-an-attachment',
  'How do I add an attachment?',
  'To add an attachment to a task:
1. **Open the task** and scroll to the **Attachments** section
2. Click the **+ Add attachment** button or drag files
3. **Choose a file** from your computer (JPG, PNG, PDF, DOC, etc.)
4. **Wait for upload** to complete
5. The attachment now appears in the task

You can also:
• **Add attachments in comments** — Click the attachment icon in the comment box
• **Link Google Drive files** — Use the Drive integration to link shared docs
• **Embed links** — Paste a URL and it''ll preview

**File limits:**
• Max 2MB per file (contact admin to increase)
• Stored securely in Nexus Storage',
  'tasks',
  ARRAY['super_admin','regional_secretary','dept_lead','pastor','member'],
  ARRAY[]::text[]
),

(
  'how-do-due-dates-work',
  'How do due dates work?',
  'Due dates help you track when tasks need to be done:
• **Set a due date** when creating or editing a task
• **View by due date** in My Tasks, sorted by Today, Tomorrow, Upcoming, Overdue
• **Visual indicators:**
  - Green/on-time: Due in the future
  - Yellow/due soon: Due within 24 hours
  - Red/overdue: Past the due date
• **Notifications:** Get notified if a task is overdue or due soon (if enabled)

**Recurring tasks:**
• Set a **repeat pattern** (daily, weekly, monthly) when creating a task
• Creates new tasks automatically on the schedule
• Useful for recurring meetings, check-ins, reports

**Reminders:**
• Set in task details to get a notification before the due date
• Options: 1 day before, 1 hour before, etc.',
  'tasks',
  ARRAY['super_admin','regional_secretary','dept_lead','pastor','member'],
  ARRAY[]::text[]
),

(
  'how-do-dependencies-work',
  'How do dependencies work?',
  '**Dependencies** let you link tasks so you can track what needs to happen first.
• **Blocking task** — A task that must be done before another can start
• **Blocked task** — A task waiting for another to finish

**To add a dependency:**
1. Open a task
2. Click **Add dependency** or **Link task**
3. Search for the task that blocks this one
4. Select the dependency type (Blocks, Blocked by, etc.)
5. Save

**Benefits:**
• **Sprint boards** show dependency chains visually
• **Notifications** alert you when blocking tasks are completed
• **Reports** track dependency impact on timelines

**Example:** "Design mockups" blocks "Build UI" — when mockups are done, the UI task lights up as ready to start.',
  'tasks',
  ARRAY['super_admin','regional_secretary','dept_lead','pastor','member'],
  ARRAY[]::text[]
),

(
  'what-is-my-tasks',
  'What is My Tasks?',
  '**My Tasks** is your personal task board showing all tasks assigned to you across Nexus.
• **Today & Tomorrow view** — Urgent tasks you should focus on now
• **Full list view** — All your open tasks grouped by status or due date
• **Personal list** — Your own private task list (stays with you, not team-wide)
• **Quick filters** — Sort by status, priority, due date, department

**My Tasks shows:**
• Tasks from your department
• Tasks from sprints you''re in
• Tasks from cross-functional projects
• Your personal tasks (private)

**It does NOT show:**
• Tasks assigned to others (unless you''re following them)
• Team-only lists you''re not assigned to

Click **My Tasks** in the sidebar to open it.',
  'tasks',
  ARRAY['super_admin','regional_secretary','dept_lead','pastor','member'],
  ARRAY[]::text[]
),

(
  'what-is-the-difference-between-department-tasks-and-my-tasks',
  'What is the difference between department tasks and My Tasks?',
  '**Department Tasks:**
• Belong to your department space
• Visible to all department members
• Assigned to team members to spread the workload
• Examples: "Design poster", "Update website", "Plan event"
• Anyone in the department can view and comment

**My Tasks:**
• Assigned to you personally
• Can be from different departments or sprints
• Consolidated view of what YOU need to do
• Serves as your personal worklist
• You can prioritize what''s most urgent to you

**Personal List:**
• Private tasks only you can see
• For personal goals, reminders, or private work
• Separate from team tasks
• Access via **Personal List** in sidebar

**Use both together:**
• **Department tasks** for team coordination
• **My Tasks** for personal focus and workload tracking
• **Personal list** for private reminders',
  'tasks',
  ARRAY['super_admin','regional_secretary','dept_lead','pastor','member'],
  ARRAY[]::text[]
),

-- ─── SPRINTS/PROJECTS ─────────────────────────────────────────────────

(
  'what-is-a-sprint',
  'What is a sprint?',
  'A **sprint** is a focused work period (usually 1-2 weeks) where a team works together on specific goals.

**In Nexus, sprints have:**
• **Title & Goal** — What you''re trying to accomplish
• **Dates** — Start and end dates (usually 1-2 weeks)
• **Tasks** — Work items assigned to the sprint
• **Team members** — Who''s involved (auto-added for multi-dept sprints)
• **Status** — Planning, Active, Completed, or Cancelled
• **Board view** — Visual task columns by status

**Types of sprints:**
• **Department sprints** — Single team, managed by dept lead
• **Multi-department sprints** — Cross-functional, spans multiple teams
• **Custom sprints** — Hand-picked team, full control over members

**Sprint cycle:**
1. **Plan** — Define goals, create tasks, estimate effort
2. **Active** — Team works on tasks (daily standups optional)
3. **Review** — Celebrate completions, discuss what worked
4. **Close** — Archive sprint, capture learnings',
  'sprints',
  ARRAY['super_admin','regional_secretary','dept_lead','pastor','member'],
  ARRAY[]::text[]
),

(
  'how-do-i-create-a-sprint',
  'How do I create a sprint?',
  'To create a sprint (Dept Lead or Admin only):
1. Go to **Sprints** in the sidebar
2. Click **+ New Sprint**
3. Fill in:
   • **Title** (e.g., "Easter Event 2026")
   • **Goal** (What you''re trying to accomplish)
   • **Start date** (when the sprint begins)
   • **End date** (when it finishes, usually 1-2 weeks later)
   • **Type** (Department, Multi-department, or Custom)
4. Click **Create Sprint**

**For Multi-department sprints:**
• Select which departments are involved
• Nexus auto-creates a team per department
• All active members are auto-added

**For Custom sprints:**
• Hand-pick team members after creation
• No auto-assignments',
  'sprints',
  ARRAY['super_admin','regional_secretary','dept_lead','pastor'],
  ARRAY['what-is-a-sprint']
),

(
  'how-do-i-add-tasks-to-a-sprint',
  'How do I add tasks to a sprint?',
  'To add tasks to a sprint:
1. **Open the sprint** and go to the **Sprint Board** tab
2. Click **+ Add task** in the board, or drag existing tasks in
3. **Create new task** — Fill in title and assign to a team member
4. **Add existing task** — Search for and link a task from your department

**Alternative methods:**
• **From department space** — Right-click a task and select "Add to sprint"
• **Bulk edit** — Select multiple tasks and add them at once
• **Drag-and-drop** — If the task is already in progress, drag it to the sprint

**Sprint board columns:**
• **To Do** — Not started yet
• **In Progress** — Being worked on
• **Review** — Waiting for approval
• **Completed** — Done

You can move tasks between columns as work progresses.',
  'sprints',
  ARRAY['super_admin','regional_secretary','dept_lead','pastor'],
  ARRAY['what-is-a-sprint']
),

(
  'what-do-sprint-statuses-mean',
  'What do sprint statuses mean?',
  '**Sprint statuses track the lifecycle of a sprint:**

• **Planning** — Sprint created, goals defined, but work hasn''t started yet. Team members can review goals and tasks.

• **Active** — Sprint is live. Team is working on tasks. Daily standup and status updates happen here.

• **Completed** — Sprint ended on schedule. Retrospective done, work wrapped up. Tasks marked complete.

• **Cancelled** — Sprint ended early. Goals changed, resources reallocated, or circumstances changed. Work is paused.

**Transitions:**
• Planning → Active (when sprint starts)
• Active → Completed (when sprint end date arrives)
• Any status → Cancelled (if needed)

**Task status within sprints:**
• Tasks have their own statuses (To Do, In Progress, Review, Completed)
• These track individual task progress WITHIN the sprint
• Sprint status tracks the overall sprint''s phase',
  'sprints',
  ARRAY['super_admin','regional_secretary','dept_lead','pastor','member'],
  ARRAY['what-is-a-sprint']
),

(
  'how-does-the-sprint-board-work',
  'How does the sprint board work?',
  'The **Sprint Board** is a Kanban-style view of all sprint tasks, organized by status.

**Columns:**
• **To Do** — Tasks ready to start
• **In Progress** — Currently being worked on
• **Review** — Waiting for feedback or approval
• **Completed** — Done (locked, can''t be moved)

**Features:**
• **Drag-and-drop** — Move cards between columns as work progresses
• **Task cards** — Show title, assignee, due date, priority color
• **Click to open** — See full task details, comments, attachments
• **Filter** — Sort by assignee, priority, due date
• **Search** — Find specific tasks in the sprint

**Best practices:**
• Move tasks as they progress
• One person per card (don''t split work)
• Keep the board up-to-date for accurate status
• Use comments to ask questions and share updates',
  'sprints',
  ARRAY['super_admin','regional_secretary','dept_lead','pastor','member'],
  ARRAY['how-does-the-sprint-board-work']
),

(
  'how-do-i-move-a-task-between-columns',
  'How do I move a task between columns?',
  'To move a task on the sprint board:
1. **Open the sprint board** (click Sprint > Board tab)
2. **Drag the task card** from one column to another
3. The task status updates automatically

**Keyboard shortcut:**
• Click the task → press arrow keys to move between columns

**Change status another way:**
• Click the task to open details
• Click the status pill at the top
• Select the new status

**Examples:**
• Drag from **To Do → In Progress** when you start work
• Drag from **In Progress → Review** when ready for feedback
• Drag from **Review → In Progress** if changes needed
• Drag to **Completed** when done

**Note:** Completed tasks can''t be moved back (they''re done). If you need to reopen a task, change its status in task details.',
  'sprints',
  ARRAY['super_admin','regional_secretary','dept_lead','pastor','member'],
  ARRAY['how-does-the-sprint-board-work']
),

(
  'what-happens-when-a-sprint-ends',
  'What happens when a sprint ends?',
  'When a sprint reaches its end date:

**Automatic:**
• Sprint status changes to **Completed**
• Sprint board becomes read-only (view only)
• Tasks are archived with the sprint

**You should:**
1. **Review completions** — How many tasks finished?
2. **Close incomplete tasks** — Mark as Completed, Cancelled, or move to next sprint
3. **Capture learnings** — Add notes about what went well/what to improve
4. **Schedule retrospective** — Optional team meeting to discuss

**Incomplete tasks:**
• Can be moved to the **next sprint**
• Can stay in your **department space**
• Can be marked **Cancelled** if no longer needed

**After sprint ends:**
• Access via **Sprints archive** (past sprints section)
• View reports on what was completed
• Use as a reference for planning future sprints

**Next sprint:**
• Create a new sprint with fresh goals
• Re-prioritize and redistribute tasks',
  'sprints',
  ARRAY['super_admin','regional_secretary','dept_lead','pastor','member'],
  ARRAY['what-is-a-sprint']
),

-- ─── MEETINGS ─────────────────────────────────────────────────────────

(
  'what-is-meeting-hub',
  'What is Meeting Hub?',
  '**Meeting Hub** is where you manage all your meetings — schedule, attend, record minutes, assign action items, and track follow-ups.

**Meeting Hub features:**
• **Calendar** — Upcoming and past meetings for your department
• **Create meeting** — Schedule a new meeting
• **Meeting details** — Agenda, attendees, RSVP, meeting notes
• **Minutes** — Record what happened, decisions made, action items
• **Action items** — Assignments from the meeting (auto-become tasks)
• **Meeting log** — Historical record of all meetings

**Navigation:**
• Click **Meetings** in sidebar
• Access via **Calendar** if synced with Google Calendar
• See upcoming meetings on **Dashboard**

**Who can use it:**
• All users can view and attend meetings
• Dept leads and admins can create meetings
• Anyone can record minutes (if permissions allow)
• Action items assigned auto-create tasks',
  'meetings',
  ARRAY['super_admin','regional_secretary','dept_lead','pastor','member'],
  ARRAY[]::text[]
),

(
  'how-do-i-create-a-meeting',
  'How do I create a meeting?',
  'To create a meeting (Dept Lead or Admin):
1. Go to **Meetings** in sidebar
2. Click **+ New Meeting**
3. Fill in:
   • **Title** (e.g., "Weekly Standup")
   • **Date & Time** (when the meeting happens)
   • **Duration** (how long it will be)
   • **Description** (optional, agenda or context)
   • **Attendees** (who should attend — @ mention to invite)
   • **Location** (physical location or Zoom/Meet link)
4. Click **Create Meeting**

**After creating:**
• Invites are sent to attendees
• Meeting appears on their calendars (if synced with Google)
• Add agenda items before the meeting
• Record minutes and action items during/after

**Recurring meetings:**
• Set repeat pattern (weekly, bi-weekly, monthly)
• Auto-creates meetings on the schedule',
  'meetings',
  ARRAY['super_admin','regional_secretary','dept_lead','pastor'],
  ARRAY['what-is-meeting-hub']
),

(
  'how-do-i-add-an-agenda-item',
  'How do I add an agenda item?',
  'To add an agenda item to a meeting:
1. **Open the meeting** from Meeting Hub
2. Click the **Agenda** tab
3. Click **+ Add agenda item**
4. Fill in:
   • **Title** (what you''re discussing)
   • **Time** (how long to spend, optional)
   • **Assigned to** (who''s leading discussion, optional)
   • **Notes** (context or prep needed)
5. Click **Add**

**During the meeting:**
• Check off items as you cover them
• Re-order if needed (drag-and-drop)
• Add notes to each item
• If decisions/actions emerge, create action items

**After the meeting:**
• Agenda items remain in the meeting record
• Use as the basis for minutes',
  'meetings',
  ARRAY['super_admin','regional_secretary','dept_lead','pastor','member'],
  ARRAY['what-is-meeting-hub']
),

(
  'how-do-i-take-minutes',
  'How do I take minutes?',
  'To take meeting minutes:
1. **Open the meeting** from Meeting Hub
2. Click the **Minutes** tab
3. Add sections:
   • **Attendees** — Who showed up
   • **Agenda items** — What was discussed
   • **Decisions** — What was decided
   • **Action items** — Tasks assigned (auto-create as tasks)
   • **Notes** — Any other context
4. **Format with markdown** — Bold, lists, links are supported
5. Click **Save**

**Action items in minutes:**
• Use format: **Action: [Person] - [What]** (e.g., "Action: John - Follow up with legal")
• These auto-create tasks assigned to John
• He''ll get a notification about the task

**After saving:**
• Minutes are locked from editing (admin can unlock)
• Minutes appear in meeting record
• Historical reference for follow-ups
• Reports can pull from minutes data

**Best practice:** Assign someone to take minutes while others focus on discussion.',
  'meetings',
  ARRAY['super_admin','regional_secretary','dept_lead','pastor','member'],
  ARRAY['what-is-meeting-hub']
),

(
  'who-can-edit-meeting-minutes',
  'Who can edit meeting minutes?',
  '**Who can edit:**
• **Original author** — Person who created the minutes
• **Meeting organizer** — Person who created the meeting
• **Super admin / Regional secretary** — Can edit any minutes
• **Dept lead** — Can edit minutes from their department''s meetings

**Who CANNOT edit:**
• Regular members (unless they created the minutes)
• People from other departments (unless admin)

**How to edit:**
1. Open the meeting
2. Click the **Minutes** tab
3. Click **Edit** button
4. Make changes and click **Save**

**Locked minutes:**
• After a meeting, minutes are typically locked
• To unlock: Contact admin or meeting organizer
• Once unlocked, anyone who can edit can make changes

**Corrections:**
• If you spot an error, comment on the meeting
• Tag the meeting organizer or admin
• They can unlock and fix it',
  'meetings',
  ARRAY['super_admin','regional_secretary','dept_lead','pastor','member'],
  ARRAY['how-do-i-take-minutes']
),

(
  'how-do-i-assign-an-action-item',
  'How do I assign an action item?',
  'To assign an action item during/after a meeting:
1. **Open the meeting** and go to **Minutes** or **Action Items** tab
2. Click **+ Add action item**
3. Fill in:
   • **Title** (what needs to be done)
   • **Assigned to** (who will do it)
   • **Due date** (when it''s due, optional)
   • **Notes** (context or details)
4. Click **Create**

**During minutes:**
• Use format: "Action: [Person] - [What they need to do]"
• When you save, Nexus auto-creates a task

**Result:**
• Action item appears in meeting record
• A task is automatically created and assigned
• Person gets notification about the task
• Task appears in their My Tasks
• Completion is tracked in meeting reports

**Tip:** Keep action items specific, add due dates, and assign to one person. Use task comments for follow-up discussions.',
  'meetings',
  ARRAY['super_admin','regional_secretary','dept_lead','pastor','member'],
  ARRAY['what-is-meeting-hub']
),

(
  'what-is-the-meeting-log',
  'What is the meeting log?',
  'The **Meeting Log** is a searchable historical record of all meetings held in your department.

**What''s in it:**
• **Meeting title, date, time**
• **Attendees** — Who was there
• **Minutes** — What happened
• **Action items** — Tasks assigned
• **Decisions** — What was decided
• **Attachments** — Documents, recordings

**Where to find it:**
• Click **Meetings** > **Log** tab (or similar)
• Searchable by title, date, attendees
• Filter by department or team

**Uses:**
• **Look up past decisions** — What did we decide about X?
• **Track action items** — Did we complete the follow-up?
• **Onboard new members** — What has the team been working on?
• **Compliance** — Audit trail of meetings and decisions
• **Reports** — Meeting attendance and action item completion trends

**Access:**
• Your department members can view your meetings'' logs
• Admins can see all meeting logs
• Regional secretaries can see their region''s logs',
  'meetings',
  ARRAY['super_admin','regional_secretary','dept_lead','pastor','member'],
  ARRAY['what-is-meeting-hub']
),

(
  'how-do-i-close-a-meeting',
  'How do I close a meeting?',
  'To close/end a meeting:
1. **Open the meeting** from Meeting Hub
2. Click **Close Meeting** or **End Meeting** button
3. Confirm you''ve recorded:
   • Minutes ✓
   • Action items ✓
   • Decisions ✓
4. Click **Confirm Close**

**What happens:**
• Meeting status changes to **Closed** or **Completed**
• Minutes are locked (only admin/organizer can edit)
• Action items are finalized (tasks sent to assignees)
• Meeting moves to **Past meetings** section
• Notifications sent to attendees about action items

**Before closing, make sure:**
• Minutes are recorded and saved
• All action items are assigned and have due dates
• Attendees know their tasks and deadlines
• Key decisions are documented

**After closing:**
• Meeting appears in Meeting Log
• Can''t re-open without admin help
• Use for reference and reporting
• Historical record is permanent',
  'meetings',
  ARRAY['super_admin','regional_secretary','dept_lead','pastor'],
  ARRAY['what-is-meeting-hub']
),

(
  'how-do-meeting-actions-become-tasks',
  'How do meeting actions become tasks?',
  'Meeting action items automatically become tasks:

**Process:**
1. **During minutes** — Use format: "Action: [Person] - [What]"
2. **When you save** — Nexus scans for action items
3. **Auto-creates tasks** — One task per action
4. **Assigns to person** — Task goes to their task list
5. **Notification sent** — They get alert about new task

**Example:**
• Minutes say: "Action: Alice - Update website homepage by Friday"
• Nexus creates: Task "Update website homepage" assigned to Alice, due Friday

**Task details:**
• Linked to the meeting (can navigate back)
• Appears in their My Tasks
• Status defaults to "To Do"
• They can comment, ask questions, add attachments

**Manually creating action items:**
• Click **+ Action Item** in meeting
• Title, assign to, due date
• Same result as auto-creation

**Tracking completion:**
• Action item status = task status
• Reports show % of meeting actions completed on time
• Use to measure follow-through',
  'meetings',
  ARRAY['super_admin','regional_secretary','dept_lead','pastor','member'],
  ARRAY['how-do-i-assign-an-action-item']
),

(
  'where-can-i-find-past-meetings',
  'Where can I find past meetings?',
  'To find past meetings:
1. Go to **Meetings** in sidebar
2. Click the **Past meetings** or **Log** tab
3. **Search** by title, date, or attendee
4. **Filter** by department or team

**Other ways to access:**
• **Calendar** — View past events if synced with Google
• **Department space** — May have meeting list or log
• **Meeting links** — Direct links to specific meetings

**What you can do:**
• **View minutes** — See what was discussed
• **Check action items** — What tasks came from this meeting
• **Read notes** — Context and decisions
• **Search content** — Find meetings about a topic
• **Generate report** — Analytics on meeting patterns

**Tips:**
• Meetings are permanent records
• Use search to find decisions or action items
• Sort by date to see trend of meetings over time
• Export meeting reports for presentations',
  'meetings',
  ARRAY['super_admin','regional_secretary','dept_lead','pastor','member'],
  ARRAY['what-is-meeting-hub']
),

-- ─── NOTIFICATIONS ────────────────────────────────────────────────────

(
  'what-notifications-can-nexus-send',
  'What notifications can Nexus send?',
  'Nexus sends notifications for:

**Activity:**
• **You''re assigned a task** — "John assigned you to Design Poster"
• **You''re mentioned** — "Alice mentioned you: @John check this"
• **Task updated** — "Design Poster status changed to Review"
• **Comment reply** — "Sarah replied to your comment"

**Meetings:**
• **Meeting invite** — You''re invited to a meeting
• **Upcoming meeting** — Meeting starts in 30 min or 1 hour
• **Action item assigned** — You have a task from a meeting

**Communications:**
• **Campaign sent** — Campaign you subscribed to
• **Feature announcement** — New features or updates
• **Newsletter** — Regular digest or update

**System:**
• **Approval needed** — Permission request or approval needed
• **Automation triggered** — Automated action completed

**Notification channels:**
• **Push notifications** — Browser pop-ups (if enabled)
• **Email** — Summary emails (if enabled)
• **In-app** — In Nexus Inbox

You can manage all of these in **Settings > Notifications**.',
  'notifications',
  ARRAY['super_admin','regional_secretary','dept_lead','pastor','member'],
  ARRAY[]::text[]
),

(
  'how-do-i-enable-push-notifications',
  'How do I enable push notifications?',
  'To enable push notifications:
1. Go to **Settings > Notifications**
2. Look for **Push Notifications** section
3. Click **Enable Push Notifications**
4. **Browser prompt appears** — Click **Allow**
5. Done! You''ll now get pop-up alerts

**Where you''ll see them:**
• Browser pop-ups (even if Nexus isn''t open)
• Desktop notifications in the corner
• Mobile notifications (if using mobile app/PWA)

**To disable later:**
• Go back to **Settings > Notifications**
• Click **Disable Push Notifications**
• Or change browser settings for the site

**Troubleshooting:**
• If prompt doesn''t appear, browser may have blocked notifications
• Check browser settings: Privacy > Notifications > Allow for nexus.lwcanada.org
• Refresh Nexus and try again

**Best practice:**
• Enable push for important items (mentions, assignments)
• Disable for non-urgent updates
• Set quiet hours to avoid notifications during off-hours',
  'notifications',
  ARRAY['super_admin','regional_secretary','dept_lead','pastor','member'],
  ARRAY[]::text[]
),

(
  'how-do-i-turn-off-email-notifications',
  'How do I turn off email notifications?',
  'To turn off email notifications:
1. Go to **Settings > Notifications**
2. Look for **Email Notifications** section
3. **Turn off specific types:**
   • Task assignments
   • Comments & mentions
   • Meeting invites
   • Campaign emails
   • Newsletter/announcements
4. Click **Save** or toggle switches
5. Done! You''ll stop getting those emails

**Unsubscribe from campaigns:**
• Look for **Unsubscribe** link in email footer
• Click it to opt out

**Opt out of announcements:**
• Go to **Settings > Notifications**
• Find "Feature announcements" and toggle off

**Temporarily disable:**
• Set **Quiet hours** in Notifications settings
• Choose times when you don''t want emails (e.g., after 5 PM)
• Emails still arrive, but are queued until quiet hours end

**Note:** You''ll still see activity in Nexus Inbox even if emails are off.',
  'notifications',
  ARRAY['super_admin','regional_secretary','dept_lead','pastor','member'],
  ARRAY[]::text[]
),

(
  'why-did-i-receive-this-notification',
  'Why did I receive this notification?',
  '**Common reasons:**

**Task-related:**
• You were **assigned** to a task
• Someone **@mentioned** you in a task comment
• A task you''re assigned to **changed status**
• Someone **replied** to your comment on a task

**Meeting-related:**
• You''re **invited** to a meeting
• A meeting is **starting soon**
• You''re assigned an **action item** from a meeting

**Communication:**
• You subscribed to a **campaign**
• A **feature announcement** was sent
• An important **system message**

**Approval/admin:**
• Someone **needs your approval**
• An **automation triggered**
• Permission was **granted** or **revoked**

**Troubleshooting:**
• Notifications you don''t want? Go to **Settings > Notifications** and turn them off
• Too many notifications? Set quiet hours or adjust notification types
• Missed a notification? Check your **Inbox** (bell icon)

**Privacy note:**
• Notifications respect your RLS permissions (you only get notifications for things you can access)
• Department members can''t see your personal task notifications',
  'notifications',
  ARRAY['super_admin','regional_secretary','dept_lead','pastor','member'],
  ARRAY[]::text[]
),

(
  'what-is-needs-attention',
  'What is Needs Attention?',
  '**Needs Attention** is your inbox of unresolved notifications and action items:

**What appears here:**
• Tasks **assigned** to you (until marked done or reassigned)
• Comments **@mentioning** you (until you reply)
• **Action items** from meetings (until marked done)
• **Approvals** waiting for you
• **Urgent updates** that need action

**Where to find it:**
• Click the **bell icon** in top nav
• Or go to **Inbox** in sidebar
• Shows badge with count of unresolved items

**How to clear it:**
• **Mark as done** — Task completed
• **Reply** to a mention — Shows you saw it
• **Reassign** — Give task to someone else
• **Dismiss** — Mark as reviewed (for non-actionable items)

**Best practice:**
• Keep Needs Attention small (aim for <10 items)
• Review daily
• Don''t use as a filing system — complete and clear
• Use Projects/My Tasks for ongoing tracking

**Notifications:**
• You''ll get notified when something lands in Needs Attention
• Enable alerts in **Settings > Notifications** so you don''t miss them',
  'notifications',
  ARRAY['super_admin','regional_secretary','dept_lead','pastor','member'],
  ARRAY[]::text[]
),

(
  'how-do-nudges-work',
  'How do nudges work?',
  '**Nudges** are gentle reminders to help you stay on top of things.

**Types of nudges:**
• **Overdue task reminder** — "You have 3 overdue tasks"
• **Meeting prep** — "Standup in 1 hour, check the agenda"
• **Follow-up** — "Follow up on Sarah''s comment from 3 days ago"
• **Stale task** — "This task hasn''t been updated in a week"

**When they arrive:**
• As email summaries (usually daily or weekly)
• As in-app alerts
• Based on your activity level

**How they''re triggered:**
• **Overdue tasks** — Any task past due date without completion
• **No activity** — Task not updated for N days
• **Pending responses** — You haven''t replied to a mention
• **Meeting prep** — Meeting starting soon

**To disable nudges:**
• Go to **Settings > Notifications**
• Toggle off "Nudge reminders"
• Or unsubscribe from specific types

**Best practice:**
• Don''t ignore nudges — they''re helpful signals
• Use them to catch tasks falling behind
• Respond to nudges about mentions/follow-ups
• Adjust frequency if too much/too little',
  'notifications',
  ARRAY['super_admin','regional_secretary','dept_lead','pastor','member'],
  ARRAY[]::text[]
),

-- ─── PERMISSIONS ──────────────────────────────────────────────────────

(
  'what-can-a-member-do',
  'What can a member do?',
  '**Members** are regular team members with these permissions:

**Tasks:**
• View and work on tasks in their department
• Create personal tasks in My Tasks
• Assign tasks to themselves
• Add comments and attachments
• Update task status on tasks assigned to them

**Meetings:**
• View and attend meetings
• Comment on meetings
• Can NOT create meetings or take minutes (unless permission granted)
• Can complete action items assigned to them

**Sprints:**
• View sprints in their department
• Work on sprint tasks if assigned
• Can NOT create or manage sprints

**Department:**
• View their department space
• View department members and tasks
• Can NOT delete or archive items

**Personal:**
• Manage their profile (name, photo, email sig)
• Manage personal notifications
• Create and manage personal tasks (My Tasks, Personal List)

**What they CAN''T do:**
• Create meetings, manage people, edit department settings
• Archive or delete team tasks
• Manage permissions or security
• View other departments (unless shared)

**To get more permissions:**
• Ask your department lead to promote you to Lead
• Or contact admin for special permissions',
  'permissions',
  ARRAY['member'],
  ARRAY[]::text[]
),

(
  'what-can-a-department-lead-do',
  'What can a department lead do?',
  '**Department Leads** manage a team with these permissions:

**Tasks & Work:**
• Create, edit, delete tasks in their department
• Assign tasks to team members
• Create sprints and add tasks to them
• Manage task status and board view
• Archive or bulk-delete tasks

**Meetings:**
• Create and schedule meetings
• Take and edit meeting minutes (their own dept)
• Assign action items
• View all department meetings and logs

**Team Management:**
• View all department members
• See member activity and task workload
• Manage sprint team membership
• Request admin permissions for department changes

**Department:**
• Manage department folders and lists
• Edit department space settings
• View department overview and health
• See adoption metrics for their team

**Reporting:**
• View operational health scores
• See adoption and activity reports
• Generate team reports

**What they CAN''T do:**
• Manage other departments
• Add/remove members from Nexus (admin only)
• Change permissions or security
• View super admin settings
• Create multi-department sprints (admin only)

**To escalate:**
• Contact super admin for org-wide actions
• Regional secretary for region-wide access',
  'permissions',
  ARRAY['dept_lead'],
  ARRAY[]::text[]
),

(
  'what-can-a-super-admin-do',
  'What can a super admin do?',
  '**Super Admins** run Nexus with full permissions:

**Users:**
• Invite new users and manage accounts
• Assign roles (member, dept_lead, super_admin)
• Deactivate or reactivate users
• View all user activity and profiles
• Manage permissions and access

**Organization:**
• Manage all departments and teams
• Create multi-department sprints
• View and edit org settings (name, timezone, etc.)
• Manage integrations (Google Calendar, Slack, etc.)

**Tasks & Work:**
• Create, edit, delete tasks across all departments
• Archive or manage all tasks
• Override task permissions and ownership
• View all tasks regardless of department

**Meetings & Communications:**
• Create and manage all meetings
• Send organization-wide communications/announcements
• Access all meeting minutes and logs
• Manage communication templates

**Reporting & Analytics:**
• Full access to all reports and analytics
• Adoption dashboard
• Operational health across org
• User activity and engagement reports

**System Administration:**
• Manage system settings and configuration
• Access support and debugging tools
• Export data and run audits
• Manage API keys and integrations

**Super admins should:**
• Use power carefully (you can break things)
• Follow security best practices
• Document admin actions in audit logs
• Delegate to dept leads when possible',
  'permissions',
  ARRAY['super_admin'],
  ARRAY[]::text[]
),

(
  'why-cant-i-edit-this',
  'Why can''t I edit this?',
  '**Common reasons you can''t edit:**

**Permissions:**
• You''re a **member**, not the task owner or dept lead
• Task is in a **different department** (ask to be added)
• Task is **archived** (can''t edit archived work)

**Status:**
• Task is **completed** (can reopen if needed)
• Sprint is **closed** (archive was locked)
• Meeting minutes are **locked** (ask admin to unlock)

**Ownership:**
• You didn''t **create the item** (only creator or admin can edit)
• Task is **assigned to someone else** (only assignee can update status)

**Workflow:**
• Task is in **Review** status (waiting for approval before editing)
• Meeting **already happened** (minutes are finalized)

**What to do:**
1. **Ask the owner** — Politely request they make the change
2. **Ask your dept lead** — They may have override permissions
3. **Contact admin** — If it''s a mistake or emergency
4. **Leave a comment** — Suggest the change, let owner decide

**To grant edit permissions:**
• Task owner can reassign you as assignee
• Dept lead can make you owner of a task
• Admin can override any permission',
  'permissions',
  ARRAY['super_admin','regional_secretary','dept_lead','pastor','member'],
  ARRAY[]::text[]
),

(
  'who-can-see-meeting-minutes',
  'Who can see meeting minutes?',
  '**Default visibility:**
• **Department members** — Can see their department''s meeting minutes
• **Meeting attendees** — Always see their meeting''s minutes
• **Dept lead** — Can see all minutes from their department
• **Super admin** — Can see all meeting minutes
• **Regional secretary** — Can see their region''s meetings

**Who CANNOT see:**
• **Other departments** — Can''t view another department''s meeting minutes unless shared
• **Casual visitors** — Minutes require authenticated login
• **External people** — Nexus is internal only

**Sharing minutes:**
• Copy meeting link and share with specific people
• Dept lead can grant access to other departments if needed
• Export minutes to PDF/document for distribution

**Private vs public:**
• Meeting minutes are tied to a specific meeting
• They''re not public (all participants must be invited)
• Comment access = can see minutes + comment

**What''s in minutes:**
• Attendees, date, time, location
• Agenda items covered
• Decisions made
• Action items assigned (with due dates)
• Notes and attachments',
  'permissions',
  ARRAY['super_admin','regional_secretary','dept_lead','pastor','member'],
  ARRAY['what-is-meeting-hub']
),

(
  'who-can-view-department-information',
  'Who can view department information?',
  '**Who can view a department:**

• **Department members** — Full access to their department space
• **Department lead** — Full access and management
• **Super admin** — Full access to all departments
• **Regional secretary** — Access to departments in their region
• **Other members** — Can see department name, but not internal tasks (unless shared)

**What they can see:**

**Members with access:**
• All tasks and folders in the department
• Meeting logs and minutes
• Team members and roles
• Department calendar and events
• Health scores and reports

**Members WITHOUT access:**
• Can see the department exists
• Can see department name and lead
• Can see shared items if specifically shared
• Can''t see internal tasks or conversations

**Sharing department info:**
• Dept lead can share specific tasks with other departments
• Share meeting minutes by copying link
• Export reports for stakeholders

**Privacy:**
• RLS ensures you only see what you''re allowed to see
• Cross-department tasks are explicitly shared
• Department data is isolated and secure

**Request access:**
• Ask your department lead to add you
• Or contact super admin to request access to another department',
  'permissions',
  ARRAY['super_admin','regional_secretary','dept_lead','pastor','member'],
  ARRAY[]::text[]
),

(
  'how-do-permissions-work',
  'How do permissions work?',
  '**Nexus uses role-based permissions:**

**Roles:**
• **Member** — Regular team member
• **Dept Lead** — Manages a department
• **Super Admin** — Runs the organization
• **Regional Secretary** — Manages a region

**Permission layers:**

1. **Authentication** — Must be signed in
2. **Role-based** — Your role determines base permissions
3. **Department-based** — You see your department''s data by default
4. **Ownership-based** — You can edit things you created/own
5. **Explicit sharing** — Cross-department shares need permission

**Examples:**
• **Member** can edit own tasks and comment everywhere (dept-scoped)
• **Dept Lead** can edit all tasks in their department
• **Super Admin** can edit anything
• **Shared task** — Other depts can see it only if explicitly shared

**RLS (Row-Level Security):**
• Database-level permission enforcement
• Ensures you can''t access data you shouldn''t
• Automatic — you can''t "bypass" it

**Requesting more access:**
1. Ask your **dept lead** first
2. If they can''t grant it, ask **super admin**
3. Admin must explicitly grant cross-department access

**Best practice:**
• Don''t share sensitive info across departments
• Use department spaces for team-only work
• Explicitly share items that need wider access
• Contact admin if permissions seem wrong',
  'permissions',
  ARRAY['super_admin','regional_secretary','dept_lead','pastor','member'],
  ARRAY[]::text[]
),

-- ─── ADOPTION & HEALTH ────────────────────────────────────────────────

(
  'what-is-an-operational-health-score',
  'What is an operational health score?',
  '**Operational Health Score** measures how well your department is executing work:

**Scored on three areas (each ~33%):**

1. **Task Execution (60%)** — Are tasks getting done on time?
   • % of tasks completed on time
   • % of overdue tasks
   • % of stale tasks (not updated in weeks)

2. **Action Follow-Through (20%)** — Are meeting action items completed?
   • % of actions from meetings completed on time
   • Avg days to close an action item

3. **Adoption (20%)** — Is the team actively using Nexus?
   • % of team members active this week
   • Feature adoption (sprints, meetings, communications usage)

**Score range:**
• **90-100** — Excellent, keep it up!
• **70-89** — Good, some room for improvement
• **50-69** — At risk, needs attention
• **Below 50** — Critical, immediate action needed

**Where to see it:**
• **Dashboard** — Department health widget
• **Reports > Operational Health** (admin only)
• **Department overview** (lead only)

**How to improve:**
• Complete tasks on time (set realistic due dates)
• Follow up on meeting action items
• Keep team active (regular tasks, meetings, updates)
• Use Nexus features regularly',
  'adoption',
  ARRAY['super_admin','regional_secretary','dept_lead'],
  ARRAY[]::text[]
),

(
  'what-does-at-risk-mean',
  'What does At Risk mean?',
  '**"At Risk"** means your department''s health score is between 50-69:

**What''s happening:**
• Some tasks are consistently overdue
• Meeting action items aren''t being followed up
• Team activity is low (people not using Nexus regularly)
• Backlog of work is building up

**Typical causes:**
• Too many commitments (overwhelmed team)
• Unclear priorities or ownership
• Tasks not getting updated/communicated
• Team not trained on Nexus yet
• Leadership not enforcing deadlines

**What to do:**

1. **Review overdue tasks** — Find what''s blocking progress
2. **Prioritize ruthlessly** — Cut low-priority work
3. **Assign clear owners** — One person per task
4. **Set realistic dates** — Don''t over-commit
5. **Hold sync meetings** — Weekly standup to unblock
6. **Follow up on actions** — Track meeting outcomes
7. **Train team** — Make sure everyone uses Nexus
8. **Celebrate wins** — Recognize completed work

**Getting out of At Risk:**
• Aim to get 80%+ of tasks done on time
• Complete 90%+ of meeting action items
• Keep 70%+ of team active weekly

**Monitor progress:**
• Check health score weekly
• Track improvements
• Adjust as needed',
  'adoption',
  ARRAY['super_admin','regional_secretary','dept_lead'],
  ARRAY['what-is-an-operational-health-score']
),

(
  'what-is-adoption-score',
  'What is adoption score?',
  '**Adoption Score** measures how well your organization is using Nexus:

**What it tracks:**
• **Feature adoption** — % of teams using tasks, sprints, meetings, communications
• **User activation** — % of users who signed in and did something
• **Engagement** — % of team active this week/month
• **Feature progression** — Has the team moved from basic to advanced features?

**Levels:**
• **Invited** — Invitation sent, not yet signed up
• **Activated** — Account created
• **Profile Complete** — Set up profile with photo
• **First Task** — Created or updated first task
• **First Meeting** — Attended first meeting
• **Weekly Active** — Used Nexus at least once this week
• **Power User** — Using 3+ features regularly

**Score calculation:**
• % of team at each level
• Higher % at "Power User" = higher adoption
• Track over time to see improvement

**Where to see it:**
• **Adoption Dashboard** (admin only)
• **Reporting > Adoption Metrics**
• Team breakdown by level

**How to increase:**
• Onboard new users properly (profile complete step)
• Encourage feature use (sprints, meetings, communications)
• Lead by example (use Nexus daily)
• Run team training sessions
• Celebrate adoption milestones

**Why it matters:**
• Higher adoption = better team efficiency
• Metrics show ROI of the platform
• Identify which teams need more training',
  'adoption',
  ARRAY['super_admin','regional_secretary','dept_lead'],
  ARRAY[]::text[]
),

(
  'what-does-confidence-mean',
  'What does confidence mean?',
  '**Confidence** refers to the reliability of metrics and scores in Nexus:

**Three confidence levels:**

1. **High Confidence (30+ data points)**
   • Reliable score based on lots of data
   • Safe to make decisions based on this score
   • Example: "Task completion 85%, High Confidence"

2. **Medium Confidence (10-29 data points)**
   • Decent sample size, but still building
   • Use with some caution
   • Example: "Adoption 60%, Medium Confidence — still ramping up"

3. **Low Confidence (<10 data points)**
   • Small sample size, early days
   • Take with a grain of salt
   • Example: "New team, Low Confidence on score yet"

**Why confidence matters:**
• Helps you interpret data correctly
• High confidence = trust the metric
• Low confidence = wait for more data
• Guides decision-making

**Examples:**
• New department: Low confidence, but growing
• Established department: High confidence, reliable metrics
• One-person team: Always lower confidence (small sample)

**In reports:**
• Look for confidence indicators next to scores
• Prioritize high-confidence metrics
• Track how confidence improves over time

**Tip:** Ask Nova "Is our health score reliable?" and it''ll check the confidence level.',
  'adoption',
  ARRAY['super_admin','regional_secretary','dept_lead'],
  ARRAY[]::text[]
),

(
  'what-is-workspace-coach',
  'What is Workspace Coach?',
  '**Workspace Coach** is a coming feature (not yet live) that will provide AI-powered team guidance.

**What it will do:**
• Analyze your team''s Nexus usage patterns
• Identify bottlenecks and inefficiencies
• Suggest best practices based on your team''s style
• Recommend features your team should try
• Alert you to at-risk situations (overdue tasks, low activity, etc.)

**Examples of coaching:**
• "Your team takes 3 days to respond to comments. Try daily standups?"
• "You''re completing 75% of tasks on time. Here''s how high-performing teams hit 90%."
• "Two sprints in a row, 40% incomplete. Consider smaller sprints?"

**Who uses it:**
• Department leads (for their team)
• Super admins (for org health)

**How to access (when available):**
• Go to **Reports > Workspace Coach**
• See recommendations tailored to your team
• Read tips and best practices
• Ask Nova for advice on specific metrics

**For now:**
• Use **Health Score** and **Adoption** reports
• Ask Nova about best practices
• Review this guide for how-tos',
  'adoption',
  ARRAY['super_admin','regional_secretary','dept_lead'],
  ARRAY['what-is-an-operational-health-score']
),

(
  'how-is-onboarding-progress-measured',
  'How is onboarding progress measured?',
  '**Onboarding progress is tracked in 4 steps:**

**Step 1: Profile Complete**
• Measure: User uploaded a profile photo
• Why: Establishes identity, team gets to know each other

**Step 2: Open Department**
• Measure: User navigated to department dashboard
• Why: User is oriented in the team space, sees what the dept is working on

**Step 3: View Tasks**
• Measure: User opened their My Tasks page
• Why: User understands their personal workload

**Step 4: Update a Task**
• Measure: User changed task status, added comment, or made edit
• Why: User is hands-on, actively participating

**Tracking:**
• Automatic — Nexus tracks when each event happens
• No manual effort needed
• Progress shows in onboarding modal
• Completion triggers "All Set!" badge

**Timeline:**
• **First login** — Modal shows "Welcome, 0 of 4 complete"
• **After 1st step** — Shows "1 of 4 complete" with progress bar
• **After 4th step** — Shows "You''re all set!" and badge earned

**Viewing progress:**
• Personal: In onboarding modal on Dashboard
• Dept lead: Dashboard > Onboarding Checklist widget
• Admin: Reports > Adoption > Individual progress

**Why measure:**
• Ensures new users are ramped up
• Identifies who needs support
• Tracks adoption of the platform',
  'adoption',
  ARRAY['super_admin','regional_secretary','dept_lead','pastor','member'],
  ARRAY['how-do-i-complete-onboarding']
),

(
  'what-counts-as-meaningful-activity',
  'What counts as meaningful activity?',
  '**Meaningful Activity** is work that shows the team is actively using Nexus.

**Counted as meaningful:**
• **Task work** — Create, update, or complete tasks
• **Task comments** — Add comments to tasks
• **Meeting creation** — Schedule a meeting
• **Meeting minutes** — Record minutes from a meeting
• **Action items** — Assign action items
• **Sprint updates** — Move tasks on sprint board
• **Status changes** — Update task status
• **Profile updates** — Update profile info
• **Communications** — Send campaigns or messages

**NOT counted (passive):**
• Just viewing tasks (lurking)
• Scrolling through feed
• Opening but not engaging
• Reading emails

**Why it matters:**
• **Adoption tracking** — Shows who''s really using Nexus
• **Health metrics** — Active users = healthy team
• **Engagement** — Distinguishes "users" from "participants"
• **Reporting** — Reports show % team "active this week"

**What counts as "active this week":**
• At least one meaningful activity in the past 7 days
• Example: Posted a comment, updated task, attended meeting

**How to stay active:**
• Create or update tasks regularly
• Comment and respond to mentions
• Use Nexus as your primary work tool
• Engage with your team''s sprints and meetings

**Tip:** Ask Nova "Is our team active this week?" to see current engagement.',
  'adoption',
  ARRAY['super_admin','regional_secretary','dept_lead','pastor','member'],
  ARRAY[]::text[]
),

-- ─── NOVA ─────────────────────────────────────────────────────────────

(
  'what-can-nova-help-me-with',
  'What can Nova help me with?',
  '**Nova can help with:**

**How-to questions:**
• "How do I create a task?"
• "How do I take meeting minutes?"
• "Where do I find my tasks?"

**Feature guidance:**
• "What''s a sprint?"
• "How do dependencies work?"
• "What''s the difference between My Tasks and department tasks?"

**Best practices:**
• "What should I do first after signing in?"
• "How do we improve our health score?"
• "What''s a good sprint length?"

**Troubleshooting:**
• "Why can''t I edit this task?"
• "Why didn''t I get a notification?"
• "How do I enable push notifications?"

**Status & reports:**
• "What''s our adoption score?"
• "Is our health at risk?"
• "How many tasks are overdue?"

**Navigation:**
• "Where are my tasks?"
• "How do I find past meetings?"
• "Where do I manage permissions?"

**Ask Nova anything about Nexus!**
• Click the Nova chat icon (bottom right)
• Ask a question in natural language
• Nova will search its knowledge base and answer',
  'nova',
  ARRAY['super_admin','regional_secretary','dept_lead','pastor','member'],
  ARRAY[]::text[]
),

(
  'what-information-can-nova-access',
  'What information can Nova access?',
  '**Nova can see:**
• Tasks in your department
• Sprints you''re part of
• Meetings you attended
• Your personal profile
• Public reporting data (health, adoption, etc.)

**Nova CANNOT see:**
• Private tasks from other departments (unless shared)
• Personal data of other users (unless they shared it)
• System settings or admin configuration
• Email addresses or phone numbers
• Financial or sensitive data

**Privacy:**
• Nova respects your RLS permissions (same rules as UI)
• You only see what you''re allowed to access
• Cross-department data is never shared
• Queries are logged for quality assurance

**How Nova knows what you can access:**
• Your role (member, dept lead, super admin)
• Your department
• Your team assignments
• Explicit shares with you

**What Nova remembers:**
• Conversation within the chat session
• Your previous questions (to provide better answers)
• Your team/department (to give personalized advice)

**For admins:**
• Nova can see org-wide metrics
• Can query across all departments
• Can access admin-only reporting

**Data security:**
• No data is stored in Nova conversations
• Chats are not permanent (cleared on logout)
• All access follows RLS and security policies',
  'nova',
  ARRAY['super_admin','regional_secretary','dept_lead','pastor','member'],
  ARRAY[]::text[]
),

(
  'can-nova-see-private-data',
  'Can Nova see private data?',
  '**No, Nova respects privacy.**

**Private data Nova CANNOT see:**
• **Department A''s tasks** if you''re in Department B
• **Personal tasks** of other users
• **Private meeting minutes** not shared with you
• **Passwords, emails, phone numbers, PII**
• **System configuration or admin settings**
• **Financial data or sensitive docs**

**Privacy rules:**
• Nova follows the same RLS as Nexus UI
• You can only ask Nova about things you can access
• Cross-department data is never visible
• Personal data is never shared across users

**What Nova CAN see (that you can access):**
• Your department''s tasks
• Meetings you attended
• Sprints you''re in
• Shared tasks from other departments
• Public reporting (health, adoption)

**Examples:**

**You can ask Nova:**
• "What''s my team''s health score?" (your dept only)
• "How many tasks are overdue in my list?" (your tasks)
• "Can you summarize the all-hands meeting?" (if you attended)

**You CANNOT ask Nova:**
• "What''s Admin department working on?" (private)
• "Show me John''s personal tasks?" (private)
• "What''s the CEO''s email?" (private)

**If you ask about something private:**
• Nova will say "I don''t have access to that"
• Won''t show you the data
• Won''t break your privacy

**Trust Nova:**
• Designed with privacy first
• No loopholes or tricks
• Secure and audited',
  'nova',
  ARRAY['super_admin','regional_secretary','dept_lead','pastor','member'],
  ARRAY[]::text[]
),

(
  'can-nova-update-tasks',
  'Can Nova update tasks?',
  '**No, Nova cannot update or modify tasks.**

**What Nova CAN do:**
• View and summarize tasks
• Answer questions about tasks
• Suggest what to do with a task
• Search for tasks by keyword
• Explain task status and workflow

**What Nova CANNOT do:**
• Create, edit, or delete tasks
• Change task status
• Assign tasks to people
• Add comments or attachments
• Update deadlines or priority

**Why the limitation:**
• Prevents accidental or unauthorized changes
• Keeps Nexus audit trail clear (humans made the change)
• Protects data integrity
• You maintain full control

**What to do instead:**
1. **Ask Nova to summarize** — "What does the Design task say?"
2. **Ask for suggestions** — "Should I change this to In Progress?"
3. **Make the change yourself** — Open task, update it
4. **Confirm with Nova** — "I updated it, does that make sense?"

**Example:**
• **You:** "What''s blocking the Design task?"
• **Nova:** "It says waiting for client feedback. Also needs color specs."
• **You:** "Got it, let me update the status and add a comment."
• **You:** [Update task in Nexus]
• **You:** "Done, I added a note about waiting for specs."

**Reporting:**
• Your changes appear in activity log (not Nova''s)
• You''re always the one making decisions',
  'nova',
  ARRAY['super_admin','regional_secretary','dept_lead','pastor','member'],
  ARRAY[]::text[]
),

(
  'can-nova-create-meetings',
  'Can Nova create meetings?',
  '**No, Nova cannot create or schedule meetings.**

**What Nova CAN do:**
• Summarize meeting notes and minutes
• Answer questions about past meetings
• Suggest meeting agenda items
• Explain meeting best practices
• Find past meetings by topic or date

**What Nova CANNOT do:**
• Schedule a new meeting
• Send meeting invites
• Add attendees
• Set meeting time
• Manage recurring meetings

**Why the limitation:**
• Prevents accidentally scheduling conflicts
• Keeps meeting invites from "real people"
• You control your calendar
• Ensures attendees get proper notifications

**What to do instead:**
1. **Ask Nova for help planning** — "What should our standup agenda be?"
2. **Create the meeting yourself** — Go to Meetings > New Meeting
3. **Ask Nova to review** — "Does this agenda look good?"

**Example workflow:**
• **You:** "Nova, what topics should we cover in our weekly?"
• **Nova:** "Based on open tasks, I''d suggest: Sprint status, blockers, upcoming deadlines, celebrations."
• **You:** [Create meeting in Nexus]
• **You:** "Nova, I created the meeting. Can you remind me what to cover?"
• **Nova:** "Absolutely! Focus on those 4 items."

**Coming soon:**
• Nova may eventually have permission to schedule meetings
• For now, you''re in full control',
  'nova',
  ARRAY['super_admin','regional_secretary','dept_lead','pastor','member'],
  ARRAY[]::text[]
),

(
  'why-cant-nova-answer-this',
  'Why can''t Nova answer this?',
  '**Common reasons Nova can''t answer:**

1. **Private data** — Asking about another person''s tasks or data
   • Ask instead: "What should I do about my task?"

2. **Out of scope** — Asking about things outside Nexus
   • Ask instead: "How do I do X in Nexus?"

3. **Too specific** — Asking about detailed business decisions
   • Ask instead: "What are best practices for sprint planning?"

4. **Requesting action** — Asking Nova to update, create, or delete
   • Do instead: "What should I change?" → Make the change → "Did I do that right?"

5. **System administration** — Asking about admin config
   • Ask instead: "How do I manage team permissions?"
   • (If you''re admin, Nova can help more)

6. **Technical issues** — Bugs or system problems
   • Report instead: Use Support > File a ticket

7. **Unclear question** — Nova isn''t sure what you''re asking
   • Rephrase: Be specific, give context
   • Example: "How do I prioritize tasks?" vs "What should I do?"

**How to get answers:**

1. **Rephrase the question** — Be specific
2. **Provide context** — "I''m a dept lead, we''re planning a sprint"
3. **Ask for guidance** — "What''s the best way to...?"
4. **Ask Nova directly** — "Why can''t you answer that?"

**If still stuck:**
• Ask your **dept lead** for guidance
• Contact **support** for technical issues
• Message **super admin** for admin questions',
  'nova',
  ARRAY['super_admin','regional_secretary','dept_lead','pastor','member'],
  ARRAY[]::text[]
),

(
  'how-does-nova-know-what-i-can-access',
  'How does Nova know what I can access?',
  '**Nova uses several signals to understand your permissions:**

**1. Your Role**
• **Member** → Nova knows you can see your dept and shared items
• **Dept Lead** → Nova knows you can see your whole dept + org reports
• **Super Admin** → Nova knows you see everything

**2. Your Department**
• Your home department is known to Nova
• Your tasks and meetings from that dept are visible
• Cross-dept access requires explicit shares

**3. Your Team Assignments**
• Sprints you''re in → Nova can discuss those tasks
• Teams you''re part of → Nova sees your team''s work
• Meetings you attended → Nova can reference them

**4. Shared Items**
• Tasks explicitly shared with you → Nova can see
• Department tasks shared cross-dept → Nova knows
• Public reports → Nova can discuss

**Security checks:**
• Nova runs RLS checks before answering
• If you ask about private data → Nova says "I don''t have access"
• No way to "trick" Nova into sharing private data

**Examples:**

**Scenario 1 — You''re a member:**
• Ask: "What are my tasks?" → Nova lists them ✓
• Ask: "What''s Admin dept working on?" → Nova: "I don''t have access" ✓

**Scenario 2 — You''re dept lead:**
• Ask: "What''s our health score?" → Nova shows it ✓
• Ask: "What''s Pastors dept health?" → Nova: "I can''t see that dept" ✓

**Scenario 3 — You''re super admin:**
• Ask: "Show me all tasks across org" → Nova lists them ✓
• Ask: "What''s John''s password?" → Nova: "I can''t access that" ✓

**Privacy by design:**
• Nova is built with your permissions in mind
• Same rules as Nexus UI apply
• No shortcuts or backdoors
• Audited for security',
  'nova',
  ARRAY['super_admin','regional_secretary','dept_lead','pastor','member'],
  ARRAY[]::text[]
)

on conflict (slug) do nothing;
