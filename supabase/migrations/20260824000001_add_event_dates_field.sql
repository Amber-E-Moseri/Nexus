-- The ticket header's "Date" field (28-31 Aug 2026) was the last hardcoded
-- value with no backing column, following the same pattern as the earlier
-- Venue/Checkout/Wi-Fi/Sessions/Meals fixes.
alter table this_is_it_event_content add column if not exists event_dates text default '28–31 Aug 2026';

update this_is_it_event_content set
  event_dates = coalesce(event_dates, '28–31 Aug 2026')
where event_year = 2026;
