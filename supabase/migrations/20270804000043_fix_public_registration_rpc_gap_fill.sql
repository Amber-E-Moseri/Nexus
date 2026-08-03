-- Fix get_public_registration_data to gap-fill from `registrations` for people
-- not on the working_list, mirroring the internal RegistrationDataTab logic.

create or replace function public.get_public_registration_data(p_token text)
returns table (
  row_num       bigint,
  full_name     text,
  subgroup      text,
  fellowship    text,
  registration_status text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_raw  jsonb;
  v_token text;
begin
  -- Read stored token from registration_config
  select value into v_raw
  from registration_config
  where key = 'tii2_public_token'
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
    combined.registration_status
  from (
    -- Primary: everyone on the working list (registered or not)
    select
      coalesce(r.full_name,   wl.full_name,   '') as full_name,
      coalesce(r.subgroup,    wl.subgroup,    '') as subgroup,
      coalesce(r.fellowship,  wl.fellowship,  '') as fellowship,
      case
        when r.email is null then 'not_registered'
        when ep.amount_paid is not null
          and (ep.amount_paid::numeric) > 0
          and (ep.amount_paid::numeric) >= (ep.amount_expected::numeric)
          then 'confirmed'
        else 'registered_outstanding'
      end as registration_status
    from working_list wl
    left join registrations  r  on lower(wl.email) = lower(r.email)
    left join event_payments ep on lower(wl.email) = lower(ep.email)

    union all

    -- Gap-fill: registrants not on the working list (e.g. manually added)
    select
      coalesce(r.full_name, '') as full_name,
      coalesce(r.subgroup,  '') as subgroup,
      coalesce(r.fellowship,'') as fellowship,
      case
        when ep.amount_paid is not null
          and (ep.amount_paid::numeric) > 0
          and (ep.amount_paid::numeric) >= (ep.amount_expected::numeric)
          then 'confirmed'
        else 'registered_outstanding'
      end as registration_status
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
