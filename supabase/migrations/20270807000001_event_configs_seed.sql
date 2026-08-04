-- Seed TII 2.0 as the active event config.
-- Values match every hardcoded constant in RegistrationPage.jsx, RegistrationEcosystem.jsx,
-- and Sidebar.jsx as of the time of this migration — zero behavior change on first deploy.
-- on conflict do nothing makes re-running safe.

insert into public.event_configs (
  event_name,
  sprint_pattern,
  is_active,
  is_template,
  early_cutoff_at,
  early_fee,
  standard_fee,
  local_detection_regex,
  exempt_fellowships,
  tab_config,
  team_permissions,
  sidebar_teams,
  public_token_key
)
values (
  'This Is It 2.0',
  '%This Is It 2.0%',
  true,
  false,
  '2026-08-06T00:00:00+00:00',
  250,
  350,
  'manitoba|winnipeg',
  array[
    'BLW University of Manitoba',
    'BLW University of Winnipeg'
  ],
  -- confirm (Delegates) tab is hidden — matches ALL_TABS hidden: true in RegistrationEcosystem.jsx
  '[{"key": "confirm", "hidden": true}]'::jsonb,
  '{
    "unscoped_edit":   ["Programs", "Secretariat"],
    "finance_only":    ["Finance"],
    "scoped_edit_all": ["Registration"],
    "scoped_edit_reg": ["Accommodation", "Hospitality"],
    "scoped_view_reg": [
      "Transportation",
      "Foundation School Graduation and Baptism",
      "Delegates Compliance"
    ]
  }'::jsonb,
  -- Matches REGISTRATION_TEAMS in Sidebar.jsx
  array[
    'Foundation School Graduation and Baptism',
    'Secretariat and Planning',
    'Registration',
    'Secretariat Programs',
    'Finance',
    'Transportation',
    'Delegates Compliance',
    'Accommodation and Room Coordination',
    'Hospitality — Delegates'
  ],
  'tii2_public_token'
)
on conflict do nothing;
