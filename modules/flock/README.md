# Flock — Contact & Relationship Tracking

## Problem

Assigned field representatives in a distributed volunteer organization needed a way to track their assigned contacts, log call outcomes, and manage follow-up queues — without adopting a sales-oriented CRM that would expose other teams' data or require retraining around unfamiliar workflows. At the same time, regional managers needed a real-time workload view across the field team without seeing the contents of individual call notes. These two requirements — representative privacy and management visibility — had to coexist in the same system without separate deployments.

## Key Technical Decisions

**Three distinct views from one data model, scoped by role.** Field representatives see only their assigned contacts with call-status badges (Overdue, Due Today, Callback Due). Regional managers see an aggregate workload view: task-state counts per team member (active, overdue, monitoring) without individual contact details. Administrative observers can view contact lists without editing rights. The view routing happens at the React Router level based on the JWT `user_role` claim; all three views query the same tables.

**AI-assisted voice logging.** The `extract-flock-voice` edge function accepts a free-form voice note from the field representative, sends it to the Anthropic Claude API, and returns a structured call log entry (outcome classification, key points, next action date). Field representatives can log calls by dictating rather than filling out a form — reducing the friction that had caused follow-up logging to be skipped in the previous workflow.

**Module-level access restriction, row-level data scoping.** Which departments can access the Flock module at all is controlled in the application layer (route guards + role checks). Once inside, which contacts a user can see is enforced by RLS — field representatives can only read and write their own assigned contacts. This two-layer model separates "can you use this feature" from "what data can you touch."

## Schema Highlights

- Contacts stored in the shared `profiles` table with assignment fields (`assigned_rep_id`, `next_contact_date`, `contact_status`)
- Call log entries: `outcome` enum (Connected, Voicemail, No Answer, Callback Requested), free-text `notes`, `next_action_date`
- `FlockCallsDueWidget` on the dashboard surfaces the queue without requiring a full page visit
- Manager workload view is an aggregated query over the task system (`sprint_members` + task statuses), not a separate table

## Engineering Challenge: Idempotent Voice Log Submission

Voice logging introduces a retry problem: if the network drops after the edge function processes the audio but before the client receives the response, the user may tap "Submit" again — generating a duplicate log entry. Standard deduplication (unique constraints) doesn't apply here because the same call can legitimately be logged twice if the field representative retries intentionally after an error.

The solution: the `extract-flock-voice` edge function computes a content hash of the processed transcript and checks for a matching entry within a 5-minute window before inserting. If a match exists, it returns the existing record as if it were new. This makes voice submissions idempotent from the client's perspective, without requiring the client to generate or track a deduplication key.
