# ICPLC ARCHITECTURE RECONCILIATION — DESIGN ONLY

**No code changes. No migrations. No deployment.**

---

## 1. FIELD OWNERSHIP MATRIX

| Field | Canonical Table | Source Table | Write Authority | Read Paths | Rationale |
|-------|---|---|---|---|---|
| id (UUID) | icplc_participants | — | Insertion | ICPLC | Primary key |
| full_name | icplc_participants | registrations | Import seed, staff | ICPLC People | Operational name |
| email | icplc_participants | registrations | Import seed, staff | ICPLC search | Contact |
| participation_status | icplc_participants | — | Staff only | People, Overview, Needs Attention | Never from import |
| registration_status | icplc_participants | import | Import + override, staff | ICPLC, readiness | Source-backed with staff lock |
| passport_country | icplc_participants | import | Import, staff | ICPLC, visa defaults | Deterministic |
| passport_readiness | icplc_participants | import | Import + override, staff | ICPLC, readiness | Document status |
| visa_requirement | icplc_participants | — | Visa defaults, staff | ICPLC, readiness | Derived + override |
| visa_process_status | icplc_participants | — | Staff | ICPLC, Needs Attention | Process tracking |
| arrival_date, flight | icplc_participants | import | Import, staff | ICPLC Travel, readiness | Itinerary |
| departure_date, flight | icplc_participants | import | Import, staff | ICPLC Travel, readiness | Itinerary |
| canada_residency_status | **icplc_participants** | registrations (seed) | Import, form, staff + lock | Documentation, readiness | **REDESIGN TARGET** |
| canada_status_document_readiness | **icplc_participants** | form | Form, staff + lock | Documentation, readiness | **REDESIGN TARGET** |
| doc_update_token | **icplc_participants** | — | Auto (UUID) | Participant form URL | **REDESIGN TARGET** |
| region, subgroup, group_name, leadership | icplc_participants | import | Import only | People filtering, Overview | Organizational |
| notes | icplc_participants | — | Staff | Profile drawer | Operational notes |
| override_fields (JSONB) | icplc_participants | — | Auto (field mutations) | Admin audit | Tracks staff locks |
| source_values (JSONB) | icplc_participants | — | Auto (import) | Import preview, audit | Tracks provenance |
| icplc_tags (junction) | icplc_participant_tags | — | Staff | ICPLC People | Tagging |
| **payment_received** | **registrations** | — | Finance gateway | Reports, RegistrationEcosystem | Finance authority |
| **transport_mode** | **registrations** | — | Staff | RegistrationEcosystem | Transport logistics |
| **room_assignment** | **registrations** | — | Room UI | RegistrationEcosystem | Physical logistics |

---

## 2. REGISTRATIONS RESPONSIBILITIES

**Keep on registrations (do NOT migrate to icplc_participants):**

- Finance domain: payment_received, checked_in_at, in_state
- Logistics: transport_mode, room_assignment
- Source/registration metadata: submitted_at, first_name

**Scope protection:**
- event_config_id NULL = TII historical records
- event_config_id non-null = ICPLC event
- RLS: RegistrationEcosystem scopes to its domain

**Data flows TO icplc_participants:**
- Initial seed only (populate icplc_participants from matching registrations)
- Then: ICPLC owns operational state
- Then: ICPLC staff edits do NOT write back to registrations

**Role:**
- Source/legacy surface (RegistrationEcosystem)
- Finance authority
- TII isolation (via event_config_id)

---

## 3. ICPLC_PARTICIPANTS RESPONSIBILITIES

**Canonical authority for all ICPLC operational domains:**

- Participation tracking (staff-managed status)
- Passport and visa tracking
- **Canadian residency and document readiness** (REDESIGN TARGET)
- Travel coordination
- Organizational assignment (subgroup, region, group, leadership)
- Operational notes and tags
- Field-level override metadata
- Provenance tracking (source per field)

**Write authority:**
- Nexus staff (all fields, with per-field override protection)
- Participant form (whitelisted fields only: canada_residency_status, canada_status_document_readiness)
- CSV import (non-protected fields only)
- Auto-population at creation (from registrations seed)

**Read authority:**
- ICPLC portal (all pages)
- Readiness engine
- Needs Attention filtering
- Public participant form (token-gated)

---

## 4. SOURCE → OPERATIONAL DATA FLOW

```
registrations (finance/source)
    ↓ (one-time seed at participant creation)
    
icplc_participants (canonical operational)
    ↑
    ├── CSV import (new participants + field updates)
    ├── Participant form (canadian_residency_status, canada_status_document_readiness)
    └── Nexus staff UI (any field + field-level lock)

Field-level override:
    Nexus staff locks field → override_fields[field] = { overridden: true, by, at }
    Import blocked on locked field
    Staff can "Resume Form Sync" to clear lock and adopt latest _participant value
```

---

## 5. CANADIAN DOCUMENT TARGET MODEL

**DO NOT add to registrations. Add to icplc_participants instead:**

```sql
ALTER TABLE icplc_participants ADD COLUMN IF NOT EXISTS (
  -- Operational fields
  canada_residency_status text CHECK (...CANADIAN_CITIZEN|PERMANENT_RESIDENT|...|VISITOR_OTHER...),
  canada_status_document_readiness text CHECK (...UNKNOWN|READY|RENEWAL_NEEDED|RENEWAL_IN_PROGRESS|ISSUE|NOT_APPLICABLE...),
  
  -- Provenance
  canada_residency_status_source text CHECK (...PARTICIPANT_FORM|NEXUS_MANUAL|CSV_IMPORT...),
  canada_status_doc_readiness_source text CHECK (...PARTICIPANT_FORM|NEXUS_MANUAL|CSV_IMPORT...),
  
  -- Latest participant-submitted (preserved even when staff-locked)
  canada_residency_status_participant text CHECK (...),
  canada_status_doc_readiness_participant text CHECK (...),
  
  -- Public form access
  doc_update_token uuid NOT NULL UNIQUE DEFAULT gen_random_uuid()
);
```

**Provenance and override stored in existing JSONB columns:**
- override_fields: tracks which fields have staff lock
- source_values: tracks source (PARTICIPANT_FORM|NEXUS_MANUAL|CSV_IMPORT)

---

## 6. PARTICIPANT FORM TARGET MODEL

**Public form updates icplc_participants directly (NOT registrations).**

```
GET /api/icplc/doc-form/{doc_update_token}
  → Validate: token exists on icplc_participants
  → Validate: icplc_participants.event_id → event_configs.event_name ILIKE '%ICPLC%'
  → Reject if TII
  → Return: { first_name, event_name, canada_residency_status, canada_status_document_readiness, source }

POST /api/icplc/doc-form/{doc_update_token}
  Payload: { canada_residency_status, canada_status_document_readiness }
  
  Logic:
    IF source = 'NEXUS_MANUAL':
      → Update _participant columns only
      → Keep main columns locked
    ELSE:
      → Update main columns + _participant
      → Set source = 'PARTICIPANT_FORM'
  
  Atomic: single UPDATE statement
```

---

## 7. FIELD AUTHORITY / OVERRIDE MODEL

**Use existing icplc_participants infrastructure:**

```javascript
// Staff manual correction (field-level):
UPDATE icplc_participants
SET 
  canada_residency_status = 'INTERNATIONAL_STUDENT',
  override_fields = override_fields || '{"canada_residency_status": {"overridden": true, "by": user_id, "at": now()}}'
WHERE id = participant_id;

// Resume Form Sync (atomic):
UPDATE icplc_participants
SET
  canada_residency_status = canada_residency_status_participant,
  canada_status_document_readiness = canada_status_doc_readiness_participant,
  canada_residency_status_source = 'PARTICIPANT_FORM',
  override_fields = jsonb_strip_nulls(override_fields || '{"canada_residency_status": null, "canada_status_document_readiness": null}')
WHERE id = participant_id
  AND override_fields -> 'canada_residency_status' ->> 'overridden' = 'true';
```

**Behavior:**
- Override is PER FIELD, not per-participant
- Other fields still importable while one is locked
- Participant form cannot overwrite locked field (source='NEXUS_MANUAL' gate)
- Resume sync is explicit staff action (clear lock + adopt latest form submission)

---

## 8. UI INTEGRATION

**People page:**
- Show participation_status, passport_readiness badges
- No Canadian status (separate page)

**Documentation page (NEW):**
- Group by derived required-document-type
- For each participant:
  - Show canada_residency_status (readonly context)
  - Show canada_status_document_readiness (readonly context)
  - Show source indicator
  - Show override lock indicator
  - Offer staff edit forms (both fields)
  - Show participant form history (_participant values)
  - "Resume Form Sync" button if lock present

**Participant form (public, token-gated):**
- URL: `/update-documentation/{doc_update_token}`
- Validates token maps to ICPLC participant
- Renders dropdowns for both fields
- Shows current values (context only)
- Submit: direct to icplc_participants
- Shows message if field is locked by staff

**Needs Attention page:**
- "Canadian status unknown" cohort
- "Canadian status needs review" cohort (VISITOR_OTHER)
- "[Document type] renewal needed" cohorts

**Profile drawer (in People page):**
- Show Canadian fields if populated
- Show override lock badge
- Link to Documentation page

---

## 9. REGISTRATION-BASED CODE TO REMOVE/ADAPT

**Current problem (in ICPLCDashboard.jsx):**
```javascript
// WRONG: writes to registrations
await supabase.from('registrations')
  .update({ operational_note: noteValue })
  .eq('id', p._regId)
```

**Fix:**
```javascript
// RIGHT: write to icplc_participants
await supabase.from('icplc_participants')
  .update({ notes: noteValue })
  .eq('id', participant.id)
```

**Files to audit:**
- `src/features/icplc/ICPLCDashboard.jsx` — Remove all registrations writes
- `src/pages/events/ICPLCDocUpdatePage.jsx` — Retarget Canadian form to icplc_participants
- `src/features/icplc/hooks/useICPLCProfile.js` — Already correct; verify it stays icplc_participants

**DO NOT remove:**
- registrations.participation_status, registrations.passport_* fields (backwards compat)
- Just stop WRITING to them from ICPLC code

---

## 10. MIGRATION RESTRUCTURE PLAN

**Current state:** 18 local migrations marked LOCAL_ONLY; 20270829000000 targets registrations (wrong table)

**Forward strategy (no repair of history):**

| Phase | Purpose | Migrations |
|---|---|---|
| Foundation | Core infrastructure | 20260624002000, 20260907000001, 20260915000001-004 (if missing) |
| ICPLC | Canonical model | 20260925000001 (icplc_participants), 20260925000002-011 (tags, visa defaults, import) |
| Canadian Redesign | Canadian on icplc_participants | NEW migration (NOT 20270829000000) |

**New migration (replaces 20270829000000):**
- Add canadian_* columns to icplc_participants (not registrations)
- Add source tracking (JSONB in source_values)
- Add _participant columns for form submissions
- Add doc_update_token
- New RPCs: icplc_get_doc_form_info, icplc_update_documentation, icplc_resume_form_sync

**Reject 20270829000000** (targets registrations; architectural mismatch)

---

## 11. TII INVARIANTS

**Test assertions before shipping:**

1. ✓ TII registrations untouched
   - SELECT COUNT(*) FROM registrations WHERE event_config_id IS NULL AND canada_residency_status IS NOT NULL
   - Must = 0

2. ✓ TII public RPC behavior unchanged
   - RegistrationEcosystem still works
   - Public share page loads
   - Payment flow unaffected

3. ✓ TII roster/working-list unchanged
   - Scoped queries on event_config_id IS NULL still work

4. ✓ ICPLC RPCs reject TII tokens
   - icplc_get_doc_form_info(tii_token) → error
   - Validates event_name ILIKE '%ICPLC%'

5. ✓ ICPLC form cannot resolve TII records
   - No TII rows in icplc_participants
   - Token lookup returns NOT FOUND

6. ✓ ICPLC import doesn't touch TII
   - All participants go to icplc_participants (not registrations)
   - registrations unchanged

---

## 12. REMOTE SCHEMA UNKNOWN ITEMS

**UNVERIFIED (need direct schema inspection):**

- [ ] icplc_participants table exists
- [ ] icplc_tags, icplc_visa_defaults exist
- [ ] icplc_import_batches/rows/identity_maps exist
- [ ] event_config_id is on registrations/working_list/roster
- [ ] registrations.participation_status, passport_* fields exist (from 20260926000001)
- [ ] Which migrations are actually applied

**DO NOT assume existence from:**
- Migration repair suggestions
- Migration list tracker (diverged from schema)
- Migration timestamps

**NEXT STEP:** Direct schema read-only inspection required before any deployment.

---

## 13. IMPLEMENTATION PHASES

**Phase A — Design Lock (CURRENT):**
- ✓ Architecture: icplc_participants canonical
- ✓ Field ownership: defined per domain
- ✓ Data flow: registrations → icplc_participants (seed only)
- ✓ Canadian redesign: icplc_participants + form + RPCs
- ⏳ Remote schema: UNKNOWN (needs verification)

**Phase B — Code Review (AFTER schema verified):**
- [ ] Identify all registrations writes from ICPLC code
- [ ] Prepare code changes: redirect to icplc_participants
- [ ] Prepare updated RPC implementations
- [ ] Prepare TII invariant test suite

**Phase C — Migration Plan (AFTER phase B):**
- [ ] Verify remote has icplc_participants foundation
- [ ] Design new Canadian migration (icplc_participants, not registrations)
- [ ] Reject 20270829000000
- [ ] Finalize migration sequence

**Phase D — Deploy (AFTER everything approved):**
- [ ] Unit tests: Canadian logic
- [ ] Integration tests: form → icplc_participants → UI
- [ ] TII invariant tests: 6 assertions
- [ ] Full regression
- [ ] Gradual rollout

---

## SUMMARY

**Architecture:** icplc_participants is canonical ICPLC operational model  
**Canadian fields:** Move from registrations to icplc_participants  
**Code fix:** Redirect ICPLCDashboard writes to correct table  
**Migration:** Design new Canadian migration; reject 20270829000000  
**Remote schema:** UNKNOWN; must verify before deploying  
**Settings work:** ON HOLD until schema confirmed  
**Blocking:** Remote schema state must be directly inspected

