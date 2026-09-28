-- ICPLC event configuration row.
-- GUARD: event_configs created later by 20270807000000.
DO $guard$
BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'event_configs' AND relnamespace = 'public'::regnamespace) THEN
  RAISE NOTICE 'Skipping: event_configs not yet created';
  RETURN;
END IF;

insert into public.event_configs (
  event_name,
  sprint_pattern,
  is_active,
  early_cutoff_at,
  early_fee,
  standard_fee,
  local_detection_regex,
  exempt_fellowships,
  public_token_key,
  tab_config,
  team_permissions,
  sidebar_teams
) values (
  'ICPLC',
  '%ICPLC%',
  false,
  null,
  0,
  0,
  'manitoba|winnipeg',
  '{}',
  'icplc_public_token',
  '[
    {"key": "overview",     "hidden": true},
    {"key": "summary",      "hidden": true},
    {"key": "tii-report",   "hidden": true},
    {"key": "checkin",      "hidden": true},
    {"key": "confirm",      "hidden": true},
    {"key": "discipleship", "hidden": true},
    {"key": "compliance",   "hidden": true},
    {"key": "import",       "hidden": true}
  ]'::jsonb,
  '{
    "unscoped_edit":   ["Programs", "Secretariat", "Planning"],
    "finance_only":    ["Finance"],
    "scoped_edit_all": ["Registration"],
    "scoped_edit_reg": ["Accommodation", "Hospitality"],
    "scoped_view_reg": ["Transportation"]
  }'::jsonb,
  '{}'
)
on conflict do nothing;

-- Allow authenticated users to read the ICPLC row (it is not is_active=true,
-- so the existing "authenticated users read active event config" policy doesn't
-- cover it). This policy is scoped to ICPLC by name so it doesn't expose all
-- inactive/template configs.
EXECUTE 'drop policy if exists "authenticated users read icplc event config" on public.event_configs';
EXECUTE $pol$create policy "authenticated users read icplc event config"
  on public.event_configs for select
  to authenticated
  using (event_name ilike '%ICPLC%')$pol$;

END;
$guard$;
