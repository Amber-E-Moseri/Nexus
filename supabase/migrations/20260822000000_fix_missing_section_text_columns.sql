-- Corrective migration: the 20260821000000_add_section_descriptions.sql migration
-- was shadowed by a duplicate-timestamp collision with regional_updates.sql and
-- never actually ran, despite being recorded as applied in migration history.
-- Re-add the missing columns with IF NOT EXISTS guards so this is safe to run
-- regardless of partial prior application.
alter table this_is_it_event_content add column if not exists flight_form_text text default 'Fill this out so the team knows your travel details and can arrange transfers.';
alter table this_is_it_event_content add column if not exists packing_text text default 'Late August in Winnipeg usually means warm, sunny days and noticeably cooler evenings — pack in layers.';
alter table this_is_it_event_content add column if not exists shuttle_text text default 'A driver from the hotel shuttle will come get you at arrivals. They''ll already have your name on their pickup list — nothing to book or call ahead. Just head to arrivals and look for the Sandman shuttle.';
alter table this_is_it_event_content add column if not exists arrival_text text default 'Your arrival time depends on your department. Check with your department lead. If you haven''t heard otherwise, aim to arrive by 4:30 PM so you''re settled before the opening session.';
alter table this_is_it_event_content add column if not exists checkin_text text default 'When you arrive, look for the check-in stand or table in the lobby. Your room is covered — no card required. The team at the stand will get you sorted and send you to your room.';
alter table this_is_it_event_content add column if not exists venue_text text default 'Good news: the retreat venue is the hotel itself. All sessions run out of the conference room at the Sandman — once you''re checked in, you''re already there.';
alter table this_is_it_event_content add column if not exists schedule_text text default 'The schedule is filling in below. Check back as details confirm.';

update this_is_it_event_content set
  flight_form_text = coalesce(flight_form_text, 'Fill this out so the team knows your travel details and can arrange transfers.'),
  packing_text = coalesce(packing_text, 'Late August in Winnipeg usually means warm, sunny days and noticeably cooler evenings — pack in layers.'),
  shuttle_text = coalesce(shuttle_text, 'A driver from the hotel shuttle will come get you at arrivals. They''ll already have your name on their pickup list — nothing to book or call ahead. Just head to arrivals and look for the Sandman shuttle.'),
  arrival_text = coalesce(arrival_text, 'Your arrival time depends on your department. Check with your department lead. If you haven''t heard otherwise, aim to arrive by 4:30 PM so you''re settled before the opening session.'),
  checkin_text = coalesce(checkin_text, 'When you arrive, look for the check-in stand or table in the lobby. Your room is covered — no card required. The team at the stand will get you sorted and send you to your room.'),
  venue_text = coalesce(venue_text, 'Good news: the retreat venue is the hotel itself. All sessions run out of the conference room at the Sandman — once you''re checked in, you''re already there.'),
  schedule_text = coalesce(schedule_text, 'The schedule is filling in below. Check back as details confirm.')
where event_year = 2026;
