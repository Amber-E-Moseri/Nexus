# Nexus Repository Structure & Configuration

**Last Updated:** 2026-06-25  
**Project:** BLW Canada OS (Nexus)  
**Repository:** C:\Users\moser\Downloads\clickup

---

## 📁 Directory Structure

```
clickup/
├── src/
│   ├── pages/
│   │   ├── reports/
│   │   │   └── MeetingReportPublicPage.jsx          [Public report viewer with share_token]
│   │   ├── communications/
│   │   │   ├── RSVPPage.jsx                         [Public RSVP page (Phase 1)]
│   │   │   ├── InvitationDetailPage.jsx             [Admin RSVP response tracking]
│   │   │   ├── CommunicationsPage.jsx
│   │   │   ├── AnalyticsPage.jsx
│   │   │   └── ...
│   │   ├── admin/
│   │   ├── meetings/
│   │   ├── calendar/
│   │   ├── people/
│   │   ├── Dashboard.jsx
│   │   └── ...
│   ├── components/
│   │   ├── layout/
│   │   │   ├── Shell.jsx                            [Main app wrapper]
│   │   │   └── ProtectedRoute.jsx                   [Auth guard]
│   │   ├── modules/
│   │   │   └── meetings/                            [Meeting-related components]
│   │   ├── attendance-trends/
│   │   └── ...
│   ├── lib/
│   │   ├── supabase.js                              [Supabase client]
│   │   ├── rsvpTokens.js                            [RSVP token generation (Phase 1)]
│   │   ├── csv/
│   │   │   ├── elvanto-attendance-parser.ts         [CSV import: Elvanto format]
│   │   │   └── attendanceImportLib.ts               [Core CSV import logic]
│   │   ├── meetings/
│   │   │   ├── permissions.js                       [Meeting permission logic]
│   │   │   └── pdfGeneration.js                     [PDF export for meetings]
│   │   └── ...
│   ├── tests/
│   │   ├── rsvp.permission.test.js                  [RSVP permission tests (Phase 1)]
│   │   ├── audioTranscription.test.js
│   │   ├── documentUpload.test.js
│   │   └── ...
│   ├── styles/
│   │   ├── index.css                                [⚠️ CRITICAL: Append-only, never overwrite]
│   │   ├── audio-transcription.css
│   │   ├── designated-creators.css
│   │   └── ...
│   ├── App.jsx                                       [Main routing (updated Phase 1)]
│   └── main.jsx                                      [Vite entry point]
├── supabase/
│   ├── migrations/
│   │   ├── 20260608000000_initial_blw_canada_os_schema.sql
│   │   ├── ...
│   │   ├── 20260625000000_invitation_system_core_schema.sql      [RSVP schema (Phase 1)]
│   │   ├── 20260625000001_rsvp_rpc_functions.sql               [RSVP RPCs (Phase 1)]
│   │   ├── 20260625000002_invitation_rsvp_notes_constraint.sql  [Notes limit (Phase 1)]
│   │   ├── 20260620000024_add_share_token_to_meeting_reports.sql
│   │   └── ...
│   └── functions/
│       ├── send-invitations/index.ts                 [Email invitations]
│       ├── send-invitation-reminders/index.ts        [RSVP reminders (Phase 1)]
│       ├── send-communication-email/index.ts
│       ├── broadcast-campaign/index.ts
│       ├── email-digest/index.ts
│       ├── automation-engine/index.ts
│       └── ... (15+ edge functions)
├── docs/
│   ├── RSVP_SYSTEM_DEPLOYMENT.md                    [RSVP deployment guide (Phase 1)]
│   └── ...
├── vite.config.js                                    [Vite config (port 5173)]
├── package.json                                      [Dependencies, npm scripts]
├── .env.example                                      [Template env vars]
├── .env.local                                        [Local secrets (gitignored)]
└── README.md
```

---

## 🗄️ Supabase Schema Overview

### **Supabase Project**
- **Project ID:** kraurtuhflouyorgtpun
- **URL:** https://kraurtuhflouyorgtpun.supabase.co
- **Auth:** JWT via Supabase Auth (users table + auth.users)
- **Region:** (check Supabase dashboard)

### **Core Tables**

| Table | Purpose | Key Fields | Rows |
|-------|---------|-----------|------|
| **users** | System users | id (UUID), name, email, role, department_id | ~50-200 |
| **departments** | Ministry departments | id, name, color, health_status | 5-10 |
| **meetings** | Recorded ministry meetings | id, title, date, department_id, agenda, minutes, transcript | 100+ |
| **meeting_attendance** | Attendance records | meeting_id, user_id, status (present/absent/excused) | 1000+ |
| **meeting_attendance_reports** | Exportable attendance summaries | id, share_token, meeting_id, subgroup_filter | 50-100 |
| **tasks** | Action items | id, title, status, assignee_id, department_id, due_date | 500+ |
| **goals** | Department goals | id, title, department_id, owner_id, target_value | 20-50 |
| **pastor_members** | Pastor-to-member relationships | pastor_id, member_id | 100+ |
| **expected_attendees** | Predicted attendance for meetings | meeting_id, user_id, category | 500+ |
| **attendance_subgroups** | Grouping for attendance trends | id, meeting_id, subgroup_name, attendance_count | 100+ |
| **activity_log** | Audit trail | id, user_id, action, entity_type, entity_id | 10000+ |

### **RSVP System Tables (Phase 1 - NEW)**

| Table | Purpose | Key Fields |
|-------|---------|-----------|
| **invitation_campaigns** | Invitation batches | id, org_id, title, event_date, status, rsvp_yes/no/maybe (denormalized) |
| **invitation_recipients** | Individual invitees | id, campaign_id, recipient_email, rsvp_token (48-char), rsvp_response (yes/no/maybe/pending), rsvp_notes (≤500 chars) |
| **invitation_activity_log** | Audit for invitations | id, campaign_id, action (created/sent/rsvp_submitted), metadata |

### **Report/Sharing Tables**

| Table | Purpose | Fields |
|-------|---------|--------|
| **meeting_attendance_reports** | Public report sharing | id, share_token (UUID, unique, public access via RLS), meeting_id, subgroup_filter |

---

## 🔐 Row Level Security (RLS)

### **Enabled Tables**
- departments, users, pastor_members
- tasks, task_comments, goals
- meetings, meeting_attendance
- automations, notifications, activity_log
- **meeting_attendance_reports** — Public access via `share_token IS NOT NULL`
- **invitation_campaigns** — Org-scoped (org_id matches JWT)
- **invitation_recipients** — Org-scoped via FK to campaigns

### **Key RLS Policies**

| Table | Policy | Access |
|-------|--------|--------|
| **users** | users_select_own | Users see only themselves |
| | users_select_leads | Dept leads see their department users |
| | users_select_pastor_members | Pastors see their assigned members |
| **tasks** | tasks_select_member | Assignees, creators, dept members see |
| | tasks_select_lead | Dept leads see all dept tasks |
| | tasks_select_admin | Super admins see all |
| **meeting_attendance** | (see meetings policy) | Users see their own attendance |
| **meeting_attendance_reports** | "Public access via share_token" | Anyone with token can view (no auth) |
| **invitation_campaigns** | invitation_campaigns_select | Org-scoped: own org or super_admin |
| **invitation_recipients** | invitation_recipients_select | Org-scoped via campaign.org_id |

---

## 💻 Local Development Setup

### **Prerequisites**
- Node.js 18+
- Docker (for local Supabase)
- Git

### **Start Development**

```bash
# 1. Install dependencies
npm install

# 2. Start local Supabase (requires Docker)
supabase start
# Creates local PostgreSQL, Auth, Storage at 127.0.0.1

# 3. Apply migrations
supabase migration up
# Applies all migrations in supabase/migrations/ in order

# 4. Set environment variables
# Edit .env.local with:
VITE_SUPABASE_URL=http://127.0.0.1:54321          # Local Supabase
VITE_SUPABASE_ANON_KEY=<from `supabase start` output>
VITE_FRONTEND_URL=http://localhost:5173            # For RSVP links
RESEND_API_KEY=re_xxxxx                            # For email
VITE_FLOCK_CRM_ENABLED=true/false

# 5. Start dev server
npm run dev
# Runs on http://localhost:5173

# 6. Access unauthenticated routes
# Public routes (no auth required):
http://localhost:5173/rsvp?token=<48-char-token>  # RSVP page (Phase 1)
http://localhost:5173/reports/<share_token>       # Public report
http://localhost:5173/login                       # Login page
http://localhost:5173/signup                      # Signup page

# Authenticated routes (behind ProtectedRoute):
http://localhost:5173/dashboard                   # Requires login
http://localhost:5173/calendar
http://localhost:5173/communications
etc.
```

### **Environment Variables**

**`.env.local` (local development, never commit)**
```
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_ANON_KEY=eyJ...
VITE_FRONTEND_URL=http://localhost:5173
VITE_MEETING_OS_URL=/apps/meeting/index.html
RESEND_API_KEY=re_xxxxx
VITE_FLOCK_CRM_ENABLED=true
VITE_FLOCK_CRM_API_URL=https://script.google.com/...
VITE_ANTHROPIC_API_KEY=sk-ant-api03-...
```

**Supabase Secrets (production, set via dashboard)**
```
FRONTEND_URL=https://nexus.blw.local
RESEND_API_KEY=re_xxxxx
RESEND_WEBHOOK_SECRET=whsec_xxxxx
```

### **Port Configuration**
- **Dev server:** http://localhost:5173 (Vite default)
- **Supabase local:**
  - API: http://127.0.0.1:54321
  - PostgreSQL: 127.0.0.1:54322
  - Inbucket (email): http://127.0.0.1:54324
  - Kong (API gateway): http://127.0.0.1:54321

---

## 🧪 Testing

### **Run Tests**
```bash
# Run all tests
npm test

# Run specific test file
npm test -- rsvp.permission.test.js

# Run with coverage
npm test -- --coverage
```

### **Test Files**
- `src/tests/rsvp.permission.test.js` — RSVP system permission tests
- `src/tests/audioTranscription.test.js` — Audio transcription tests
- `src/tests/documentUpload.test.js` — Document upload tests
- `src/tests/permissions.test.js` — Permission system tests
- `src/lib/csv/*.test.ts` — CSV import tests

---

## 📊 Key Features by Module

| Module | Location | Purpose |
|--------|----------|---------|
| **Communications** | src/pages/communications/ | Email campaigns, RSVP invitations (Phase 1) |
| **Calendar** | src/pages/calendar/ | Ministry event planning & approvals |
| **Meetings** | src/pages/meetings/ | Meeting notes, transcription, attendance |
| **People** | src/pages/people/ | User management, departments, permissions |
| **Tasks** | src/pages/personal/ | Personal & team task tracking |
| **Reporting** | src/pages/reports/ | Public attendance reports |
| **Integrations** | src/pages/settings/ | Google Drive, Calendar, Slack, Zoom |

---

## 🔍 CSV Import (Attendance)

**Parser:** `src/lib/csv/elvanto-attendance-parser.ts`  
**Input Format:** Elvanto CSV export (or compatible format)  
**Key Fields:** Name, Email, Date, Status (Present/Absent/Excused)  
**Output:** Bulk inserts into `meeting_attendance` table  
**RLS:** Only super_admin or dept_lead can import  

---

## 🚀 Deployment

### **Frontend**
```bash
npm run build          # Builds to dist/
# Deploy dist/ to Vercel, Netlify, or static host
```

### **Database Migrations**
```bash
supabase db push --linked   # Push to production Supabase
```

### **Edge Functions**
```bash
supabase functions deploy send-invitation-reminders --linked
supabase functions deploy send-invitations --linked
# Deploy all functions to production
```

---

## 📝 Important Notes

### **CSS Protection (CRITICAL)**
⚠️ **Never overwrite** `src/styles/index.css`  
✅ **Always append** new styles to the end  
✅ **Reuse design tokens** (colors, spacing, fonts defined at top)  
🔍 See `MEMORY.md` for CSS policy details

### **RSVP System (Phase 1)**
- Token generation: `src/lib/rsvpTokens.js`
- Database schema: `supabase/migrations/20260625000000*`
- RPC functions: 5 functions in migration
- Public endpoint: `/rsvp?token=...`
- Reminders: `supabase/functions/send-invitation-reminders/index.ts`

### **Public Routes (No Auth)**
- `/rsvp?token=...` — RSVP page (Phase 1)
- `/reports/:share_token` — Public report viewing
- `/login`, `/signup`, `/forgot-password` — Auth pages

---

## 🔗 Related Documentation

- **RSVP Deployment:** `docs/RSVP_SYSTEM_DEPLOYMENT.md`
- **Memory Index:** `MEMORY.md` (calendar system, CSS protection, etc.)
- **Code Style:** Inline comments only when WHY is non-obvious
- **Git Strategy:** Feature branches, squash on merge to main

---

## 📞 Quick Reference

| What | Where | Command |
|------|-------|---------|
| Start dev | Terminal | `npm run dev` |
| Run migrations | Terminal | `supabase migration up` |
| Check schema | Supabase dashboard | SQL editor |
| Deploy | Terminal | `supabase db push --linked` |
| View logs | Supabase dashboard | Functions → Logs |
| Test auth bypass | Browser | Go to `/rsvp` without login |

**Last verified:** 2026-06-25 — After RSVP Phase 1 implementation
