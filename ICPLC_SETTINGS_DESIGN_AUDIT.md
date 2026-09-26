# ICPLC SETTINGS — DESIGN GATE AUDIT

## CANADIAN MAPPING CONSUMER AUDIT

### All Callers of `deriveDocumentType()`

**Direct function calls (9 locations):**

1. **src/features/registration/icplcDocReadiness.js:140**
   - Definition; pure function
   - Called by: `computeDocReadinessContribution()` and `docNeedsAttention()`
   - Synchronous; no DB dependency

2. **src/features/registration/icplcDocReadiness.js:155 (computeDocReadinessContribution)**
   - Consumer: `deriveDocumentType()` called at start
   - Returns: OVERALL_READINESS enum
   - Used by: readiness derivation, NeedsAttention filtering
   - Synchronous, called every time readiness is computed
   - **Dependency:** Must remain synchronous; cannot wait for DB

3. **src/features/registration/icplcDocReadiness.js:197 (docNeedsAttention)**
   - Consumer: Called to derive document type for attention filtering
   - Returns: Attention reason string or null
   - Used by: NeedsAttentionPage participant filtering
   - Synchronous, called on every participant render
   - **Dependency:** Must remain synchronous

4. **src/pages/events/ICPLCDocUpdatePage.jsx:110**
   - Context: Participant documentation self-service form
   - Usage: Derived document type to show expected document requirement
   - Called: On form load (useEffect)
   - **Dependency:** Can be async (form is already async)
   - Scope: Displays what document is required for the participant's residency status

5. **src/features/icplc/ICPLCDashboard.jsx:519**
   - Context: Unknown context (needs inspection)
   - Synchronous call
   - **Dependency:** TBD from file content

6. **src/features/icplc/ICPLCDashboard.jsx:829**
   - Context: Unknown context (needs inspection)
   - Synchronous call
   - **Dependency:** TBD from file content

7. **src/features/registration/RegistrationEditModal.jsx:315**
   - Context: TII registration editing
   - Usage: Deriving document type from form data
   - Synchronous call
   - **Dependency:** May need to remain sync for form validation

8. **src/features/registration/DocumentationTab.jsx:64**
   - Context: TII registration documentation tab
   - Usage: Deriving document type for display
   - Synchronous call
   - **Dependency:** Display; can tolerate brief async

9. **src/features/registration/DocumentationTab.jsx:179**
   - Context: TII registration form; status selection
   - Usage: Deriving document type when status changes
   - Synchronous call
   - **Dependency:** Form validation/UI update; needs to stay fast

### Test Dependencies

**src/tests/icplc-canadian-status-readiness.test.js:**
- Multiple tests verify `deriveDocumentType()` deterministic behavior
- Tests: 30, 56, 81, 126, 155, 173, 193, 194, 195, 261, 322, 325, 334, 335
- **Nature:** Tests assume hardcoded mapping; tests verify all statuses map correctly
- **If configurable:** Tests would need access to loaded configuration before assertions

**src/tests/icplc-participant-form.test.js:**
- Tests: 149, 156, 162, 168, 174, 382, 383-390
- Tests verify form behavior with expected document types
- **Nature:** Tests assume hardcoded mapping
- **If configurable:** Tests would need seeded config or mock config injection

### Critical Finding: Synchronous Requirement

**CRITICAL:** `deriveDocumentType()` is called synchronously in:
- Readiness derivation (computeDocReadinessContribution) — called during participant filtering/render
- NeedsAttention page participant filtering
- DocumentationTab form rendering
- RegistrationEditModal form validation

Making this database-configurable would require:
- Loading configuration before every participant render
- Caching strategy (React Query)
- Fallback for cache misses
- Tests would need seeded config or mocks

**CONCLUSION:** Not worth the complexity for V1. Keep hardcoded.

---

## FINAL CONFIGURABLE VS FIXED MATRIX

| Setting | Current | V1 Decision | Reason |
|---------|---------|------------|--------|
| Participation Statuses | Hardcoded const | FIXED | Domain vocabulary; tied to readiness logic |
| Registration Statuses | Hardcoded const | FIXED | Tied to import behavior; domain enums |
| Passport Readiness Vocabulary | Hardcoded const | FIXED | Readiness engine vocabulary |
| Visa Requirement Options | Hardcoded const | FIXED | Readiness engine vocabulary |
| Visa Process Options | Hardcoded const | FIXED | Readiness engine vocabulary |
| Readiness Logic (BLOCKED → READY) | Hardcoded algorithm | FIXED | Core operational logic; no rule engine |
| Readiness Vocabulary | Hardcoded const | FIXED | Stable enum; no CRITICAL until deadline config exists |
| **Canadian Status → Document Type** | Hardcoded const | **DISPLAY ONLY (V1)** | Synchronous dependency; no config needed for V1; informational in Settings |
| Visa Defaults | DB (icplc_visa_defaults) | **KEEP CONFIGURABLE** | Already working; operational defaults |
| Tags | DB (icplc_tags) | **KEEP + IMPROVE** | Already working; add reorder/archive |
| Tag Ordering | sort_order column (unused UI) | **CONFIGURABLE** | Use existing column; drag-to-reorder or move buttons |
| Tag Archival | N/A | **NEW** | Add archived_at column; soft-delete pattern |
| Needs Attention Cohorts | Hardcoded in code | FIXED | Fixed operational workflows |
| Event Name/Sprint Pattern | event_configs (read-only here) | **DISPLAY** | Managed by event admin surface; link out if editable elsewhere |

---

## SETTINGS AUTHORIZATION

**Verified against actual code:**

**Frontend routing (ICPLCPortal.jsx:48, 111):**
```javascript
if (t.key === 'settings') return canAdmin
...
{!isLegacyTab && resolvedTab === 'settings' && canAdmin && <SettingsPage />}
```
- Settings tab only renders when `canAdmin === true`
- `canAdmin` is true when `accessTier === 'admin'` (line 43)

**Access tier derivation (ICPLCPage.jsx:202-207):**
```javascript
function deriveAccessTier() {
  if (financeAccess && !sprintEditAccess) return 'finance_only'
  if (role === 'super_admin' || role === 'regional_secretary') return 'admin'
  if (sprintEditAccess && canAccess === true) return 'write'
  return 'read_only'
}
```
- `canAdmin` tier requires: `role === 'super_admin'` or `role === 'regional_secretary'`

**Database RLS (existing migrations):**

icplc_tags write policy:
```sql
create policy "icplc_tags_write"
  on public.icplc_tags for all to authenticated
  using (public.current_user_role() in ('super_admin', 'regional_secretary'))
  with check (public.current_user_role() in ('super_admin', 'regional_secretary'));
```

icplc_visa_defaults write policy:
```sql
create policy "icplc_visa_defaults_write"
  on public.icplc_visa_defaults for all to authenticated
  using (public.current_user_role() in ('super_admin', 'regional_secretary'))
  with check (public.current_user_role() in ('super_admin', 'regional_secretary'));
```

**VERIFIED:** Settings authorization is correctly enforced:
- ✓ Frontend: canAdmin gate
- ✓ RLS: super_admin, regional_secretary only
- ✓ No frontend-only permission checks
- ✓ Consistent across both existing write surfaces

---

## TAG LIFECYCLE DESIGN

### Current Behavior

**Create:**
- SettingsPage form
- Insert into icplc_tags
- sort_order: defaults to 0 (no auto-increment)

**Read:**
- SettingsPage query: `order by sort_order`
- ParticipantProfileDrawer: fetch via useICPLCProfile
- useICPLCParticipants: join on icplc_participant_tags
- OverviewTab: read for assignment dropdown

**Update:**
- Not exposed in current UI
- Could add name/color edit form

**Delete:**
- SettingsPage: hard delete via `.delete().eq('id', id)`
- Cascades to icplc_participant_tags via FK `on delete cascade`
- **PROBLEM:** Historical participant assignments are lost

### Foreign Key Constraint

From migration 20260925000002:
```sql
create table public.icplc_participant_tags (
  participant_id uuid not null references public.icplc_participants(id) on delete cascade,
  tag_id         uuid not null references public.icplc_tags(id) on delete cascade,
  ...
  primary key (participant_id, tag_id)
);
```

**CASCADE behavior:** When tag is deleted, all assignments to that tag are deleted. No soft-delete possible without changing FK.

### Proposed Improvements

**1. Add `archived_at` column to icplc_tags**
```sql
alter table public.icplc_tags
  add column archived_at timestamptz;
```

**2. Update icplc_tags read query to filter**
```sql
where archived_at is null
```

**3. When displaying on participant, show archived indication** (optional)

**4. Soft-delete operation:**
- Set archived_at = now() instead of delete
- Existing assignments remain; show "(archived)" label on participant profiles if needed
- Easy to restore: set archived_at = null

**5. UI operations:**
- Add: ✓ (existing)
- Rename: ✓ (can add edit form)
- Reorder: ✓ (use sort_order; Move Up/Move Down buttons or drag)
- Archive: ✓ (soft-delete via archived_at)
- Restore: ✓ (clear archived_at)
- Permanently delete: ✓ (after archival confirmation dialog; requires hard delete)

**6. Drag-and-drop consideration:**
- Nexus does NOT have a stable drag-and-drop library convention
- Recommendation: Use simple Move Up/Move Down buttons
- If drag is desired later: use @dnd-kit (already in project) with explicit migration

### Schema Change Needed
```sql
ALTER TABLE public.icplc_tags
  ADD COLUMN archived_at timestamptz;
```

### Query Update in SettingsPage
```javascript
.select('*')
.or(`event_id.eq.${eventId},event_id.is.null`)
.is('archived_at', null)  // NEW: filter archived
.order('sort_order')
```

### Update Queries in useICPLCParticipants
If we want to hide archived tags from participant displays:
```javascript
.select('...tags(...)')
.eq('tags.archived_at', null)  // May not work; may need post-filter
```

**Decision:** Keep archived tags visible on participants who already have them (backward compatible). Don't assign new archived tags, but historical ones show with "(archived)" indicator.

---

## EVENT SETTINGS AUTHORITY

### Current Event Information

event_configs table has:
- event_name (text)
- sprint_pattern (text)
- created_at, updated_at (timestamptz)
- No location, no event_dates

Sprint table (related but separate):
- Assumed to have start_at, end_at (need to verify)
- Linked via `sprints.name ilike event_configs.sprint_pattern`

### Where Event Config Is Managed

**EventConfigsPage.jsx** (`src/pages/admin/EventConfigsPage.jsx`):
- Super admin only
- Full CRUD for event_configs
- Edit: event_name, sprint_pattern, team_permissions, tab_config
- This is the authoritative event configuration surface

### Settings Section Decision

**DO NOT duplicate event_configs authority in Settings.**

Instead, Settings should:
1. Display event name and sprint pattern (read-only)
2. Optionally link to EventConfigsPage for editing core config
3. Not accept edits to event_name or sprint_pattern in Settings

**Rationale:** EventConfigsPage is the canonical admin surface; Settings is operational configuration for an already-created event. Splitting event config across two places causes divergence and confusion.

---

## PARTICIPANT FORM CONFIGURATION

### Current State

**Participant documentation form exists:**
- RPC: `icplc_get_doc_form_info(p_token)`
- RPC: `icplc_update_documentation(...)`
- Page: `src/pages/events/ICPLCDocUpdatePage.jsx`
- Accessible by anyone with a valid doc_update_token
- No enable/disable configuration

**Allowed fields (from migration 20270829000000):**
- canada_residency_status
- canada_status_document_readiness

**Protection:**
- Nexus manual corrections set field source to 'NEXUS_MANUAL'
- Participant form cannot overwrite NEXUS_MANUAL fields
- This protection is built-in; no settings needed

### Settings Display Decision

**Display informational section only; no enable/disable toggle.**

Reason: The form is always available via RPC. There is no event-level configuration to disable it. Adding a fake toggle would mislead admins into thinking they control this capability.

If in the future there is a real enable/disable setting needed:
1. Add column to event_configs
2. Gate the RPC with that check
3. Then expose toggle in Settings

For V1: Display as informational only.

**Suggested text:**
```
Participant Documentation Updates
Status: Enabled

Participants can update their Canadian status and document readiness through a self-service form.
Manual corrections made in Nexus remain protected and cannot be overwritten by participant submissions.
```

---

## FINAL SCHEMA CHANGES

### New Columns

**icplc_tags table:**
```sql
ALTER TABLE public.icplc_tags
  ADD COLUMN archived_at timestamptz;
```

**That's all.** No new tables for Canadian mapping (V1 display-only decision).

### Existing Fields Already Present

- icplc_visa_defaults.notes (exists; expose in UI)
- icplc_tags.sort_order (exists; use in UI)
- event_configs.event_name, sprint_pattern (exists; display in Settings)

---

## SETTINGS UX

### Structure

```
Settings

  Event
  Basic event configuration and context

  Tags
  Manage operational participant tags

  Visa & Entry
  Destination-country visa defaults

  Canadian Status Documents
  Operational document mapping (read-only in V1)

  Participant Form
  Self-service documentation capability

  Readiness
  How ICPLC determines operational readiness
```

### Detailed Sections

#### Event
- Event name (read-only)
- Sprint pattern (read-only)
- Link to EventConfigsPage for editing
- Example: "Event: ICPLC (sprint: %ICPLC%) — Edit event configuration"

#### Tags
- List of tags (org-wide + event-specific)
- For each tag:
  - Color swatch
  - Name
  - Org/event badge
  - Move Up / Move Down buttons
  - Edit button (inline edit or modal)
  - Archive button (if not already archived)
  - (Optionally: Restore button if archived)
- Form to add new tag:
  - Name input
  - Color picker
  - Add button
- Tags showing as "archived" do not appear as new assignment choices but remain visible on participants who already have them

#### Visa & Entry
- Table: Country | Requirement | Scope | Notes
- Rows: org-wide + event-specific defaults
- For each row (event-specific):
  - Show notes field (if exists; currently a column but not displayed)
  - Edit link (inline edit or modal)
  - Delete link
- Form to add/update:
  - Country code input
  - Requirement dropdown (review, required, not_required)
  - Notes textarea
  - Save button
- Display: Org-wide defaults are shown but not editable (read-only, marked as "org")

#### Canadian Status Documents (Read-Only in V1)
- Informational section
- Show current mapping:
  - Canadian Citizen → None (no document required)
  - Permanent Resident → PR Card
  - International Student → Study Permit
  - Post-Graduation Worker → PGWP
  - Work Permit → Work Permit
  - Visitor / Other → Needs review
- Explanatory text: "These mappings determine which Canadian-status document Nexus tracks for ICPLC readiness. They are operational categories and do not determine immigration eligibility."
- No edit controls in V1
- Future: If configuration becomes necessary, add edit forms here

#### Participant Form
- Section: "Participant Documentation Updates"
- Status: "Enabled"
- Description: "Participants can update their Canadian status and document readiness through a self-service form. Manual corrections made in Nexus remain protected and cannot be overwritten by participant submissions."
- No toggle (no configuration to control this)

#### Readiness (Informational, Read-Only)
- Section: "How ICPLC Determines Readiness"
- Explain vocabulary:
  - Unknown: Not enough information
  - In Progress: Something underway; no action needed now
  - Action Required: Staff attention needed
  - Ready: All critical gates pass
  - Blocked: Passport issue prevents visa processing
- Explain factors considered:
  - Passport status
  - Visa requirement and process status
  - Canadian status document readiness
  - Registration status
  - Itinerary (arrival/departure info)
- Display as narrative/list, not editable
- Do not mention CRITICAL (not in V1)
- Do not create a rules engine

---

## BEHAVIORAL CONNECTIONS

### Tag Changes
**Setting Change → Actual Behavior:**
- Rename tag → ParticipantProfileDrawer displays new name
- Reorder tags → Tag selection dropdown in OverviewTab respects sort_order
- Archive tag → Tag does not appear as new assignment option; existing assignments preserved
- Add tag → New tag available in OverviewTab dropdown

### Visa Defaults Changes
**Setting Change → Actual Behavior:**
- Add country default → DocumentationTab form pre-fills visa_requirement when participant.passport_country is set
- Change visa requirement → Existing participants not affected (field is manual override); new participants see updated default
- Add notes → Notes display as tooltip/info in settings (UI enhancement)

### Event Display
**No behavior change; informational only in Settings**

### Canadian Status → Document Mapping (V1 Display-Only)
**No behavior change; read-only display in Settings**
- Mapping remains hardcoded in icplcDocReadiness.js
- deriveDocumentType() continues to use STATUS_TO_DOCUMENT_TYPE const
- Tests continue to verify hardcoded behavior

### Participant Form & Readiness
**No behavior change; informational only in Settings**

---

## TEST RESULTS EXPECTATIONS

### Existing Tests (No Changes Required)

All existing tests pass unchanged:
- icplc-canadian-status-readiness.test.js (deriveDocumentType still uses hardcoded mapping)
- icplc-participant-form.test.js (form behavior unchanged)
- RLS tests (icplc_tags, icplc_visa_defaults policies unchanged)

### New Tests (To Be Written)

1. **Tag archival prevents new assignments**
   - Create archived tag
   - Verify tag does not appear in OverviewTab assignment dropdown
   - Verify existing assignments remain

2. **Tag reordering respected in UI**
   - Set sort_order on tags
   - Fetch and verify order matches

3. **Visa defaults update affects form pre-fill**
   - Set visa default for country
   - Create participant with matching passport_country
   - Verify visa_requirement form field is pre-populated

4. **Settings authorization**
   - Verify super_admin can access Settings page
   - Verify regional_secretary can access Settings page
   - Verify non-admin user sees no Settings tab
   - Verify non-admin RLS queries are rejected

5. **No emojis in new UI**
   - Audit new Settings components for emoji characters
   - Verify only Lucide icons are used

---

## FULL REGRESSION (Expected)

### In Scope (No Regressions Expected)
- Tag add/delete (existing behavior; UI enhancement)
- Tag soft-delete (new behavior; backward compatible)
- Visa defaults (existing behavior; notes field exposed)
- Event display (new read-only section; no behavior change)
- Participant form display (new informational section; no behavior change)
- Readiness display (new informational section; no behavior change)
- Canadian mapping (display-only; hardcoded behavior unchanged)

### Existing Functionality to Verify
- SettingsPage renders without errors
- TagsSection CRUD works (add, no-op delete to archived state, read)
- VisaDefaultsSection CRUD works
- All RLS policies still enforce authorization
- ICPLCPage access checks still work
- Participant tag assignment still works
- ParticipantProfileDrawer still displays tags correctly
- OverviewTab tag assignment dropdown works
- NeedsAttentionPage cohort filtering unchanged
- DocumentationPage display unchanged
- DocumentationTab staff edits unchanged
- Readiness calculation unchanged

---

## SUMMARY

**CANADIAN MAPPING:** Keep hardcoded for V1. Display as read-only in Settings.

**TAGS:** Improve (add reorder, archive). Add archived_at column.

**VISA DEFAULTS:** Keep configurable (existing). Expose notes field in UI.

**EVENT/PARTICIPANT FORM/READINESS:** Display informational sections only. No behavior changes.

**AUTHORIZATION:** Verified. No changes needed. super_admin + regional_secretary only.

**NO EMOJIS:** Audit and fix throughout ICPLC.

**COMPLEXITY:** Minimal. No new tables. One new column. UI-focused changes.

