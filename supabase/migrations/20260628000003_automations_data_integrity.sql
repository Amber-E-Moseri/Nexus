-- Corrective patch for the Phase 6 migration atomicity gap: the original
-- default changes and data cleanup for public.automations were not guaranteed
-- to commit together, so this migration repairs any inconsistent rows and
-- enforces array-shaped JSON going forward.

begin;

update public.automations
set conditions = '[]'::jsonb
where jsonb_typeof(conditions) <> 'array';

update public.automations
set actions = '[]'::jsonb
where jsonb_typeof(actions) <> 'array';

alter table public.automations
  add constraint automations_conditions_is_array
    check (jsonb_typeof(conditions) = 'array'),
  add constraint automations_actions_is_array
    check (jsonb_typeof(actions) = 'array');

commit;
