# Nexus — Complete Feature Catalog

This document is the exhaustive breakdown of every feature in Nexus. For a quick overview, see [README.md](../README.md).

---

## Task Management

**Views**
- Kanban board with drag-drop across statuses
- List view with inline editing
- Table view with sortable columns
- Calendar view — tasks plotted by due date across month/week
- Custom filters by status, assignee, due date, priority, tags

**Status System**
- 5 org-wide canonical statuses: To Do, In Progress, Review, Completed, Cancelled
- Per-department custom statuses mapped to org statuses
- Status management UI (Settings → Status Management)
- Custom colors per status

**Task Fields**
- Assignee (single or multiple)
- Priority: Urgent, High, Medium, Low
- Due date (with time)
- Subtasks with progress bar
- Tags
- Custom fields (extensible)
- Dependencies (blocks/blocked-by relationships)

**Interactions**
- @mention notifications (assignee inbox + desktop popup)
- Rich-text comments with Tiptap editor
- File attachments on comments
- Comment reply threads
- Comment → subtask conversion
- Task followers (subscribe for activity updates)
- iCal feed export (followers only)
- Activity log (every edit, assignment, status change)
- Me Mode toggle — filter any list to your assignments only
- Optimistic updates with rollback on error

**Organization**
- Space → Folder → List hierarchy
- Space-scoped (department-based)
- Folder favorites

**Advanced**
- Idea Bank — capture quick ideas attached to tasks or spaces
- Task dependencies (visual blocking)
- Archive/Trash — soft-delete with restoration
- Bulk actions (select multiple, change status/assignee)

---

## Personal Planning

### My Tasks
- **Today** sidebar view — cross-space, status-deduplicated
- **Tomorrow** sidebar view
- Shows only your assigned tasks from all departments

### Personal List (`/personal-list`)
- Private task list (only you can see)
- Single-level sublists: "This Week", "Someday", "Waiting" (customizable)
- Pinned tasks surfaced at top
- Rich-text descriptions
- Due dates and priority

### Time-Blocking Planner (`/planner`)
- Daily timeline view (60-minute blocks, 5am–9pm)
- Drag tasks from your task list onto the timeline
- Visual blocking (visual overlap shows scheduling conflicts)
- Auto-calculates task duration from due time
- Unlink task from planner without deleting
- Warning banner for overbooked days

### Wins (`/wins`)
- Weekly Wins tracker — completed tasks per week
- Visual summary (count + bar chart)
- Cross-space aggregation
- Home dashboard widget

---

## Sprints

**Lifecycle**
- Create sprint with name, dates, description
- Add team members (inline creation, role-based)
- Sprint board — drag-drop task management within sprint scope
- Sprint review — evaluate sprint performance
- Archive (auto-deactivates members)
- Restore archived sprints
- Duplicate sprints
- Edit sprint metadata

**Team Management**
- Temporary membership with auto-expiration for external invites
- Custom token invite flow (avoids Gmail link-scanner)
- Import team from spreadsheet
- Assign team to sprint
- Create new teams inline

**Tracking**
- Sprint progress bar — burn-down visualization
- Sprint overview — members, tasks, dates
- Sprint board — all sprint-scoped tasks by status
- My Sprint Tasks home widget

---

## Meetings

**Planning & Execution**
- Meeting Wizard (3-step: setup, build agenda, preview/export)
- Agenda builder with drag-drop reordering
- Rich-text agenda items
- Expected attendees planning
- Live Minutes Mode — real-time collaborative note-taking during meeting
- Rich-text minutes capture with formatting

**AI & Transcription**
- AI transcription via Whisper WASM (in-browser, no server upload)
- Transcription upload panel
- AI-generated meeting summary editor
- AI processing admin panel for reviewing transcription results

**Meeting Docs**
- Connect a Google Doc to a meeting
- Shared notes URL for collaborative editing
- Doc connection callback

**Attendance**
- Attendance tracking by category: Service, Group, Both
- Attendance trends view with visualization
- Attendance summary widget (dashboard)
- Excel workbook export (consolidated attendance data)
- Historical reporting by department, date range

**Reports & Export**
- Regional report mode
- Per-subgroup report mode
- PDF export with BLW Canada branding
- Public shareable meeting report page
- Public meeting report URL

**Notifications**
- Action items → Task bridge (create tasks directly from agenda items)
- Absence email workflow — template editor, batch confirm modal, send log
- Absence notifications for no-shows
- Email send log (all outbound meeting emails)

**Admin**
- Email templates for meetings
- Email customizer modal
- Email log page (EmailLogPage.jsx)
- Absence email log page
- Meeting share modal

---

## Ministry Calendar

**Calendar Views**
- Department-scoped event calendar
- Custom event types (e.g. "Evangelism", "Youth Group", "Worship")
- Category visibility matrix (per-category department access)
- Mini calendar for date navigation
- Draggable calendar events
- Event list view

**Google Calendar Integration**
- OAuth connection for shared Google account
- Add multiple calendar sources from Google
- Sync on demand or via push
- Two-way sync (events synced back to Google)
- Multiple sources can push simultaneously
- Calendar sources management panel
- Per-source visibility controls

**External Calendar Sync**
- Outlook Calendar integration
- Teams Calendar support
- Zoom integration (callbacks)

**Event Management**
- Create, edit, delete events
- Event form with rich metadata
- Draggable event creation
- Event type management (admin)
- Custom event properties

**Task Integration**
- Global task feed panel — subscribe your tasks to the calendar
- Task feed subscription panel
- iCal feed export (personal tasks)
- Task → Calendar subscribers can view tasks as calendar items

**RSVP System**
- Shareable invite links with token-based responses
- Public RSVP page (no auth required)
- RSVP analytics dashboard
- Attendance tracking (yes/no/maybe)
- Attendee list management

**Calendar Administration**
- Calendar management page (sources, event types, settings)
- Calendar review page
- Calendar settings (permissions, visibility, integrations)
- Calendar approval queue (event submissions)
- Event type edit modal

---

## Communications Hub

**Email Campaigns**
- Visual campaign builder (drag-drop content blocks)
- Email composer with rich text (Tiptap)
- HTML editor
- Email templates (reusable branded templates)
- Email signature editor (personal signature applied to all outbound emails)
- Live preview before send

**Scheduling & Delivery**
- Send now or schedule for later
- A/B testing with winner selection
- Resend as delivery provider
- Bounce webhook integration (auto-suppress on bounce)

**Audience & Segments**
- Audience picker — target by department, role, or individual
- Advanced segment builder — filter by any combination of attributes
- Saved segments for reuse
- Suppression list management — manually suppress or auto-suppress on bounce
- Recipients page — view all recipients per campaign

**Analytics & Tracking**
- Click tracking (per-recipient, per-link)
- Open tracking (per-recipient)
- Open rate chart
- Analytics dashboard with engagement metrics
- Campaign performance page

**RSVP & Follow-up**
- Create RSVP invitations (separate from email campaigns)
- Shareable invite links
- Public RSVP page
- Attendance analytics
- Absentee follow-up — one-click email to non-respondents
- Invitations list page (view all invitations)
- Invitation detail page (per-invitation view/responses)
- Invitation wizard (step-by-step creation)

**Special Emails**
- Weekly recap emails — auto-summarize team task completions
- Onboarding nudge emails — 4-day-inactive reminders for new users
- Email send log (all outbound email tracking)

**Admin**
- Email admin page (org-level email management)
- Send confirmation modal before dispatch
- Subscription management (users can subscribe/unsubscribe)
- Unsubscribe page (public)
- Confirm subscription page (verification after signup)

---

## Dashboard (Customizable Widgets)

Build your home dashboard from a library of 18+ widgets:

| Widget | What it shows | Data source |
|---|---|---|
| Activity Feed | Real-time task/comment/sprint events | Realtime subscriptions |
| Weekly Wins | Completed tasks this week, across team | Tasks table |
| Attendance Summary | Meeting attendance at a glance | Attendance table |
| Completion Rate | % task completion by period | Tasks table |
| Member Activity | Per-person task activity as heatmap | Tasks table |
| Overdue by Member | Who has most overdue tasks | Tasks table |
| Pastoral Members | Flock contact list (pastors only) | Flock contacts |
| Sprint Progress | Active sprint burn-down | Sprints/tasks tables |
| Team Activity Heatmap | Day/hour activity patterns | Activity log |
| Team Workload | Task load distribution across members | Tasks table |
| Upcoming Events | Next calendar events | Calendar events |
| Upcoming Meetings | Next scheduled meetings | Meetings table |
| Flock Calls Due | Pastor contacts due for follow-up | Flock contacts |
| Pastor Meeting Stats | Attendance stats for pastoral meetings | Meetings/attendance |
| Org Report Export | Download full org attendance report | Attendance table |
| Chart Widget | Custom chart from any data (Recharts) | Custom formula |
| Calculation Widget | Custom formula display (KPIs, sums, etc.) | Custom formula |
| Embed Widget | Embed any external URL (iframe) | Custom URL |

**Dashboard Settings**
- Settings → Dashboard Defaults
- Choose default layout per user role/department
- Save custom widget arrangements

---

## Notifications & Inbox

**Notification Types**
- @mention in task comments
- Task assignment
- Comment reply
- Task completion (watchers only)
- Sprint invitation
- Meeting invitation

**Notifications Inbox**
- Real-time inbox (bell icon) with unread count badge
- Notification detail page
- Mark as read/unread
- Delete notification
- Aggregate by type

**Desktop Notifications**
- Browser Notification API popup on @mention
- Requires user permission (one-time prompt)

**Activity Log**
- Platform-wide activity log page
- Filter by user, action, resource type, date range
- Sortable by timestamp
- Export capability (optional)

---

## People & Organization

**Directory**
- All People page — searchable across all departments
- Person detail card (name, role, department, contact info)
- Quick actions (message, invite, assign)

**User Management**
- Users page (admin) — view all users, roles, departments, status
- Invite users (new via token flow)
- Edit user role/department (admin)
- Disable/reactivate users

**Invitations**
- Invitations page — send, track, resend
- Invitation status: pending, accepted, expired
- One-time activation link (token-based)
- Resend invitation
- Revoke invitation

**Departments**
- Departments page — view department membership
- Add/remove members
- View department metadata

**Roles & Permissions**
- Permissions page (admin) — role-based permission matrix
- Roles: super_admin, regional_secretary, dept_lead, pastor, member
- View RLS policies
- API scope management

**Organization Structure**
- **Org Chart** — interactive visual chart (Group Level + Regional Level)
- Editable by regional_secretary and super_admin
- Node layout on fixed 1600×740 canvas
- Accent colors per department
- Text/code/title/sub/details/label editable per node
- Flow labels (arrows between nodes)
- Zoom/pan controls

**Pastoral Assignments**
- Assign members to pastors for oversight
- Pastoral assignments page
- View assignment history
- Edit assignments

**Support System**
- Support page (user-facing) — submit tickets
- Support tickets admin page — manage and respond to tickets

---

## Spaces & Navigation

**Space Overview**
- Per-department dashboard
- Task breakdown by the 5 canonical statuses (widget)
- Recent activity feed
- Department emoji icons
- Customizable department display

**Sidebar Navigation**
- Expandable space → folder → list tree
- Persisted in localStorage (user's navigation state)
- Space favorites (star icon)
- Collapse/expand sections
- Quick search within sidebar

**Space Context Menus**
- Favorite/unfavorite
- Rename space
- Copy space link
- Create folder
- Create list
- View space settings

**Folder & List Management**
- Create folder modal
- Edit folder metadata (name, description)
- Create list modal
- Edit list metadata
- Visibility and share modals (cross-department collaboration)
- SOP (Standard Operating Procedure) lists per space

**Space Integrations**
- Per-space integration tab
- Enable/disable integrations per space
- Space-specific Slack channels
- Space-specific calendar subscriptions

---

## Flock CRM

**Contact Database**
- Per-pastor contact management (Pastors department only)
- Auto-provisioned on first pastor login
- Real-time updates (Realtime subscriptions)

**Contact Fields**
- Name, phone, email, address
- Notes/conversation history
- Last contact date
- Contact frequency
- Flock call status
- Contact picker in meeting attendees

**Visibility & Roles**
- ORS/Admin see workload data only (call frequency, task metrics)
- Media/PFCC see full contact details
- Per-role visibility enforcement via RLS

**Widgets & Dashboards**
- Flock Calls Due widget (dashboard) — contacts due for follow-up
- Pastor Meeting Stats widget — attendance stats for pastoral meetings
- Pastoral Members widget — contact list
- Flock view page — read-only contact list view
- Flock CRM page — full contact management

---

## Registration Ecosystem

**Delegate Registration System** (`/registration`)

**Six Management Tabs:**
1. **Roster** — All delegates (name, department, status)
2. **Registrations** — Per-delegate registration details (flights, room, dietary, etc.)
3. **Flights** — Flight assignments and manifests
4. **Room Assignment** — Drag unassigned registrants to room cards (gender-sorted)
5. **Delegate Compliance** — Allergies, dietary restrictions, special needs
6. [implicit] — Summary/overview

**Public Sign-Up**
- Public registration page (`/registration-public`)
- Self-service delegate sign-up
- No auth required for public page

**Data Management**
- Google Apps Script sync for spreadsheet-based pipelines
- Registration data gap-fill (working list + registrations + manual confirmations)
- Phone number tracking
- Manual confirmation modal

**Guides & Documentation**
- Registration guide page with embedded instructions
- Registration guide content (expandable sections)
- Help for users navigating registration

**Access Control**
- Gated to Pastors department + active sprint/team members

---

## Growth Tracking

**Metrics Dashboard**
- Line chart tracking growth over time
- Per-group breakdowns
- Per-member breakdowns
- Month-over-month navigation
- Reference lines for target/baseline
- Toggle inactive groups
- Trend analysis

---

## Immerse (Built-in E-Reader)

**Reading Experience**
- Full e-reading interface for ministry and development books
- Sentence-by-sentence progress tracking
- Smooth reading flow with controls
- Typography and readability optimizations

**Library Management**
- Books app — browse and manage library
- Library page — view all books, filter, search
- Book cover display
- Reading progress per book
- Recently read tracking

**Annotations**
- Highlight text during reading
- Margin notes (create, view, edit)
- Note card view
- Export highlights and notes

**Reading Tools**
- Mobile player with audio-style controls (play/pause/skip)
- Desktop reading panel
- Settings modal (font size, colors, reading speed)
- Session end modal (save progress)

**Admin Tools**
- Import modal for uploading new books
- Admin panel (manage library, delete books, view stats)

**Access Model**
- Credit-based access system
- Purchase credits modal
- Track user credit balance

---

## Regional Updates

**Leadership Broadcast**
- Regional update composition form
- Pinned update with expiry date
- Auto-show on home dashboard for all members

**Viewing**
- Regional Update widget on home dashboard
- Past updates browsable (admin)
- Update history

---

## BLW CAN Map

**Campus Outreach Map**
- Interactive map of Canadian post-secondary institutions
- Marker clustering for dense campus areas
- Click marker for campus details

**Admin Management**
- Campus edits page — add/edit/delete campuses
- Campus photos settings — upload/manage campus photos
- Map preview

---

## Automations & API

**Automation Rule Engine**
- Rule builder: trigger + action pairs
- **Triggers:** task status change, due date (today/overdue/upcoming), user assignment, task creation
- **Actions:** send email, update task status, assign user, Slack notification, custom webhook
- Rule storage and management
- Enable/disable rules

**Automation Run Log**
- Full audit trail of every automation execution
- Filter by rule, status, date range
- View execution details (what fired, what changed, error messages if any)
- Export capability

**Public Task API**
- REST endpoints: GET /tasks, POST /tasks, PATCH /tasks/:id
- Per-key rate limiting (60 req/min)
- Filtered by department, list_id, assignee
- Authentication via API key (bearer token)

**API Key Management**
- Settings → API Permissions
- Create keys per department/sprint scope
- Scopes: `tasks:read`, `tasks:write`, `wins:read`, `meetings:write`
- Last-used timestamp tracking
- Rotate/revoke keys
- API documentation page (auto-generated from schema)

---

## Birthday Flyer System

**Monthly Birthday Sync**
- Google Sheets monthly sync (Apps Script trigger on 1st of month)
- Automatic task creation per birthday
- Task metadata: assignee (Ella Ukpabia), due date/time (birthday at 11:30 AM), status (To Do), description with checklist template
- Duplicate prevention (checks existing tasks before creation)

---

## Files

**File Browser**
- Platform-wide file browser
- View all attachments linked to tasks, comments, meetings
- Search by filename
- Download files
- Linked to Google Drive via OAuth

---

## Search

**Platform-wide Search**
- Search across tasks, comments, meetings, files
- Full-text search
- Filter by resource type
- Highlight matches
- Quick jump to resource

---

## Settings

| Section | What you configure |
|---|---|
| **Profile** | Name, avatar, bio, display name |
| **Security** | Change password, two-factor (future) |
| **Email Signature** | Personal signature applied to all outbound emails |
| **Dashboard Defaults** | Default widget layout per role/department |
| **Sidebar Tools** | Which tools appear in sidebar shortcuts |
| **Task Behaviour** | Default due dates, status, assignee behaviour |
| **Status Management** | Create/edit/deactivate custom task statuses per space |
| **Integrations** | Org-level: Google Calendar, Google Drive, Slack, Zoom, Outlook, Teams |
| **Personal Integrations** | Google/Outlook task calendar sync; personal connection status |
| **API Permissions** | Manage API keys, scopes, rate limits |
| **Campus Photos** | Upload/manage campus photos (admin only) |
| **Zoom Settings** | Zoom meeting integration config |

---

## Authentication & Authorization

**Login Flow**
1. Supabase Auth (email/password)
2. JWT issued with custom claims (`user_role`, `user_department_id`)
3. JWT hook embeds claims on sign-in
4. Fallback to direct DB lookup if claims absent (pre-hook sessions)

**Invite Flow** (avoids Gmail link-scanner)
1. Create invitation row in DB
2. Generate custom token (not in URL)
3. Send email with token in body
4. User clicks activation link → submits form with token
5. Atomic `invite_external_sprint_member()` RPC creates user + assigns sprint membership

**Roles & Permissions**
- `super_admin` — all departments, all features, user management, platform config
- `regional_secretary` — near super_admin (all data except campus photos and permission management)
- `dept_lead` — full access within their department; can invite, manage sprints/automations/communications
- `pastor` — Pastors space, Flock CRM, Registration, meeting attendance
- `member` — own department, assigned tasks, sprints

**RLS Enforcement**
- All tables have RLS enabled
- Policies resolve current user's department/role from JWT claims
- Super admins bypass department scoping
- Everyone else strictly scoped
- Cross-department access via explicit share tables

---

## External Integrations

| Integration | Type | Use |
|---|---|---|
| Google Calendar | OAuth (read/write) | Two-way calendar sync, event RSVP |
| Google Drive | OAuth + Apps Script | File attachments, document links |
| Google Sheets | Apps Script | Birthday sync, working list sync |
| Slack | Webhooks | Automation notifications |
| Resend | API (transactional) | Email delivery, bounce tracking |
| Outlook | OAuth (calendar) | Calendar sync |
| Teams | Callback | Calendar/meeting integration |
| Zoom | Callback | Meeting integration |

---

*Last updated August 2026*
