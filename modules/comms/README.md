# Comms — Email Campaigns & Invitation Management

## Problem

Reaching organization members by email required building recipient lists manually in a generic email client, with no tracking of delivery, opens, or clicks. Invitation management for events — collecting RSVPs, tracking responses, following up with people who didn't respond — was done by hand across individual email threads. The process didn't scale and produced no usable data about engagement.

## Key Technical Decisions

**Resend as the delivery layer with a full webhook feedback loop.** Outgoing emails are sent via Resend's API from the `send-communication-email` edge function. Resend's delivery webhooks (delivered, bounced, complained) are processed by a `resend-webhook` edge function that writes outcomes to a `campaign_recipients` table and automatically adds bounced addresses to a suppression list. All future sends check the suppression list before dispatch.

**Click tracking via edge function redirect.** Links in outgoing emails are rewritten at send time to route through a `track-click` edge function, which records the click timestamp and immediately redirects to the original URL. Open tracking uses Resend's built-in 1×1 pixel. Both are surfaced on a per-campaign analytics page with an open-rate time-series chart.

**Segment-based audience targeting, evaluated at send time.** Segments are built from combinations of department, role, tag, or explicit recipient lists (SegmentBuilder, SegmentBuilderAdvanced with inclusion/exclusion logic). Segments are stored as queries, not as saved member lists — they resolve at the moment a campaign is sent, so they always reflect current membership. A campaign targeting "all active members in the ORS department" automatically includes people added after the segment was defined.

**RSVP and invitation campaigns.** Invitation campaigns generate a per-recipient signed token, send a personalized email with an RSVP link, and provide a public RSVP page at `/public/rsvp/:token`. Aggregate response data (accepted, declined, no response) is visible on the campaign analytics page. A separate absentee follow-up flow (`send-absence-emails`) targets non-respondents with a configurable follow-up message.

## Schema Highlights

- `communication_campaigns`: `type` enum (broadcast, invitation, absentee-follow-up, reengagement), `status`, `scheduled_at`
- `campaign_recipients`: per-recipient tracking — `status` enum (sent, delivered, bounced, clicked, unsubscribed), `clicked_at`, `opened_at`
- `bounces` table with `email`, `bounce_type` (hard/soft), `timestamp` — feeds the suppression check
- React Email component templates for all transactional emails (invitation, confirmation, digest, reengagement)

## Engineering Challenge: Scheduling Without a Dedicated Scheduler

Campaigns can be scheduled for future delivery via a `scheduled_at` timestamp. The challenge: Supabase Edge Functions have no persistent cron trigger system, and the platform didn't want to introduce an external scheduler as a dependency.

The solution was to make the `broadcast-campaign` function trigger-agnostic. It reads all campaigns where `scheduled_at <= now() AND status = 'pending'` and processes them. The function can be called from three different contexts with identical behavior: by pg_cron running inside the Supabase database on a schedule, by a Vercel cron job as a fallback, or manually from the admin panel for immediate dispatch or testing. No shared state between triggers is needed; each invocation is idempotent because processed campaigns are immediately marked `status = 'sent'`. This architecture kept the local development workflow simple — running campaigns manually in dev required no scheduler configuration.
