-- Update public registration RPC to account for manually_confirmed flag.
-- People with manually_confirmed = true show as 'confirmed' and carry a flag so the UI can label them.

create or replace function public.get_public_registration_data(p_token text)
returns table (
  row_num              bigint,
  full_name            text,
  subgroup             text,
  fellowship           text,
  registration_status  text,
  manually_confirmed   boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token_key  text;
  v_raw        jsonb;
  v_token      text;
begin
  select coalesce(ec.public_token_key, 'tii2_public_token')
  into v_token_key
  from event_configs ec
  where ec.is_active = true
  limit 1;

  v_token_key := coalesce(v_token_key, 'tii2_public_token');

  select value into v_raw
  from registration_config
  where key = v_token_key
  limit 1;

  if v_raw is null then
    return;
  end if;

  v_token := trim(both '"' from v_raw::text);

  if v_token is distinct from p_token then
    return;
  end if;

  return query
  select
    row_number() over (order by coalesce(combined.full_name, '')) as row_num,
    combined.full_name,
    combined.subgroup,
    combined.fellowship,
    combined.registration_status,
    combined.manually_confirmed
  from (
    select
      coalesce(r.full_name,   wl.full_name,   '') as full_name,
      coalesce(r.subgroup,    wl.subgroup,    '') as subgroup,
      coalesce(r.fellowship,  wl.fellowship,  '') as fellowship,
      case
        when r.email is null then 'not_registered'
        when coalesce(r.manually_confirmed, false) then 'confirmed'
        when ep.amount_paid is not null
          and (ep.amount_paid::numeric) > 0
          and (ep.amount_paid::numeric) >= (ep.amount_expected::numeric)
          then 'confirmed'
        else 'registered_outstanding'
      end as registration_status,
      coalesce(r.manually_confirmed, false) as manually_confirmed
    from working_list wl
    left join registrations  r  on lower(wl.email) = lower(r.email)
    left join event_payments ep on lower(wl.email) = lower(ep.email)

    union all

    select
      coalesce(r.full_name, '') as full_name,
      coalesce(r.subgroup,  '') as subgroup,
      coalesce(r.fellowship,'') as fellowship,
      case
        when coalesce(r.manually_confirmed, false) then 'confirmed'
        when ep.amount_paid is not null
          and (ep.amount_paid::numeric) > 0
          and (ep.amount_paid::numeric) >= (ep.amount_expected::numeric)
          then 'confirmed'
        else 'registered_outstanding'
      end as registration_status,
      coalesce(r.manually_confirmed, false) as manually_confirmed
    from registrations r
    left join event_payments ep on lower(r.email) = lower(ep.email)
    where not exists (
      select 1 from working_list wl where lower(wl.email) = lower(r.email)
    )
  ) combined
  order by coalesce(combined.full_name, '');
end;
$$;

grant execute on function public.get_public_registration_data(text) to anon, authenticated;
