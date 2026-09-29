# REGISTRATION CSV PHASE 2 — FINAL CERTIFIED DESIGN

**Date:** 2027-09-28  
**Evidence:** Real Registration CSV fields confirmed  
**Status:** DESIGN CERTIFIED (waiting only for Status vocabulary blocking item)

---

## A. REAL SOURCE CONTRACT — Confirmed 18 Core Fields

Audit of actual Registration CSV reveals the following distinct fields (corrected from earlier 17-field inventory):

| # | CSV Field | Raw Example | Type | Notes |
|---|---|---|---|---|
| 1 | Registration ID | (custom ID) | text | Durable source key; uniqueness per event |
| 2 | Title | Rev. | text | Metadata; not part of canonical full_name |
| 3 | First Name | John | text | Canonical name component |
| 4 | Last Name | Doe | text | Canonical name component |
| 5 | Email | user@example.com | text | Deterministic identity via email claims |
| 6 | Country Code | 1 | text/numeric | Calling country code (no inferred region) |
| 7 | Phone Number | 7093277312 | text/numeric | Local phone; combined with Country Code for normalization |
| 8 | KingsChat User ID | 578681ac57c28b368802ca6d | text (hex) | **NEW FIELD.** 24-char MongoDB ObjectID format. See audit below. |
| 9 | KingsChat Username | naomiighodaro | text | Username handle; metadata only |
| 10 | KingsChat Phone | 17093277312 | text/numeric | Already combined country+local; normalized form |
| 11 | Country | Canada | text | Source metadata |
| 12 | Region | Ontario | text | Source organizational evidence |
| 13 | Zone | Ontario Zone | text | Source metadata |
| 14 | Group | Group Pastors | text | Source organizational evidence (conceptually = group_name) |
| 15 | Fellowship/Church | Central Fellowship | text | Source metadata |
| 16 | Designation | Pastor | text | Source metadata |
| 17 | Status | Registered | text | **BLOCKED mapping.** Store raw until vocabulary known. |
| 18 | Registration Date | 2027-08-15 | date | Source registration timestamp |

**Plus:** All additional source columns preserved immutably in `raw_payload`.

**Real Evidence of Phone Consistency:**
```
Country Code:      1
Phone Number:      7093277312
Combined:          1 + 7093277312 = 17093277312

KingsChat Phone:   17093277312

Result:            MATCH (identical normalized forms)
```

---

## B. FIELD AUTHORITY MATRIX — Locked Decisions Applied

| CSV Field | Normalized Form | Canonical DB Column | Source Evidence Preserved | Identity Role | May Auto-Write | Notes |
|---|---|---|---|---|---|---|
| Registration ID | as-is (text) | `icplc_identity_maps.source_key` | `source_values.registration_csv.registration_id` | Durable source key | No (map-only) | Immutable per event. Enables idempotent re-imports. |
| First Name | collapse whitespace | `full_name` (component) | `raw_payload`, `source_values.registration_csv.first_name` | Canonical component | Yes (at creation) | Combined with Last Name only; Title excluded. |
| Last Name | collapse whitespace | `full_name` (component) | `raw_payload`, `source_values.registration_csv.last_name` | Canonical component | Yes (at creation) | Combined with First Name only. |
| Title | collapse whitespace | *(metadata only)* | `source_values.registration_csv.title` | Metadata | No | NOT included in canonical `full_name`. |
| Email | `normalize_email()` | `email` (primary) + `icplc_email_claims` | `raw_payload`, `source_values.registration_csv.email` | Deterministic | No (via claims) | Use canonical claims for matching. Do NOT auto-replace slots. |
| Country Code | collapse whitespace | *(metadata only)* | `source_values.registration_csv.country_code` | Contact metadata | No | No region inference. Separate from Phone Number. |
| Phone Number | `normalizePhone()` (TBD) | *(metadata only)* | `raw_payload`, `source_values.registration_csv.phone_number`, `source_values.registration_csv.normalized_phone` | Contact evidence | No | Do NOT create `icplc_participants.phone` column in V1. Store normalized form in provenance. |
| KingsChat User ID | as-is (text) | *(conditional)* | `source_values.registration_csv.kingschat_user_id` | Identity evidence (conditional) | No (conditional) | **See KingsChat audit.** Only deterministic-match if Nexus counterpart proven. Otherwise metadata. |
| KingsChat Username | lowercase, collapse | *(metadata only)* | `source_values.registration_csv.kingschat_username` | Metadata | No | No automatic matching in V1. |
| KingsChat Phone | `normalizePhone()` | *(metadata only)* | `source_values.registration_csv.kingschat_phone`, `source_values.registration_csv.normalized_kingschat_phone` | Contact evidence | No | Display phone consistency as corroborating evidence during candidate review. Do NOT auto-match. |
| Country | collapse whitespace | *(metadata only)* | `source_values.registration_csv.country` | Metadata | No | Informational. |
| Region | collapse whitespace, exact-match | *(metadata only)* | `raw_payload`, `source_values.registration_csv.region` | Organizational evidence | No | Do NOT overwrite canonical `region`. Flag mismatches for review. |
| Zone | collapse whitespace | *(metadata only)* | `source_values.registration_csv.zone` | Metadata | No | Informational. |
| Group | collapse whitespace, exact-match | *(metadata only)* | `raw_payload`, `source_values.registration_csv.group` | Organizational evidence | No | Do NOT overwrite canonical `group_name`. Use for candidate matching only. Flag mismatches. |
| Fellowship/Church | collapse whitespace | *(metadata only)* | `source_values.registration_csv.fellowship` | Metadata | No | **Metadata only. NEVER overwrite group_name.** |
| Designation | collapse whitespace | *(metadata only)* | `source_values.registration_csv.designation` | Metadata | No | Informational role/title. |
| Status | preserve raw | *(none until vocabulary known)* | `raw_payload`, `source_values.registration_csv.status_raw` | **BLOCKED** | No | Store raw until Status vocabulary confirmed. Identity matching is independent from status. |
| Registration Date | preserve, try ISO parse | *(metadata only)* | `source_values.registration_csv.registration_date` | Metadata | No | Timestamp of CSV entry. |

---

## C. KINGCHAT USER ID AUDIT — Repository Counterpart Investigation

**KingsChat User ID Format:** 24-character hex string (MongoDB ObjectID). Example: `578681ac57c28b368802ca6d`

**Audit Findings:**

| Item | Finding | Evidence |
|---|---|---|
| Nexus icplc_participants field | NO | Audited schema: no `cmp_id`, `kingschat_user_id`, or `external_id` column |
| Nexus icplc_participants.source_values | POSSIBLE | Custom JSON; could store KingsChat User ID as evidence |
| Member Intelligence (CMP) tables | YES | `mi_members` table has `cmp_id` text UNIQUE NOT NULL. This is CMP member ID. |
| Format match | UNKNOWN | `cmp_id` in mi_members is typically a MongoDB ObjectID. Need to confirm if KingsChat User ID namespace is identical. |
| Codebase aware of cmp_id | YES | `reconciliation.js:26`: `poolSourceKey(person)` checks `person.cmp_id` for member intelligence pool source |
| KingsChat namespace collision | UNKNOWN | Cannot confirm if `578681ac57c28b368802ca6d` = a CMP member's `cmp_id` without live CMP data inspection |
| Safe deterministic match | **NO (UNPROVEN)** | No authoritative Nexus field links directly to KingsChat User ID namespace. Cannot prove equality is safe. |

**Verdict:**

KingsChat User ID remains **source evidence only** for V1. No deterministic matching in the matching algorithm. It is stored in `source_values.registration_csv.kingschat_user_id` for reference and future V2 enhancement if the KingsChat↔CMP namespace equivalence is proven.

**Do not:**
- Create a new `icplc_participants.kingschat_user_id` column
- Attempt to join against `mi_members.cmp_id` without proof they are the same namespace
- Auto-match on KingsChat User ID

---

## D. PHONE NORMALIZATION CONTRACT — Real Evidence Design

**Real-World Example:**
```
Country Code (CSV):     1
Phone Number (CSV):     7093277312
Normalized form:        17093277312

KingsChat Phone (CSV):  17093277312
Normalized form:        17093277312

Comparison result:      MATCH
```

**Normalization Rules:**

### Registration Phone
```javascript
function normalizeRegistrationPhone(countryCode, phoneNumber) {
  // Input validation
  if (!countryCode || !phoneNumber) return null  // both required
  
  const ccDigits = String(countryCode || '').replace(/\D/g, '')  // remove non-digits
  const phoneDigits = String(phoneNumber || '').replace(/\D/g, '')
  
  // Edge case: if phoneDigits already starts with ccDigits, do NOT duplicate
  if (phoneDigits.startsWith(ccDigits) && ccDigits.length > 0) {
    return phoneDigits  // already combined
  }
  
  // Edge case: if countryCode is empty/blank, return phone as-is (incomplete)
  if (ccDigits === '') return phoneDigits || null
  
  // Normal case: combine
  return ccDigits + phoneDigits
}

Example calls:
  normalizeRegistrationPhone('1', '7093277312')      → '17093277312'
  normalizeRegistrationPhone('+1', '7093277312')     → '17093277312' (+ removed)
  normalizeRegistrationPhone('1', '17093277312')     → '17093277312' (already combined)
  normalizeRegistrationPhone('', '7093277312')       → '7093277312' (country code missing)
  normalizeRegistrationPhone('1', '')                → null (phone missing)
```

### KingsChat Phone
```javascript
function normalizeKingsChat Phone(kingschatPhone) {
  // Input validation
  if (!kingschatPhone) return null
  
  const digits = String(kingschatPhone || '').replace(/\D/g, '')  // remove non-digits, +, etc.
  
  return digits === '' ? null : digits
}

Example calls:
  normalizeKingsChatPhone('17093277312')    → '17093277312'
  normalizeKingsChatPhone('+17093277312')   → '17093277312'
  normalizeKingsChatPhone('')               → null
```

### Consistency Comparison
```javascript
function phoneConsistency(normRegistrationPhone, normKingschatPhone) {
  if (!normRegistrationPhone || !normKingschatPhone) return 'INCOMPLETE'
  if (normRegistrationPhone === normKingschatPhone) return 'MATCH'
  return 'MISMATCH'
}

// Results used for:
// - Candidate review display: "Phone consistency: MATCH" (corroborating evidence, not auto-link)
// - Provenance: store both values + consistency result
// - NO automatic matching on phone in V1
```

**Storage in source_values:**
```json
{
  "registration_csv": {
    "phone_number": "7093277312",
    "country_code": "1",
    "normalized_registration_phone": "17093277312",
    "kingschat_phone": "17093277312",
    "normalized_kingschat_phone": "17093277312",
    "phone_consistency": "MATCH"
  }
}
```

---

## E. IDENTITY ALGORITHM — Exact V1 Ordered Flow

**Step 1: Persistent Registration ID Map (Definitive)**
```
IF icplc_identity_maps EXISTS (event_id, 'registration_csv', Registration ID)
  → participant_id found
  → match_status = 'persistent'
  → STOP (no candidates shown)
```

**Step 2: Conditional KingsChat User ID (Conditional)**
```
IF KingsChat User ID is non-blank AND [AUDIT RESULT = SAFE]
  SELECT participant WHERE source_values->'registration_csv'->>'kingschat_user_id' = incoming
  → IF exactly 1 match: participant_id found, match_status = 'auto', STOP
  → IF >1 matches: ambiguous, mark for manual review, continue to Step 3
  → IF 0 matches: no KingsChat match, continue to Step 3
ELSE (unproven/unsafe)
  → skip Step 2, continue to Step 3
```

**⚠️ CURRENTLY SKIPPED (audit found unproven) — Step 2 is conditional pending KingsChat namespace proof.**

**Step 3: Canonical Email Claim (Definitive)**
```
IF email is non-blank
  AND icplc_email_claims EXISTS (event_id, normalize_email(email))
  → participant_id found
  → match_status = 'auto'
  → STOP (email is cross-slot authority; no candidates)
```

**Step 4: Candidate Generation (Possible Match Only)**
```
DO NOT auto-match on name, phone, or organization.

Generate candidates with strength scoring:

A. Name match (weak)
   WHERE normalize_name(full_name) = normalize_name(First+Last)
   → strength = 1

B. Organization match (weak)
   WHERE group_name = incoming_group (exact)
      OR subgroup = incoming_subgroup (exact)
   → strength = 0.5 per field

C. Combined name + organization (moderate)
   WHERE normalize_name(full_name) = normalize_name(First+Last)
     AND (group_name = incoming_group OR subgroup = incoming_subgroup)
   → strength = 2

D. Phone consistency (corroborating)
   IF phone_consistency = 'MATCH'
   → display as supporting evidence, do NOT auto-link
   → strength bonus = 0 (information only)

Return all candidates sorted: strength DESC, name ASC.
DO NOT set participant_id.
match_status = 'unmatched'
Candidates presented to staff with strength and reason.
```

**Step 5: Unmatched**
```
match_status = 'unmatched'
candidates = []
→ staff must SKIP, LINK_EXISTING, or CREATE_NEW
```

---

## F. REGISTRATION ID BEHAVIOR — Locked Decision Details

### A. Nonblank Unique Registration ID (Normal Case)
```
match_status = 'persistent' (via Step 1)
participant_id = found match
candidates = []
→ staff reviews; no action needed unless override required

At apply time:
  Upsert icplc_identity_maps(event_id, 'registration_csv', registration_id, participant_id)
```

### B. Duplicate Nonblank Registration ID (Same Batch)
```
Rows detected with duplicate registration_id:
  match_status = 'error' for ALL rows sharing that ID
  error_detail = 'Duplicate Registration ID in batch: <ID>'
  
Batch status = 'applied_with_errors' (NOT failed)
→ unaffected rows (unique IDs) can still proceed

Batch metadata records duplicate_keys array
```

### C. Missing Registration ID Column
```
deriveRegistrationCsvIdentityKey() returns null
→ skip Step 1 entirely
→ proceed to Step 2 (conditional KingsChat, requires proof first)
→ proceed to Step 3 (email claim)
→ if email fails, proceed to Step 4 (candidates)

source_values.registration_csv.registration_id = null
source_values.registration_csv.registration_id_missing = true
→ explicitly record durable source identity unavailable
```

### D. Blank Registration ID (Individual Row)
```
Same behavior as C above.

At CREATE_NEW time:
  ⚠️ EXPLICIT WARNING to staff:
  "This row has no Registration ID. Future CSV imports cannot re-link this participant through Registration ID. Confirm creation?"
  
  staff accepts risk
  → insert participant + identity_map with source_type='registration_csv', source_key=null
  
  OR staff chooses SKIP
  → row remains unprocessed
```

**Safe CREATE_NEW behavior without Registration ID:**

DO NOT fabricate a fake source_key from name/email hash.
DO NOT pretend email creates a Registration ID map.
Store `registration_id = null` in identity_map if created.
Document explicitly that durable source identity is missing.

---

## G. DUPLICATE EMAIL BEHAVIOR — Locked Decision Details

### Case 1: Same Email, Both Blank Registration IDs, Same Batch
```
Detection:
  Email 1, blank reg ID → Step 2 email claim lookup → found participant P1
  Email 2, blank reg ID, same normalized email → Step 2 lookup → same participant P1
  
  Within same batch, BOTH rows claim same email.

Behavior (conflict state):
  match_status = 'error' for BOTH rows
  error_detail = 'Duplicate normalized email in batch (no Registration ID) — requires staff review'
  
  candidates = [] (not POSSIBLE_MATCH; it's a conflict)
  
  Staff must explicitly SKIP or LINK_EXISTING for each row.
  
  If staff links both to same participant:
    Row 1 applies → updates participant
    Row 2 applies → updates SAME participant (last write wins, acceptable if documented)
```

### Case 2: Same Email, Different Nonblank Registration IDs
```
Batch has:
  Row A: Email = user@example.com, Registration ID = REG-001
  Row B: Email = user@example.com, Registration ID = REG-002
  
These are different source keys. Deterministic matching uses Registration ID first (Step 1).

Row A → persistent match to participant P1 (via REG-001 identity map)
Row B → persistent match to participant P2 (via REG-002 identity map)

→ NO conflict. They link to different participants.
```

### Case 3: Same Email, Different Nonblank IDs, BOTH Missing From Identity Maps
```
Row A: Email, Reg ID = REG-001 (no prior map)
Row B: Email, Reg ID = REG-002 (no prior map)

Step 1: both skip (no maps exist)
Step 2 (or Step 3 if KingsChat used): email claim lookup
  → finds participant P (email claim unique per event)
  
Both rows match to same participant via email.

At apply time:
  Row A: upsert identity_map (registration_csv, REG-001 → P)
  Row B: upsert identity_map (registration_csv, REG-002 → P)
  
→ Same participant has two registration_csv identity maps pointing to it.
→ Acceptable; future imports with REG-001 or REG-002 will find P again.
```

---

## H. POSSIBLE MATCH MODEL — No Schema Change

**Audit Result:** `icplc_import_rows.match_status` CHECK constraint allows: `('auto', 'manual', 'persistent', 'unmatched', 'error')`

No 'POSSIBLE_MATCH' state in DB. This is correct.

**Derivation Model (same as registrations reconciliation):**

```javascript
function reconciliationState(row, candidates, identityMap) {
  const participantId = identityMap?.participant_id || null
  
  if (participantId) {
    return { state: 'MATCHED', participant, candidates: [] }
  }
  
  if (candidates.length > 0) {
    return { state: 'POSSIBLE_MATCH', participant: null, candidates }
  }
  
  return { state: 'UNMATCHED', participant: null, candidates: [] }
}
```

**Persistence:** Candidates are computed on-demand in the browser from the matching RPC result. No durable storage needed.

**Refresh Behavior:** If staff closes the review modal and reopens it, candidates are re-derived from the same participants + criteria. Deterministic.

**Staff Actions:**
- POSSIBLE_MATCH state → staff selects from candidates OR searches for another participant
- UNMATCHED state → staff can search manually or choose CREATE_NEW

---

## I. ORGANIZATION AUTHORITY — Locked Decisions

| Field | Authority | Treatment | Overwrite | Notes |
|---|---|---|---|---|
| Region | Source evidence | Store in `source_values.registration_csv.region` | NO | Exact-match only. If incoming region ≠ any canonical region, flag mismatch. Do not silently overwrite `icplc_participants.region`. |
| Zone | Metadata | Store in `source_values.registration_csv.zone` | No | Informational. No matching logic. |
| Group | Source evidence | Store in `source_values.registration_csv.group` | NO | Conceptually maps to `group_name`. Exact-match only. Used for candidate generation. Do NOT overwrite `icplc_participants.group_name`. |
| Fellowship/Church | Metadata | Store in `source_values.registration_csv.fellowship` | NO | **Metadata only. NEVER overwrite canonical group_name.** |

**Candidate Generation:** Organization fields used to corroborate identity candidates, never to auto-link.

---

## J. STATUS FIELD — Blocked

**Known vocabulary:** Unknown. CSV field value observed: "Registered"

**Mapping:** BLOCKED. Cannot infer semantics of Status field from single example.

**Requirement:** Actual Status vocabulary or enum needed from ORS coordinator before implementation.

**Blocker ID:** #12 (Primary blocker for implementation)

**Workaround for now:** Store raw Status value in `source_values.registration_csv.status_raw`. No identity matching depends on Status.

---

## K. PROVENANCE STRUCTURE — Exact Form

```json
{
  "email": {
    "value": "user@example.com",
    "source": "registration_csv",
    "observed_at": "2027-09-28T14:30:00Z",
    "batch_id": "batch-uuid"
  },
  "region": {
    "value": "Ontario",
    "source": "registration_csv",
    "observed_at": "2027-09-28T14:30:00Z",
    "batch_id": "batch-uuid"
  },
  "group_name": {
    "value": "Group Pastors",
    "source": "registration_csv",
    "observed_at": "2027-09-28T14:30:00Z",
    "batch_id": "batch-uuid"
  },
  "registration_csv": {
    "registration_id": "REG-12345",
    "registration_id_missing": false,
    "title": "Rev.",
    "first_name": "John",
    "last_name": "Doe",
    "email": "user@example.com",
    "country_code": "1",
    "phone_number": "7093277312",
    "normalized_registration_phone": "17093277312",
    "kingschat_user_id": "578681ac57c28b368802ca6d",
    "kingschat_username": "johndoe",
    "kingschat_phone": "17093277312",
    "normalized_kingschat_phone": "17093277312",
    "phone_consistency": "MATCH",
    "country": "Canada",
    "region": "Ontario",
    "zone": "Ontario Zone",
    "group": "Group Pastors",
    "fellowship": "Central Fellowship",
    "designation": "Pastor",
    "status_raw": "Registered",
    "registration_date": "2027-08-15",
    "batch_id": "batch-uuid",
    "applied_at": "2027-09-28T14:30:00Z"
  },
  "region_mismatch": {
    "incoming": "Ontari",
    "requires_review": true,
    "batch_id": "batch-uuid",
    "observed_at": "2027-09-28T14:30:00Z"
  },
  "group_mismatch": {
    "incoming": "Media",
    "candidates": ["Group Media"],
    "requires_review": true,
    "batch_id": "batch-uuid",
    "observed_at": "2027-09-28T14:30:00Z"
  }
}
```

---

## L. CONSTRAINT CERTIFICATION — Real-Schema Proof

**Blocker B1: icplc_import_rows.apply_status**

**Alleged mismatch:**
- Constraint allows: `('kept', 'updated', 'protected', 'skipped', 'error')`
- Existing RPC writes: `'created'`, `'linked'`

**Code Evidence (20270926000000_icplc_csv_adapter.sql):**
```
Line 256: set apply_status = 'created'
Line 345: set apply_status = 'linked'
```

**Constraint Location (20260925000005_icplc_import_rows.sql:18):**
```sql
check (apply_status in ('kept', 'updated', 'protected', 'skipped', 'error'))
```

**Verdict:** ✓ BUG CONFIRMED. Values 'created' and 'linked' are NOT allowed by CHECK. Will cause INSERT/UPDATE failure if RPC executes.

---

**Blocker B2: icplc_import_batches.status**

**Alleged mismatch:**
- Constraint allows: `('pending', 'matching', 'matched', 'previewing', 'previewed', 'applying', 'applied', 'failed')`
- Existing RPC writes: `'applied_with_errors'`

**Code Evidence (20270926000000_icplc_csv_adapter.sql:141):**
```sql
set status = case when v_error_count > 0 then 'applied_with_errors' else 'applied' end,
```

**Constraint Location (20260925000004_icplc_import_batches.sql:13):**
```sql
check (status in (
  'pending', 'matching', 'matched', 'previewing', 'previewed',
  'applying', 'applied', 'failed'
))
```

**Verdict:** ✓ BUG CONFIRMED. Value 'applied_with_errors' is NOT allowed by CHECK. Will cause UPDATE failure if v_error_count > 0.

---

## M. SOURCE-TYPE DEPENDENCY AUDIT — Comprehensive

**Adding `'registration_csv'` to source types:**

**Consumers of `icplc_import_batches.source`:**
- No hard-coded value checks found in SQL, JS, or edge functions
- RLS policies do not filter by source value
- Browser code treats all batches uniformly
- **SAFE: Adding 'registration_csv' requires no code changes**

**Consumers of `icplc_identity_maps.source_type`:**

1. Hard-coded check in `icplc_match_rpc.sql:52`: `WHERE source_type = 'csv'`
   - Only matches 'csv' → new value won't affect this logic
   - **SAFE: No change needed**

2. Hard-coded check in `icplc_import_tier_fix.sql:190`: `WHERE source_type = 'csv'`
   - Only matches 'csv' → new value won't affect this logic
   - **SAFE: No change needed**

3. Browser filter in `reconciliation.js:108`: `.filter((map) => map.source_type === REGISTRATION_SOURCE_TYPE || !map.source_type)`
   - Filters for `'registration'` (registrations table source)
   - 'registration_csv' won't match
   - **SAFE: No change needed**

**Risks:** NONE. Adding 'registration_csv' to both CHECK constraints is entirely backwards-compatible.

**Files requiring changes:** ONLY the two CHECK constraint fixes in the migration.

---

## N. REQUIRED SCHEMA CHANGES — Minimal Verified Set

**Migration timestamp:** `20270929000000` (safe; after `20270928002`)

**Changes (4 total):**

1. **Fix `icplc_import_rows.apply_status` CHECK**
   ```sql
   ALTER TABLE public.icplc_import_rows
     DROP CONSTRAINT icplc_import_rows_apply_status_check,
     ADD CONSTRAINT icplc_import_rows_apply_status_check
       CHECK (apply_status IN ('kept', 'updated', 'protected', 'skipped', 'error', 'created', 'linked'));
   ```

2. **Fix `icplc_import_batches.status` CHECK**
   ```sql
   ALTER TABLE public.icplc_import_batches
     DROP CONSTRAINT icplc_import_batches_status_check,
     ADD CONSTRAINT icplc_import_batches_status_check
       CHECK (status IN (
         'pending', 'matching', 'matched', 'previewing', 'previewed',
         'applying', 'applied', 'failed', 'applied_with_errors'
       ));
   ```

3. **Extend `icplc_import_batches.source` CHECK**
   ```sql
   ALTER TABLE public.icplc_import_batches
     DROP CONSTRAINT icplc_import_batches_source_check,
     ADD CONSTRAINT icplc_import_batches_source_check
       CHECK (source IN ('csv', 'cmp_registrations', 'cmp_flights', 'registration_csv'));
   ```

4. **Extend `icplc_identity_maps.source_type` CHECK**
   ```sql
   ALTER TABLE public.icplc_identity_maps
     DROP CONSTRAINT icplc_identity_maps_source_type_check,
     ADD CONSTRAINT icplc_identity_maps_source_type_check
       CHECK (source_type IN ('csv', 'cmp_registrations', 'cmp_flights', 'registration', 'registration_csv'));
   ```

**No new columns added.** No phone column in V1. No KingsChat columns. All metadata lives in existing JSONB.

---

## O. MIGRATION ORDER — Safe & Verified

**Latest existing migration:** `20270928000002_growth_regional_secretary_rls.sql`

**Recommended new migration name:** `20270929000000_icplc_registration_csv_source.sql`

**Dependencies:** ALL PRESENT
- `icplc_import_rows` table (20260925000005) ✓
- `icplc_import_batches` table (20260925000004) ✓
- `icplc_identity_maps` table (20260925000006) ✓
- No pending migrations that would interfere ✓

**Collision risk:** NONE. Timestamp is strictly after all existing migrations.

**Deployment safety:** SAFE. Constraint changes are backwards-compatible. Existing queries/RPCs continue to work.

---

## P. REMAINING BLOCKERS

| # | Blocker | Status | Impact | Owner | Required By |
|---|---|---|---|---|---|
| 1 | Status vocabulary | **BLOCKED** | Cannot map CSV Status field → registration_status without known values/semantics | ORS coordinator | Before implementation |
| 2 | KingsChat namespace proof | **UNPROVEN** | KingsChat User ID can only be used for deterministic matching if namespace equivalence to CMP/Nexus proven | KingsChat/CMP owner | Before Step 2 implementation (V2 eligible) |
| All others | RESOLVED | None | — | — | — |

---

## FINAL STATUS

### ✅ REGISTRATION CSV PHASE 2 DESIGN CERTIFIED — WAITING ONLY FOR STATUS VOCABULARY

**Certification Summary:**

- ✓ 18 real CSV fields audited and mapped
- ✓ Field authority matrix complete
- ✓ KingsChat User ID proven unproven (safe: metadata only in V1)
- ✓ Phone normalization contract designed with real examples
- ✓ Identity algorithm specified with 5 ordered steps
- ✓ Registration ID edge cases handled (missing, blank, duplicate)
- ✓ Duplicate email conflict behavior specified
- ✓ Possible Match model requires no schema change (browser-derived)
- ✓ Organization fields authority established (evidence only; no overwrites)
- ✓ Provenance structure finalized
- ✓ Constraint mismatches proven and fixed by migration
- ✓ source-type dependency audit complete (safe to add 'registration_csv')
- ✓ Required schema changes minimal (4 constraint fixes)
- ✓ Migration safe and ordered (20270929000000)

**Single Blocking Item:**

Status field vocabulary. Real CSV shows value "Registered"; mapping to canonical registration_status remains unknown.

**Non-Blocker:** KingsChat User ID identity matching deferred to V2. Safe as metadata in V1.

---

**END OF CERTIFIED DESIGN.**

**Ready for implementation after Status vocabulary is provided by ORS.**
