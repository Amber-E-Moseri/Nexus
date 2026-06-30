-- ============================================================================
-- RSVP SYSTEM RPC FUNCTIONS
-- ============================================================================

-- 1. Bulk insert recipients with auto-generated RSVP tokens
create or replace function create_invitation_recipients_batch(
  p_campaign_id uuid,
  p_recipients jsonb -- [{email, name, custom_fields}, ...]
)
returns table (
  recipient_id uuid,
  email text,
  rsvp_token text
) as $$
declare
  v_recipient jsonb;
  v_token text;
  v_campaign_org_id uuid;
  v_chars text := 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  i int;
begin
  -- Security: Verify campaign exists & belongs to user's org
  select org_id into v_campaign_org_id
  from invitation_campaigns
  where id = p_campaign_id;
  if v_campaign_org_id is null then
    raise exception 'Campaign not found: %', p_campaign_id;
  end if;
  if v_campaign_org_id != (auth.jwt() ->> 'org_id')::uuid
     and (auth.jwt() ->> 'role') != 'super_admin' then
    raise exception 'Unauthorized: Campaign belongs to different org';
  end if;
  -- Bulk insert
  for v_recipient in select * from jsonb_array_elements(p_recipients)
  loop
    -- Generate unique token
    v_token := '';
    for i in 1..48 loop
      v_token := v_token || substr(v_chars, floor(random() * 62)::int + 1, 1);
    end loop;
    insert into invitation_recipients (
      campaign_id,
      recipient_email,
      recipient_name,
      custom_fields,
      rsvp_token,
      status
    ) values (
      p_campaign_id,
      v_recipient->>'email',
      v_recipient->>'name',
      coalesce(v_recipient->'custom_fields', '{}'::jsonb),
      v_token,
      'pending'
    )
    on conflict (campaign_id, recipient_email) do update
    set custom_fields = excluded.custom_fields, updated_at = now()
    returning
      id as recipient_id,
      recipient_email as email,
      rsvp_token as rsvp_token;
  end loop;
end;
$$ language plpgsql security definer;

-- 2. Handle RSVP submission (public function, no auth required)
create or replace function submit_rsvp(
  p_rsvp_token text,
  p_response text, -- 'yes', 'no', 'maybe'
  p_notes text default null
)
returns jsonb as $$
declare
  v_recipient_id uuid;
  v_campaign_id uuid;
  v_campaign_title text;
  v_event_date date;
begin
  -- Validate response
  if p_response not in ('yes', 'no', 'maybe') then
    raise exception 'Invalid RSVP response: %', p_response;
  end if;
  -- Lookup recipient by token
  select id, campaign_id into v_recipient_id, v_campaign_id
  from invitation_recipients
  where rsvp_token = p_rsvp_token
  limit 1;
  if v_recipient_id is null then
    raise exception 'Invalid or expired RSVP token';
  end if;
  -- Get campaign details for response
  select title, event_date into v_campaign_title, v_event_date
  from invitation_campaigns
  where id = v_campaign_id;
  -- Update recipient RSVP
  update invitation_recipients
  set
    rsvp_response = p_response,
    rsvp_at = now(),
    rsvp_notes = p_notes,
    updated_at = now()
  where id = v_recipient_id;
  -- Log activity
  insert into invitation_activity_log (
    campaign_id,
    action,
    metadata
  ) values (
    v_campaign_id,
    'rsvp_submitted',
    jsonb_build_object(
      'recipient_id', v_recipient_id,
      'response', p_response
    )
  );
  -- Return confirmation
  return jsonb_build_object(
    'success', true,
    'message', format('Thanks! Your RSVP (%s) for "%s" on %s has been recorded.',
      p_response, v_campaign_title, v_event_date),
    'campaign_title', v_campaign_title,
    'event_date', v_event_date,
    'rsvp_response', p_response
  );
end;
$$ language plpgsql;

-- 3. Get guest list for campaign (shows who's coming)
create or replace function get_campaign_guest_list(
  p_campaign_id uuid
)
returns table (
  recipient_name text,
  recipient_email text,
  rsvp_response text,
  rsvp_at timestamp with time zone,
  rsvp_notes text
) as $$
begin
  return query
  select ir.recipient_name, ir.recipient_email, ir.rsvp_response, ir.rsvp_at, ir.rsvp_notes
  from invitation_recipients ir
  join invitation_campaigns ic on ir.campaign_id = ic.id
  where ir.campaign_id = p_campaign_id
    and (
      ic.org_id = (auth.jwt() ->> 'org_id')::uuid
      or (auth.jwt() ->> 'role') = 'super_admin'
    )
  order by
    rsvp_response desc,
    recipient_name asc;
end;
$$ language plpgsql security definer;

-- 4. Get campaign RSVP summary (for dashboard)
create or replace function get_campaign_rsvp_summary(
  p_campaign_id uuid
)
returns table (
  total_sent int,
  responded int,
  rsvp_yes int,
  rsvp_no int,
  rsvp_maybe int,
  response_rate numeric
) as $$
begin
  return query
  select
    (select count(*)::int from invitation_recipients where campaign_id = p_campaign_id),
    (select count(*)::int from invitation_recipients where campaign_id = p_campaign_id and rsvp_response != 'pending'),
    (select count(*)::int from invitation_recipients where campaign_id = p_campaign_id and rsvp_response = 'yes'),
    (select count(*)::int from invitation_recipients where campaign_id = p_campaign_id and rsvp_response = 'no'),
    (select count(*)::int from invitation_recipients where campaign_id = p_campaign_id and rsvp_response = 'maybe'),
    (
      select (count(*) filter (where rsvp_response != 'pending')::numeric /
              nullif(count(*)::numeric, 0) * 100)
      from invitation_recipients
      where campaign_id = p_campaign_id
    )::numeric;
end;
$$ language plpgsql security definer;

-- 5. Queue reminders (called by edge function or cron)
create or replace function queue_invitation_reminders(
  p_reminder_type text -- '3d' or '1d'
)
returns table (
  campaign_id uuid,
  reminder_count int
) as $$
declare
  v_days_until int := case when p_reminder_type = '3d' then 3 when p_reminder_type = '1d' then 1 else null end;
  v_campaign record;
begin
  if v_days_until is null then
    raise exception 'Invalid reminder type: %', p_reminder_type;
  end if;
  for v_campaign in
    select ic.id, ic.title, ic.event_date
    from invitation_campaigns ic
    where ic.status = 'sent'
      and ic.event_date = (current_date + v_days_until)
      and (
        (p_reminder_type = '3d' and ic.reminder_3d_sent = false)
        or (p_reminder_type = '1d' and ic.reminder_1d_sent = false)
      )
  loop
    -- Mark as queued
    if p_reminder_type = '3d' then
      update invitation_campaigns set reminder_3d_sent = true where id = v_campaign.id;
    elsif p_reminder_type = '1d' then
      update invitation_campaigns set reminder_1d_sent = true where id = v_campaign.id;
    end if;
    -- Log activity
    insert into invitation_activity_log (campaign_id, action, metadata)
    values (v_campaign.id, format('reminder_%s_queued', p_reminder_type), '{}'::jsonb);
    return query
    select v_campaign.id, (select count(*)::int from invitation_recipients where campaign_id = v_campaign.id);
  end loop;
end;
$$ language plpgsql security definer;
