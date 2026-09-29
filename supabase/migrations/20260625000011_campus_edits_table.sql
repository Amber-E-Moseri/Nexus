-- Campus edits table: tracks pending/approved/rejected changes to campus data
-- Two-phase workflow: users submit → ORS reviews and approves
--
-- GUARD: campuses table created later by 20261001000006.
-- Forward convergence at 20261215999999_ensure_campus_edits.sql.

DO $guard$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'campuses' AND relnamespace = 'public'::regnamespace)
  THEN
    EXECUTE $ddl$
      create table if not exists public.campus_edits (
        id uuid primary key default gen_random_uuid(),
        campus_id uuid not null references public.campuses(id) on delete cascade,
        field_name text not null,
        old_value text,
        new_value text not null,
        submitted_by uuid not null references auth.users(id) on delete cascade,
        submitted_at timestamp with time zone default now(),
        status text not null default 'pending'
          check (status in ('pending', 'approved', 'rejected')),
        reviewed_by uuid references auth.users(id),
        reviewed_at timestamp with time zone,
        notes text,
        created_at timestamp with time zone default now()
      )
    $ddl$;

    EXECUTE 'create index if not exists idx_campus_edits_status on public.campus_edits(status)';
    EXECUTE 'create index if not exists idx_campus_edits_campus_id on public.campus_edits(campus_id)';
    EXECUTE 'create index if not exists idx_campus_edits_submitted_by on public.campus_edits(submitted_by)';
    EXECUTE 'alter table public.campus_edits enable row level security';

    EXECUTE $pol$
      create policy "campus_edits_select_own_or_admin"
      on public.campus_edits
      for select to authenticated
      using (
        auth.uid() = submitted_by
        or (select role from public.users where id = auth.uid()) in ('super_admin', 'ors')
      )
    $pol$;

    EXECUTE $pol2$
      create policy "campus_edits_insert_authenticated"
      on public.campus_edits
      for insert to authenticated
      with check (auth.uid() = submitted_by)
    $pol2$;

    EXECUTE $pol3$
      create policy "campus_edits_update_admin_only"
      on public.campus_edits
      for update to authenticated
      using ((select role from public.users where id = auth.uid()) in ('super_admin', 'ors'))
    $pol3$;
  END IF;
END;
$guard$;
