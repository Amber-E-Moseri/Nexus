-- Allow working list entries to be manually linked to a specific registration
-- by storing the registration's email. Used when names differ (e.g. "Pastor IK Nwoken"
-- vs "IK Nwoken") and fuzzy matching can't resolve it automatically.

alter table public.working_list
  add column if not exists linked_registration_email text;
