-- Editable fields for Venue mini-cards (Wi-Fi, Sessions, Meals) and the
-- "Arrival time by department" note + default time, which were hardcoded.
alter table this_is_it_event_content add column if not exists wifi_text text default 'Free, hotel-wide';
alter table this_is_it_event_content add column if not exists sessions_text text default 'Conference Room';
alter table this_is_it_event_content add column if not exists meals_text text default 'Details to come';
alter table this_is_it_event_content add column if not exists dept_arrival_note text default 'Check with your department lead for your specific arrival window';
alter table this_is_it_event_content add column if not exists dept_arrival_default text default '4:30 PM Friday, Aug 28';

update this_is_it_event_content set
  wifi_text = coalesce(wifi_text, 'Free, hotel-wide'),
  sessions_text = coalesce(sessions_text, 'Conference Room'),
  meals_text = coalesce(meals_text, 'Details to come'),
  dept_arrival_note = coalesce(dept_arrival_note, 'Check with your department lead for your specific arrival window'),
  dept_arrival_default = coalesce(dept_arrival_default, '4:30 PM Friday, Aug 28')
where event_year = 2026;
