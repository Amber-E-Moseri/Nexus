-- Keep unsubscribe credentials separate from actual opt-outs, and move due
-- campaign dispatch to the database so it is not dependent on an open browser.

alter table public.communication_unsubscribe_tokens
  add column if not exists token_hash text,
  add column if not exists used_at timestamptz;

create unique index if not exists communication_unsubscribe_tokens_email_unique
  on public.communication_unsubscribe_tokens (email);
create unique index if not exists communication_unsubscribe_tokens_hash_unique
  on public.communication_unsubscribe_tokens (token_hash)
  where token_hash is not null;

-- The sender now writes token_hash. Legacy token rows remain valid through the
-- fallback in handle-unsubscribe until they expire.
alter table public.communication_unsubscribes
  add column if not exists is_unsubscribed boolean not null default true;

create or replace function public.is_comms_manager()
returns boolean
language sql
stable
as $$
  select public.current_user_role() in ('super_admin', 'regional_secretary')
    or public.has_space_role_anywhere(auth.uid(), 'ors')
    or public.has_space_role_anywhere(auth.uid(), 'programs')
    or public.has_space_role_anywhere(auth.uid(), 'dept_lead');
$$;

create or replace function public.dispatch_due_communication_campaigns()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_campaign_id uuid;
  v_url text := public.app_setting('supabase_url');
  v_key text := public.app_setting('service_role_key');
begin
  if v_url is null or v_key is null then
    raise log 'communications dispatcher is not configured';
    return;
  end if;

  for v_campaign_id in
    update public.communication_campaigns
    set status = 'sending', updated_at = now()
    where status = 'scheduled' and scheduled_at <= now()
    returning id
  loop
    perform http_post(
      url := v_url || '/functions/v1/send-communication-email',
      body := json_build_object('campaign_id', v_campaign_id)::text,
      content_type := 'application/json',
      headers := array[http_header('Authorization', 'Bearer ' || v_key)]
    );
  end loop;
end;
$$;

grant execute on function public.dispatch_due_communication_campaigns() to service_role;

do $$ begin
  perform cron.unschedule('dispatch-due-communication-campaigns');
exception when others then null;
end $$;

select cron.schedule(
  'dispatch-due-communication-campaigns',
  '* * * * *',
  $$select public.dispatch_due_communication_campaigns();$$
);
