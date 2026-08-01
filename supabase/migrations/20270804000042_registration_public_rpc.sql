-- Public read-only RPC for the This Is It 2.0 registration data share link.
-- No auth required: the caller supplies the secret token; if it doesn't match
-- the stored value the function returns an empty result set.
--
-- Only the four safe columns are returned — no phone, no email address.

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
  -- Read stored token from registration_config (value is jsonb, strip JSON string quotes)
  select value into v_raw
  from registration_config
  where key = 'tii2_public_token'
  limit 1;

  if v_raw is null then
    return;  -- token was never generated
  end if;

  -- jsonb string value arrives as "\"abc\"", trim surrounding quotes
  v_token := trim(both '"' from v_raw::text);

  if v_token is distinct from p_token then
    return;  -- wrong / expired token → empty result
  end if;

  return query
  select
    row_number() over (order by coalesce(r.full_name, wl.full_name)) as row_num,
    coalesce(r.full_name,   wl.full_name,   '')                      as full_name,
    coalesce(r.subgroup,    wl.subgroup,    '')                      as subgroup,
    coalesce(r.fellowship,  wl.fellowship,  '')                      as fellowship,
    case
      when r.email is null then 'not_registered'
      when ep.amount_paid  is not null
        and (ep.amount_paid::numeric)  > 0
        and (ep.amount_paid::numeric) >= (ep.amount_expected::numeric)
        then 'confirmed'
      else 'registered_outstanding'
    end                                                               as registration_status
  from working_list wl
  left join registrations  r  on lower(wl.email) = lower(r.email)
  left join event_payments ep on lower(wl.email) = lower(ep.email)
  order by coalesce(r.full_name, wl.full_name);
end;
$$;

-- Allow the anon key (unauthenticated callers) to execute this function
grant execute on function public.get_public_registration_data(text) to anon, authenticated;
