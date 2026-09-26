# ICPLC ARCHITECTURE RECONCILIATION DESIGN

**Status:** DESIGN ONLY — No code changes, no migrations, no deployment

**Date:** 2026-09-26  
**Target Architecture:** icplc_participants as canonical ICPLC operational model

---

## 1. FIELD OWNERSHIP MATRIX

| Field Domain | Canonical Table | Source Table | Write Paths | Read Paths | Sync Direction | Manual Override | Rationale |
|---|---|---|---|---|---|---|---|
| **Identity** | | | | | | | |
| id (UUID) | icplc_participants | — | insertion only | ICPLC UI | — | NO | Primary key; immutable |
| full_name | icplc_participants | registrations (initial) | Nexus staff, import | ICPLC UI (People, profile) | registrations → icplc_participants (initial seed only) | NO | Canonical operational record |
| email | icplc_participants | registrations (source) | import, manual | ICPLC UI (search, profile) | registrations → icplc_participants (initial seed) | NO | Identify and contact |
| | | | | | | | |
| **Registration/Status** | | | | | | | |
| participation_status | icplc_participants | — | Nexus staff only | ICPLC People, Overview, Needs Attention | — | NO | Staff-managed; never from import |
| registration_status | icplc_participants | registrations (source-backed) | Import with override, Nexus manual | ICPLC UI, readiness | registrations → icplc_participants (with override protection) | YES (field-level) | Source-backed with staff correction capability |
| | | | | | | | |
| **Finance** | | | | | | | |
| payment_received | registrations | — | payment gateway, manual | RegistrationEcosystem (legacy), Reports | — | NO | Finance authority remains on registrations |
| transport_mode | registrations | — | Nexus staff | RegistrationEcosystem (legacy) | — | YES | Transport scoping; owned by registrations |
| room_assignment | registrations | — | Room assignment UI | RegistrationEcosystem (legacy) | — | YES | Physical logistics; registrations |
| | | | | | | | |
| **Passport/Visa** | | | | | | | |
| passport_country | icplc_participants | registrations (initial) | Import, Nexus manual, participant form | ICPLC UI, readiness calc | registrations → icplc_participants (initial) | NO | Deterministic for readiness |
| passport_readiness | icplc_participants | import (field-backed) | Import with override, Nexus manual | ICPLC UI, readiness, Needs Attention | registrations → icplc_participants (if present) | YES (field-level) | Document status tracking |
| visa_requirement | icplc_participants | — (derived from passport_country + visa_defaults) | Nexus manual only | ICPLC UI, readiness | — | YES (manual override) | Operational default; staff-overridable |
| visa_process_status | icplc_participants | — | Nexus staff | ICPLC UI, readiness, Needs Attention | — | NO | Process tracking |
| | | | | | | | |
| **Canadian Status** | | | | | | | |
| canada_residency_status | icplc_participants | registrations (initial seed) | Import, participant form, Nexus manual | ICPLC UI (Documentation), readiness | registrations → icplc_participants (initial) | YES (field-level) | **REDESIGN TARGET** |
| canada_status_document_readiness | icplc_participants | participant form (latest), Nexus manual | Participant form, Nexus staff | ICPLC UI (Documentation), readiness | participant form → icplc_participants | YES (field-level) | **REDESIGN TARGET** |
| canada_residency_status_source | icplc_participants | — | Auto-set by write path | Admin audit only | — | NO | Audit trail: PARTICIPANT_FORM, NEXUS_MANUAL, CSV_IMPORT |
| doc_update_token | icplc_participants | — | AUTO (UUID default on insert) | Participant form URL | — | NO | **REDESIGN TARGET** — Public form access token |
| canada_residency_status_participant | icplc_participants | participant form | Participant form self-service | Admin view (for manual protection) | participant form writes | NO | Latest participant-submitted value |
| | | | | | | | |
| **Travel** | | | | | | | |
| arrival_date | icplc_participants | import | Import, Nexus manual | ICPLC Travel, readiness | import → icplc_participants | YES (field-level) | Flight coordination |
| arrival_flight | icplc_participants | import | Import, Nexus manual | ICPLC Travel, readiness | import → icplc_participants | YES (field-level) | Itinerary |
| departure_date | icplc_participants | import | Import, Nexus manual | ICPLC Travel, readiness | import → icplc_participants | YES (field-level) | Itinerary |
| departure_flight | icplc_participants | import | Import, Nexus manual | ICPLC Travel, readiness | import → icplc_participants | YES (field-level) | Itinerary |
| | | | | | | | |
| **Organization** | | | | | | | |
| region | icplc_participants | import | Import only | ICPLC UI (People filtering) | import → icplc_participants | NO | Imported demographic |
| subgroup | icplc_participants | import | Import only | ICPLC UI (filtering, Overview breakdown) | import → icplc_participants | NO | Event cohort assignment |
| group_name | icplc_participants | import | Import only | ICPLC UI | import → icplc_participants | NO | Imported demographic |
| leadership | icplc_participants | import | Import only | ICPLC UI | import → icplc_participants | NO | Imported role |
| | | | | | | | |
| **Operational** | | | | | | | |
| notes | icplc_participants | — | Nexus staff | ICPLC profile drawer | — | NO | Operational notes, Nexus only |
| override_fields (JSONB) | icplc_participants | — | Auto-managed by field-level mutations | Admin audit | — | NO | Tracks which fields have manual staff corrections |
| source_values (JSONB) | icplc_participants | — | Auto-managed by import | Import preview, audit | — | NO | Tracks provenance (source, batch_id, observed_at) |
| icplc_tags (junction) | icplc_participant_tags | — | Nexus staff | ICPLC UI (profile tags, filtering) | — | NO | Operational tagging |
| created_at | icplc_participants | — | AUTO | Audit only | — | NO | |
| updated_at | icplc_participants | — | AUTO | Audit only | — | NO | |

---

## 2. REGISTRATIONS RESPONSIBILITIES

**Registrations table retains ownership of:**

- **Financial data:**
  - payment_received
  - in_state (fellowship location qualification)
  - checked_in_at (event check-in)
  
- **Legacy/source data:**
  - full_name, email (source copy for backwards compatibility)
  - first_name, submitted_at (original submission metadata)
  - All other TII-specific fields remain untouched
  
- **Logistics (scoped to registrations authority):**
  - transport_mode
  - room_assignment (not yet in icplc_participants)
  - **Rationale:** These are coordination fields that may differ between registrations/TII and ICPLC use cases. Keeping them on registrations prevents accidental coupling.

**Registrations scope limitation:**
- event_config_id FK ensures registrations rows are isolated to their owning event
- ICPLC participant-form updates go to icplc_participants, NOT registrations
- ICPLC operational updates do NOT write to registrations (eliminates sync confusion)

**Data flows FROM registrations TO icplc_participants:**
- Initial participant creation: populate icplc_participants from matching registrations (one-time seed)
- Import updates: flow through icplc_import_rows → icplc_participants directly (NOT via registrations)
- Participant form: writes directly to icplc_participants (NOT via registrations)

---

## 3. ICPLC_PARTICIPANTS RESPONSIBILITIES

**icplc_participants is the canonical operational authority for:**

All ICPLC staff and participant-facing operational domains:
- Participation (tracking status)
- Passport readiness
- Visa requirement and process
- **Canadian residency status and document readiness** (REDESIGN TARGET)
- Travel itinerary
- Organizational assignment (subgroup, region, leadership, group)
- Operational notes and tags
- Field-level override metadata
- Source provenance tracking

**Write authority:**
- Nexus staff (all fields, with field-level override protection)
- Participant form (only whitelisted fields: canada_residency_status, canada_status_document_readiness)
- CSV import (non-protected fields only; blocked by override)
- Auto-population at participant creation (from registrations seed)

**Read authority:**
- ICPLC portal (all pages)
- Readiness engine (derives operational state)
- Needs Attention filtering
- Public participant form (token-gated, minimal projection)

---

## 4. SOURCE → OPERATIONAL DATA FLOW

```
registrations (source/finance model)
    ↓ (initial seed only)
    icplc_participants (canonical operational model)
    ↑
    +--- CSV import (bypass registrations)
    ↑
    +--- Participant form (direct write, token-gated)
    ↑
    +--- Nexus staff UI (direct read/write)
```

**For Canadian Status specifically:**

```
registrations.canada_residency_status (if source-backed)
    ↓ (optional initial seed for existing records)
    icplc_participants.canada_residency_status
    ↑
    +--- Participant form (participant-submitted)
    ↑
    +--- Nexus staff manual correction
    ↑
    +--- CSV import (if field-backed)

participantForm → icplc_participants.canada_status_document_readiness
    ↑
    +--- Nexus staff manual correction
```

**Override behavior:**
- When a field is manually corrected in Nexus, override_fields[field] is set
- Subsequent imports are blocked on that field (marked "protected" in preview)
- Staff can "Resume Form Sync" to clear override and re-enable import
- Manual correction is **field-level**, not participant-level (other fields still importable)

---

## 5. CANADIAN DOCUMENT TARGET MODEL

**DO NOT implement on registrations; redesign on icplc_participants.**

### Required operational fields (on icplc_participants):

```sql
ALTER TABLE public.icplc_participants ADD COLUMN IF NOT EXISTS (
  canada_residency_status text
    CHECK (canada_residency_status IN (
      'CANADIAN_CITIZEN',
      'PERMANENT_RESIDENT', 
      'INTERNATIONAL_STUDENT',
      'POST_GRADUATION_WORKER',
      'WORK_PERMIT',
      'VISITOR_OTHER'
    )),
  canada_status_document_readiness text
    CHECK (canada_status_document_readiness IN (
      'UNKNOWN',
      'READY',
      'RENEWAL_NEEDED',
      'RENEWAL_IN_PROGRESS',
      'ISSUE',
      'NOT_APPLICABLE'
    )),
  doc_update_token uuid NOT NULL UNIQUE DEFAULT gen_random_uuid()
);
```

### Field authority metadata:

Use existing icplc_participants.override_fields JSONB:
```json
{
  "canada_residency_status": {
    "overridden": true,
    "by": "<user-uuid>",
    "at": "<iso-timestamp>"
  },
  "canada_status_document_readiness": {
    "overridden": true,
    "by": "<user-uuid>",
    "at": "<iso-timestamp>"
  }
}
```

Use existing icplc_participants.source_values JSONB:
```json
{
  "canada_residency_status": {
    "value": "INTERNATIONAL_STUDENT",
    "source": "PARTICIPANT_FORM",
    "observed_at": "<iso-timestamp>"
  },
  "canada_status_document_readiness": {
    "value": "READY",
    "source": "PARTICIPANT_FORM",
    "observed_at": "<iso-timestamp>"
  }
}
```

### Latest participant-submitted values:

Add to icplc_participants:
```sql
ALTER TABLE public.icplc_participants ADD COLUMN IF NOT EXISTS (
  canada_residency_status_participant text
    CHECK (canada_residency_status_participant IN (
      'CANADIAN_CITIZEN',
      'PERMANENT_RESIDENT',
      'INTERNATIONAL_STUDENT',
      'POST_GRADUATION_WORKER',
      'WORK_PERMIT',
      'VISITOR_OTHER'
    )),
  canada_status_doc_readiness_participant text
    CHECK (canada_status_doc_readiness_participant IN (
      'UNKNOWN',
      'READY',
      'RENEWAL_NEEDED',
      'RENEWAL_IN_PROGRESS',
      'ISSUE',
      'NOT_APPLICABLE'
    ))
);
```

**Rationale:**
- When source = 'NEXUS_MANUAL': participant form cannot overwrite the main value, but latest participant response is captured in _participant columns
- When resuming form sync: adopt latest _participant value back into main column and set source = 'PARTICIPANT_FORM'
- Preserves participant intent even when manually locked

---

## 6. PARTICIPANT FORM TARGET MODEL

**Public participant form updates icplc_participants directly (NOT registrations).**

### Form requirements:

```
Participant Documentation Update Form
  |
  +-- Token-gated endpoint: GET /api/icplc/doc-form/{doc_update_token}
  |
  +-- Validates:
  |     - Token exists on icplc_participants row
  |     - Token.icplc_participants.event_id is ICPLC event
  |     - NOT a TII token
  |
  +-- Returns minimal projection:
  |     - first_name (greeting)
  |     - event_name (context)
  |     - canada_residency_status (current value)
  |     - canada_status_document_readiness (current value)
  |     - source (to show "this was updated manually")
  |
  +-- Form fields (participant-editable):
  |     [ ] Canadian status (dropdown)
  |     [ ] Document readiness (dropdown)
  |
  +-- Submit:
        POST /api/icplc/doc-form/{doc_update_token}
        Payload: { canada_residency_status, canada_status_document_readiness }
```

### Update logic (in RPC icplc_update_documentation):

```
IF source = 'NEXUS_MANUAL':
  → update _participant columns only
  → do NOT update main columns
  → set source still 'NEXUS_MANUAL'

IF source IS NULL or 'PARTICIPANT_FORM':
  → update main columns
  → update _participant columns (latest submission)
  → set source = 'PARTICIPANT_FORM'
```

### Atomicity:
- Single UPDATE statement reads current source state and decides which columns to update
- Prevents race between manual lock and concurrent participant submission

### TII rejection:
- RPC validates `event_configs(id).event_name ILIKE '%ICPLC%'`
- Rejects if token maps to TII (event_name != '%ICPLC%')
- Safe: TII registrations.doc_update_token remains unused

---

## 7. FIELD AUTHORITY / OVERRIDE MODEL

**Existing override/source architecture in icplc_participants applies to Canadian fields:**

### Field-level override:
```javascript
// In Nexus staff UI, when correcting canada_residency_status:
const changed = { 
  canada_residency_status: "INTERNATIONAL_STUDENT" 
}
// Auto-managed: 
// override_fields.canada_residency_status = { overridden: true, by: user_id, at: now() }
```

### Resume Form Sync (atomic operation):
```sql
UPDATE icplc_participants
SET
  canada_residency_status = canada_residency_status_participant,
  canada_status_document_readiness = canada_status_doc_readiness_participant,
  canada_residency_status_source = 'PARTICIPANT_FORM',
  override_fields = jsonb_strip_nulls(override_fields || '{"canada_residency_status": null, "canada_status_document_readiness": null}')
WHERE id = $1
  AND source = 'NEXUS_MANUAL'
RETURNING *;
```

**Effect:**
- Clears override lock (both fields)
- Adopts latest participant-submitted values
- Allows future imports and form submissions to update
- Atomic: no race between manual lock and concurrent submission

---

## 8. UI INTEGRATION

### People page:
- Shows participation_status badge
- No Canadian status visible (belongs on Documentation page)

### Documentation page (NEW):
- Group participants by derived required document type
- For each participant:
  - Show current canada_residency_status
  - Show canada_status_document_readiness
  - Show source indicator (participant form / Nexus manual / CSV import)
  - Show override lock indicator (if locked)
  - Allow staff to:
    - Manually edit both fields
    - View participant form history (latest _participant values)
    - Resume Form Sync button (if override present)
  - NO staff UI for manual participant-form link generation (links already token-gated)

### Participant form (public, token-gated):
- Accessible via `/update-documentation/{doc_update_token}`
- Shows current values (read-only context)
- Offers dropdowns for both fields
- Submit button updates icplc_participants directly
- Shows success/lock message if field is manually protected

### Needs Attention page:
- "Canadian status unknown" cohort (canada_residency_status IS NULL)
- "Canadian status needs review" cohort (status = 'VISITOR_OTHER')
- "[Document type] renewal needed" cohorts (derived from residency_status + readiness)

### Profile drawer (within People page):
- Show Canadian fields if non-null
- Show override lock indicator
- Link to Documentation page for editing

---

## 9. REGISTRATION-BASED CODE TO REMOVE/ADAPT

**Current split implementation (ICPLCDashboard.jsx):**
```javascript
// CURRENTLY WRITES TO registrations (WRONG):
await supabase.from('registrations').update({ 
  operational_note: noteValue 
}).eq('id', p._regId)

// FIX: Write to icplc_participants instead:
await supabase.from('icplc_participants').update({
  notes: noteValue
}).eq('id', participant.id)
```

**Files to audit/adapt:**
1. `src/features/icplc/ICPLCDashboard.jsx` — Remove all registrations writes; route to icplc_participants
2. `src/features/icplc/hooks/useICPLCProfile.js` — Already uses icplc_participants; OK
3. `src/features/icplc/ICPLCPortal.jsx` — Verify legacy RegistrationEcosystem is legacy-only
4. `src/pages/events/ICPLCDocUpdatePage.jsx` — Retarget Canadian fields to icplc_participants
5. `src/features/registration/icplcDocReadiness.js` — No changes (deriveDocumentType stays hardcoded)

**Do NOT remove registrations.participation_status or registrations.passport_* fields** — keep them for backwards compatibility and TII isolation. Just stop writing to them from ICPLC code.

---

## 10. MIGRATION RESTRUCTURE PLAN

**Current migrations exist but are LOCAL_ONLY + unapplied: DO NOT REPAIR HISTORY.**

**Instead, design correct forward path:**

### Phase 1: FOUNDATION (if remote schema is missing these)
- 20260624002000: Activity log gap fill
- 20260907000001: Seed event_configs
- 20260915000001-004: Event isolation (event_config_id on registrations/working_list/roster)

### Phase 2: ICPLC CANONICAL MODEL
- 20260925000001: Create icplc_participants (canonical operational table)
- 20260925000002: Create icplc_tags and icplc_participant_tags
- 20260925000003: Create icplc_visa_defaults
- 20260925000004-011: Import infrastructure (batches, rows, identity_maps, RPC ops)

### Phase 3: CANADIAN DOCUMENTATION (REDESIGNED)
- NEW MIGRATION (not 20270829000000): Add canadian_* columns to icplc_participants ONLY
  - canada_residency_status
  - canada_status_document_readiness
  - canada_residency_status_source
  - canada_status_doc_readiness_source
  - canada_residency_status_participant
  - canada_status_doc_readiness_participant
  - doc_update_token (UNIQUE, DEFAULT gen_random_uuid())
- NEW RPC: icplc_get_doc_form_info(doc_update_token) — token-gated lookup on icplc_participants
- NEW RPC: icplc_update_documentation(doc_update_token, canada_residency_status, canada_status_document_readiness) — atomic update with source/override logic
- NEW RPC: icplc_resume_form_sync(participant_id) — clear override, adopt _participant values

**DO NOT include 20270829000000 (old implementation) — it targets registrations.**

---

## 11. TII INVARIANTS

**Release assertions (must pass before shipping):**

1. **TII registrations unchanged**
   - SELECT COUNT(*) FROM registrations WHERE event_config_id IS NULL AND canada_residency_status IS NOT NULL
   - Must return 0 (ICPLC updates do not leak to TII)

2. **TII public RPC behavior unchanged**
   - Existing RegistrationEcosystem public registration intake still works
   - Public share page still loads
   - Payment flow unaffected

3. **TII roster/working-list behavior unchanged**
   - Scoping by event_config_id IS NULL still works
   - No new columns on these tables for Canadian status

4. **ICPLC participant RPCs cannot operate on TII**
   - icplc_get_doc_form_info(token): validates token.icplc_participants.event_id → event_configs.event_name ILIKE '%ICPLC%'
   - Rejects if event_name != 'ICPLC'
   - Test: call with TII token, expect error

5. **ICPLC participant form cannot resolve a TII record**
   - Token lookup: `SELECT * FROM icplc_participants WHERE doc_update_token = $1`
   - TII has no icplc_participants rows
   - Test: use registrations.doc_update_token (if added), expect NOT FOUND

6. **ICPLC import cannot mutate TII**
   - icplc_import_batches.event_id NOT NULL
   - All imported participants written to icplc_participants, not registrations
   - Test: run ICPLC import, verify registrations unchanged

---

## 12. REMOTE SCHEMA UNKNOWN ITEMS

**Following items remain UNVERIFIED (remote schema inspection not completed):**

- [ ] icplc_participants table exists and is applied
- [ ] icplc_tags and icplc_visa_defaults tables exist and are applied
- [ ] icplc_import_batches/rows/identity_maps exist and are applied
- [ ] event_config_id is actually on registrations/working_list/roster
- [ ] registrations.participation_status, passport_* fields exist (20260926000001)
- [ ] Which specific migrations are actually applied vs pending

**DO NOT assume schema exists based on:**
- Migration repair suggestions (output only)
- Migration list tracker (diverged from reality)
- migration timestamps (may not reflect applied state)

**NEXT STEP:** Direct schema inspection required before deployment.

---

## 13. IMPLEMENTATION PHASES

**Phase A — Design Lock (CURRENT):**
- ✅ Architecture decision: icplc_participants canonical
- ✅ Field ownership matrix complete
- ✅ Data flow paths defined
- ✅ Override/source model designed
- ⏳ Remote schema verification pending

**Phase B — Code Preparation (AFTER schema verification):**
- [ ] Verify remote schema has icplc_participants
- [ ] Verify remote schema has icplc_tags, icplc_visa_defaults
- [ ] Identify which code uses registrations.participation_status (WRONG)
- [ ] Prepare code changes: registrations → icplc_participants routing
- [ ] Prepare updated RPC implementations (icplc_get_doc_form_info, etc.)
- [ ] Prepare test suite for TII invariants

**Phase C — Migration Audit (AFTER phase B):**
- [ ] Determine which existing local migrations are safe to keep
- [ ] Design new migrations for icplc_participants Canadian fields
- [ ] Reject 20270829000000 (old registrations implementation)
- [ ] Finalize migration sequence

**Phase D — Testing & Deployment (AFTER migration plan approved):**
- [ ] Unit tests: Canadian status domain logic
- [ ] Integration tests: participant form → icplc_participants → UI
- [ ] TII invariant tests (6 assertions above)
- [ ] Full regression suite
- [ ] Gradual rollout with monitoring

---

## SUMMARY

**Current state:** Dual participant models with conflicting authority  
**Target state:** icplc_participants as canonical ICPLC operational model  
**Canadian document redesign:** Move from registrations to icplc_participants  
**Code split:** ICPLCDashboard currently writes to wrong table; must redirect  
**Migration:**  Do NOT repair existing history; design correct forward migrations  
**Remote schema:** Unknown; must verify before proceeding  
**Settings work:** ON HOLD pending architecture lock (can proceed once icplc_tags/icplc_visa_defaults are confirmed deployed)

**Blocking issues:**
1. Remote schema state unknown
2. Existing 20270829000000 migration targets wrong table
3. ICPLCDashboard has mixed write paths

**Next action:** Direct remote schema inspection to verify icplc_participants and infrastructure tables exist.

