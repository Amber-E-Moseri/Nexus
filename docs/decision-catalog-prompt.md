## BLW Canada OS — Decision Catalog Prompt

Run this after every build session to log interview-significant decisions.

Paste this into a Claude conversation (not Claude Code) after each session. Paste in the build output or summary from that session alongside this prompt. Claude will extract and log decisions in interview-ready format. Keep a running document — paste the previous catalog each time so it accumulates.

### Instructions for Claude and Codex

You are helping me build a professional decision log for a portfolio project called BLW Canada OS — an internal operations platform built with React, Vite, Supabase, and a connected ecosystem of tools (Meeting OS, BLW CAN Map, Foundation School).

I will paste:
- A summary or output from my latest build session
- My existing decision catalog (empty the first time)

Your job is to:
- Extract every decision that has interview significance
- Explain WHY it matters in an interview context
- Write a sample answer I could give if asked about it
- Add it to the running catalog without removing previous entries
- Flag decisions that connect across multiple tools in the ecosystem
- Format each entry exactly as shown in the template below

### Decision entry template

```md
### [DECISION-###] — [Short title]
**Phase:** Phase X
**Category:** Architecture / Security / Performance / Tooling / Product / Trade-off
**What I decided:** [One sentence — the actual decision made]
**Why I decided it:** [2–3 sentences — the real reasoning]
**What I considered instead:** [The alternatives I rejected and why]
**Interview answer (30 seconds):** [How I would explain this if asked in an interview]
**Follow-up questions this invites:**
- [Question an interviewer might ask next]
- [Another likely follow-up]
**Ecosystem connection:** [How this decision affects or connects to Meeting OS / CAN Map / Foundation School — or N/A]
```

### Categories to watch for

When reading build output, flag decisions in these areas:

#### Architecture
- Why separate repos vs monorepo
- Why Supabase over Firebase / PlanetScale / Railway
- Why React + Vite over Next.js
- Why no n8n / Zapier — native Supabase automation engine instead
- Why Foundation School stays as a separate Supabase project
- How SSO works across apps without merging databases
- The pastor shepherd model — why cross-dept visibility is enforced at DB layer not frontend

#### Security
- RLS policies — why row-level security over middleware auth checks
- Why API keys never touch the frontend (Edge Function proxy)
- Why no public sign-up — super admin creates accounts only
- How pastor RLS works — why pastors literally cannot query data outside their flock at DB level

#### Performance
- Optimistic updates on task status changes
- Why tasks library fetches are scoped per department, not org-wide
- Supabase Realtime for live updates vs polling

#### Tooling
- Why Tailwind CSS v4 with CSS custom properties
- Why `@dnd-kit` over `react-beautiful-dnd`
- Why Resend over SendGrid / Mailgun for email notifications
- Why `lucide-react` for icons

#### Product decisions
- Why no coordinator role — only 4 roles
- Why kanban is desktop-first but list view is mobile-friendly
- Why Meeting OS stays separate instead of merging
- Why personal tasks are invisible to everyone including dept leads
- Why source tracking on tasks (manual vs meeting vs automation vs zoom)

#### Trade-offs
- Cost vs features — why build instead of buy (`ClickUp = $120+/mo`)
- Complexity vs maintainability — why native Supabase automation over n8n
- Speed vs correctness — optimistic UI updates with rollback
- Separation vs convenience — Foundation School as external ecosystem

### Running catalog

```md
[PASTE YOUR EXISTING CATALOG HERE — empty on first run]
```

### This session's build output

```md
[PASTE THE BUILD SUMMARY OR CLAUDE CODE OUTPUT FROM YOUR SESSION HERE]
```

### Output format

Return the full updated catalog with new entries added. Number decisions sequentially. Group by phase at the top, but keep a flat numbered list below for easy searching.

At the end, add an `Interview prep summary` section that lists:
- The 3 strongest decisions from this session to lead with in interviews
- The 1 decision most likely to get a deep technical follow-up
- Any decisions that show product thinking (not just technical execution)
