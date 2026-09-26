# ICPLC SETTINGS AUDIT

## CURRENT SETTINGS INVENTORY

### SettingsPage.jsx (current state)
Currently renders two hardcoded sections:
1. **Operational Tags** — form to add/delete tags (existing `icplc_tags` table)
2. **Visa Defaults by Passport Country** — form to add/delete visa defaults (existing `icplc_visa_defaults` table)

Both sections already have working CRUD; Settings UI is functional but incomplete.

---

## HARDCODED ICPLC CONFIGURATION

### 1. Participation Statuses (RegistrationTab.jsx:8)
```javascript
const PARTICIPATION_OPTIONS = ['tracking', 'likely', 'confirmed', 'uncertain', 'not_attending']
```
- **Location:** `src/features/icplc/components/tabs/RegistrationTab.jsx`
- **Nature:** Hardcoded const, displayed in dropdown; staff-managed (never from import)
- **Should be configurable?** NO — these are domain states, not operational rules. They map to international fellowship participation likelihood. Renaming/reordering belongs to Settings only if operators request it, but changing semantic meaning would break readiness logic.

### 2. Registration Statuses (RegistrationTab.jsx:7)
```javascript
const REGISTRATION_OPTIONS = ['unknown', 'not_registered', 'registered', 'issue']
```
- **Location:** `src/features/icplc/components/tabs/RegistrationTab.jsx`
- **Nature:** Hardcoded const; import-backed with staff override
- **Should be configurable?** NO — operational enums tied to CSV imports and readiness logic.

### 3. Passport Readiness Options (DocumentationTab.jsx:5-8)
```javascript
const PASSPORT_READINESS_OPTIONS = ['unknown', 'ready', 'renewal_needed', 'renewal_in_progress', 'no_passport', 'unsure', 'issue']
const VISA_REQUIREMENT_OPTIONS = ['review', 'required', 'not_required']
const VISA_PROCESS_OPTIONS = ['not_started', 'in_progress', 'submitted', 'processing', 'approved', 'issue', 'not_applicable']
```
- **Location:** `src/features/icplc/components/tabs/DocumentationTab.jsx`
- **Nature:** Hardcoded const; domain vocabulary
- **Should be configurable?** NO — these define the core readiness engine states. Changing them breaks `readinessEngine.js` and `icplcDocReadiness.js` logic.

### 4. Canadian Status → Required Document Type Mapping (icplcDocReadiness.js:127-134)
```javascript
const STATUS_TO_DOCUMENT_TYPE = {
  CANADIAN_CITIZEN:       DOCUMENT_TYPE.NONE,
  PERMANENT_RESIDENT:     DOCUMENT_TYPE.PR_CARD,
  INTERNATIONAL_STUDENT:  DOCUMENT_TYPE.STUDY_PERMIT,
  POST_GRADUATION_WORKER: DOCUMENT_TYPE.PGWP,
  WORK_PERMIT:            DOCUMENT_TYPE.WORK_PERMIT,
  VISITOR_OTHER:          DOCUMENT_TYPE.REVIEW,
};
```
- **Location:** `src/features/registration/icplcDocReadiness.js`
- **Nature:** Hardcoded const used by `deriveDocumentType()` and `computeDocReadinessContribution()`
- **Should be configurable?** YES — this is operational policy, not domain logic. Immigration rules change. Admins should be able to reconfigure which document is required for each residency status without editing code.
- **Current consumers:**
  - `deriveDocumentType()` (icplcDocReadiness.js)
  - `computeDocReadinessContribution()` (icplcDocReadiness.js)
  - `docNeedsAttention()` (icplcDocReadiness.js)
  - DocumentationPage.jsx displays `canada_residency_status`
  - DocumentationTab.jsx allows editing `canada_residency_status`

### 5. Readiness Logic (readinessEngine.js:36-83)
- **Location:** `src/features/icplc/lib/readinessEngine.js`
- **Nature:** Hardcoded decision tree: BLOCKED → ACTION_REQUIRED → IN_PROGRESS → READY → UNKNOWN
- **Conditions:**
  - BLOCKED: passport issue + visa required
  - ACTION_REQUIRED: passport action needed, visa not started, registration issue, missing itinerary
  - IN_PROGRESS: visa processing underway
  - READY: passport ready, visa approved or not required, itinerary received
  - UNKNOWN: not enough information
- **Should be configurable?** PARTIALLY — the overall vocabulary (BLOCKED, ACTION_REQUIRED, IN_PROGRESS, READY, UNKNOWN) should remain stable. Settings should DISPLAY what contributes to readiness, not allow admins to build boolean expressions. Some conditional thresholds MAY be configurable (e.g., deadline for "itinerary missing"), but V1 readiness is derived, not stored — making it editable would break the entire operational model.

### 6. Needs Attention Cohorts (NeedsAttentionPage.jsx:8-45)
```
- Blocked: passport issue prevents visa processing
- Action Required: staff attention needed
- Confirmed — Missing Itinerary: confirmed but no flight details
- Registered — Not Confirmed: registered but participation not confirmed
- Visa Required — Not Started: visa required but not started
```
- **Location:** `src/features/icplc/pages/NeedsAttentionPage.jsx`
- **Nature:** Hardcoded cohort definitions using derived readiness + explicit filters
- **Should be configurable?** NO — these are fixed operational workflows, not settings.

### 7. Visa Defaults (icplc_visa_defaults table)
- **Location:** Database table `public.icplc_visa_defaults`
- **Nature:** Already stored in DB; SettingsPage has CRUD
- **Should remain configurable?** YES — already is.

### 8. Tags (icplc_tags table)
- **Location:** Database table `public.icplc_tags`
- **Nature:** Already stored in DB; default org-wide tags seeded in migration 20260925000002; SettingsPage has CRUD
- **Should remain configurable?** YES — already is.

---

## EXISTING DATABASE CONFIGURATION

### event_configs Table (ICPLC row)
- `event_name`: 'ICPLC'
- `sprint_pattern`: '%ICPLC%'
- `early_cutoff_at`: null
- `early_fee`: 0
- `standard_fee`: 0
- `local_detection_regex`: 'manitoba|winnipeg'
- `exempt_fellowships`: []
- `public_token_key`: 'icplc_public_token'
- `tab_config`: hidden tabs (TII tabs)
- `team_permissions`: team tier assignments
- `sidebar_teams`: {}

No ICPLC-specific operational settings are stored here (by design — most config is domain constants or in dedicated tables).

### icplc_tags Table
- Stores configurable operational tags (Finances, School, etc.)
- `event_id = null` for org-wide; non-null for event-specific
- RLS: super_admin/regional_secretary can write; anyone can read

### icplc_visa_defaults Table
- Stores country → visa_requirement mapping
- `event_id = null` for org-wide; non-null for event-specific
- RLS: super_admin/regional_secretary can write; anyone can read

### icplc_participants Table
- Stores participant data including:
  - Participation status (staff-managed)
  - Registration status (import-backed with override)
  - Passport/visa/documentation fields
  - `canada_residency_status` (from registration join or manual entry)

### registrations Table (TII — not ICPLC-specific)
- Has `canada_residency_status`, `canada_status_document_readiness`, etc.
- Isolated from ICPLC via `doc_update_token` gating
- Not directly configurable per ICPLC event

---

## WHAT SHOULD BECOME CONFIGURABLE

### 1. Canadian Status → Document Type Mapping ✓
- **Current state:** Hardcoded in `icplcDocReadiness.js`
- **Should be:** Configurable via Settings; stored in a new `icplc_doc_mappings` table
- **Rationale:** Immigration rules/policies change; Nexus is not a legal authority
- **UI:** Matrix showing residency status → required document type; allow override
- **Storage:** Small normalized table with (event_id, residency_status, required_document_type)
- **Behavior change:** `deriveDocumentType()` reads from DB instead of hardcoded const

### 2. Tag Ordering & Archival ✓
- **Current state:** Tags exist; sort_order field exists but UI doesn't expose ordering
- **Should be:** Drag-to-reorder UI; soft-delete (archive) instead of hard-delete
- **Rationale:** Staff reorders tags based on operational priority; historical tag assignments should remain intact
- **Storage:** Existing icplc_tags + add `archived_at` timestamp
- **UI enhancement:** Drag handles in SettingsPage; "Archive" instead of "Delete"

### 3. Visa Defaults — Notes/Rationale ✓
- **Current state:** Visa defaults table has `notes` column (unused in UI)
- **Should be:** Show notes in Settings; allow editing
- **Rationale:** Document why a country's visa requirement was set (policy change, legal advisory, etc.)
- **UI enhancement:** Add notes field to visa defaults form

### 4. Participation Status Labels (OPTIONAL, LOW PRIORITY)
- **Current state:** Hardcoded as 'tracking', 'likely', 'confirmed', 'uncertain', 'not_attending'
- **Should be:** Allow rename? (e.g., 'Tracking' → 'Looking')
- **Rationale:** Operators may want semantic alignment with fellowship terminology
- **Decision:** DEFER — this is internationalization/localization, not configuration. Do NOT implement unless operators explicitly request. Risk: breaking readiness logic if someone renames 'confirmed' without understanding implications.

---

## WHAT SHOULD REMAIN FIXED

1. **Readiness vocabulary** (BLOCKED, ACTION_REQUIRED, IN_PROGRESS, READY, UNKNOWN) — no renaming
2. **Readiness decision tree logic** — no allow-admins-to-build-rules system
3. **Participation status semantics** ('confirmed' = yes, 'tracking' = maybe, etc.)
4. **Registration status semantics** (unknown, not_registered, registered, issue)
5. **Passport readiness semantics** (ready, renewal_needed, no_passport, etc.)

---

## STORAGE DECISION FOR EACH SETTING

| Setting | Table | Location | Type | Event-Scoped |
|---------|-------|----------|------|--------------|
| Tags | icplc_tags | existing | existing | both |
| Visa Defaults | icplc_visa_defaults | existing | existing | both |
| Tag Ordering | icplc_tags.sort_order | existing | update UI | both |
| Tag Archival | icplc_tags.archived_at | new column | update UI | both |
| Visa Notes | icplc_visa_defaults.notes | existing | update UI | both |
| Doc Mapping | **icplc_doc_mappings** (NEW) | new table | new | both |

---

## AUTHORIZATION MODEL

**Current state:**
- `icplc_tags` write: super_admin, regional_secretary
- `icplc_visa_defaults` write: super_admin, regional_secretary
- SettingsPage visibility: canAdmin (admin access tier only)

**Required:**
- Settings page only visible to `canAdmin` tier (enforced in ICPLCPortal)
- All writes must be authorized by RLS policies (super_admin, regional_secretary)
- No frontend-only permission checks; RLS is authoritative
- Migrations must add RLS policies for new tables

**Separation of concerns:**
- View: All ICPLC sprint members + team-specific roles
- Modify settings: super_admin, regional_secretary only
- This already exists; no changes needed

---

## BEHAVIORAL CONNECTIONS

### Canadian Status Document Mapping
**Current flow:**
```
DocumentationTab.jsx
  → participant.canada_residency_status (stored in icplc_participants)
  → deriveDocumentType(residencyStatus) [hardcoded]
  → used in readiness calculation
  → shown in DocumentationPage.jsx grouping
  → shown in NeedsAttentionPage (docNeedsAttention)
```

**After configuration:**
```
DocumentationTab.jsx
  → participant.canada_residency_status (stored in icplc_participants)
  → deriveDocumentType(residencyStatus) [READ FROM icplc_doc_mappings]
  → used in readiness calculation
  → shown in DocumentationPage.jsx grouping
  → shown in NeedsAttentionPage (docNeedsAttention)
```

**Where it's used:**
1. `icplcDocReadiness.deriveDocumentType()` — fetch from DB or fallback to hardcoded
2. `icplcDocReadiness.docNeedsAttention()` — uses derived document type
3. `readinessEngine.deriveReadiness()` — does NOT directly reference doc type (only via overall contribution)
4. DocumentationPage.jsx — groups participants by derived document type
5. DocumentationTab.jsx — displays current residency status

### Tag Configuration
**Current flow:**
```
SettingsPage → add/delete icplc_tags → read in ParticipantProfileDrawer → render tag chips
```

**After enhancement:**
```
SettingsPage → add/rename/reorder/archive icplc_tags → read in ParticipantProfileDrawer → render tag chips (in sort order, skip archived)
```

### Visa Defaults
**Current flow:**
```
SettingsPage → add/delete icplc_visa_defaults → read in DocumentationTab dropdown auto-populate
```

**After enhancement:**
```
SettingsPage → add/delete/edit-notes icplc_visa_defaults → read in DocumentationTab + show notes tooltip
```

---

## MIGRATION

### New Table: icplc_doc_mappings
```sql
create table public.icplc_doc_mappings (
  id                      uuid primary key default gen_random_uuid(),
  event_id                uuid not null references public.event_configs(id) on delete cascade,
  residency_status        text not null,
  required_document_type  text not null,
  notes                   text,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  unique(event_id, residency_status)
);
```

### Schema Updates: icplc_tags
```sql
alter table public.icplc_tags
  add column archived_at timestamptz;
```

### RLS for icplc_doc_mappings
```sql
alter table public.icplc_doc_mappings enable row level security;

create policy "icplc_doc_mappings_read"
  on public.icplc_doc_mappings for select to authenticated
  using (public.icplc_can_read_participants());

create policy "icplc_doc_mappings_write"
  on public.icplc_doc_mappings for all to authenticated
  using (public.current_user_role() in ('super_admin', 'regional_secretary'))
  with check (public.current_user_role() in ('super_admin', 'regional_secretary'));
```

### Seed Default Mappings
```sql
insert into public.icplc_doc_mappings (event_id, residency_status, required_document_type, notes)
select id, 'CANADIAN_CITIZEN', 'NONE', 'Canadian citizens do not require status documents'
  from public.event_configs where event_name ilike '%ICPLC%'
on conflict do nothing;
-- ... repeat for other statuses
```

---

## SettingsPage STRUCTURE (Updated)

```
Settings

  ▶ Event
    • Event name (read-only from event_configs)
    • Sprint pattern (read-only)

  ▶ Tags
    • List of tags with sort order (drag to reorder)
    • Option to archive tag
    • Option to edit tag name/color
    • Form to add new tag

  ▶ Canadian Status Documents
    • Matrix: Residency Status → Required Document Type
    • Edit form for each mapping
    • Notes for each mapping

  ▶ Visa & Entry
    • Country → Visa Requirement defaults (existing)
    • Notes field for each (existing field, add UI)
    • Edit/delete form

  ▶ Participant Form (if appropriate)
    • Show whether participant documentation form is enabled
    • Show which fields participants can self-update
    • Do NOT expose tokens

  ▶ Readiness (Display Only)
    • Explain what contributes to readiness
    • Show readiness vocabulary (BLOCKED, ACTION_REQUIRED, etc.)
    • Do NOT allow editing readiness logic
```

---

## IMPLEMENTATION PLAN

1. **Migration:** Add `archived_at` to icplc_tags; create icplc_doc_mappings table with RLS
2. **Hook:** `useICPLCDocMappings()` to fetch/update doc mappings
3. **SettingsPage enhancements:**
   - TagsSection: add reorder UI, archive option
   - VisaDefaultsSection: expose notes field
   - DocumentMappingSection: new form for residency → document type mapping
4. **icplcDocReadiness.js:** Refactor `deriveDocumentType()` to fetch from DB (with fallback)
5. **Tests:** Verify doc mapping is read from DB, settings changes affect behavior
6. **Remove hardcoded:** Delete STATUS_TO_DOCUMENT_TYPE from icplcDocReadiness.js after migration applied

---

## NO EMOJIS

- Remove emoji UI icons throughout ICPLC
- Use Lucide icons instead (consistent with Nexus)
- Examples: Settings (Settings), Documents (FileText, CheckCircle, AlertCircle), Tags (Tag), Travel (Plane)

