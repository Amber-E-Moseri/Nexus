# Nexus: A Case Study in Platform Consolidation

## Executive Summary

Nexus is a full-stack internal operations platform built to replace a fragmented suite of tools — task management, contact tracking, meeting documentation, email campaigns, and manual coordination — with a unified system that enforces data permissions at the database layer. The platform grew from an initial core of task management and meeting minutes over roughly 8 months of solo development. As organizational needs emerged, pre-existing standalone components — contact tracking (Flock), communications/email (Comms) — were reworked and consolidated into the unified Nexus platform during a focused 10–12 week integration phase. Nova (the AI assistant module) was built as part of the platform architecture from the start. A document reader module (Immerse) was added a few weeks after the core platform consolidated, as a refinement for knowledge access. This iterative progression transformed Nexus from a task-and-meeting tool into a genuine operations platform — demonstrating sustained solo ownership of a growing system and the judgment to recognize when independently built pieces should be unified rather than left siloed.

## Organization Background

The organization is a distributed volunteer network coordinating members across several departments, spread across multiple geographic regions. Each department operates semi-independently — maintaining its own task workflows, reporting cycles, and team coordination practices — but needs to share cross-departmental work (sprints, events, all-org announcements) without exposing sensitive data across boundary lines. Previous tooling included a commercial task manager (ClickUp), shared spreadsheets for reporting, email threads for communication, and manual coordination calls for synchronization.

## Problems

**1. Fragmented task vocabulary.** Each department used different names for the same workflow stages — one used "In Progress" and "In Review," another used "In Flight" and "Awaiting Feedback." Consolidating into a single off-the-shelf tool meant either imposing one team's vocabulary on everyone or accepting a confusing dual-status mess. The status system needed to support canonical org-wide stages and department-specific vocabulary that mapped cleanly back to them.

**2. Broken permissions model.** Off-the-shelf tools enforced access at the workspace or table level, not the row level. A "member" role either saw everything or nothing — there was no native way to say "you can see these specific tasks and meetings, but not others in your team."

**3. Manual, lagging reporting.** Weekly attendance and growth metrics were collected by hand: team leads emailed spreadsheet updates, a coordinator aggregated them, and a summary went out days later. No real-time visibility, no historical archive.

**4. Meeting minutes chaos.** Meetings happened frequently, but structured notes were rare. Decisions lived in people's memory or buried in email threads. Action items were assigned ad hoc and followed up on by personal reminder, with no systematic trail of who committed to what.

**5. No communication platform.** Reaching the organization meant building a recipient list by hand in a generic email tool, with no tracking, segmentation, or historical record. Event RSVPs were collected manually across email threads.

**6. Scattered operational knowledge.** How-to questions ("How do I invite someone to a sprint?" "What are the reporting deadlines?") were answered by individual messages or went unanswered — no single source of truth for operational documentation.

## Goals

- Unified data model: one source of truth for operational data, with permissions enforced at the database layer, not the UI
- Flexible workflows: support each team's own status vocabulary without fragmenting reporting
- Consolidated communication: replace email threads, spreadsheets, and manual coordination with an integrated platform
- Auditable permissions: understand exactly who can see what and why, backed by database policy rather than scattered application logic
- Real-time insight: replace delayed reporting with dashboards that update as data changes
- Buildable fast, maintainable later: ship a working production system quickly, with documentation and structure clean enough to extend or hand off

## Technical Decisions

**Row-Level Security as the foundation.** Every table has RLS enabled. JWT claims (`user_role`, `user_department_id`) embedded in the auth token drive all access decisions. Policies are written as reusable Postgres functions (`current_user_department()`, `current_user_role()`) rather than duplicated per table — making permissions auditable by reading the function, testable in isolation, and maintainable from a single change point.

**Two-tier status hierarchy.** Canonical org-wide statuses (To Do, In Progress, Review, Completed, Cancelled) anchor aggregate reporting. Each department can define its own sub-statuses, mapped to a parent via a foreign key enforced by a `CHECK` constraint. This let teams keep their own vocabulary without breaking cross-org rollups.

**Edge Functions for async work.** Deno edge functions handle email delivery, transcription, AI-based extraction, document/drive integration, and scheduled reports. Functions are trigger-agnostic — a scheduled job can be invoked by a database cron job, a platform cron fallback, or a manual admin trigger, with identical behavior across all three.

**AI as a structural layer, not a bolt-on.** An LLM API powers three distinct flows: meeting-minute extraction from raw transcripts into structured blocks, voice-note-to-log conversion in the field contact module, and a role-aware assistant that answers operational questions from a curated knowledge base. Prompt caching on the static knowledge-base portion of the system prompt meaningfully reduced repeated-query token costs.

**Client-side state separation.** Server state (tasks, meetings, users) lives in React Query with stable cache keys. View state (sidebar open/closed, active filters) lives in scoped React Context per module. This kept state debugging tractable as the surface area grew.

## Challenges

**Idempotent async operations.** Voice logging, email dispatch, and meeting extraction all have retry scenarios where standard unique-constraint deduplication breaks down, since the same action can legitimately repeat. Solved with content-hash-based deduplication within a short time window: if a matching transcript hash appears again within a few minutes, the existing record is returned instead of a duplicate being created — no client-side dedup key required.

**Real-time status during long AI operations.** A 30–60 second audio transcription or extraction step with a silent spinner causes users to assume failure and retry, creating duplicate submissions. Solved with Server-Sent Events streamed from the edge function, updating the UI stage-by-stage (`uploading → transcribing → extracting → done`). Implementing this in Deno required manually configuring stream buffering, since the runtime buffers responses by default.

**Many widget types without prop-drilling.** A customizable dashboard with dozens of widget types would otherwise require the grid to know every widget's data shape. Solved by having each widget own its own data fetch — the grid passes only a config object and a stable ID. Adding a new widget type requires one new component and a registry entry; off-screen widgets never issue fetches.

**Scheduling without external infrastructure.** Campaigns need to send at specific future times, but the platform has no persistent cron system of its own. Solved by making the sending function trigger-agnostic: it processes any campaign where `scheduled_at <= now()` and marks it sent, so it works identically whether invoked by a database-level cron job, a platform-level cron fallback, or a manual admin trigger — with no shared state or external job queue required.

**Retiring a status without downtime.** Several months into use, a redundant status needed to be removed without a maintenance window. Solved with a single migration: an `UPDATE` with a correlated subquery remapped affected rows to the replacement status, then flipped the retired status to inactive. Since the status-fetching function already filtered on active status, pickers stopped showing the retired option the moment the migration committed — no application code change needed.

## Results

Nexus is in active use as the operational system for a distributed volunteer organization, handling task management, sprint coordination, meeting documentation, and team coordination across multiple departments. The project spans roughly 8 months of solo development. Task management and meeting minutes formed the core of Nexus from the start; Nova (the AI assistant) was built as part of the platform architecture from day one. As organizational needs expanded, contact tracking and communications modules — originally built as standalone tools — were reworked and consolidated into Nexus during a focused 10–12 week integration phase. Immerse (a document reader module) was added a few weeks after core consolidation as a refinement, currently being refined and perfected. This progression was made possible in part by using AI-assisted development throughout — from architecture discussion to implementation to debugging.

**Direct infrastructure cost savings:**

The organization previously used ClickUp at $12.50 per user per month. With 35 regular users and 60+ during busy seasons, the previous subscription cost roughly $437–750 per month depending on season ($5,250–9,000 annually at standard usage). Nexus infrastructure runs at approximately $50–70 per month ($600–840 annually), depending on AI usage. This represents an annual savings of roughly $4,500–8,500 in direct infrastructure and subscription costs — a delta that grows as the organization scales.

This comparison reflects recurring hosting and third-party service costs only, not the engineering time required to build and maintain the system, nor the value of workflows designed specifically around organizational needs rather than generic task-management patterns.

**Consolidation outcomes:**

The platform replaced a commercial task-management subscription, dozens of shared spreadsheets, and ad hoc email/messaging coordination with a single integrated system. It eliminated context-switching between tools, created auditable access controls, and provided real-time visibility into organizational work — outcomes that are harder to quantify in dollars but were consistently cited as valuable by users.

## Lessons Learned

**RLS is a forcing function for clarity.** When permissions can't be checked in middleware or component guard clauses, the permission model has to be encoded in the database. That constraint turned out to be a strength: permissions became testable, auditable, and consistent across every access path — the main app, direct API calls, and background functions alike.

**Async idempotency should be designed in, not bolted on.** Voice logging, email, and transcription all had retry scenarios. Building content-hash deduplication into the first version cost almost nothing; retrofitting it after duplicate records existed would have meant a painful cleanup pass.

**AI-assisted development changes the shape of solo engineering.** Consolidating several previously separate components into one coherent platform in 10–12 weeks, as a single developer, required treating AI tools as a genuine engineering collaborator — for architecture discussion, code review, and debugging — not just autocomplete. That meant staying disciplined about reviewing generated code, understanding every decision well enough to defend it, and not letting speed substitute for correctness on the parts that mattered most (permissions, data integrity).

**Stakeholder communication over pure feature velocity.** Shipping features fast mattered less than shipping features that matched how people actually worked. Time spent understanding a team's real status workflow before building the status system prevented much larger rework later.

**Ship with observability from day one.** Edge functions that fail silently (a network timeout, an API quota hit) are invisible without logging. Structured logging on every function — what was called, with what input, with what result — made debugging production issues tractable instead of guesswork.

**Documentation discipline is a multiplier.** A codebase built by one person is easy to understand until it isn't. Documenting decisions as they were made — in migration comments, in code comments for non-obvious logic, in a running design-notes file — kept the system legible when revisiting it later, including to myself.

---

**Build period:** ~8 months total (2025–2026). Core platform (task management, meetings, Nova) built from the start; contact tracking and communications modules were reworked from prior versions and consolidated during a 10–12 week integration phase; document reader (Immerse) added a few weeks after core consolidation, currently being refined.

**Stack:** React, Vite, TanStack Query, Supabase, PostgreSQL, Row-Level Security, Deno Edge Functions

**Deployment:** Vercel (frontend), Supabase Cloud (database + edge functions)

**Development approach:** Solo-built with AI-assisted development throughout
