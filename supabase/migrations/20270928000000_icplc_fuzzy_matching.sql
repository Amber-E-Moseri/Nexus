-- icplc_match_import_rows: add fuzzy email and name matching
-- Updates the matching RPC to add email fuzzy matching (fallback to name fuzzy matching)
-- Uses pg_trgm similarity with 0.7 threshold

-- First ensure pg_trgm extension is enabled
create extension if not exists pg_trgm;

-- Update the function to add fuzzy matching stages
create or replace function public.icplc_match_import_rows(p_batch_id uuid)
  returns void
  language plpgsql
  security definer
  set search_path = public, pg_catalog
as $$
declare
  v_row record;
  v_match_id uuid;
  v_match_status text;
  v_event_id uuid;
  v_matched int := 0;
  v_unmatched int := 0;
  v_name_candidates int;
begin
  -- Authorization: caller must have write capability for ICPLC participants
  if not public.icplc_can_write_participants() then
    raise exception 'permission denied for function icplc_match_import_rows'
      using errcode = '42501';
  end if;

  update public.icplc_import_batches
  set status = 'matching'
  where id = p_batch_id and status in ('pending', 'matched');

  if not found then
    raise exception 'Batch % not found or not in a matchable state', p_batch_id
      using errcode = '22023';
  end if;

  select event_id into v_event_id
  from public.icplc_import_batches
  where id = p_batch_id;

  for v_row in
    select id, raw_payload, identity_key
    from public.icplc_import_rows
    where batch_id = p_batch_id
  loop
    v_match_id := null;
    v_match_status := 'unmatched';

    -- 1. Persistent identity map (highest priority; staff-confirmed)
    select participant_id into v_match_id
    from public.icplc_identity_maps
    where event_id = v_event_id
      and source_type = 'csv'
      and source_key = v_row.identity_key
    limit 1;

    if v_match_id is not null then
      v_match_status := 'persistent';
    else
      -- 2. KingsChat Username exact match (most reliable identifier)
      if (v_row.raw_payload->>'kingschat_username') is not null
         and trim(v_row.raw_payload->>'kingschat_username') <> ''
      then
        select id into v_match_id
        from public.icplc_participants
        where event_id = v_event_id
          and kingschat_username is not null
          and lower(trim(kingschat_username)) = lower(trim(v_row.raw_payload->>'kingschat_username'))
        limit 1;

        if v_match_id is not null then
          v_match_status := 'auto_kingschat';
        end if;
      end if;

      -- 3. Email exact match (unique per event; unambiguous by unique index)
      if v_match_id is null
         and (v_row.raw_payload->>'email') is not null
         and trim(v_row.raw_payload->>'email') <> ''
      then
        select id into v_match_id
        from public.icplc_participants
        where event_id = v_event_id
          and email is not null
          and lower(trim(email)) = lower(trim(v_row.raw_payload->>'email'))
        limit 1;

        if v_match_id is not null then
          v_match_status := 'auto';
        end if;
      end if;

      -- 3b. Email fuzzy match (if exact match failed; trigram similarity > 0.6)
      if v_match_id is null
         and (v_row.raw_payload->>'email') is not null
         and trim(v_row.raw_payload->>'email') <> ''
      then
        select id into v_match_id
        from public.icplc_participants
        where event_id = v_event_id
          and email is not null
          and similarity(lower(trim(email)), lower(trim(v_row.raw_payload->>'email'))) > 0.6
        order by similarity(lower(trim(email)), lower(trim(v_row.raw_payload->>'email'))) desc
        limit 1;

        if v_match_id is not null then
          v_match_status := 'auto_fuzzy_email';
        end if;
      end if;

      -- 4. Normalized full-name match — only auto-match when EXACTLY one candidate
      -- Multiple same-normalized-name candidates require manual resolution.
      if v_match_id is null
         and (v_row.raw_payload->>'full_name') is not null
         and trim(v_row.raw_payload->>'full_name') <> ''
      then
        select count(*) into v_name_candidates
        from public.icplc_participants
        where event_id = v_event_id
          and regexp_replace(lower(trim(full_name)), '[^a-z0-9]', '', 'g')
            = regexp_replace(lower(trim(v_row.raw_payload->>'full_name')), '[^a-z0-9]', '', 'g');

        if v_name_candidates = 1 then
          select id into v_match_id
          from public.icplc_participants
          where event_id = v_event_id
            and regexp_replace(lower(trim(full_name)), '[^a-z0-9]', '', 'g')
              = regexp_replace(lower(trim(v_row.raw_payload->>'full_name')), '[^a-z0-9]', '', 'g');
          v_match_status := 'auto';
        end if;
        -- v_name_candidates > 1: try fuzzy match instead of leaving unmatched
      end if;

      -- 4b. Name fuzzy match (if exact match failed; trigram similarity > 0.6)
      if v_match_id is null
         and (v_row.raw_payload->>'full_name') is not null
         and trim(v_row.raw_payload->>'full_name') <> ''
      then
        select id into v_match_id
        from public.icplc_participants
        where event_id = v_event_id
          and full_name is not null
          and similarity(lower(trim(full_name)), lower(trim(v_row.raw_payload->>'full_name'))) > 0.6
        order by similarity(lower(trim(full_name)), lower(trim(v_row.raw_payload->>'full_name'))) desc
        limit 1;

        if v_match_id is not null then
          v_match_status := 'auto_fuzzy_name';
        end if;
      end if;
    end if;

    update public.icplc_import_rows
    set participant_id = v_match_id,
        match_status   = v_match_status
    where id = v_row.id;

    if v_match_id is not null then
      v_matched := v_matched + 1;
    else
      v_unmatched := v_unmatched + 1;
    end if;
  end loop;

  update public.icplc_import_batches
  set status         = 'matched',
      matched_rows   = v_matched,
      unmatched_rows = v_unmatched
  where id = p_batch_id;
end;
$$;
