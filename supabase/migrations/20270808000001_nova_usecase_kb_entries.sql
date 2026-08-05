-- Nova KB: use-case / decision-point entries + related_slugs column.
--
-- "Use-case" entries answer "when should I use X vs Y" questions — they give
-- the nuance behind a choice, not just the steps. Kept in a separate migration
-- from the initial seed so they're easy to audit and extend independently.
--
-- Also adds related_slugs text[] to nova_kb_entries so each entry can
-- explicitly link back to foundational entries the reader might need first.
-- Using explicit authoring (not auto-similarity) because the KB is small
-- enough that manual linking is reliable and avoids false neighbours.

-- ── Schema ────────────────────────────────────────────────────────────────

alter table public.nova_kb_entries
  add column if not exists related_slugs text[] not null default '{}';

-- ── Use-case entries ─────────────────────────────────────────────────────

insert into public.nova_kb_entries
  (slug, question, answer, feature_area, applicable_roles, related_slugs)
values

(
  'sprints-custom-vs-multi-dept',
  'Should I create a custom sprint or a multi-department sprint?',
  'Both types have no department owner (neither is tied to a single department space), but they are meant for different situations.

**Multi-Department sprint** — choose this when your project explicitly spans two or more of our existing BLW Canada departments and you want Nexus to handle the team structure automatically. When you create a multi-department sprint you select which departments are involved; Nexus creates one team per department and auto-adds every active member from each. Sprint tasks become visible in each participating department''s space alongside that team''s regular tasks, so members see them without navigating to the Sprints section.

**Custom sprint** — choose this when the working group does not map to existing departments, or when you want complete control over who is in the sprint. No teams are auto-created, no members are auto-added. You hand-pick every participant after creation. Tasks in a custom sprint are sprint-only — they do not surface in any department space, so the work stays contained inside the Sprints section unless a member navigates there directly.

**Decision guide:**
- Cross-dept initiative where you want all dept members automatically in? → Multi-Department.
- Ad-hoc project team, external collaborators, or a group that crosses departments in a non-standard way? → Custom.
- Unsure who should be in it yet? → Custom is safer; add members incrementally.

In both cases you can still invite additional people (including external/temporary members) after creation via the Members tab.',
  'sprints',
  ARRAY['super_admin','regional_secretary','dept_lead','pastor','member'],
  ARRAY['sprints-what','sprints-create']
),

(
  'comms-campaign-vs-invitation',
  'Should I send this as a campaign or as an RSVP invitation?',
  'Both live in the Communications Hub, but they serve different purposes.

**Email Campaign** — use this when you are broadcasting news, updates, or announcements and do not need recipients to respond or RSVP. Campaigns support rich email templates, recipient segment targeting, and analytics (opens, clicks, delivery rates). There is no RSVP link or response-tracking built in — it is a one-way send.

**RSVP Invitation** — use this when you need to know who is coming. An invitation sends each recipient a personalised link to a branded RSVP page (no login required). When they click it they confirm attendance, and you see real-time response counts in the Invitations dashboard. Invitations are tied to a specific calendar event.

**Decision guide:**
- Announcing a policy change, sharing meeting notes, or sending a general newsletter? → Campaign.
- Inviting people to an event and need a headcount? → Invitation.
- Need both (announce AND collect RSVPs)? → Create the calendar event first, then use Invitations for the invite itself and a separate Campaign for any follow-up broadcasts to the same group.

One practical tip: if you already sent an invitation but want to follow up with non-responders, use a Campaign targeted to the segment of people who have not yet replied — the Communications Hub lets you filter recipients by RSVP status.',
  'communications',
  ARRAY['super_admin','regional_secretary','dept_lead','pastor','member'],
  ARRAY['comms-hub','comms-invitation-wizard','comms-send-campaign']
),

(
  'automations-scheduled-vs-event',
  'When should I use a due-date trigger versus an event trigger for an automation?',
  'The choice comes down to whether you want the automation to react to something happening, or to react to when something is due.

**Event triggers** (task status changed, task created, task assigned, comment added, meeting created, sprint started/ended) fire the moment that action occurs in Nexus. Use these when you want an immediate response to a change — for example, "when a task moves to Review status, notify the reviewer" or "when a new meeting is created, post to our Slack channel." The automation is reactive.

**Due-date triggers** (due date approaching, due date passed) fire based on a task''s due date relative to today''s date. Use these for time-based nudges — for example, "2 days before a task is due, send a reminder to the assignee" or "when a task is overdue, notify the department lead." The automation is time-driven.

**Decision guide:**
- React to a person doing something (status change, assignment, comment)? → Event trigger.
- React to time passing (overdue, approaching deadline)? → Due-date trigger.
- Want to do both? Create two separate automations — one event-based, one time-based — and chain them.

One nuance: due-date triggers only fire for tasks that have a due date set. If many of your tasks are created without due dates, a due-date trigger will silently skip those tasks. Consider pairing it with a "task created without a due date" alert if that is a real risk in your workflow.',
  'automations',
  ARRAY['super_admin','regional_secretary','dept_lead'],
  ARRAY['automations-what','automations-triggers','automations-create']
);
