-- Lets a super_admin set the default Foundation School / Baptism column visibility for
-- the Discipleship tab (e.g. hide Foundation School entirely for a baptism-only follow-up
-- team). Stored per event_config, same pattern as tab_config/team_permissions — the
-- default applies to everyone viewing the tab; individual viewers can still toggle their
-- own view locally without changing the saved default.
alter table public.event_configs
  add column if not exists discipleship_view_defaults jsonb;

comment on column public.event_configs.discipleship_view_defaults is
  'Default { showFoundation, showBaptism } for RegistrationEcosystem''s DiscipleshipTab, '
  'set by a super_admin. Null means both columns shown by default.';
