-- Editable checklist items for This Is It 2.0
create table this_is_it_checklist_items (
  id uuid primary key default gen_random_uuid(),
  event_content_id uuid references this_is_it_event_content(id) on delete cascade,
  section text not null,  -- 'packing', 'other', etc.
  item text not null,
  order_num int default 0,
  created_at timestamp default now(),
  updated_at timestamp default now()
);

alter table this_is_it_checklist_items enable row level security;

-- Super admin + regional secretary can manage checklist
create policy "programs_and_super_admin_checklist" on this_is_it_checklist_items
  as permissive for all
  using (
    (select role from public.users where id = auth.uid()) in ('super_admin', 'regional_secretary')
  )
  with check (
    (select role from public.users where id = auth.uid()) in ('super_admin', 'regional_secretary')
  );

-- Public read checklist
create policy "public_read_checklist" on this_is_it_checklist_items
  as permissive for select
  using (true);

-- Seed packing checklist items
insert into this_is_it_checklist_items (event_content_id, section, item, order_num)
select
  event_content_id,
  section,
  item,
  order_num
from (
  select
    (select id from this_is_it_event_content where event_year = 2026 limit 1) as event_content_id,
    'packing'::text as section,
    'Photo ID (for flight + hotel check-in)'::text as item,
    1::int as order_num
  union all
  select
    (select id from this_is_it_event_content where event_year = 2026 limit 1),
    'packing',
    'All white outfit for Thanksgiving service',
    2
  union all
  select
    (select id from this_is_it_event_content where event_year = 2026 limit 1),
    'packing',
    'Sunday service outfit',
    3
  union all
  select
    (select id from this_is_it_event_content where event_year = 2026 limit 1),
    'packing',
    'Light jacket or sweater (evenings get cool)',
    4
  union all
  select
    (select id from this_is_it_event_content where event_year = 2026 limit 1),
    'packing',
    'Toiletries (hotel has basics, bring your own if you prefer)',
    5
  union all
  select
    (select id from this_is_it_event_content where event_year = 2026 limit 1),
    'packing',
    'Portable charger / phone charger',
    6
) t;
