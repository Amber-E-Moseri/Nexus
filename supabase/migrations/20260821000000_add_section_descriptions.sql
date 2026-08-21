-- Add editable description fields for all page sections
alter table this_is_it_event_content add column flight_form_text text default 'Fill this out so the team knows your travel details and can arrange transfers.';
alter table this_is_it_event_content add column packing_text text default 'Late August in Winnipeg usually means warm, sunny days and noticeably cooler evenings — pack in layers.';
alter table this_is_it_event_content add column shuttle_text text default 'A driver from the hotel shuttle will come get you at arrivals. They''ll already have your name on their pickup list — nothing to book or call ahead. Just head to arrivals and look for the Sandman shuttle.';
alter table this_is_it_event_content add column arrival_text text default 'Your arrival time depends on your department. Check with your department lead. If you haven''t heard otherwise, aim to arrive by 4:30 PM so you''re settled before the opening session.';
alter table this_is_it_event_content add column checkin_text text default 'When you arrive, look for the check-in stand or table in the lobby. Your room is covered — no card required. The team at the stand will get you sorted and send you to your room.';
alter table this_is_it_event_content add column venue_text text default 'Good news: the retreat venue is the hotel itself. All sessions run out of the conference room at the Sandman — once you''re checked in, you''re already there.';
alter table this_is_it_event_content add column schedule_text text default 'The schedule is filling in below. Check back as details confirm.';

-- Update existing row with defaults
update this_is_it_event_content set
  flight_form_text = 'Fill this out so the team knows your travel details and can arrange transfers.',
  packing_text = 'Late August in Winnipeg usually means warm, sunny days and noticeably cooler evenings — pack in layers.',
  shuttle_text = 'A driver from the hotel shuttle will come get you at arrivals. They''ll already have your name on their pickup list — nothing to book or call ahead. Just head to arrivals and look for the Sandman shuttle.',
  arrival_text = 'Your arrival time depends on your department. Check with your department lead. If you haven''t heard otherwise, aim to arrive by 4:30 PM so you''re settled before the opening session.',
  checkin_text = 'When you arrive, look for the check-in stand or table in the lobby. Your room is covered — no card required. The team at the stand will get you sorted and send you to your room.',
  venue_text = 'Good news: the retreat venue is the hotel itself. All sessions run out of the conference room at the Sandman — once you''re checked in, you''re already there.',
  schedule_text = 'The schedule is filling in below. Check back as details confirm.'
where event_year = 2026;
