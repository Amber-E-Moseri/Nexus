import { useMemo, useState } from 'react'
import { Search, Headphones } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { FONT_BODY, FONT_HEADING } from '../lib/fonts'

const FAQ_SECTIONS = [
  {
    id: 'getting-started',
    title: 'Getting Started',
    items: [
      {
        q: 'What is BLW CAN NEXUS?',
        a: 'NEXUS is BLW Canada Sub-Region\'s internal operations platform. It replaces ClickUp with a purpose-built workspace covering tasks, meetings, sprints, communications, the ministry calendar, and automations for the 30-person team across 5 departments.',
      },
      {
        q: 'What do the different roles mean?',
        a: 'Roles control what you can see and do. super_admin has full cross-department access. regional_secretary and pastor get region-wide visibility (Flock, attendance, calendar approvals). dept_lead manages their own department\'s spaces, people, and meetings. ors and programs unlock specific feature areas (Communications, Campus tools). member is the default role scoped to their own department.',
      },
      {
        q: 'How is the sidebar organized?',
        a: 'Workspace (Dashboard, Inbox, My Tasks, Ministry Calendar) is always visible. Spaces and Sprints list your department and cross-department areas. Platform groups Meetings and Communications. Below that are role-gated tools (CAN Map, Flock CRM, Settings & Admin) and any external integrations or SOP links your admin has enabled.',
      },
      {
        q: 'What\'s the difference between Inbox and Notifications?',
        a: 'Inbox surfaces items that need your action — task assignments, mentions, approvals. Notifications is a fuller activity log of everything happening across your spaces, read or not.',
      },
    ],
  },
  {
    id: 'dashboard-tasks',
    title: 'Dashboard & My Tasks',
    items: [
      {
        q: 'What does the Dashboard show me?',
        a: 'A cross-space summary: your open tasks, upcoming meetings and calendar events, and department activity, so you don\'t have to visit every space individually to see what\'s next.',
      },
      {
        q: 'How is My Tasks different from the Dashboard?',
        a: 'My Tasks is a focused, filterable list of every task assigned to you across every space and sprint, with sorting by status, priority, and due date. The Dashboard is a higher-level overview; My Tasks is where you actually work through your list.',
      },
      {
        q: 'What is Planner for?',
        a: 'Planner is a personal time-blocking calendar, open to everyone (not role-gated). Drag your tasks onto the weekly grid to schedule when you\'ll actually work on them; it flags overload and scheduling conflicts as you go. It also has a Weekly Wins panel where you log highlight achievements each week.',
      },
      {
        q: 'What happens to a task when I delete it?',
        a: 'Deleting a task sends it to Trash (in the sidebar under My Tasks), not permanent deletion. From Trash you can Restore it back to its original list. Permanently deleting ("Delete Forever") is limited to dept_lead, regional_secretary, and super_admin for that task\'s department, and cannot be undone.',
      },
      {
        q: 'What is Personal List?',
        a: 'A private task list visible only to you. Use it for personal to-dos, reminders, and notes that don\'t belong in a shared space. You can also "pin" any team task to your Personal List to keep it visible there as a second location — the task still lives in its original space, you\'re just tracking it personally too. Find it under My Tasks → Personal List in the sidebar.',
      },
      {
        q: 'What are Task Followers?',
        a: 'Any team member can follow a task to stay updated on it without being the assignee. Followers receive activity-feed notifications when the task is updated, commented on, or status-changed. Click the ☆ Follow button on any task detail panel to start following; click ★ Following to unfollow.',
      },
      {
        q: 'Can I sync my tasks to Google Calendar?',
        a: 'Yes — go to Settings → Personal Integrations → Task Calendar Sync. Once your Google Calendar is connected, toggle "Sync tasks to calendar" on and your assigned tasks with due dates will appear as events in your Google Calendar. Hit "Sync now" to push immediately.',
      },
    ],
  },
  {
    id: 'inbox-notifications',
    title: 'Inbox & Notifications',
    items: [
      {
        q: 'What shows up in my Inbox?',
        a: 'Inbox surfaces items that need your action — task assignments, @mentions, comment replies, and approval requests. Items are grouped by recency (Today / Earlier) and you can filter to show only unread items.',
      },
      {
        q: 'How do I manage Inbox items?',
        a: 'Click any item to open the related task or record. Use the context menu (hover to reveal) to mark as read/unread or delete individual notifications. You can also mark all as read in one click from the top of the page.',
      },
      {
        q: 'How is Notifications different from Inbox?',
        a: 'Notifications is a fuller activity log grouped into Today, This Week, and Earlier. It shows everything happening across your spaces — not just items assigned to you. Use it to stay aware of team activity; use Inbox to focus on what needs your attention.',
      },
      {
        q: 'What notification types are there?',
        a: 'Task assigned, task comment, meeting created, calendar event approved/rejected, @mentions, and system alerts. Each type has its own icon so you can scan the list quickly.',
      },
    ],
  },
  {
    id: 'spaces',
    title: 'Spaces, Folders & Lists',
    items: [
      {
        q: 'What is a Space?',
        a: 'A Space is the top-level container for a department (e.g. Media, ORS, Pastors) or program. Inside a Space, work is organized into Folders, which contain Lists, which contain Tasks.',
      },
      {
        q: 'What are the different Space types?',
        a: 'department spaces map to the 5 org departments. program spaces are cross-department initiatives. personal spaces are private to one user. sandbox spaces are for experimentation and don\'t affect reporting.',
      },
      {
        q: 'How do I create a new folder or list?',
        a: 'Two ways: (1) In the sidebar, hover the space (and a folder, for a list inside it) and click the "+" / "➕ Add list" control that appears. (2) Open the space\'s Overview tab, where the folder/list tree has its own "+ Add List" / "New List" buttons next to each folder and for top-level lists. Creating folders and lists is limited to that space\'s dept_lead and super_admin — regular members won\'t see the + controls. Separately, dept_lead and super_admin can also create whole new spaces via the + next to the "Spaces" section label in the sidebar.',
      },
      {
        q: 'How do task statuses work?',
        a: 'NEXUS uses a two-tier status system. Every department status maps to one of 5 canonical org-wide statuses (To Do, In Progress, Review, Completed, Cancelled), so reporting stays consistent even though each department can customize its own status names and colors.',
      },
      {
        q: 'Do completed or cancelled tasks get deleted automatically?',
        a: 'No — they stay in their list until you manually archive or delete them (or set up an automation to do it). In List view, completed and cancelled tasks are hidden by default to keep things clean. A "Show N closed tasks" button appears at the bottom of the list whenever hidden tasks exist — click it to reveal them, and "Hide closed tasks" to collapse again. Archiving is a separate step: it removes a task from active views and reporting entirely, but it remains searchable and restorable.',
      },
      {
        q: 'Can I hide or archive a Space I don\'t use?',
        a: 'Yes — use the "..." menu on a space to Hide it from your sidebar (personal, reversible) or, if you\'re super_admin, Archive it for everyone. Archived spaces live in the collapsible "Archived" section at the bottom of the Spaces list.',
      },
      {
        q: 'What are Group Spaces?',
        a: 'Group Spaces are shared workspaces for cross-department groups (e.g. a campus team or outreach unit). Members are added via group invitations and automatically gain access to the group\'s space, folders, and lists. Group members see the group space in their sidebar alongside their department space.',
      },
    ],
  },
  {
    id: 'sprints',
    title: 'Sprints',
    items: [
      {
        q: 'What is a Sprint used for?',
        a: 'A Sprint is a time-boxed push (with a team, start/end dates, and status) for focused work that cuts across normal space/task organization — useful for events, launches, or short-term initiatives.',
      },
      {
        q: 'How do I get added to a sprint?',
        a: 'Sprint membership is temporary and auto-expires at the sprint end date. A dept_lead or super_admin adds members when creating or editing the sprint via the Sprint modal (+ next to "Sprints" in the sidebar).',
      },
      {
        q: 'Where do I see sprints outside my own team?',
        a: 'Click "All Sprints" at the bottom of the Sprints section in the sidebar, or visit All Teams from the Sprints list to see active and planning sprints across every department.',
      },
      {
        q: 'What\'s the difference between a single-department, multi-department, and custom sprint — and where do the tasks show up?',
        a: 'A single-department sprint is tied to one space: its tasks automatically surface in that space\'s Board/List/Space Overview stats, in addition to the sprint\'s own board. A multi-department sprint has teams mapped to real departments (e.g. a "Media" team, a "PFCC" team) — each task shows up in its assignee\'s own department space as well as the sprint board, so multiple spaces see a slice of the sprint\'s work. A custom sprint (used for one-off events like a conference or festival) never attaches tasks to any department space, even if its teams happen to reuse department names for convenience — its tasks live only on the sprint\'s own board, keeping one-off event work out of every department\'s regular reporting. If an event sprint\'s tasks are unexpectedly appearing on a department\'s board, its sprint_type is probably set to multi-department when it should be custom.',
      },
    ],
  },
  {
    id: 'meetings',
    title: 'Meetings',
    items: [
      {
        q: 'How do I plan a meeting?',
        a: 'Expand "Meetings" in the sidebar and choose "Plan meeting" (dept_lead, ors, and super_admin only). The wizard walks through attendees, agenda, and scheduling.',
      },
      {
        q: 'What is the Attendee Roster?',
        a: 'A per-meeting-type list of who is expected to attend, used to calculate attendance rates and flag absences automatically.',
      },
      {
        q: 'What are Attendance Trends?',
        a: 'A dashboard (visible to dept_lead, pastor, and super_admin) charting attendance rates over time per department or meeting type, so leaders can spot disengagement early.',
      },
      {
        q: 'How does audio transcription work?',
        a: 'Meetings can be recorded and transcribed in-browser (Whisper WASM — no audio leaves your device unprocessed), then run through AI extraction to auto-generate action items, decisions, and a structured meeting report.',
      },
      {
        q: 'What is the Absence Email Log?',
        a: 'A record of automated absence-follow-up emails sent to members who missed an expected meeting, so you can confirm delivery without digging through email.',
      },
      {
        q: 'Can I share a meeting report outside NEXUS?',
        a: 'Yes — each meeting report has a public share link (/reports/:token) that doesn\'t require login, useful for sharing summaries with people outside the platform.',
      },
    ],
  },
  {
    id: 'calendar',
    title: 'Ministry Calendar',
    items: [
      {
        q: 'What shows up on the Ministry Calendar?',
        a: 'Region-wide events — services, outreach, department activities — pulled from internal submissions and connected external Google calendars, filterable by category and source.',
      },
      {
        q: 'How do I submit an event for approval?',
        a: 'Click "+ Add Event" on the Ministry Calendar; depending on your role it either publishes directly or enters a review queue for dept_lead/super_admin/regional_secretary approval.',
      },
      {
        q: 'Who approves calendar submissions?',
        a: 'super_admin, regional_secretary, and dept_lead can review pending submissions at Calendar Review before they go live region-wide.',
      },
      {
        q: 'How do I connect Google Calendar to the Ministry Calendar?',
        a: 'super_admin only: go to Calendar Settings → Ministry Calendar Sources → "Connect Google Account" and sign in with a shared Google account. This connection covers all sources (org calendar, Birthdays, Holidays, etc.) — each is connected once.',
      },
      {
        q: 'What are Calendar Sources?',
        a: 'A source is a Google calendar (e.g., primary account, Birthdays, shared team calendars) synced into NEXUS. After connecting a Google account, super_admin must add specific sources via "Add calendar" and hit Sync to pull events in.',
      },
      {
        q: 'How do I control which departments can see a Google Calendar source?',
        a: 'In Calendar Settings, each source has a "Everyone" / "N depts" button. Click it to expand department access controls — toggle checkboxes to hide or show that source to each department. No restrictions = everyone sees it; some checked = only those departments see it.',
      },
      {
        q: 'Can I push Nexus events back to Google Calendar?',
        a: 'Yes — in Calendar Settings, each source has a "Push" toggle. When enabled, approved Nexus events sync to that Google calendar. Only sources you own (not read-only shared calendars) can have push enabled.',
      },
      {
        q: 'How often does Google Calendar sync?',
        a: 'Click "Sync now" (↻ button) next to a source to pull the latest events immediately. Automatic background sync is not yet enabled.',
      },
      {
        q: 'How do I subscribe to specific event categories?',
        a: 'Use the subscription manager to pick which event categories (Personal Events, Team Meetings, etc.) sync to your personal iCal feed or connected external calendar, instead of seeing every event.',
      },
      {
        q: 'Can I subscribe to the calendar in Apple Calendar, Google Calendar, or Outlook?',
        a: 'Yes — NEXUS generates a personal iCal feed URL you can paste into any calendar app that supports iCal subscriptions. The feed auto-updates as events are added or changed. Regenerate the token any time from Calendar Settings if you need to revoke a shared link.',
      },
      {
        q: 'Where are calendar admin settings?',
        a: 'Calendar Settings (dept_lead/super_admin only) manages Ministry Calendar Sources (Google connections, sync, push, and per-department visibility), Event Categories (category names and colors), and Event Category Visibility (which departments see which categories). Calendar Review (approval queue) is a separate tab for approving pending submissions.',
      },
    ],
  },
  {
    id: 'communications',
    title: 'Communications',
    items: [
      {
        q: 'Who can access Communications?',
        a: 'super_admin, ors, and anyone with the "programs" feature role. It\'s the native hub for region-wide email campaigns, invitations, and the public mailing-list signup — all built and tracked in one place without leaving NEXUS.',
      },
      {
        q: 'What are Campaigns, Segments, and Recipients?',
        a: 'A Campaign is an email send (broadcast or targeted). Segments are reusable audience filters (e.g. "all Media volunteers"). Recipients is the underlying contact list campaigns and segments draw from.',
      },
      {
        q: 'What does Analytics show?',
        a: 'Open rates, click rates, and bounce/delivery stats per campaign, so you can see what\'s landing and what\'s bouncing.',
      },
      {
        q: 'What is the Invitation / RSVP flow?',
        a: 'Invitation Wizard builds an event invitation with a trackable link; recipients RSVP on a public page (no login needed) and responses roll up into per-invitation analytics on the Invitation Detail page.',
      },
      {
        q: 'What is the Mailing List signup form?',
        a: 'A public-facing form (no login required) where anyone can subscribe to region communications. Submissions feed directly into the Recipients list. Share the link externally — from a bulletin, social post, or event page.',
      },
    ],
  },
  {
    id: 'flock',
    title: 'My Flock & Flock CRM',
    items: [
      {
        q: 'Who sees My Flock?',
        a: 'regional_secretary, pastor, and super_admin. It\'s a pastoral-care view of the congregation members assigned to that person for follow-up, showing contact details, last-contact date, and a log of past interactions.',
      },
      {
        q: 'What is Flock CRM — Pastoral Outreach?',
        a: 'A confidential outreach tracking tool (regional_secretary and super_admin only, under the "Confidential" sidebar section) for logging pastoral contact history. Each person record tracks call/visit notes, follow-up dates, and contact status — scoped per pastor so each leader only sees their own flock.',
      },
      {
        q: 'How do I log a pastoral contact?',
        a: 'Open a person record in Flock CRM → click "Log Contact" (or use the quick-log button in the Home widget). Fill in the date, contact type (call, visit, message), and notes. The entry is saved privately to your record and does not surface to other pastors.',
      },
      {
        q: 'What is voice-to-text call logging?',
        a: 'On a person record, tap the microphone icon to dictate your contact notes by voice. Whisper transcribes the audio in-browser (no audio sent to external servers) and auto-fills the notes field. Useful for logging calls immediately after hanging up, hands-free.',
      },
      {
        q: 'How does the fuzzy person search work?',
        a: 'The person search in Flock CRM tolerates spelling differences — searching "Emeka" also surfaces "Emeka-Chijioke" or "Emeca". If you\'re not finding someone, try a shorter version of the name or their phone number.',
      },
      {
        q: 'Does Flock CRM connect to Meetings?',
        a: 'Yes — when you end a 1-on-1 meeting, NEXUS automatically logs a Flock CRM interaction for the matching contact (matched via the meeting\'s linked contact, the other attendee\'s linked account, or fuzzy name matching against your contacts), using the meeting notes as the summary. That interaction entry shows a "→ Open linked meeting" link back to the full meeting record. This only runs for 1-on-1 meetings you created, and it fails silently if no confident contact match is found — it never blocks ending the meeting.',
      },
      {
        q: 'Where are Flock CRM settings?',
        a: 'Settings → Flock (visible to regional_secretary and super_admin) controls which fields are collected on person records and whether the Flock home widget is shown on your dashboard.',
      },
    ],
  },
  {
    id: 'map-campus',
    title: 'CAN Map & Campus Tools',
    items: [
      {
        q: 'What is CAN Map?',
        a: 'A map view of BLW campuses/locations across the sub-region, open to all users.',
      },
      {
        q: 'Who can edit campus info and photos?',
        a: 'super_admin and ors can edit campus details at Campus Edits and manage campus photo galleries at Campus Photos.',
      },
    ],
  },
  {
    id: 'automations',
    title: 'Automations',
    items: [
      {
        q: 'What are Automation Rules?',
        a: 'Trigger-and-action rules that run automatically without manual intervention. Available to dept_lead and super_admin. Example: "when a task moves to Completed, notify the dept_lead" or "when a task becomes overdue, send a Slack alert."',
      },
      {
        q: 'What triggers are available?',
        a: 'Task triggers: status changed, due date passed (overdue), task assigned, task created. Sprint triggers: sprint started, sprint ended. Meeting triggers: meeting completed. Member triggers: member joined or left a space.',
      },
      {
        q: 'What actions can an automation take?',
        a: 'Send a Slack notification, send an in-app notification to a user or role, change a task\'s status or assignee, create a follow-up task, or send an email via Resend. Actions can be chained — one trigger can fire multiple actions.',
      },
      {
        q: 'How do I create an automation?',
        a: 'Go to Automations in the sidebar → click "+ New Rule" → pick a trigger, set any conditions (e.g. only for a specific space or status), then add one or more actions. Save and toggle the rule active. Rules apply org-wide unless scoped to a specific space or department.',
      },
      {
        q: 'Where can I see what an automation actually did?',
        a: 'Every automation run is logged for audit — click a rule to open its detail panel and view the full run history: timestamp, what triggered it, which action(s) fired, and whether each succeeded or errored.',
      },
      {
        q: 'Why didn\'t my automation fire?',
        a: 'Check the run history first — errors are logged there with a reason. Common causes: the rule is toggled off, the trigger condition wasn\'t fully met (e.g. wrong status name), or the target user has no Slack connected. If the run history is empty, the trigger event never occurred.',
      },
    ],
  },
  {
    id: 'people',
    title: 'People, Invitations & Permissions',
    items: [
      {
        q: 'Where do I manage users and departments?',
        a: 'People Management (visible to super_admin, dept_lead, regional_secretary, pastor) covers Users, Departments, and Pastoral Assignments in one place.',
      },
      {
        q: 'How do I invite a new team member?',
        a: 'From People → Invitations, send an invite by email; the recipient gets a signup link that walks them through setting a password and joining their department.',
      },
      {
        q: 'Who can change permissions?',
        a: 'Only super_admin. Fine-grained role and access changes live under People → Permissions and the separate Admin Permissions page.',
      },
    ],
  },
  {
    id: 'mobile-notifications',
    title: 'Mobile App & Notifications',
    items: [
      {
        q: 'How do I install NEXUS on my iPhone or iPad?',
        a: 'NEXUS is a web app that installs directly from Safari — no App Store needed. Open nexus.blwcanada.org in Safari (must be Safari, not Chrome or Firefox on iOS). Tap the Share button (the box with an arrow at the bottom of the screen), then scroll down and tap "Add to Home Screen." Tap "Add" to confirm. The app will appear on your home screen and opens in full-screen, just like a native app.',
      },
      {
        q: 'How do I install NEXUS on my Android phone?',
        a: 'Open NEXUS in Chrome on Android. You\'ll usually see an "Install" banner at the bottom of the screen — tap it to install. If the banner doesn\'t appear, tap the three-dot menu (⋮) in Chrome and select "Add to Home Screen" or "Install app." The app icon will be added to your home screen and launches in standalone mode.',
      },
      {
        q: 'How do I allow push notifications on Android?',
        a: 'When you first use NEXUS after installing it, the app will ask permission to send notifications — tap "Allow." If you missed or dismissed the prompt: open your Android Settings → Apps → BLW Nexus (or Chrome if not installed) → Notifications → turn on "Allow notifications." You\'ll then receive alerts for task assignments, mentions, inbox items, and calendar events.',
      },
      {
        q: 'How do I allow push notifications on iPhone (iOS)?',
        a: 'Push notifications on iOS require iOS 16.4 or later and the app must be installed to your home screen from Safari first (see "How do I install NEXUS on my iPhone"). Once installed, open the app from your home screen — it will prompt you to allow notifications. If it doesn\'t prompt: go to iOS Settings → scroll down to BLW Nexus → Notifications → toggle "Allow Notifications" on and choose your alert style.',
      },
      {
        q: 'What notifications will I receive?',
        a: 'Task assignments, @mentions, comment replies on tasks you\'re watching, inbox items, calendar event approvals/rejections, and system alerts. Notifications also appear in-app in your Inbox and Notifications pages, so you won\'t miss anything even if push is off.',
      },
      {
        q: 'Can I use NEXUS offline?',
        a: 'Partially. The app shell and recently visited pages load offline thanks to the service worker cache. However, live data (tasks, messages, calendar) requires an internet connection to fetch or update. If you lose connection, an offline indicator appears and the app will sync automatically when reconnected.',
      },
    ],
  },
  {
    id: 'activity-files',
    title: 'Activity Log & Files',
    items: [
      {
        q: 'What is the Activity Log?',
        a: 'A chronological audit trail (dept_lead and super_admin only) of every action taken across the platform — task creates, status changes, meeting updates, permission changes, and more. Filter by user, date range, or entity type to find exactly what happened and when.',
      },
      {
        q: 'Can I export the Activity Log?',
        a: 'Yes — click the download icon at the top of the Activity Log to export a filtered CSV of all visible entries.',
      },
      {
        q: 'What is the Files page?',
        a: 'A centralized view (dept_lead and super_admin only) of every file attachment uploaded across tasks, meetings, sprints, and spaces. Search by name, filter by entity type, preview files in-app, or download them directly.',
      },
    ],
  },
  {
    id: 'support',
    title: 'Support & Tickets',
    items: [
      {
        q: 'How do I get help inside NEXUS?',
        a: 'Visit Help & FAQ (this page) for self-service answers, or click "Get Support" at the bottom to submit a support ticket. Your ticket goes directly to super_admin for review.',
      },
      {
        q: 'What can I submit a ticket for?',
        a: 'Four categories: General Support (questions or help), Task Request (ask an admin to create or modify something), Bug Report (something isn\'t working), and Feature Request (suggest an improvement). Set a priority (low, normal, high, urgent) so admins can triage.',
      },
      {
        q: 'How do ticket replies work?',
        a: 'Once submitted, your ticket opens a real-time chat thread between you and admin. You\'ll see replies appear instantly — no need to refresh. The ticket status moves from Open → In Progress → Resolved → Closed as the admin works on it.',
      },
      {
        q: 'Where do admins manage tickets?',
        a: 'super_admin can access the Support Tickets admin page to see all submitted tickets, filter by status or category, reply, and update ticket status.',
      },
    ],
  },
  {
    id: 'settings',
    title: 'Settings & Integrations',
    items: [
      {
        q: 'What\'s configurable in Settings?',
        a: 'Your profile, email signature, security (password/2FA), task behavior defaults, dashboard defaults, sidebar tool visibility, and — for super_admin — org-wide integration status.',
      },
      {
        q: 'How do I connect my Google Calendar or other personal integrations?',
        a: 'Go to Settings → Personal Integrations → click "Connect" next to the integration you want. Google Calendar: authorise with your Google account and select which calendar to sync. Google Drive: authorise and pick a default folder for exported reports. Slack: enter your workspace URL and authorise — you\'ll then receive NEXUS notifications as Slack DMs. Outlook and Teams follow the same OAuth flow. These are per-account; they don\'t affect org-wide settings.',
      },
      {
        q: 'How do I set up org-wide integrations (Slack workspace, Google shared account)?',
        a: 'super_admin only: Settings → Org Integrations. Slack workspace integration: paste the Slack Incoming Webhook URL from your Slack App settings — this is what automations and system alerts post to. Google shared account: used for the Ministry Calendar Google sync (see Calendar Settings → Sources). Resend email: the API key and sender domain are configured here for all outbound campaign and notification emails.',
      },
      {
        q: 'Where\'s the API documentation?',
        a: 'Settings → API Docs lists every endpoint (tasks, spaces, folders, lists, sprints) with request/response examples, auth header format, and rate limits — for anyone building external integrations against NEXUS.',
      },
    ],
  },
]

function normalize(text) {
  return text.toLowerCase()
}

export default function HelpPage() {
  const [query, setQuery] = useState('')
  const [openId, setOpenId] = useState(null)
  const navigate = useNavigate()

  const filteredSections = useMemo(() => {
    const q = normalize(query.trim())
    if (!q) return FAQ_SECTIONS
    return FAQ_SECTIONS
      .map((section) => ({
        ...section,
        items: section.items.filter(
          (item) => normalize(item.q).includes(q) || normalize(item.a).includes(q),
        ),
      }))
      .filter((section) => section.items.length > 0)
  }, [query])

  const totalMatches = filteredSections.reduce((sum, s) => sum + s.items.length, 0)

  return (
    <div className="flex gap-6 p-6" style={{ background: 'var(--bg-app)', minHeight: '100vh', fontFamily: FONT_BODY }}>
      <aside className="w-64 flex-shrink-0 hidden lg:block">
        <div className="sticky top-6 rounded-2xl border border-[var(--border-1)] bg-white p-5 shadow-sm">
          <h3 className="mb-4 text-sm uppercase tracking-wide" style={{ fontFamily: FONT_HEADING, fontWeight: 600, color: 'var(--ink-3)' }}>
            Topics
          </h3>
          <nav className="space-y-1">
            {FAQ_SECTIONS.map((section) => (
              <a
                key={section.id}
                href={`#${section.id}`}
                className="block px-3 py-2 rounded-lg text-sm transition"
                style={{ color: 'var(--ink-2)' }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--purple-tint)'; e.currentTarget.style.color = 'var(--purple-700)' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--ink-2)' }}
              >
                {section.title}
              </a>
            ))}
          </nav>
        </div>
      </aside>

      <main className="flex-1 max-w-3xl">
        <div className="mb-6 rounded-2xl border border-[var(--border-1)] bg-white p-6 shadow-sm">
          <h1 className="text-2xl" style={{ fontFamily: FONT_HEADING, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--ink-1)' }}>
            Help & FAQ
          </h1>
          <p className="mt-2 text-sm" style={{ color: 'var(--ink-2)' }}>
            How to use NEXUS and what each feature is for. Search or browse by topic.
          </p>

          <div className="mt-5 relative">
            <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-3)' }} />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search questions, e.g. &quot;invite&quot; or &quot;calendar&quot;"
              className="w-full text-sm outline-none"
              style={{
                padding: '10px 12px 10px 36px',
                border: '1px solid var(--border-1)',
                borderRadius: 10,
                color: 'var(--ink-1)',
              }}
            />
          </div>
          {query.trim() ? (
            <div className="mt-3 text-xs" style={{ color: 'var(--ink-3)' }}>
              {totalMatches} {totalMatches === 1 ? 'result' : 'results'} for "{query.trim()}"
            </div>
          ) : null}
        </div>

        {filteredSections.length === 0 ? (
          <div className="rounded-2xl border border-[var(--border-1)] bg-white p-6 shadow-sm text-sm" style={{ color: 'var(--ink-2)' }}>
            No matches. Try a different search term.
          </div>
        ) : (
          <div className="space-y-6">
            {filteredSections.map((section) => (
              <div key={section.id} id={section.id} className="rounded-2xl border border-[var(--border-1)] bg-white p-6 shadow-sm scroll-mt-6">
                <h2 className="mb-4 text-lg" style={{ fontFamily: FONT_HEADING, fontWeight: 700, color: 'var(--ink-1)' }}>
                  {section.title}
                </h2>
                <div className="space-y-2">
                  {section.items.map((item) => {
                    const itemId = `${section.id}::${item.q}`
                    const isOpen = openId === itemId
                    return (
                      <div key={itemId} style={{ borderBottom: '1px solid var(--border-1)' }}>
                        <button
                          type="button"
                          onClick={() => setOpenId(isOpen ? null : itemId)}
                          className="w-full flex items-center justify-between gap-3 text-left"
                          style={{ padding: '12px 2px', background: 'transparent', border: 'none', cursor: 'pointer' }}
                        >
                          <span className="text-sm" style={{ fontWeight: 600, color: 'var(--ink-1)' }}>
                            {item.q}
                          </span>
                          <span
                            style={{
                              flexShrink: 0,
                              color: 'var(--purple-700)',
                              fontSize: 14,
                              transform: isOpen ? 'rotate(45deg)' : 'rotate(0deg)',
                              transition: 'transform 0.15s',
                            }}
                          >
                            +
                          </span>
                        </button>
                        {isOpen ? (
                          <p className="text-sm" style={{ padding: '0 2px 14px', color: 'var(--ink-2)', lineHeight: 1.6 }}>
                            {item.a}
                          </p>
                        ) : null}
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
        {/* Contact admin CTA */}
        <div className="rounded-2xl border border-[var(--border-1)] bg-white p-6 shadow-sm" style={{ marginTop: 24, display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: '#f0eafb', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Headphones size={20} style={{ color: '#4C2A92' }} />
          </div>
          <div style={{ flex: 1 }}>
            <p style={{ fontFamily: FONT_HEADING, fontWeight: 700, fontSize: 15, color: 'var(--ink-1)', marginBottom: 3 }}>
              Still need help?
            </p>
            <p style={{ fontSize: 13, color: 'var(--ink-3)' }}>
              Can't find what you're looking for? Submit a request and your admin will respond in-app.
            </p>
          </div>
          <button
            type="button"
            onClick={() => navigate('/support')}
            style={{ padding: '9px 18px', background: '#4C2A92', color: '#fff', border: 'none', borderRadius: 10, fontFamily: FONT_BODY, fontSize: 13, fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}
          >
            Get Support
          </button>
        </div>
      </main>
    </div>
  )
}
