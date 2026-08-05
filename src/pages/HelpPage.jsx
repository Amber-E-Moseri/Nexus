import { useMemo, useState } from 'react'
import { Search, Headphones, X } from 'lucide-react'
import { FONT_BODY, FONT_HEADING } from '../lib/fonts'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { createNotification } from '../features/notifications/lib/notifications'

const TICKET_CATEGORIES = [
  { value: 'support', label: 'General Support', color: '#6366f1', bg: '#eef2ff' },
  { value: 'task_request', label: 'Task Request', color: '#0891b2', bg: '#ecfeff' },
  { value: 'bug', label: 'Bug Report', color: '#dc2626', bg: '#fef2f2' },
  { value: 'feature_request', label: 'Feature Request', color: '#16a34a', bg: '#f0fdf4' },
]

async function notifySuperAdmins(type, payload) {
  const { data: admins } = await supabase.from('users').select('id').eq('role', 'super_admin')
  for (const admin of admins ?? []) {
    createNotification(admin.id, type, payload).catch(() => {})
  }
}

function SupportModal({ onClose, userId, userName }) {
  const [form, setForm] = useState({ title: '', description: '', category: 'support', priority: 'normal' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [done, setDone] = useState(false)

  async function submit(e) {
    e.preventDefault()
    if (!form.title.trim() || !form.description.trim()) return
    setSaving(true)
    setError(null)
    const { error: err } = await supabase.from('support_tickets').insert({
      title: form.title.trim(),
      description: form.description.trim(),
      category: form.category,
      priority: form.priority,
      submitted_by: userId,
    })
    if (err) { setError(err.message); setSaving(false); return }
    notifySuperAdmins('support_ticket_submitted', {
      title: form.title.trim(),
      category: form.category,
      submitter_name: userName,
      link: '/admin/tickets',
    })
    setDone(true)
    setSaving(false)
  }

  return (
    <>
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, background: 'rgba(14,14,30,.35)', zIndex: 400 }}
      />
      <div style={{
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        width: 'min(520px, 92vw)',
        background: 'var(--surface-card)',
        border: '1px solid var(--border-1)',
        borderRadius: 20,
        boxShadow: '0 20px 60px rgba(28,22,16,.18)',
        zIndex: 401,
        fontFamily: FONT_BODY,
        overflow: 'hidden',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 22px', borderBottom: '1px solid var(--border-1)' }}>
          <span style={{ fontFamily: FONT_HEADING, fontWeight: 700, fontSize: 15, color: 'var(--ink-1)' }}>Submit a Support Request</span>
          <button type="button" onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--ink-3)', padding: 4, display: 'flex' }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ padding: '20px 22px' }}>
          {done ? (
            <div style={{ textAlign: 'center', padding: '24px 0' }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>✅</div>
              <p style={{ fontFamily: FONT_HEADING, fontWeight: 700, fontSize: 15, color: 'var(--ink-1)', marginBottom: 6 }}>Request submitted!</p>
              <p style={{ fontSize: 13, color: 'var(--ink-3)', marginBottom: 20 }}>Your admin has been notified and will respond in-app.</p>
              <button type="button" onClick={onClose} style={{ padding: '9px 22px', borderRadius: 10, border: 'none', background: 'var(--purple-700)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                Close
              </button>
            </div>
          ) : (
            <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 6 }}>Type of request</label>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {TICKET_CATEGORIES.map((c) => (
                    <button
                      key={c.value}
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, category: c.value }))}
                      style={{
                        padding: '5px 12px', borderRadius: 99, border: '2px solid',
                        borderColor: form.category === c.value ? c.color : 'transparent',
                        background: form.category === c.value ? c.bg : 'var(--surface-sub)',
                        color: form.category === c.value ? c.color : 'var(--ink-2)',
                        fontFamily: FONT_BODY, fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
                      }}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 5 }}>
                  Title <span style={{ color: '#dc2626' }}>*</span>
                </label>
                <input
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder="Brief summary of your request"
                  required
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 10, border: '1px solid var(--border-1)', fontFamily: FONT_BODY, fontSize: 13, color: 'var(--ink-1)', outline: 'none', boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 5 }}>
                  Description <span style={{ color: '#dc2626' }}>*</span>
                </label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder="Describe the issue or request in detail."
                  required
                  rows={4}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 10, border: '1px solid var(--border-1)', fontFamily: FONT_BODY, fontSize: 13, color: 'var(--ink-1)', outline: 'none', resize: 'vertical', boxSizing: 'border-box' }}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--ink-2)', marginBottom: 5 }}>Priority</label>
                  <select
                    value={form.priority}
                    onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}
                    style={{ padding: '8px 12px', borderRadius: 10, border: '1px solid var(--border-1)', fontFamily: FONT_BODY, fontSize: 13, color: 'var(--ink-1)', background: 'var(--surface-card)', cursor: 'pointer' }}
                  >
                    {['low', 'normal', 'high', 'urgent'].map((p) => (
                      <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
                    ))}
                  </select>
                </div>
                <div style={{ flex: 1 }} />
                {error && <p style={{ fontSize: 12, color: '#dc2626', margin: 0 }}>{error}</p>}
                <button
                  type="submit"
                  disabled={saving || !form.title.trim() || !form.description.trim()}
                  style={{
                    padding: '9px 20px', borderRadius: 10, border: 'none', alignSelf: 'flex-end',
                    background: (saving || !form.title.trim() || !form.description.trim()) ? 'var(--surface-sub)' : 'var(--purple-700)',
                    color: (saving || !form.title.trim() || !form.description.trim()) ? 'var(--ink-3)' : '#fff',
                    fontFamily: FONT_BODY, fontSize: 13, fontWeight: 700,
                    cursor: (saving || !form.title.trim() || !form.description.trim()) ? 'not-allowed' : 'pointer',
                  }}
                >
                  {saving ? 'Submitting…' : 'Submit Request'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </>
  )
}

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
        a: 'A cross-space summary of what matters to you right now: open tasks, upcoming meetings and calendar events, sprint progress, team workload, and department activity — so you don\'t have to visit every space individually. What you see depends on your role: super_admin gets org-wide widgets like Team Velocity and Regional Updates; dept_lead sees department-scoped workload and completion rates; members get a personal focus with their assigned tasks, action items, and upcoming events.',
      },
      {
        q: 'Can I customize which widgets appear on my Dashboard?',
        a: 'Yes — click "Customize" in the top-right of the Dashboard to open the widget panel. From there you can toggle any widget on or off, and drag to reorder them. Your layout is saved per-account, so it persists across sessions. Available widgets include: Assigned to Me, My Sprint Tasks, Sprint Progress, Team Workload, Team Velocity Trend, Completion Rate, Overdue by Member, Member Activity, Team Activity Heatmap, Upcoming Meetings, Upcoming Events, Attendance Summary, Recent Activity, My Action Items, Wins This Week, Personal Reminders, Quick Actions, My Spaces, Regional Updates, and more. If you want to start fresh, use "Reset to defaults" to go back to your role\'s default layout.',
      },
      {
        q: 'How is My Tasks different from the Dashboard?',
        a: 'My Tasks is a focused, filterable list of every task assigned to you across every space and sprint, with sorting by status, priority, and due date. The Dashboard is a higher-level overview with widgets; My Tasks is where you actually work through your list.',
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
        a: 'A private task list visible only to you. Use it for personal to-dos, reminders, and notes that don\'t belong in a shared space. You can also "pin" any team task to your Personal List to keep it visible there as a second location — the task still lives in its original space, you\'re just tracking it personally too. Sublists let you organize items into groups like "This Week" or "Someday." Find it under My Tasks → Personal List in the sidebar.',
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
        a: 'Click any item to open the related task or record. Use the context menu (hover to reveal) to mark as read/unread or delete individual notifications. You can also mark all as read in one click from the top of the page. Deleting an Inbox item does not delete the underlying task or comment — it just removes the notification.',
      },
      {
        q: 'How is Notifications different from Inbox?',
        a: 'Notifications is a fuller activity log grouped into Today, This Week, and Earlier. It shows everything happening across your spaces — not just items assigned to you. Use it to stay aware of team activity; use Inbox to focus on what needs your attention.',
      },
      {
        q: 'What notification types are there?',
        a: 'Task assigned, task comment, meeting created, calendar event approved/rejected, @mentions, and system alerts. Each type has its own icon so you can scan the list quickly.',
      },
      {
        q: 'Can I customize what notifications I receive?',
        a: 'Yes — go to Settings to fine-tune which events trigger notifications and whether they appear as push, in-app, or email alerts. You can also mute notifications from a specific person or space temporarily.',
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
        a: 'Two ways: (1) In the sidebar, hover the space (and a folder, for a list inside it) and click the "+" / "➕ Add list" control that appears. (2) Open the space\'s Overview tab, where the folder/list tree has its own "+ Add List" / "New List" buttons next to each folder and for top-level lists. Any member of the space can create folders and lists there. Editing or deleting someone else\'s folder/list, managing Settings, and archiving/deleting the space itself stay limited to that space\'s dept_lead and super_admin. Separately, dept_lead and super_admin can also create whole new spaces via the + next to the "Spaces" section label in the sidebar.',
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
      {
        q: 'How do I share a space or list with people outside my department?',
        a: 'Use the Share menu on a space or list. You can invite individual users by email or share with an entire department. Shared items appear in the recipient\'s sidebar under "Shared with me" and they gain view/edit permissions based on what you grant.',
      },
      {
        q: 'What\'s the difference between Hiding and Archiving a space?',
        a: 'Hiding removes a space from your personal sidebar only — it\'s reversible and doesn\'t affect anyone else. Archiving (super_admin only) removes it from everyone\'s sidebar and grays it out; it\'s meant for spaces no longer in use. Archived spaces are still searchable and restorable.',
      },
      {
        q: 'Can I see a Space\'s activity and file history?',
        a: 'Yes — open the space and go to Overview → Activity. This shows every action in that space (task creates, updates, comments, etc.) sorted by date. Super_admin and dept_lead can also access the org-wide Activity Log and Files page from the sidebar to audit or search across all spaces.',
      },
    ],
  },
  {
    id: 'sprints',
    title: 'Sprints',
    items: [
      {
        q: 'What is a Sprint used for?',
        a: 'A Sprint is a time-boxed push (with a team, start/end dates, and status) for focused work that cuts across normal space/task organization — useful for events, launches, or short-term initiatives. Think of it as a temporary project container: it has its own board, members, and progress tracking, and it dissolves when the dates end.',
      },
      {
        q: 'What are the different sprint types and when should I use each one?',
        a: 'There are three types, and choosing the right one matters because it controls where tasks show up. (1) Single-department — tied to one department space. Tasks appear on both the sprint board and that department\'s Board/List views and stats. Use this for department-internal pushes like "Media Q3 content blitz." (2) Multi-department — has teams mapped to real departments (e.g. a "Media" team, a "PFCC" team). Each task surfaces in its assignee\'s department space as well as the sprint board, so every department\'s regular reporting reflects the sprint work. Use this when multiple departments are collaborating and each needs to see their slice in their own space — for example, a region-wide outreach where Media handles promo, ORS handles logistics, and Pastors handle follow-up. (3) Custom — for one-off events like a conference, festival, or retreat. Tasks live only on the sprint\'s own board and never leak into any department\'s space, even if the teams happen to reuse department names. This keeps event work out of regular department reporting. If a sprint\'s tasks are unexpectedly showing up in a department\'s board, the sprint type is likely set to multi-department when it should be custom.',
      },
      {
        q: 'How do I get added to a sprint?',
        a: 'Sprint membership is temporary and auto-expires at the sprint end date. A dept_lead or super_admin adds members when creating or editing the sprint via the Sprint modal (+ next to "Sprints" in the sidebar). You\'ll see sprints you belong to listed in the Sprints section of your sidebar.',
      },
      {
        q: 'Where do I see sprints outside my own team?',
        a: 'Click "All Sprints" at the bottom of the Sprints section in the sidebar, or visit All Teams from the Sprints list to see active and planning sprints across every department.',
      },
      {
        q: 'What happens to a sprint when it ends?',
        a: 'The sprint status moves to "completed" and membership auto-expires — members no longer see it in their sidebar. The sprint board and its tasks remain accessible for reference (navigate via All Sprints), but active work is expected to wrap up or move to a new sprint. Incomplete tasks stay in whatever status they\'re in; they don\'t auto-close.',
      },
      {
        q: 'Can a sprint have goals?',
        a: 'Yes — each sprint team can have goals set by the sprint creator. Goals appear on the sprint overview and help the team track whether the sprint achieved its objectives beyond just completing tasks.',
      },
    ],
  },
  {
    id: 'registration',
    title: 'Registration & Roster',
    items: [
      {
        q: 'What is Registration?',
        a: 'A central hub for managing event registrations and attendee info. Access it from the sidebar at Registration → or from the Apps page. It\'s the single source of truth for who signed up, which room they\'re assigned to, special requests (dietary restrictions, accessibility), and more.',
      },
      {
        q: 'Who can access Registration?',
        a: 'Visible to pastors, organizers (super_admin), sprint/team members working on an event, and regional_secretary. It\'s role-gated so only people actively involved in event planning can see attendee details.',
      },
      {
        q: 'What tabs are in Registration?',
        a: 'Registrations (list of all sign-ups), Roster (attendee details by role or status), Flights (if the event involves travel logistics), Room Assignments (map attendees to accommodations), Delegate Compliance (allergy and medical info for safety), and Dashboard (overview stats).',
      },
      {
        q: 'How do I manage room assignments?',
        a: 'Go to Registration → Room Assignments. Unassigned attendees appear in a sortable list (you can sort by gender or other filters). Drag them onto room cards to assign housing. The system prevents invalid assignments and tracks who still needs placement.',
      },
      {
        q: 'Can I sync registrations from Google Forms or a website?',
        a: 'Yes — use the Apps Script integration (configured by super_admin) to auto-pull new responses into the Registrations tab. This keeps your NEXUS roster in sync with sign-ups without manual data entry.',
      },
    ],
  },
  {
    id: 'apps',
    title: 'Apps & Add-ons',
    items: [
      {
        q: 'What are Apps?',
        a: 'Add-on features accessible from the Apps page (click "Apps" in the sidebar). Each app is a specialized tool for a specific need: Wins for testimonies, CAN Map for location info, Communications for email campaigns, Registration for event sign-ups, and more. Apps live outside regular spaces and are available based on your role.',
      },
      {
        q: 'What apps are available?',
        a: 'Wins (testimonies, available to all), CAN Map (view/edit campus locations), Communications (emails & campaigns, for super_admin/ors), Growth Tracking (service center stats, super_admin only), Event Setup Guide (guide for planning events from CMP, super_admin only), and Registration (attendee management).',
      },
      {
        q: 'Can I add custom apps?',
        a: 'Currently apps are built-in. Super_admin can configure which apps are visible in the Apps page via Settings → App Settings.',
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
    id: 'claude-cowork',
    title: 'Claude Cowork',
    items: [
      {
        q: 'What is Claude Cowork?',
        a: 'Claude Cowork is the official integration that lets you use Claude AI to interact with your Nexus workspace. Once connected, you can ask Claude to list your tasks, create sprint tasks, check sprint progress, view weekly wins, and log meeting notes — all from the Claude interface on any device.',
      },
      {
        q: 'How do I connect Claude to Nexus?',
        a: 'Open Claude.ai and sign in. Go to Settings → Connectors and find the Nexus connector (nexus.lwcanada.org/api/mcp). Click Connect — Claude will open a Nexus authorization page. Sign in to Nexus if prompted, then click "Approve Nexus access." Claude will confirm the connection and you\'re ready to go.',
      },
      {
        q: 'What can Claude do once it\'s connected to Nexus?',
        a: 'With Nexus connected, Claude can: list all tasks assigned to you across spaces and sprints, create tasks in any sprint you have permission to manage, check the status and task-count breakdown of a sprint, view weekly wins for your department (or org-wide if you\'re an admin), and log meeting minutes to any meeting you can edit.',
      },
      {
        q: 'Who can connect Claude to Nexus?',
        a: 'Any active Nexus user can connect — no special role is required. Claude\'s access is scoped to your own account, so it can only see and do what you can do yourself in Nexus.',
      },
      {
        q: 'How do I disconnect Claude from Nexus?',
        a: 'In Claude.ai, go to Settings → Connectors → find the Nexus connector → click Disconnect. The token is revoked immediately and Claude can no longer access Nexus. You can reconnect at any time by following the connection steps again.',
      },
      {
        q: 'Is my Nexus data safe when using Claude?',
        a: 'Yes. The connection uses a short-lived OAuth token (8-hour sessions) scoped to your own account. No passwords or credentials are shared with Claude. Claude can only access the data and tools your Nexus role permits, and every tool call is logged in the Nexus MCP audit log.',
      },
      {
        q: 'Why does the connector show "Connection issue" or fail to connect?',
        a: 'Click "Try again" in the Claude connector settings — most connection issues are temporary and resolve on retry. If you see "add an OAuth Client ID," the registration step failed; clicking "Try again" restarts the full flow. If it keeps failing, make sure you\'re signed in to Nexus and that your account is active. Contact your admin if the problem persists.',
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
      {
        q: 'What are the different Settings sections?',
        a: 'Your Profile: name, email, photo, timezone, and language preferences. Personal Integrations: connect Google Calendar, Google Drive, Slack, Outlook, Teams, or other personal accounts for syncing. Task Defaults: how you want new tasks to behave. Dashboard Defaults: which widgets show up when you reset your dashboard. Security: password, 2FA, recovery codes, active sessions. Sidebar Tools: toggle visibility of role-gated features (for super_admin, dept_lead, regional_secretary). Admin Settings (super_admin only): org-wide integrations (Slack workspace, Google shared account, Resend email), People Management, and Activity Audit.',
      },
      {
        q: 'What integrations are available?',
        a: 'Personal: Google Calendar, Google Drive, Slack, Outlook, Microsoft Teams. Org-wide (super_admin): Slack workspace webhooks (for automations and alerts), Google shared account (for Ministry Calendar sync), Resend email service (for campaigns and notifications). Each is configured separately — personal integrations are per-account, org integrations affect the entire workspace.',
      },
      {
        q: 'Can I export my data from NEXUS?',
        a: 'Activity Log and Files can be exported as CSV. Individual tasks, spaces, and sprints can be exported where export buttons appear in the interface. There\'s no one-click full-export, but super_admin has audit access to everything.',
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
  const [showSupport, setShowSupport] = useState(false)
  const { user, profile } = useAuth()

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
            onClick={() => setShowSupport(true)}
            style={{ padding: '9px 18px', background: '#4C2A92', color: '#fff', border: 'none', borderRadius: 10, fontFamily: FONT_BODY, fontSize: 13, fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}
          >
            Get Support
          </button>
        </div>

      {showSupport && (
        <SupportModal
          onClose={() => setShowSupport(false)}
          userId={user?.id}
          userName={profile?.name ?? 'Unknown'}
        />
      )}
      </main>
    </div>
  )
}
