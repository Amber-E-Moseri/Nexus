-- PROPOSED — NOT A MIGRATION, NOT APPLIED. Lives under docs/ on purpose so `supabase db push` never picks it up.
-- To apply it must be copied into supabase/migrations with the next collision-free version that sorts
-- BEFORE 20271002000002 (so the scheduler repair cannot run against the stale backlog), e.g.
-- 20271002000000_expire_obsolete_task_email_backlog.sql, after explicit approval.
--
-- Decision (2026-10-02): EXPIRE OBSOLETE ONLY. Narrow, auditable, idempotent, limited to the exact cohort
-- classified by the read-only dry run (165 pending → 153 would expire, 12 retained).
--
--   * Cohort frozen by created_at <= the cutoff literal below (newest pending row at dry-run time was
--     2026-09-29 23:43 UTC), so rows created later are never touched.
--   * "Expire" = stamp email_sent_at (the existing "processed" marker the batch job and the per-row
--     dispatcher already honour). No new lifecycle model. The reason is recorded in a tiny audit table so
--     the operation is attributable and reversible.
--   * Idempotent: only rows still email_sent_at IS NULL are touched; the audit insert is ON CONFLICT DO NOTHING.
--   * Guard: aborts if the cohort is unexpectedly large.
--   * Never mutates payloads, read flags, or any row outside the cohort. In-app notifications are unaffected.
--
-- Reasons (first match wins; identical to the dry run):
--   not_a_batch_type            type is not one the batch email job ever processes
--   task_deleted_or_missing     referenced task deleted or no longer exists
--   task_archived               referenced task archived
--   task_completed_or_cancelled referenced task completed (completed_at / category) or cancelled
--   sprint_closed_or_missing    referenced sprint not 'active' or missing
--   informational_older_than_7d informational / time-sensitive type older than 7 days
-- Rows for still-actionable entities (active task or active sprint, actionable type) are RETAINED even if old.

create table if not exists public.notification_email_expiry_audit (
  notification_id uuid primary key references public.notifications(id) on delete cascade,
  reason          text        not null,
  batch           text        not null,
  expired_at      timestamptz not null default now()
);
alter table public.notification_email_expiry_audit enable row level security;
revoke all on public.notification_email_expiry_audit from public, anon, authenticated; -- service/admin only

do $$
declare
  c_cutoff constant timestamptz := timestamptz '2026-09-30 00:00:00+00';
  c_batch  constant text        := 'phase0-2026-10-02-obsolete-backlog';
  v_cohort int;
  v_stamped int;
begin
  create temporary table _cohort on commit drop as
  with pending as (
    select n.id, n.user_id, n.type, n.created_at,
           case when n.payload->>'task_id'   ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then (n.payload->>'task_id')::uuid end   as task_id,
           case when n.payload->>'sprint_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then (n.payload->>'sprint_id')::uuid end as sprint_id
    from public.notifications n
    where n.email_sent_at is null
      and n.created_at <= c_cutoff
  ), ctx as (
    select p.*,
      t.id as t_id, t.deleted_at as t_deleted, t.archived_at as t_archived, t.completed_at as t_completed, d.category as t_category,
      s.id as s_id, s.status as s_status,
      (p.type in ('task_assigned','task_comment','comment_added','mention','task_due_soon','task_completed','subtask_completed','dependency_cleared','sprint_added','sprint_status','sprint_access_requested','sprint_access_approved','sprint_access_rejected')) as batch_type,
      (p.type in ('task_completed','subtask_completed','dependency_cleared','sprint_status','sprint_added','sprint_access_requested','sprint_access_approved','sprint_access_rejected','task_due_soon')) as informational
    from pending p
    left join public.tasks t on t.id = p.task_id
    left join public.task_status_definitions d on d.id = t.status_id
    left join public.sprints s on s.id = p.sprint_id
  )
  select id,
    case
      when not batch_type then 'not_a_batch_type'
      when task_id is not null and (t_id is null or t_deleted is not null) then 'task_deleted_or_missing'
      when task_id is not null and t_archived is not null then 'task_archived'
      when task_id is not null and (t_completed is not null or t_category in ('completed','cancelled')) then 'task_completed_or_cancelled'
      when sprint_id is not null and (s_id is null or s_status <> 'active') then 'sprint_closed_or_missing'
      when informational and created_at < c_cutoff - interval '7 days' then 'informational_older_than_7d'
    end as reason
  from ctx;

  delete from _cohort where reason is null;            -- keep ONLY the obsolete cohort
  select count(*) into v_cohort from _cohort;

  if v_cohort > 200 then
    raise exception 'backlog expiry aborted: cohort % exceeds the approved ceiling (200); re-run the dry run', v_cohort;
  end if;

  insert into public.notification_email_expiry_audit (notification_id, reason, batch)
  select id, reason, c_batch from _cohort
  on conflict (notification_id) do nothing;

  update public.notifications n
     set email_sent_at = now()
   where n.id in (select id from _cohort)
     and n.email_sent_at is null;
  get diagnostics v_stamped = row_count;

  raise notice 'obsolete email backlog expiry: cohort=% stamped=% batch=%', v_cohort, v_stamped, c_batch;
end $$;

-- ROLLBACK (manual, only if ever needed): restores the rows to pending exactly as they were.
--   update public.notifications n set email_sent_at = null
--     from public.notification_email_expiry_audit a
--    where a.notification_id = n.id and a.batch = 'phase0-2026-10-02-obsolete-backlog';
