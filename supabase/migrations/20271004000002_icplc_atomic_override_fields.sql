-- ICPLC: atomic override_fields changes (F3)
--
-- PROBLEM (reproduced with scratch tests; see src/tests/icplc/overrideFieldsAtomic.test.js)
--   Staff corrections are protected from re-imports by participant.override_fields. Three client hooks changed it by
--   READ -> merge in the browser -> WRITE THE WHOLE OBJECT, using a cached copy (profile cache, or the list row, up to
--   30 s old):
--     * useUpdateProfile / useClearFieldOverride: with no cached profile, "clear one override" wrote {} and removed
--       protection from EVERY field of that person;
--     * any of them, with a stale cache, silently dropped an override another staff member had added meanwhile;
--     * useTravelLock built the object from the list row, dropping concurrent overrides;
--     * the "Make Primary" email swap sent a whole override_fields object the same way.
--   Consequence: a staff correction stopped being protected and the next CSV/CMP import could overwrite it, which is
--   exactly what override_fields exists to prevent.
--
-- FIX
--   Two SECURITY INVOKER functions that change only the keys they are told to, in a SINGLE UPDATE statement. The row
--   lock serialises concurrent callers and Postgres re-evaluates the expression against the latest committed row, so
--   concurrent changes to different fields can no longer overwrite each other.
--     icplc_apply_override_changes(participant, set_fields[], clear_fields[])  clear first, then set
--     icplc_swap_override_keys(participant, key_a, key_b)                      atomic exchange of two keys
--   * SECURITY INVOKER: row-level security still decides who may update which participant (event-scoped, and Group
--     Pastors are excluded). There is no authorization logic here to get out of step.
--   * The override entry's `by` and `at` are stamped from auth.uid() and now() on the server, not trusted from the client.
--   * They touch override_fields only. They are not a generic participant updater.
--   * Unknown participant / no access raises 42501 instead of reporting success.

create or replace function public.icplc_apply_override_changes(
  p_participant_id uuid,
  p_set_fields     text[] default '{}',
  p_clear_fields   text[] default '{}'
) returns jsonb
  language plpgsql security invoker
  set search_path = public, pg_catalog as $$
declare
  v_uid    uuid := auth.uid();
  v_result jsonb;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  update public.icplc_participants p
     set override_fields =
           (coalesce(p.override_fields, '{}'::jsonb) - coalesce(p_clear_fields, '{}'::text[]))
           || coalesce((
                select jsonb_object_agg(
                         f,
                         jsonb_build_object(
                           'overridden', true,
                           'by', v_uid,
                           'at', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
                         )
                       )
                from unnest(coalesce(p_set_fields, '{}'::text[])) as f
                where f is not null and btrim(f) <> ''
              ), '{}'::jsonb)
   where p.id = p_participant_id
  returning p.override_fields into v_result;

  if not found then
    raise exception 'participant not found or no access' using errcode = '42501';
  end if;
  return v_result;
end
$$;

create or replace function public.icplc_swap_override_keys(
  p_participant_id uuid,
  p_key_a          text,
  p_key_b          text
) returns jsonb
  language plpgsql security invoker
  set search_path = public, pg_catalog as $$
declare
  v_uid    uuid := auth.uid();
  v_result jsonb;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  update public.icplc_participants p
     set override_fields =
           (coalesce(p.override_fields, '{}'::jsonb) - p_key_a - p_key_b)
           || case when coalesce(p.override_fields, '{}'::jsonb) ? p_key_a
                   then jsonb_build_object(p_key_b, p.override_fields -> p_key_a) else '{}'::jsonb end
           || case when coalesce(p.override_fields, '{}'::jsonb) ? p_key_b
                   then jsonb_build_object(p_key_a, p.override_fields -> p_key_b) else '{}'::jsonb end
   where p.id = p_participant_id
  returning p.override_fields into v_result;

  if not found then
    raise exception 'participant not found or no access' using errcode = '42501';
  end if;
  return v_result;
end
$$;

revoke execute on function public.icplc_apply_override_changes(uuid, text[], text[]) from anon, public;
revoke execute on function public.icplc_swap_override_keys(uuid, text, text)        from anon, public;
grant  execute on function public.icplc_apply_override_changes(uuid, text[], text[]) to authenticated;
grant  execute on function public.icplc_swap_override_keys(uuid, text, text)        to authenticated;
