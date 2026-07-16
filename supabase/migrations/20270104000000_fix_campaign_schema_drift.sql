-- Fix schema drift blocking "New Campaign" / compose: the frontend has
-- queried/written two columns that were never migrated, so every
-- communication_campaigns and communication_email_templates SELECT 400s
-- (PostgREST: unknown column), breaking the campaigns list, the scheduled-
-- campaign poll, and the templates picker that compose/New Campaign depends
-- on.
--
--   • communication_campaigns.recurring_rule — CampaignPage.jsx selects it
--     (CAMPAIGN_SELECT) and writes it as jsonb ({ frequency, day_of_week,
--     time, end_date }) for recurring sends, but no migration ever added it.
--   • communication_email_templates.subject — EmailTemplatesPage.jsx selects
--     it, but the table (20260728000000) never defined it.

alter table public.communication_campaigns
  add column if not exists recurring_rule jsonb;

alter table public.communication_email_templates
  add column if not exists subject text;
