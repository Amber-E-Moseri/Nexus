# Nova — In-App AI Assistant

Reconciliation of what was originally specced (the "Build Prompt: Nova" task
brief) against what actually shipped, plus the live verification record from
the pre-merge pass. This is the record to trust going forward — if it
disagrees with the original build prompt, this document is more current.

Branch: `feature/nova-assistant`. Deployed: `nova-chat` edge function is live
on the linked Supabase project as of this pass; the frontend chat panel is
built but not yet merged, so no in-app path calls it yet.

## Scope, as shipped

Two jobs, same as specced:

**Track A — how-to/FAQ**, answered from a cached, role-filtered knowledge
base (`nova_kb_entries`). **104 entries** (not 108 — the original count was
wrong; it included 4 legend lines from the file's header comment). Verified
against the live database: exactly 104 rows in the file, exactly 104 in
Postgres, zero dropped, zero extras.

**Track B — exactly two live-data tools**, unchanged in name/shape from the
spec:
- `get_sprint_due_today` — as specced.
- `get_my_followups_today` — **narrower than specced.** See below.

## Known deviation: `get_my_followups_today`'s "awaiting your response" category

The original brief described this as covering "pending sprint invites,
pending absence approvals if they're an approver." As shipped, it covers
**pending sprint access requests only**, sourced from the real
`sprint_access_requests` table (has an actual `status` column, verified
against live data with a known pending case and a known already-resolved
case — both came back correct).

Why narrower:
- There is no "sprint invite" notification type in real data. The actual
  in-app mechanism for an existing member requesting sprint access is
  `sprint_access_requests`, not an invite/accept flow — the KB content
  describing "Accept/Decline a Sprint Invite notification" describes a
  UX framing that doesn't match what's actually queryable. (This is a KB
  content question, not a tool-scope question — the KB entries themselves
  weren't audited for this discrepancy in this pass. Worth a follow-up.)
- There is **no backing table for absence-approval batches at all** — no
  `absence_approvals`, `absence_email_batches`, or equivalent exists.
  `absence_email_log` is a send log (`status: sent/failed`), not a pending-
  approval queue. Nine candidate table names were checked directly against
  the live schema; none of the absence-approval ones exist.

Rather than fabricate a query against something that isn't there, the tool
description now explicitly tells Nova not to imply it checked absence
approvals, even if asked by name.

**Decision needed:** is "sprint access requests only" acceptable coverage for
v1, or does this justify building a real pending-approvals table as a
near-term follow-up (which would also let the absence-email approval
workflow itself become queryable, not just Nova-visible)? Until decided,
treat "awaiting your response" as sprint-access-only in any user-facing
description of what Nova can do — don't let the original broader framing
leak into docs, onboarding, or support answers.

## Known gap: Org Chart / People directory RLS scope unconfirmed

The KB entry `tasks-department-visibility` claims "Ministry Calendar, Org
Chart, and People directory are visible org-wide" as the exception to
per-department task scoping. This was **not verified** — the `users` table's
SELECT policy has been touched by 6 separate migrations over time, and
tracing the current effective policy wasn't completed in this pass. This is
a privacy-adjacent claim (who can see whose contact info), not a cosmetic
one — confirm the actual current RLS behavior before treating this entry as
trustworthy for end users.

## What was live-verified against the real project (not simulated)

All of the following were run against the actual linked Supabase project
(`kraurtuhflouyorgtpun` / "NEXUS"), with a live Anthropic API call chain,
using two throwaway test accounts that were created and fully deleted
(including their `nova_query_log` rows) as part of this pass:

- **Migration applies cleanly**: 104/104 KB rows landed, zero errors.
- **Live RLS, real Postgres, two real accounts**: a `member` account was
  denied reading a super_admin/regional_secretary-only KB entry and denied
  writing to `nova_kb_entries`; a `super_admin` account was allowed both.
  `nova_query_log` cross-user isolation confirmed in both directions.
- **Prompt caching**: a clean miss→hit pair on a role queried for the first
  time — call 1: `cache_creation_input_tokens: 17265, cache_read_input_tokens: 0`;
  call 2 (same 5-minute window): `cache_creation_input_tokens: 0,
  cache_read_input_tokens: 17265`.
- **HTTP-level auth rejection**: no-auth-header, garbage bearer token, and a
  structurally-valid-but-forged JWT (fabricated `user_role: super_admin`
  claim, no real signature) were all rejected with 401 — the forged-JWT case
  is rejected by Supabase's platform gateway signature verification before
  the function's own code runs at all, meaning a crafted role claim is
  useless without the actual project signing secret.
- **KB content accuracy**: spot-checking against the real codebase (not just
  prose quality) found and fixed two factual errors — `meetings-transcription`
  falsely claimed audio is processed locally in the browser (it's actually
  sent to Deepgram, an external service); three `automations-*` entries gave
  a wrong navigation path (Settings → Automations doesn't exist; it's a
  top-level sidebar link).
- **KB_USED trailer never reaches the user**: the internal citation marker
  the model is asked to emit is stripped before any text reaches the client.
  An end-anchored strip was found to fail silently if the model ever placed
  the marker mid-response and kept talking afterward — fixed to strip
  globally regardless of position; regression-tested.

## Post-pass correction: Immerse narrowed to super_admin only

After the initial verification pass above, Immerse/Books access was
deliberately narrowed to `super_admin` only — `regional_secretary` no longer
has access at all. This was a product decision, not a bug fix to something
this build got wrong: the sidebar already had a pre-existing "Surprise"
placeholder shown to `regional_secretary` in place of a real Library link
(`src/components/layout/Sidebar.jsx`), which was the intended behavior all
along — it just wasn't the *only* behavior. Three other real, working entry
points still granted `regional_secretary` access and were undermining it:
- `App.jsx` — the `/books` route's `ProtectedRoute roles` list
- `Sidebar.jsx` — a separate command-list entry (not the "Surprise" block)
- `AppsPage.jsx` — a fully clickable "My Library" tile

All three are now `super_admin`-only, matching the placeholder. The KB was
updated to match: `immerse-what`, `immerse-access`, `immerse-share`, and
`immerse-manage` are now tagged `ARRAY['super_admin']` only (previously
`['super_admin','regional_secretary']`), and their answer text no longer
describes any regional_secretary-specific capability. `roles-regional-secretary`
was also updated — it lists "near-super-admin... with a few exceptions," and
Immerse/Books is now one of the named exceptions, so Nova doesn't imply
regional_secretary still has it via that entry instead. Total KB row count
is unchanged at 104 (role tags and content updated in place, no rows
added or removed).

## Known-imperfect, monitor after launch: track mislabeling

One out of four identical live calls to a plain how-to question ("How do I
create a task?") came back tagged `track: 'live_data'` instead of `'kb'` —
the model called a tool unnecessarily, then still answered correctly from
the knowledge base, but the track label (and therefore the "from your tasks"
vs "from the knowledge base" badge shown to the user, and the admin review
queue's categorization) was wrong for that one response. Not reproducible on
3 immediate retries. The system prompt was tightened to explicitly
discourage speculative tool calls ("never call a tool 'just in case'"); a
follow-up round of 6 how-to questions (including the closest-sounding
Track-B-adjacent phrasing, "How do sprint invites work?") came back 0/6
spurious, and both genuine Track B questions still correctly triggered their
tools afterward. This is *improved*, not *provably eliminated* — LLM
non-determinism means a zero-risk claim isn't honest. Watch the admin review
queue (`/admin/nova-review`) for the first couple of weeks of real usage for
any recurring pattern of mislabeled tracks, not just isolated flagged
answers.
