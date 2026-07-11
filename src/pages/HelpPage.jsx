import { useMemo, useState } from 'react'
import { Search } from 'lucide-react'
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
        a: 'Planner is a super_admin-only cross-team scheduling view for laying out work across departments and sprints at a glance. It also includes a Weekly Wins board where teams log highlight achievements each week — visible to leadership without digging into task lists.',
      },
      {
        q: 'What is Personal List?',
        a: 'A private task list visible only to you. Use it for personal to-dos, reminders, and notes that don\'t belong in a shared space. You can also "pin" any team task to your Personal List to keep it visible there as a second location — the task still lives in its original space, you\'re just tracking it personally too. Find it under My Tasks → Personal List in the sidebar.',
      },
      {
        q: 'What are Task Followers?',
        a: 'Any team member can follow a task to stay updated on it without being the assignee. Followers receive activity-feed notifications when the task is updated, commented on, or status-changed. Add or remove yourself via the task detail panel.',
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
        a: 'Hover a space in the sidebar and click the + icon, or use "Create folder" / "Create list" from the space\'s quick-add menu. dept_lead and super_admin roles can create spaces themselves via the + next to the "Spaces" section label.',
      },
      {
        q: 'How do task statuses work?',
        a: 'NEXUS uses a two-tier status system. Every department status maps to one of 6 canonical org-wide statuses (Not Started, In Progress, Review, Blocked, Completed, Cancelled), so reporting stays consistent even though each department can customize its own status names and colors.',
      },
      {
        q: 'Can I hide or archive a Space I don\'t use?',
        a: 'Yes — use the "..." menu on a space to Hide it from your sidebar (personal, reversible) or, if you\'re super_admin, Archive it for everyone. Archived spaces live in the collapsible "Archived" section at the bottom of the Spaces list.',
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
      </main>
    </div>
  )
}
