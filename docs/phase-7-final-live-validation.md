# Phase 7 â€” Final Live Validation

## Purpose

Validate the Phase 7 final consolidation patch against the live Supabase project before marking the phase production-complete.

This phase is not new feature work. It validates the migration, RLS, settings workspace, Zoom config storage, meeting embed behavior, CAN Map embed, BLW Mail embed, automation engine deployment, notification email delivery, sidebar tools integration loading, and related regression coverage added in Phase 7.

---

## 1. Pre-migration backup

Complete these steps before applying `20260617_phase7_final.sql`.

### Backup checklist

- Create a Supabase backup/export from the Supabase dashboard if that option is available on the current plan.
- Run a local SQL dump:
  - `supabase db dump -f supabase-backup-pre-phase7.sql`
- Confirm the current migration state:
  - `supabase migration list`
- Confirm the local git branch is clean:
  - `git status`
- Confirm the target Supabase project is the correct production or staging project before applying anything.

### Pre-migration sign-off

- [ ] Dashboard backup/export created or confirmed unavailable
- [ ] `supabase db dump` completed
- [ ] Current migration version recorded
- [ ] Local branch clean
- [ ] Correct Supabase project confirmed

---

## 2. Migration apply checklist

Apply and verify the Phase 7 migration.

### Apply

- `supabase db push`

### Verify migration application

- Confirm `supabase/migrations/20260617_phase7_final.sql` is included in the applied migration set.
- Re-run:
  - `supabase migration list`
- Check CLI output for any migration errors, duplicate-policy errors, or constraint failures.

### Post-apply verification

- Confirm new tables exist:
  - `zoom_config`
  - `external_integrations`
- Confirm altered calendar column exists:
  - `calendar_events.zoom_join_url`
- Confirm RLS policies exist:
  - `zoom_config_admin`
  - `external_integrations_select`
  - `external_integrations_write`
- Confirm seeded integration rows exist:
  - `Foundation School`
  - `CAN Map`
  - `Canva`
  - `Google Drive`
- Deploy edge functions:
  - `supabase functions deploy automation-engine`
  - `supabase functions deploy send-notification-email`

### Migration result

- [ ] `supabase db push` completed
- [ ] Migration listed as applied
- [ ] No migration errors
- [ ] Tables exist
- [ ] Calendar column exists
- [ ] Policies exist
- [ ] Seed rows exist
- [ ] Edge functions deployed

---

## 3. Schema validation

Verify the live schema matches the migration.

### Required tables

- `public.zoom_config`
- `public.external_integrations`

### Required `zoom_config` columns

- `id`
- `account_id`
- `client_id`
- `webhook_secret`
- `enabled`
- `updated_by`
- `updated_at`

### Required `external_integrations` columns

- `id`
- `name`
- `type`
- `launch_url`
- `description`
- `icon_emoji`
- `visible_to`
- `sort_order`
- `enabled`
- `created_by`
- `created_at`

### Required altered calendar column

- `public.calendar_events.zoom_join_url`

### Required RLS policies

#### `zoom_config`
- `zoom_config_admin`

#### `external_integrations`
- `external_integrations_select`
- `external_integrations_write`

### Validation notes

- Confirm `external_integrations.type` allows:
  - `foundation_school`
  - `zoom`
  - `canva`
  - `google_drive`
  - `custom`
- Confirm `external_integrations.visible_to` allows:
  - `all`
  - `super_admin`
  - `dept_lead`
- Confirm `external_integrations.name` remains unique.

### Schema result

- [ ] Tables verified
- [ ] Columns verified
- [ ] Policies verified
- [ ] Constraints verified
- [ ] Seed rows verified

---

## 4. RLS validation matrix

Expected behavior must match the Phase 7 settings, integration, and communications access rules.

| Role | View settings profile tab | Edit own notification prefs | View integration cards | Manage external integrations | View/edit zoom config | Access `/communications` | View sidebar tools |
|---|---|---|---|---|---|---|---|
| `super_admin` | Yes | Yes | Yes | Yes | Yes | Yes | Yes |
| `dept_lead` | Yes | Yes | Yes | No | No | Yes | Yes |
| `pastor` | Yes | Yes | Yes for `visible_to = 'all'` | No | No | No | Yes for allowed tools |
| `member` | Yes | Yes | Yes for `visible_to = 'all'` | No | No | No | Yes for allowed tools |

### Validation notes

- `zoom_config` should remain `super_admin` only.
- `external_integrations` select should respect `enabled` and `visible_to`.
- `/communications` route should remain restricted to `super_admin` and `dept_lead`.
- Test both UI behavior and direct Supabase access where possible.

### RLS result

- [ ] `super_admin` validated
- [ ] `dept_lead` validated
- [ ] `pastor` validated
- [ ] `member` validated

---

## 5. UI smoke tests

Verify the app behavior after the migration.

- [ ] Settings page loads
- [ ] Settings tabs render: `Profile`, `Notifications`, `Integrations`, `Account`
- [ ] Meetings page loads
- [ ] `/map` route loads
- [ ] `/communications` route loads for allowed roles
- [ ] Automations page Run Log tab loads
- [ ] Sidebar Tools section renders
- [ ] Sidebar Communications link renders only for allowed roles

---

## 6. Settings and integrations test cases

### Profile tab name edit saves

**Preconditions**
- Logged in user with editable profile

**Steps**
- Open `Settings` â†’ `Profile`
- Change display name
- Save

**Expected result**
- `public.users.name` updates
- Updated name appears in shell/profile surfaces after reload

**Pass/Fail:** __________  
**Notes:** __________

### Password change works

**Preconditions**
- Logged in user

**Steps**
- Open `Settings` â†’ `Profile`
- Enter new password and confirm
- Save

**Expected result**
- Supabase Auth password update succeeds

**Pass/Fail:** __________  
**Notes:** __________

### Notifications tab toggles save

**Preconditions**
- Logged in user

**Steps**
- Open `Settings` â†’ `Notifications`
- Toggle one or more `in_app` / `email` values

**Expected result**
- `public.user_notification_prefs` upserts correctly
- Toggle state persists after refresh

**Pass/Fail:** __________  
**Notes:** __________

### Integrations tab shows seeded launch cards

**Preconditions**
- Phase 7 seed data present

**Steps**
- Open `Settings` â†’ `Integrations`

**Expected result**
- Launch cards render for:
  - `Foundation School`
  - `CAN Map`
  - `Canva`
  - `Google Drive`

**Pass/Fail:** __________  
**Notes:** __________

### Account tab visible to `super_admin` only

**Preconditions**
- Test as `super_admin`, then as non-admin role

**Steps**
- Open `Settings`

**Expected result**
- `Account` tab appears only for `super_admin`

**Pass/Fail:** __________  
**Notes:** __________

### Workspace info and global sign-out

**Preconditions**
- Logged in as `super_admin`

**Steps**
- Open `Account` tab
- Inspect workspace info
- Use global sign-out action in a safe environment

**Expected result**
- Workspace info renders
- Global sign-out action succeeds through Supabase Auth

**Pass/Fail:** __________  
**Notes:** __________

### Zoom config saves to `zoom_config`

**Preconditions**
- Logged in as `super_admin`

**Steps**
- Open `Account` tab
- Enter Account ID, Client ID, Webhook Secret, and enabled state
- Save

**Expected result**
- Row is inserted or updated in `public.zoom_config`
- Values persist after reload

**Pass/Fail:** __________  
**Notes:** __________

### Event modal exposes `zoom_join_url`

**Preconditions**
- Logged in as allowed calendar editor

**Steps**
- Open event modal

**Expected result**
- Zoom link field is visible
- Saved value persists to `calendar_events.zoom_join_url`

**Pass/Fail:** __________  
**Notes:** __________

---

## 7. Consolidation and edge function test cases

### MeetingsModule embeds iframe when `VITE_MEETING_OS_URL` is set

**Preconditions**
- Environment configured with `VITE_MEETING_OS_URL`

**Steps**
- Open `/meetings`

**Expected result**
- Meeting OS renders in iframe

**Pass/Fail:** __________  
**Notes:** __________

### MeetingsModule fallback when URL is not set

**Preconditions**
- Environment with `VITE_MEETING_OS_URL` unset

**Steps**
- Open `/meetings`

**Expected result**
- Internal fallback meeting log UI renders

**Pass/Fail:** __________  
**Notes:** __________

### `/map` route loads CAN Map in shell

**Preconditions**
- App deployed with `public/apps/map/index.html`

**Steps**
- Open `/map`

**Expected result**
- CAN Map renders inside OS shell iframe

**Pass/Fail:** __________  
**Notes:** __________

### `/communications` route loads BLW Mail in shell

**Preconditions**
- App deployed with `public/apps/mail/index.html`

**Steps**
- Open `/communications` as allowed role

**Expected result**
- BLW Mail renders inside OS shell iframe

**Pass/Fail:** __________  
**Notes:** __________

### Communications link visible only to `super_admin` and `dept_lead`

**Preconditions**
- Test as all four roles

**Steps**
- Inspect sidebar

**Expected result**
- Link visible only for `super_admin` and `dept_lead`

**Pass/Fail:** __________  
**Notes:** __________

### Automation engine deployed and accepts `trigger_type`

**Preconditions**
- `automation-engine` deployed

**Steps**
- Invoke with payload containing `trigger_type`

**Expected result**
- Function returns a structured response, even if no automations match

**Pass/Fail:** __________  
**Notes:** __________

### Notification email function sends via Resend

**Preconditions**
- `send-notification-email` deployed
- Required secrets configured

**Steps**
- Invoke function with valid `user_id`, `notification_type`, and payload

**Expected result**
- Resend request succeeds
- Function returns `sent: true`

**Pass/Fail:** __________  
**Notes:** __________

### Run Log tab shows `automation_runs` data

**Preconditions**
- At least one automation run exists

**Steps**
- Open `Automations` â†’ `Run Log`

**Expected result**
- Run rows render with automation name, trigger, status, duration, timestamp, and actions count

**Pass/Fail:** __________  
**Notes:** __________

### Sidebar Tools section loads from `external_integrations`

**Preconditions**
- Seed or admin-created integration rows exist

**Steps**
- Refresh app
- Inspect sidebar tools section

**Expected result**
- Tools render from DB data
- Order matches `sort_order`

**Pass/Fail:** __________  
**Notes:** __________

---

## 8. Tool visibility and seed-data test cases

### Seeded integration rows visible in UI

**Preconditions**
- Phase 7 migration applied successfully

**Steps**
- Open `Settings` â†’ `Integrations`
- Inspect sidebar `Tools`

**Expected result**
- `Foundation School`, `CAN Map`, `Canva`, and `Google Drive` appear
- Order follows `sort_order`

**Pass/Fail:** __________  
**Notes:** __________

### `external_integrations` visibility rules

**Preconditions**
- At least one row configured with restricted `visible_to`

**Steps**
- Check visibility as `super_admin`, `dept_lead`, `pastor`, and `member`

**Expected result**
- `visible_to = 'all'` appears to all authenticated users
- Restricted rows appear only to permitted roles

**Pass/Fail:** __________  
**Notes:** __________

---

## 9. Regression checks

- [ ] My Work still loads
- [ ] Department task boards still load
- [ ] Sprint pages still load
- [ ] Calendar still loads
- [ ] People module still loads
- [ ] Invitation flow still loads
- [ ] Meetings still load
- [ ] Dashboard widgets still load
- [ ] Existing task visibility still works

---

## 10. Defect policy

- Fix only defects related to the Phase 7 migration, settings workspace, consolidation routes, or Phase 7 edge functions.
- Do not add new feature scope during validation.
- Any RLS defect blocks production completion.
- Any migration failure blocks production completion.
- Any broken embedded route or broken edge function deployment blocks production completion.
- UI defects that do not affect data integrity can be triaged.

---

## 11. Sign-off matrix

| Area | Tester | Date | Result | Defects linked | Approved by |
|---|---|---|---|---|---|
| Migration apply |  |  |  |  |  |
| Schema validation |  |  |  |  |  |
| RLS validation |  |  |  |  |  |
| Settings profile |  |  |  |  |  |
| Notification prefs |  |  |  |  |  |
| Integrations |  |  |  |  |  |
| Zoom config |  |  |  |  |  |
| Meetings embed/fallback |  |  |  |  |  |
| Map and communications embeds |  |  |  |  |  |
| Edge functions |  |  |  |  |  |
| Automations run log |  |  |  |  |  |
| Regression |  |  |  |  |  |

---

## 12. Exit criteria

Phase 7 is production-complete when:

- [ ] Migration applies cleanly
- [ ] New tables/column/policies exist
- [ ] Settings page behaviors pass
- [ ] Zoom config and `zoom_join_url` checks pass
- [ ] Meetings, CAN Map, and BLW Mail embed routes behave correctly
- [ ] Communications access remains role-restricted
- [ ] Automation engine and notification email edge functions work
- [ ] Sidebar tools load from `external_integrations`
- [ ] No critical RLS, migration, embed, or edge function defects remain
