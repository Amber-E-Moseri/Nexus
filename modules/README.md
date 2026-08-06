# Nexus Modules

Each module in Nexus is a self-contained product domain with its own problem space, technical decisions, and engineering challenges. This directory contains reference documentation for each.

## Quick Links

- **[Core PM](./core-pm/)** — Task management, Kanban boards, sprints, status hierarchy
- **[Flock](./flock/)** — Contact tracking, call logging, follow-up queues, manager workload view
- **[Meetings](./meetings/)** — AI-powered meeting capture, transcription, action item extraction
- **[Immerse](./immerse/)** — PDF e-reader with AI text-to-speech, highlighting, note-taking
- **[Comms](./comms/)** — Email campaigns, segmentation, RSVP tracking, click analytics
- **[Nova](./nova/)** — Role-aware AI assistant, live data tools, knowledge base

## Cross-Module Architecture

All six modules run on the same Supabase PostgreSQL backend and share:

- **Authentication:** Supabase Auth + JWT-based invite flow
- **Authorization:** Row-level security policies; JWT claims (`user_role`, `user_department_id`) drive all access decisions
- **Realtime:** Supabase `postgres_changes` subscriptions
- **Data model:** Shared `users`, `profiles`, `spaces`, `tasks`, `meetings` tables; modules add their own domain tables
- **Edge functions:** ~80 Deno functions in `supabase/functions/` handle async work, external integrations, and complex business logic
- **Frontend:** React 18 + Vite; all pages are lazy-loaded and code-split
- **State management:** TanStack React Query for server state, React Context for view state scoped to each module

## Reading the Module READMEs

Each module's README is structured as a mini case study:

1. **Problem** — what the module solves, what the organization needed
2. **Key Technical Decisions** — architecture, data model, and design rationale
3. **Schema Highlights** — important database tables specific to the module
4. **Engineering Challenge** — one interesting problem the module solved and how

This structure emphasizes decision-making over implementation details. The goal is to understand *why* the code is structured the way it is, not to serve as a line-by-line walkthrough.

---

**Next steps:** Read the [main README](../README.md) for an overview of the platform and architecture. Then dive into a specific module based on what interests you.
