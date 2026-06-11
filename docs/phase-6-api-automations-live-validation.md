# Phase 6 â€” API + Automations Live Validation

## Purpose

Validate the Phase 6 API keys and automations patch against the live Supabase project before marking the phase production-complete.

This phase is not new feature work. It validates the migration, RLS, edge function deployment, API key behavior, task API endpoints, idempotency handling, Automations page behavior, Apps Script guide accuracy, and related regression coverage added in Phase 6.

---

## 1. Pre-migration backup

Complete these steps before applying `20260616_phase6_api_automations.sql`.

### Backup checklist

- Create a Supabase backup/export from the Supabase dashboard if that option is available on the current plan.
- Run a local SQL dump:
  - `supabase db dump -f supabase-backup-pre-phase6.sql`
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

Apply and verify the Phase 6 migration.

### Apply

- `supabase db push`

### Verify migration application

- Confirm `supabase/migrations/20260616_phase6_api_automations.sql` is included in the applied migration set.
- Re-run:
  - `supabase migration list`
- Check CLI output for any migration errors, duplicate-policy errors, or constraint failures.

### Post-apply verification

- Confirm new table exists:
  - `api_keys`
  - `automation_runs`
- Confirm altered columns exist:
  - `tasks.source_name`
  - `tasks.source_type`
  - `tasks.external_unique_key`
  - `automations.description`
  - `automations.sprint_id`
  - `automations.trigger_config`
  - `automations.last_fired_at`
  - `automations.fire_count`
- Confirm indexes exist:
  - `tasks_external_unique_key_idx`
  - `api_keys_hash_idx`
  - `api_keys_dept_idx`
  - `api_keys_sprint_idx`
  - `automations_dept_idx`
  - `automations_sprint_idx`
  - `automations_enabled_idx`
  - `automation_runs_automation_idx`
  - `automation_runs_ran_at_idx`
- Confirm RLS policies exist on `api_keys`, `automations`, and `automation_runs`.
- Deploy the edge function:
  - `supabase functions deploy task-api`

### Migration result

- [ ] `supabase db push` completed
- [ ] Migration listed as applied
- [ ] No migration errors
- [ ] Tables exist
- [ ] Columns exist
- [ ] Indexes exist
- [ ] RLS policies exist
- [ ] `task-api` deployed

---

## 3. Schema validation

Verify the live schema matches the migration.

### Required tables

- `public.api_keys`
- `public.automation_runs`

### Required task columns

- `public.tasks.source_name`
- `public.tasks.source_type`
- `public.tasks.external_unique_key`

### Required automation columns

- `public.automations.description`
- `public.automations.sprint_id`
- `public.automations.trigger_config`
- `public.automations.last_fired_at`
- `public.automations.fire_count`

### Required indexes

- `tasks_external_unique_key_idx`
- `api_keys_hash_idx`
- `api_keys_dept_idx`
- `api_keys_sprint_idx`
- `automations_dept_idx`
- `automations_sprint_idx`
- `automations_enabled_idx`
- `automation_runs_automation_idx`
- `automation_runs_ran_at_idx`

### Required RLS policies

#### `api_keys`
- `api_keys_select`
- `api_keys_write`

#### `automations`
- `automations_select`
- `automations_write`

#### `automation_runs`
- `automation_runs_select`

### Validation notes

- Confirm `tasks.source` supports `api` and `integration`.
- Confirm `tasks_external_unique_key_idx` is unique and partial on non-null keys.
- Confirm `api_keys_scope_check` requires either `department_id` or `sprint_id`.
- Confirm `api_keys.key_hash` is unique.

### Schema result

- [ ] Tables verified
- [ ] Columns verified
- [ ] Indexes verified
- [ ] Policies verified
- [ ] Constraints verified

---

## 4. RLS validation matrix

Expected behavior must match the Phase 6 API key and automation access rules.

| Role | View API keys | Generate API keys | Revoke API keys | View automations | Create/edit/delete automations | View automation runs |
|---|---|---|---|---|---|---|
| `super_admin` | Yes | Yes | Yes | Yes | Yes | Yes |
| `dept_lead` | Yes, own department only | Yes, own department only | Yes, own department only | Yes, own department only | Yes, own department only | Yes, own department only |
| `pastor` | No by default | No | No | No by default unless sprint-member visibility applies | No | No by default unless sprint-member visibility applies |
| `member` | No by default | No | No | No by default unless sprint-member visibility applies | No | No by default unless sprint-member visibility applies |

### Validation notes

- API key management should remain leadership-only.
- Sprint-member visibility may expose automations and run logs for sprint-scoped automations.
- Test both UI behavior and direct Supabase access where possible.

### RLS result

- [ ] `super_admin` validated
- [ ] `dept_lead` validated
- [ ] `pastor` validated
- [ ] `member` validated

---

## 5. UI smoke tests

Verify the app behavior after the migration.

- [ ] Automations page loads
- [ ] Automations page is not a placeholder
- [ ] Tabs render: `Automations`, `API Keys`, `Run Log`
- [ ] API Keys tab loads
- [ ] Run Log tab loads
- [ ] Automation builder opens
- [ ] Curl example in UI renders
- [ ] Apps Script guide still matches current endpoints and payloads

---

## 6. API key and task API test cases

### Generate API key

**Preconditions**
- Logged in as `super_admin` or `dept_lead`

**Steps**
- Open `API Keys`
- Generate key

**Expected result**
- Full key is shown once
- Table stores only prefix and metadata
- `public.api_keys.key_hash` populated

**Pass/Fail:** __________  
**Notes:** __________

### Revoke API key

**Preconditions**
- Existing active API key

**Steps**
- Revoke key from UI

**Expected result**
- `revoked = true`
- Revoked key stops authenticating

**Pass/Fail:** __________  
**Notes:** __________

### API key expiry

**Preconditions**
- Key created with expiry or test key updated with past `expires_at`

**Steps**
- Use expired key against API

**Expected result**
- API returns `401`

**Pass/Fail:** __________  
**Notes:** __________

### `POST /tasks` creates API task

**Preconditions**
- Valid active API key

**Steps**
- Call `POST /tasks`

**Expected result**
- Task is created
- `source = 'api'`
- Expected scope field populated

**Pass/Fail:** __________  
**Notes:** __________

### `external_unique_key` duplicate handling

**Preconditions**
- Valid API key
- First `POST /tasks` already completed with one `external_unique_key`

**Steps**
- Repeat the same logical create request

**Expected result**
- API returns duplicate result instead of creating second task
- No second task row exists

**Pass/Fail:** __________  
**Notes:** __________

### `GET /tasks` returns department-scoped list

**Preconditions**
- Valid department-scoped API key

**Steps**
- Call `GET /tasks`

**Expected result**
- Response includes only tasks for the key scope

**Pass/Fail:** __________  
**Notes:** __________

### `PATCH /tasks/:id` updates task

**Preconditions**
- Valid API key
- Existing task in scope

**Steps**
- Update status or title

**Expected result**
- Task updates successfully

**Pass/Fail:** __________  
**Notes:** __________

### `GET /spaces` returns departments

**Preconditions**
- Valid API key

**Steps**
- Call `GET /spaces`

**Expected result**
- Response returns departments/space records in scope

**Pass/Fail:** __________  
**Notes:** __________

### `GET /sprints` returns active sprints

**Preconditions**
- Valid API key

**Steps**
- Call `GET /sprints`

**Expected result**
- Response returns active sprint rows only

**Pass/Fail:** __________  
**Notes:** __________

### Invalid key returns `401`

**Preconditions**
- Invalid or random key

**Steps**
- Call any task API endpoint

**Expected result**
- Response is `401`

**Pass/Fail:** __________  
**Notes:** __________

### Revoked key returns `401`

**Preconditions**
- Revoked key

**Steps**
- Call any task API endpoint

**Expected result**
- Response is `401`

**Pass/Fail:** __________  
**Notes:** __________

---

## 7. Automation UI and documentation test cases

### Automation rule create/edit/delete/toggle

**Preconditions**
- Logged in as `super_admin` or `dept_lead`

**Steps**
- Create rule
- Edit rule
- Toggle enabled/disabled
- Delete rule

**Expected result**
- `public.automations` updates correctly
- UI reflects changes after reload

**Pass/Fail:** __________  
**Notes:** __________

### API Keys tab generate/copy/revoke

**Preconditions**
- Logged in as allowed role

**Steps**
- Generate key
- Copy displayed value
- Revoke key

**Expected result**
- UI shows full key once
- Prefix remains in table
- Revoked key shows revoked state

**Pass/Fail:** __________  
**Notes:** __________

### Curl example accuracy

**Preconditions**
- Automations page loads

**Steps**
- Inspect curl example in UI

**Expected result**
- Endpoint matches deployed `task-api`
- Header name and payload shape are correct

**Pass/Fail:** __________  
**Notes:** __________

### Apps Script guide accuracy

**Preconditions**
- `docs/apps-script-integration-guide.md` available

**Steps**
- Compare guide examples with actual API routes and payload rules

**Expected result**
- Guide matches current implementation

**Pass/Fail:** __________  
**Notes:** __________

---

## 8. Apps Script and run log test cases

### Run Log tab shows `automation_runs`

**Preconditions**
- At least one automation run exists

**Steps**
- Open `Automations` â†’ `Run Log`

**Expected result**
- Rows render with correct automation metadata
- Status badge matches `success`, `partial`, or `failed`
- Expanding a row shows `actions_taken` details

**Pass/Fail:** __________  
**Notes:** __________

### Apps Script guide round-trip test

**Preconditions**
- `docs/apps-script-integration-guide.md` available
- Valid active API key

**Steps**
- Follow the documented Apps Script or curl flow against the deployed API

**Expected result**
- The documented request format works without undocumented corrections

**Pass/Fail:** __________  
**Notes:** __________

---

## 9. Regression checks

- [ ] My Work still loads
- [ ] Department task boards still load
- [ ] Sprint pages still load
- [ ] People module still loads
- [ ] Calendar still loads
- [ ] Meetings still load
- [ ] Dashboard widgets still load
- [ ] Existing task visibility still works

---

## 10. Defect policy

- Fix only defects related to the Phase 6 migration, task API, or automations flows.
- Do not add new feature scope during validation.
- Any RLS defect blocks production completion.
- Any migration failure blocks production completion.
- Any authentication failure in the public task API blocks production completion.
- UI defects that do not affect data integrity can be triaged.

---

## 11. Sign-off matrix

| Area | Tester | Date | Result | Defects linked | Approved by |
|---|---|---|---|---|---|
| Migration apply |  |  |  |  |  |
| Schema validation |  |  |  |  |  |
| RLS validation |  |  |  |  |  |
| Edge function deploy |  |  |  |  |  |
| API key lifecycle |  |  |  |  |  |
| Task API endpoints |  |  |  |  |  |
| Automations UI |  |  |  |  |  |
| Run log visibility |  |  |  |  |  |
| Docs accuracy |  |  |  |  |  |
| Regression |  |  |  |  |  |

---

## 12. Exit criteria

Phase 6 is production-complete when:

- [ ] Migration applies cleanly
- [ ] New tables/columns/indexes/policies exist
- [ ] `task-api` is deployed and reachable
- [ ] API key generation, revoke, and expiry behavior pass
- [ ] Public endpoints behave correctly
- [ ] `external_unique_key` prevents duplicate task creation
- [ ] Automations page and API Keys tab behave correctly
- [ ] Curl example and Apps Script guide are accurate
- [ ] No critical RLS, auth, or migration defects remain
