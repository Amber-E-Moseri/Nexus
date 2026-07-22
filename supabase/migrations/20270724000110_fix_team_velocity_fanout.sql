-- =============================================================================
-- Fix: Team Velocity widget showing completion rates over 100% (400%, 700%)
-- -----------------------------------------------------------------------------
-- get_team_velocity() joined sprint_members and users into the FROM clause,
-- but neither alias (sm/u) was referenced anywhere in the SELECT list or the
-- completion math — they were only there, apparently, to feed the WHERE
-- clause's department filter, which actually uses its own independent
-- correlated subquery (sm2/u2) instead. The dead join wasn't harmless: it
-- fanned out every task row once per sprint member before the aggregation
-- ran. total_count correctly deduped with count(distinct t.id), but
-- completed_count summed a plain 1/0 per joined row with no dedup — so a
-- sprint with 8 members counted each of its completed tasks up to 8 times,
-- inflating completion_rate_percent past 100%. The widget's bar-height CSS
-- has no upper clamp on that percentage, so a 700% rate rendered a bar 7x
-- taller than its container — visually overflowing across the rest of the
-- page (the "expands over other widgets" symptom).
--
-- Fix: drop the two unused joins entirely (they were never needed — the
-- department filter's own subquery is self-contained) so tasks are joined
-- to sprints exactly once, matching total_count's already-correct grouping.
-- =============================================================================

create or replace function public.get_team_velocity(p_dept_id uuid, p_sprint_count integer default 4)
returns table(sprint_id uuid, sprint_name text, start_date date, end_date date, completed_count integer, total_count integer, completion_rate_percent integer)
language sql
security definer
as $function$
  select
    s.id as sprint_id,
    s.name as sprint_name,
    s.start_date,
    s.end_date,
    coalesce(sum(case when t.completed_at is not null then 1 else 0 end), 0)::integer as completed_count,
    count(distinct t.id)::integer as total_count,
    coalesce((sum(case when t.completed_at is not null then 1 else 0 end)::float / nullif(count(distinct t.id), 0) * 100)::integer, 0) as completion_rate_percent
  from public.sprints s
  left join public.tasks t on t.sprint_id = s.id
    and t.parent_task_id is null
  where s.start_date is not null
    and s.end_date is not null
    and (select count(distinct u2.department_id) from public.sprint_members sm2
         join public.users u2 on sm2.user_id = u2.id
         where sm2.sprint_id = s.id and u2.department_id = p_dept_id) > 0
  group by s.id, s.name, s.start_date, s.end_date
  order by s.start_date desc
  limit p_sprint_count;
$function$;
