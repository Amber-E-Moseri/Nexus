-- Atomic mention: notify + follow in one call, so the two can't partially fail
-- (notified-but-can't-open, or followed-but-never-notified). task_follows_user_create
-- RLS (with check (user_id = auth.uid()), 20261001000007_add_task_follows.sql) blocks
-- inserting a follow row for someone else, which is exactly the case here.
alter table public.task_follows
  add column if not exists added_via text not null default 'manual'
    check (added_via in ('manual', 'mention'));
alter table public.task_follows
  add column if not exists added_by uuid references public.users(id);
-- added_by is null for self-initiated (manual) follows; set to the mentioning actor's
-- id only when added_via = 'mention', giving a traceable "who granted this" audit trail.

-- Returns true if an in-app notification row was actually inserted (false if the
-- mentioned user has disabled in-app mention notifications via user_notification_prefs)
-- so the client knows whether to dispatch a push notification. The task_follows grant
-- happens unconditionally either way — visibility isn't a notification preference, it's
-- access, so it must not be skipped just because someone muted mention pings.
create or replace function public.mention_user_on_task(p_task_id uuid, p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_task record;
  v_actor_name text;
  v_mentions_disabled boolean;
begin
  select id, title, is_personal, assignee_id, created_by, department_id
  into v_task
  from public.tasks where id = p_task_id;

  if v_task.id is null then
    raise exception 'Task not found';
  end if;

  -- Base visibility via the shared predicate (20260718000000) — it already includes
  -- chaining through an existing follow (and pastor_members), so a follower can loop in
  -- a third person, not just the task's original assignee/creator/department member;
  -- otherwise mention-based collaboration only works one hop deep.
  if not public.user_can_view_task(p_task_id) then
    raise exception 'Not authorized to mention on this task';
  end if;

  -- Personal tasks: only the owner (assignee/creator) or super_admin may extend the
  -- follower chain. An already-looped-in follower (e.g. a secondary pastor) cannot
  -- unilaterally grant a fourth person visibility into someone's private task — no
  -- depth limit or consent otherwise exists for that chain, and the owner has no way to
  -- know who granted access beyond this restriction.
  if v_task.is_personal and not (
    v_task.assignee_id = auth.uid()
    or v_task.created_by = auth.uid()
    or public.current_user_role() = 'super_admin'
  ) then
    raise exception 'Only the task owner may loop in additional people on a personal task';
  end if;

  -- Upgrade-only: a prior manual follow (curiosity) becomes a tracked mention if the
  -- person is later legitimately mentioned, but an existing mention is never
  -- downgraded. Without the "where added_via = 'manual'" guard, ON CONFLICT DO NOTHING
  -- would silently make this a no-op on repeat mentions and the dept_lead monitoring
  -- clause (20260718000003) would never see the upgrade for someone who followed
  -- manually first.
  --
  -- Note (intentional, not a bug): because the WHERE guard only fires while
  -- added_via = 'manual', added_by always reflects the FIRST person who mentioned this
  -- user onto the task, not the most recent. If A follows manually, B mentions them
  -- (upgrade, added_by = B), then C also mentions them, added_by stays B. Treated as
  -- "original grantor," which is the useful field for the personal-task chain question
  -- ("who originally gave this person access") — not a most-recent-activity log.
  insert into public.task_follows (task_id, user_id, added_via, added_by)
  values (p_task_id, p_user_id, 'mention', auth.uid())
  on conflict (user_id, task_id) do update
    set added_via = 'mention', added_by = excluded.added_by
    where public.task_follows.added_via = 'manual';

  -- Self-mentions never notify (nothing to tell yourself), same as the old
  -- createMentionNotifications' `userId !== commenterId` filter.
  if p_user_id = auth.uid() then
    return false;
  end if;

  select exists (
    select 1 from public.user_notification_prefs
    where user_id = p_user_id and notification_type = 'mention' and in_app = false
  ) into v_mentions_disabled;

  if v_mentions_disabled then
    return false;
  end if;

  select name into v_actor_name from public.users where id = auth.uid();

  insert into public.notifications (user_id, type, payload)
  values (
    p_user_id,
    'mention',
    jsonb_build_object('actor_name', v_actor_name, 'task_title', v_task.title, 'task_id', p_task_id)
  );

  return true;
end;
$$;

grant execute on function public.mention_user_on_task(uuid, uuid) to authenticated;
