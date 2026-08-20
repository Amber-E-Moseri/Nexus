-- Add cross_country_subgroups column to event_configs and seed the active event
ALTER TABLE event_configs
  ADD COLUMN IF NOT EXISTS cross_country_subgroups text[] NOT NULL DEFAULT '{}';

-- Set the active event to West Subgroup B only
UPDATE event_configs
SET cross_country_subgroups = ARRAY['West Subgroup B']
WHERE is_active = true;
