# BLW Canada OS (Nexus): Building a Custom Ops Platform for a 30-Person Organization

## The Problem

**Context:** BLW Canada Sub-Region is a 30-person campus ministry across 5 departments (Admin, Media, ORS, Pastors, PFCC). They were using ClickUp for task management, but the workflow didn't fit their actual structure.

**Specific pain points:**
- Weekly reporting required 2.5 hours of manual aggregation from Elvanto (CRM), Google Sheets, and email threads
- No real-time visibility into attendance trends or engagement patterns across departments
- Communication campaigns were tracked in multiple places (email threads, Slack, spreadsheets)
- Meeting minutes, transcription, and action items required manual consolidation after every session
- Kanban boards were flexible but lacked department-level isolation and visibility into cross-departmental dependencies
- Campus presence tracking (358 Canadian campuses) was static and required manual updates

**The core issue:** Existing tools (ClickUp, Slack, Google Workspace) work *generically*. They don't understand the ministry's specific workflow: how departments interact, how reporting flows, how decisions get made. Using an off-the-shelf tool meant constant workarounds and expensive annual licensing for a 30-person team.

---

## Solution Architecture

**Decision:** Build a custom platform from scratch, tailored to their exact workflow and department structure.

**Tech stack:**
- **Frontend:** React + Vite (fast iteration, dev experience)
- **Backend & Data:** Supabase (PostgreSQL + RLS for multi-tenant isolation)
- **Email/Communications:** Resend (reliable, CASL-compliant delivery)
- **Transcription/Summaries:** Whisper (OpenAI) + Claude API
- **Drag-drop infrastructure:** @dnd-kit (performant, accessible)
- **Deployment:** Vercel (Next.js compatible, built-in preview environments)

**Architecture highlights:**
- **Multi-tenant RLS (Row Level Security):** Each department sees only their tasks, reports, and data. Implemented at the database layer, not in code.
- **Edge functions:** Automated reporting and scheduled tasks (birthday flyers, weekly report delivery, bounce management)
- **Optimistic updates:** Drag-drop on Kanban boards feels instant; rollback on network failure
- **Public shareable links:** Reports can be shared without login (e.g., attendance reports for external leadership)

---

## Features & Impact

### 1. **Automated Reporting**

**The multiplier:** What took 2.5 hours every week now runs in under 5 minutes.

*How it works:*
- Edge function pulls data from Elvanto (CRM) weekly
- Aggregates attendance, follow-ups, and first-timer metrics by subgroup
- Applies automatic grading (color-coded health bands: red/yellow/green)
- Generates PDF report with charts and trend analysis
- Emails stakeholders automatically

*Outcome:* Team leaders now spend time *acting* on insights instead of *compiling* them. Early engagement flags catch declining subgroups 48 hours faster than manual reporting.

**Technical note:** The first version was built in Google Apps Script (see [BLW Report Suite](https://github.com/Amber-E-Moseri/google-apps-scripts)). When scaling to the OS, I took those learnings and rebuilt it as a proper system layer—using edge functions, Supabase queries, and Resend for delivery—so it integrates seamlessly with the platform's data model.

---

### 2. **Communications Module**

**Capabilities:**
- Campaign builder with recipient segmentation (by department, subgroup, custom lists)
- A/B testing (subject line, send time)
- Click tracking and bounce management (CASL compliance)
- Real-time analytics per campaign (open rate, click rate, unsubscribe rate)
- Automated unsubscribe handling (respects user preferences, legal compliance)

**Impact:** Teams can run targeted campaigns (e.g., "First-timers from Waterloo subgroup") in minutes, not hours. Analytics inform next week's messaging.

---

### 3. **Meetings Module**

**Workflow:**
- Agenda builder with drag-drop reordering and auto-timing
- Real-time transcription during meetings (Whisper WASM)
- AI-powered summaries (Claude API) that extract key decisions and action items
- Attendance tracking (category-based: Service, Group, Both, Total Unique)
- Print-ready report layouts (Regional view vs. Per-Subgroup view)
- Public shareable links (reports can be embedded in emails or dashboards)

**Impact:** Meeting minutes go from "manual typing + follow-up emails" to "automatic transcript + summary + action items." Absence workflows trigger automatically (email to missing members with context).

---

### 4. **Spaces & Kanban**

**Features:**
- Department-level spaces with custom task statuses
- Folder and list hierarchy (flexible organization per department)
- Drag-drop tasks between statuses and sprints
- Sprint management (active, archived, restore)
- Browse tab for cross-departmental visibility (what other departments are working on)
- Temporary sprint memberships with expiration (member leaves sprint after project ends)
- Task dependencies and blocking

**Impact:** Teams see their work in context. Kanban boards feel responsive (optimistic updates). Department leads understand cross-departmental bottlenecks.

---

### 5. **Campus Mapping**

**Feature:** Real-time presence tracking across 358 Canadian campuses.

*Integration:* Connected to BLW CAN Map (separate Leaflet.js project). Shows which campuses have active ministry presence, prayer focus areas, campus status.

**Impact:** Leadership gets a live snapshot of ministry footprint across Canada. Used for strategic planning and prayer focus.

---

### 6. **User Onboarding & Lifecycle**

**Three-step process:**
1. Supabase Auth invite (email with sign-up link)
2. `users` record created in database
3. `space_members` record ties user to department with role/permissions

**RLS policies ensure:** A user in Admin department cannot see Pastors' tasks or PFCC communications. Data isolation is enforced at the database layer.

---

## Technical Decisions & Why

### Why Supabase + RLS instead of Firebase?

Supabase gives us PostgreSQL + native RLS. For a multi-department organization, we need row-level security that's database-enforced, not application-logic enforced. If someone finds an API vulnerability, RLS still protects department data. Firebase doesn't offer this level of granularity without custom backend code.

### Why edge functions for reporting instead of cron jobs?

Edge functions run inside Supabase's infrastructure (no separate servers). They're free at our scale (~100 executions/month), reliable, and integrated with the database. They're also easy to debug and scale.

### Why @dnd-kit instead of react-beautiful-dnd?

@dnd-kit is actively maintained and performant for our Kanban scale (5 departments, ~200 tasks). It's also accessible (keyboard support, screen reader friendly) and we can customize collision detection and animations.

### Why RLS over application-level permissions?

Application-level permissions are convenient but leaky. A single query without permission checks, a forgotten filter, or a reverse-engineering API call can expose data. RLS is a guarantee: if you don't have the row's department, the database won't return it, period. It's defense in depth.

---

## Metrics & Outcome

| Metric | Before | After |
|--------|--------|-------|
| **Weekly reporting time** | 2.5 hours (manual) | 5 minutes (automated) |
| **Departments using system** | 0 (ClickUp only) | 5 (full adoption) |
| **Active users** | ~8 (task-focused) | 30 (cross-functional, all departments) |
| **Time to run A/B campaign** | 3+ days (manual setup) | <15 minutes (built-in) |
| **Meeting minutes turnaround** | 2 days (manual typing) | Instant (auto-transcribed + summarized) |
| **Cost vs. ClickUp** | $30/user/month = $900/month | ~$100/month (Supabase + Resend + Claude API) |

---

## What I Learned Building This

1. **Systems thinking matters before code.** Understanding the 5 departments' workflows, reporting cadence, and communication patterns shaped every architectural decision. I didn't start coding; I started with a workflow diagram.

2. **RLS is non-negotiable for multi-tenant apps.** Implementing it late is expensive. Build it in from day one.

3. **One person can ship complex systems.** When you own every decision (architecture, design, operations, support), you move faster than a committee. Trade-off: you're on-call for everything.

4. **Automation at the database layer is powerful.** Edge functions + database triggers + scheduled tasks = systems that work without UI intervention. The reporting pipeline runs while the team sleeps.

5. **Iterate on real user feedback, not assumptions.** The Browse tab, temporary sprint memberships, campus mapping integration—all came from watching how teams *actually* worked, then building for that workflow.

---

## Live Demo

**Status:** Platform is currently in production with 30 active users. Department leads and team members use it daily for communications, meetings, and task management.

**To see it in action:**
- **Request a demo:** Contact the team and I can walk you through:
  - The automated reporting pipeline (from data pull to email delivery)
  - A/B testing and campaign analytics
  - Meeting transcription + summarization in real-time
  - Cross-departmental Kanban and sprint workflow
  - RLS and department isolation in action

- **Code walkthrough:** See `docs/SECURITY.md` for RLS architecture and policy implementation
- **Schema overview:** See `supabase/migrations/` for table structures and constraints

---

## What's Next

- **Real-time analytics dashboard** — Leadership view of all departments' KPIs in one place
- **Automated escalation workflows** — Flag at-risk attendance patterns automatically
- **Advanced audience segmentation** — Target campaigns by engagement history, not just department
- **Integration with Elvanto API** — Deeper syncing of contact and attendance data
- **Mobile app** — Simplified view for field team members (pastors, event coordinators)

---

## Key Files & Architecture

### Core Systems
- **RLS & Security:** `docs/SECURITY.md`
- **Database Schema:** `supabase/migrations/` (migrations ordered by timestamp)
- **Frontend Components:** `src/features/` (modular, feature-based organization)
- **Edge Functions:** `supabase/functions/` (scheduled reporting, email delivery)

### Recent Additions (2026-06-20)
- **Pastor Subgroup Assignments:** `supabase/migrations/20260620000013_pastor_subgroup_assignments.sql`
- **Pastor Dashboard Widget:** `src/features/dashboard/components/PastorMeetingStatsWidget.jsx`
- **Public Report Sharing:** `src/pages/reports/MeetingReportPublicPage.jsx` with professional print styling

---

*BLW Canada OS is a solo-architected platform in production, handling all technical decisions, RLS design, feature prioritization, and operations. Built to prove that custom platforms can outpace off-the-shelf tools when designed for a specific workflow.*

**Repository:** [Amber-E-Moseri/Nexus](https://github.com/Amber-E-Moseri/Nexus) (private, viewable by request)

**Contact:** [blwcan.elvanto@gmail.com](mailto:blwcan.elvanto@gmail.com)
