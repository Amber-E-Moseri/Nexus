-- This Is It 2.0 event prep guide content table
-- Stores editable content for the public prep guide page
-- Super admins can read/write, public can read (no auth required)

create table this_is_it_event_content (
  id uuid primary key default gen_random_uuid(),
  event_year int not null unique,

  -- Logistics
  airport_code text,
  airport_name text,
  airport_distance_km int,
  hotel_name text,
  hotel_address text,
  hotel_phone text,
  transport_contact_name text,
  transport_contact_chat text,  -- @username
  transport_contact_phone text,
  flight_form_url text,

  -- Schedule
  friday_opening_time text,
  friday_opening_note text,
  monday_checkout_time text,

  -- Packing & Dress Code
  dress_code text,
  all_white_for text,  -- e.g., "Thanksgiving service"

  -- Meta
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamp default now(),
  created_at timestamp default now()
);

-- Enable RLS
alter table this_is_it_event_content enable row level security;

-- Super admin can read/write everything
create policy "super_admin_full_access" on this_is_it_event_content
  as permissive for all
  using (
    (select role from public.users where id = auth.uid()) = 'super_admin'
  )
  with check (
    (select role from public.users where id = auth.uid()) = 'super_admin'
  );

-- Programs space members (Chinelo, Ella, Dorcas) can read/write
create policy "programs_team_access" on this_is_it_event_content
  as permissive for all
  using (
    exists (
      select 1 from public.space_members
      where user_id = auth.uid()
        and space_id = (select id from public.spaces where slug = 'programs' limit 1)
    )
  )
  with check (
    exists (
      select 1 from public.space_members
      where user_id = auth.uid()
        and space_id = (select id from public.spaces where slug = 'programs' limit 1)
    )
  );

-- Public read (anyone can read, no auth required)
create policy "public_read_access" on this_is_it_event_content
  as permissive for select
  using (true);

-- Schedule items table (one per day, multiple items per day)
create table this_is_it_schedule_items (
  id uuid primary key default gen_random_uuid(),
  event_content_id uuid references this_is_it_event_content(id) on delete cascade,
  day text not null,  -- 'fri', 'sat', 'sun', 'mon'
  time text,  -- e.g., "6:00 PM", "TBA", "Morning"
  title text not null,  -- e.g., "Opening session"
  description text,  -- e.g., "Details to come"
  order_num int default 0,
  created_at timestamp default now(),
  updated_at timestamp default now()
);

alter table this_is_it_schedule_items enable row level security;

-- Programs team + super admin can manage schedule items
create policy "programs_and_super_admin_schedule" on this_is_it_schedule_items
  as permissive for all
  using (
    (select role from public.users where id = auth.uid()) = 'super_admin'
    or exists (
      select 1 from public.space_members
      where user_id = auth.uid()
        and space_id = (select id from public.spaces where slug = 'programs' limit 1)
    )
  )
  with check (
    (select role from public.users where id = auth.uid()) = 'super_admin'
    or exists (
      select 1 from public.space_members
      where user_id = auth.uid()
        and space_id = (select id from public.spaces where slug = 'programs' limit 1)
    )
  );

-- Public read schedule items
create policy "public_read_schedule" on this_is_it_schedule_items
  as permissive for select
  using (true);

-- Seed 2026 event data from current page
insert into this_is_it_event_content (
  event_year,
  airport_code,
  airport_name,
  airport_distance_km,
  hotel_name,
  hotel_address,
  hotel_phone,
  transport_contact_name,
  transport_contact_chat,
  transport_contact_phone,
  flight_form_url,
  friday_opening_time,
  friday_opening_note,
  monday_checkout_time,
  dress_code,
  all_white_for
) values (
  2026,
  'YWG',
  'Winnipeg James Armstrong Richardson International Airport',
  10,
  'Sandman Hotel & Suites Winnipeg Airport',
  '1750 Sargent Avenue, Winnipeg, MB R3H 0C7',
  '(204) 775-7263',
  'David Akalue',
  '@davidakalue99',
  '+1 (204) 396-6156',
  'https://leaders.lwcanada.org/f/rp3uahba3c3c',
  '6:00 PM',
  'Details to come',
  'Morning',
  'Semiformal for most of the weekend. On day 2, we''ll all be wearing our This Is It shirts.',
  'Thanksgiving service'
);

-- Seed schedule items
insert into this_is_it_schedule_items (event_content_id, day, time, title, description, order_num)
select
  id,
  day,
  time,
  title,
  description,
  order_num
from (
  select
    (select id from this_is_it_event_content where event_year = 2026 limit 1) as event_content_id,
    'fri'::text as day,
    '6:00 PM'::text as time,
    'Opening session'::text as title,
    'Details to come'::text as description,
    1::int as order_num
  union all
  select
    (select id from this_is_it_event_content where event_year = 2026 limit 1),
    'mon',
    'Morning',
    'Check-out & departure',
    'Head to the airport',
    1
) t;
