-- ============================================================================
-- INVITATION CAMPAIGNS — RPCs
-- Ports the disabled .bak_20260625000001_rsvp_rpc_functions.sql draft, with
-- fixes:
--   - submit_rsvp is now `security definer` (the confirmed root bug — without
--     this, the anonymous/guest caller has no RLS path to invitation_recipients
--     at all, since that table grants nothing to `anon`).
--   - Authz checks rewritten from org_id/JWT-claims style to
--     public.current_user_role().
--   - Activity logging goes through the existing public.activity_log table,
--     not a bespoke invitation_activity_log (which is not created — see
--     schema migration's comments).
--
-- Deliberately NOT ported: create_invitation_recipients_batch (nothing calls
-- it — Step4PreviewSend.jsx already does a client-side batch insert) and
-- queue_invitation_reminders (its only caller, send-invitation-reminders edge
-- function, isn't scheduled anywhere — no cron migration references it,
-- unlike the analogous due-date-reminders). Both can be added later as a
-- follow-up once the core send→RSVP loop is confirmed working.
-- ============================================================================

-- ─── Public: submit an RSVP by token (no auth required) ──────────────────

create or replace function public.submit_rsvp(
  p_rsvp_token text,
  p_response text,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_recipient_id uuid;
  v_campaign_id uuid;
  v_campaign_title text;
begin
  if p_response not in ('yes', 'no', 'maybe') then
    raise exception 'Invalid RSVP response: %', p_response;
  end if;

  select id, campaign_id into v_recipient_id, v_campaign_id
  from public.invitation_recipients
  where rsvp_token = p_rsvp_token
  limit 1;

  if v_recipient_id is null then
    raise exception 'Invalid or expired RSVP token';
  end if;

  select title into v_campaign_title
  from public.invitation_campaigns
  where id = v_campaign_id;

  update public.invitation_recipients
  set
    rsvp_response = p_response,
    rsvp_at = now(),
    rsvp_notes = p_notes,
    updated_at = now()
  where id = v_recipient_id;

  insert into public.activity_log (user_id, action, entity_type, entity_id)
  values (null, 'invitation_rsvp_' || p_response, 'invitation_campaign', v_campaign_id);

  return jsonb_build_object(
    'success', true,
    'message', format('Thanks! Your RSVP (%s) for "%s" has been recorded.', p_response, v_campaign_title),
    'campaign_title', v_campaign_title,
    'rsvp_response', p_response
  );
end;
$$;

grant execute on function public.submit_rsvp(text, text, text) to anon, authenticated;

-- ─── Authenticated: guest list for a campaign ─────────────────────────────

create or replace function public.get_campaign_guest_list(p_campaign_id uuid)
returns table (
  recipient_name text,
  recipient_email text,
  rsvp_response text,
  rsvp_at timestamptz,
  rsvp_notes text
)
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if public.current_user_role() not in ('dept_lead', 'pastor', 'regional_secretary', 'super_admin') then
    raise exception 'Unauthorized';
  end if;

  return query
  select ir.recipient_name, ir.recipient_email, ir.rsvp_response, ir.rsvp_at, ir.rsvp_notes
  from public.invitation_recipients ir
  where ir.campaign_id = p_campaign_id
  order by ir.rsvp_response desc, ir.recipient_name asc;
end;
$$;

grant execute on function public.get_campaign_guest_list(uuid) to authenticated;

-- ─── Authenticated: RSVP summary for a campaign (dashboard/detail page) ──

create or replace function public.get_campaign_rsvp_summary(p_campaign_id uuid)
returns table (
  total_sent int,
  responded int,
  rsvp_yes int,
  rsvp_no int,
  rsvp_maybe int,
  response_rate numeric
)
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if public.current_user_role() not in ('dept_lead', 'pastor', 'regional_secretary', 'super_admin') then
    raise exception 'Unauthorized';
  end if;

  return query
  select
    (select count(*)::int from public.invitation_recipients where campaign_id = p_campaign_id),
    (select count(*)::int from public.invitation_recipients where campaign_id = p_campaign_id and rsvp_response != 'pending'),
    (select count(*)::int from public.invitation_recipients where campaign_id = p_campaign_id and rsvp_response = 'yes'),
    (select count(*)::int from public.invitation_recipients where campaign_id = p_campaign_id and rsvp_response = 'no'),
    (select count(*)::int from public.invitation_recipients where campaign_id = p_campaign_id and rsvp_response = 'maybe'),
    (
      select (count(*) filter (where rsvp_response != 'pending')::numeric /
              nullif(count(*)::numeric, 0) * 100)
      from public.invitation_recipients
      where campaign_id = p_campaign_id
    )::numeric;
end;
$$;

grant execute on function public.get_campaign_rsvp_summary(uuid) to authenticated;

comment on function public.submit_rsvp(text, text, text) is
  'Anonymous-safe RSVP submission by token. security definer is load-bearing — invitation_recipients grants nothing to anon directly.';
