# REGISTRATION CSV PHASE 2 — FINAL LOCKED DESIGN

**Date:** 2027-09-28  
**Status:** Design Complete, Ready for Migration & Implementation  
**Locked Decisions:** 14 (all applied below)

---

## 1. FIELD AUTHORITY MATRIX — LOCKED DECISIONS 1–5

| CSV Column | Canonical DB Column | V1 Treatment | Authority | Notes |
|---|---|---|---|---|
| Registration ID | *(source_key only)* | Durable identity key | CSV source | Immutable; enables idempotent re-imports. |
| Title | *(metadata only)* | `source_values.registration_csv.title` | CSV source | NOT included in canonical `full_name`. |
| First Name | *(component)* | Part of `full_name` derivation | CSV source | Combined with Last Name only (Title excluded). |
| Last Name | *(component)* | Part of `full_name` derivation | CSV source | Combined with First Name only (Title excluded). |
| Email | `email` (primary) | Canonical email claim authority | CSV source + claims | Use `icplc_email_claims` for matching. Preserve raw as evidence. DO NOT auto-replace primary/alternate slots. |
| Country Code | *(metadata only)* | `source_values.registration_csv.country_code` | CSV source | Informational; no matching logic. |
| Phone Number | *(metadata only)* | `source_values.registration_csv.phone` | CSV source | **No phone column in V1.** No phone matching. Store raw. |
| KingsChat Username | *(metadata only)* | `source_values.registration_csv.kingschat_username` | CSV source | **No KingsChat matching in V1.** Metadata for reference only. |
| KingsChat Phone | *(metadata only)* | `source_values.registration_csv.kingschat_phone` | CSV source | No matching. Metadata. |
| Country | *(metadata only)* | `source_values.registration_csv.country` | CSV source | Informational. |
| Region | *(evidence only)* | `source_values.registration_csv.region` | CSV source | **Do NOT overwrite canonical `region`.** Store raw. Flag mismatches. |
| Zone | *(metadata only)* | `source_values.registration_csv.zone` | CSV source | Informational; no matching. |
| Group | *(evidence only)* | `source_values.registration_csv.group` | CSV source | **Do NOT overwrite canonical `group_name`.** Match for candidates only. Store raw. Flag mismatches. |
| Fellowship/Church | *(metadata only)* | `source_values.registration_csv.fellowship` | CSV source | **Metadata only.** No overwrite of `group_name`. |
| Designation | *(metadata only)* | `source_values.registration_csv.designation` | CSV source | Informational; no matching. |
| Status | *(BLOCKED)* | — | CSV source | **Status mapping BLOCKED pending actual CSV sample.** Do not guess semantics. Store raw. See Blocker #12. |
| Registration Date | *(metadata only)* | `source_values.registration_csv.registration_date` | CSV source | Informational timestamp. |

**Key Principles:**
- Only email is authoritative for identity matching (via canonical claims).
- Title is metadata only; canonical `full_name` is First + Last only.
- Region and Group are evidence, not authoritative — store raw, flag mismatches, require staff review.
- Phone, Country Code, KingsChat, Designation, Zone, Country, Fellowship: all metadata. Zero matching logic.

---

## 2. IDENTITY MATCHING ALGORITHM — LOCKED DECISION 7

**Ordered steps (STOP at first match):**

### Step 1: Persistent Registration ID Map (Definitive)
```
IF icplc_identity_maps.source_type = 'registration_csv'
   AND source_key = Registration ID (exact, as-is)
   → participant_id found
   → match_status = 'persistent'
   → STOP (no candidates; staff already confirmed)
```

**Rationale:** Registration ID from prior import is immutable and definitive.

### Step 2: Canonical Email Claim (Definitive)
```
IF email is non-blank
   AND icplc_email_claims has (event_id, normalize_email(email))
   → participant_id found
   → match_status = 'auto'
   → STOP (email is cross-slot authority; no candidates)
```

**Rationale:** Email claims are the concurrency-safe uniqueness authority. No candidates shown — email match is definitive.

### Step 3: Name + Organization Candidates (Possible Match)
```
DO NOT auto-match on name alone.

Generate candidates:

A. Name match (weak)
   SELECT participant WHERE
     normalize_name(full_name) = normalize_name(First+Last)
   → strength = 1

B. Group match (weak)
   SELECT participant WHERE
     group_name = incoming group (exact match only)
   → strength = 0.5

C. Combined name + group (moderate)
   SELECT participant WHERE
     normalize_name(full_name) = normalize_name(First+Last)
     AND group_name = incoming group
   → strength = 2

D. Combined name + subgroup (moderate)
   SELECT participant WHERE
     normalize_name(full_name) = normalize_name(First+Last)
     AND subgroup = incoming subgroup
   → strength = 2

Return all candidates sorted by strength descending, then name ascending.
DO NOT set participant_id for any candidate.
match_status = 'unmatched'
Candidates presented to staff with reasons.
```

**Rationale:** External CSV data is less trustworthy than internal data. No fuzzy auto-link. Staff confirms.

### Step 4: No Match
```
match_status = 'unmatched'
candidates = []
→ Staff must SKIP, LINK_EXISTING, or CREATE_NEW
```

---

## 3. MISSING REGISTRATION ID — LOCKED DECISION 8

**Scenario:** CSV lacks "Registration ID" column OR specific row has blank/null Registration ID.

**Behavior:**
- Step 1 (persistent map) is skipped entirely.
- Row proceeds directly to Step 2 (email claim lookup).
- If email lookup succeeds → match_status = 'auto', participant_id set. No candidates. Done.
- If email lookup fails → row becomes unmatched; candidates generated (Step 3). Staff decides.

**Critical:** Rows without Registration ID source key are **never** linked via persistent map, even if the same email appears in a prior import. Each import is transactional; email is the stable key.

**Implementation:**
```javascript
export function registrationCsvSourceKey(row) {
  const regId = (row['Registration ID'] || '').trim()
  return regId === '' ? null : regId
}
```

**Storage in source_values:**
```json
{
  "registration_csv": {
    "registration_id": null,  // Document explicitly that it was absent/blank
    "registration_id_missing": true,
    "batch_id": "batch-uuid",
    "applied_at": "2027-09-28T14:30:00Z"
  }
}
```

This preserves the fact that durable source identity is unavailable.

---

## 4. DUPLICATE REGISTRATION ID (Non-Blank) — LOCKED DECISION 10

**Scenario:** Same batch has two rows with identical non-blank Registration ID.

**Behavior:**
- Both rows marked `match_status = 'error'`, `error_detail = 'Duplicate Registration ID in batch: <ID>'`
- Neither row proceeds to resolution phase
- Batch status = 'applied_with_errors' (NOT 'failed' — rest of batch continues)
- Batch metadata includes list of duplicate keys

**Rationale:** Duplicate IDs indicate source data corruption. They must be removed by staff before re-upload. However, the rest of the batch (rows with unique IDs or no ID) can still be processed — no need to fail the entire import.

**Implementation in RPC:**
```plpgsql
-- Detect duplicates within batch
UPDATE public.icplc_import_rows
SET match_status = 'error',
    error_detail = 'Duplicate Registration ID in batch'
WHERE batch_id = p_batch_id
  AND source_key IN (
    SELECT source_key
    FROM public.icplc_import_rows
    WHERE batch_id = p_batch_id
    GROUP BY source_key
    HAVING count(*) > 1
  );

-- Continue processing other rows
-- Batch status becomes 'applied_with_errors' if any errors exist
```

---

## 5. DUPLICATE EMAIL (Multiple Rows, Blank IDs) — LOCKED DECISION 9

**Scenario:** Multiple rows in the same batch have blank Registration IDs and the same normalized email.

**Behavior (Conflict/Review State):**
- All rows sharing that email are marked `match_status = 'error'` with `error_detail = 'Duplicate normalized email in batch (no Registration ID)'`
- Neither row is auto-linked to a participant
- Both require explicit staff resolution: SKIP, LINK_EXISTING, or CREATE_NEW
- If staff links both to the same participant, the second apply will UPDATE that participant with potentially conflicting data
- Last apply wins (not ideal, but acceptable if documented)

**Why not last-write-wins silently:**
- Email claim ownership is global (per event). Two rows claiming the same email could race.
- If both rows pass Step 2 (email claim lookup), they auto-match to the same participant.
- At apply time, both are 'auto' matches and proceed to update the same participant with potentially different data.
- **Solution:** Flag this explicitly to staff. Show a conflict modal: "These 2 rows claim the same email and will update the same participant. Review or skip one."

**Implementation:**
```plpgsql
-- After Step 2 (email claims)
-- Before apply phase

-- Detect conflicts
CREATE TEMP TABLE email_duplicates AS
SELECT normalized_email, array_agg(row_id) as row_ids, count(*) as cnt
FROM icplc_import_rows ir
WHERE batch_id = p_batch_id
  AND ir.raw_payload->>'Registration ID' IS NULL OR TRIM(ir.raw_payload->>'Registration ID') = ''
  AND normalize_email(ir.raw_payload->>'Email') IS NOT NULL
GROUP BY normalize_email(ir.raw_payload->>'Email')
HAVING count(*) > 1;

-- Mark all rows in each conflict group for review
UPDATE public.icplc_import_rows
SET match_status = 'error',
    error_detail = 'Duplicate normalized email in batch (no Registration ID) — requires staff review'
WHERE batch_id = p_batch_id
  AND id = ANY((SELECT row_ids FROM email_duplicates) as rows(row_ids));

-- Batch proceeds to UI: staff sees these rows flagged for review
```

---

## 6. CANDIDATE GENERATION — LOCKED DECISION 11

**Current State (Audited):**
- `icplc_import_rows.match_status` has CHECK constraint: `('auto', 'manual', 'persistent', 'unmatched', 'error')`
- No 'POSSIBLE_MATCH' state in the DB.
- Browser derives "Possible Match" state when `match_status = 'unmatched' AND candidates.length > 0`
- This is done in `reconciliation.js` with `reconciliationState()` function

**Registration CSV V1 Behavior (Same Pattern):**
- Store candidates as JSONB in a new column OR
- Derive candidates on-the-fly when needed (browser calls `candidateMatches()` or similar)

**Recommendation:** Derive candidates on-the-fly in the browser. No new DB column needed.

```javascript
// Browser-side candidate generation (matches Steps 3–4 above)
export function registrationCsvCandidateMatches(incomingRow, participants) {
  const incomingFullName = deriveFullNameFromRegistrationCsv(incomingRow)
  const incomingNormalizedName = normalizeName(incomingFullName)
  const incomingGroup = (incomingRow['Group'] || '').trim()
  const incomingSubgroup = (incomingRow['Subgroup'] || '').trim()

  return participants
    .map((p) => {
      const nameMatch = normalizeName(p.full_name) === incomingNormalizedName
      const groupMatch = p.group_name === incomingGroup
      const subgroupMatch = p.subgroup === incomingSubgroup

      let strength = 0
      let reason = []
      
      if (nameMatch) strength += 1; reason.push('Name match')
      if (groupMatch) strength += 0.5; reason.push('Group match')
      if (subgroupMatch) strength += 0.5; reason.push('Subgroup match')
      
      if (strength === 0) return null
      
      return { participant: p, strength, reason: reason.join(' + ') }
    })
    .filter(Boolean)
    .sort((a, b) => b.strength - a.strength || a.participant.full_name.localeCompare(b.participant.full_name))
}
```

**No schema change needed.** Candidates are computed on-demand in the UI.

---

## 7. RESOLUTION WORKFLOW — Locked Decisions 7 + New Detail

After matching and candidate generation, staff makes an **explicit choice** for each unmatched row:

### Resolution 1: SKIP
```
User clicks "Skip this row"
→ resolution = 'skip'
→ resolved_participant_id = NULL
→ At apply time: row marked apply_status = 'skipped', no participant touched
```

### Resolution 2: LINK_EXISTING
```
User selects a participant (from candidates or manual search)
→ resolution = 'link_existing'
→ resolved_participant_id = <UUID>
→ resolved_by = auth.uid()
→ resolved_at = now()

At apply time:
  1. Upsert identity_map: (event_id, 'registration_csv', registration_id) → participant_id
  2. Update participant with mutable fields (region, group) IF not overridden
  3. Preserve email claim ownership (do NOT auto-replace slots)
  4. Store provenance in source_values
  5. Mark apply_status = 'linked'
```

### Resolution 3: CREATE_NEW
```
User clicks "Create new participant"
→ resolution = 'create_new'
→ resolved_participant_id = NULL (filled at apply time)
→ resolved_by = auth.uid()
→ resolved_at = now()

At apply time:
  1. INSERT icplc_participants(
       full_name, email, region, subgroup, group_name,
       source_values, participation_status = 'tracking'
     )
  2. INSERT identity_map: (event_id, 'registration_csv', registration_id) → new participant_id
  3. Mark apply_status = 'created'
```

**Key Invariant:** Resolution is set by staff in the match/review phase. Apply phase only executes the pre-decided action. No second-guessing.

---

## 8. FULL NAME DERIVATION — Locked Decision 5

```javascript
export function deriveFullNameFromRegistrationCsv(row) {
  const first = (row['First Name'] || '').trim().replace(/\s+/g, ' ')
  const last = (row['Last Name'] || '').trim().replace(/\s+/g, ' ')
  
  const parts = [first, last].filter(p => p !== '')
  if (parts.length === 0) return null  // Error: no name
  
  return parts.join(' ')  // "John Doe" — NO TITLE
}
```

**Critical:** Title is NOT included in `full_name`. It is stored separately in `source_values.registration_csv.title`.

**Why:** The canonical `full_name` should be consistent across all sources. Title is not stable across data sources (CSV vs manual entry vs other imports). Storing it separately preserves it without contaminating the canonical name field.

---

## 9. EMAIL HANDLING — Locked Decision 6

**Three principles:**

1. **Canonical identity matching uses `icplc_email_claims`** (cross-slot authority)
2. **Preserve incoming email as source evidence** (all CSV emails stored in `source_values.registration_csv.email`)
3. **Do NOT auto-replace primary or alternate slots** during import

**Implementation:**

At apply time, when creating or linking a participant:
```plpgsql
-- Read incoming email from CSV
v_incoming_email := v_row.raw_payload->>'Email';

-- If email is non-blank, it may already exist in email_claims
-- but DO NOT replace the participant's current email slots

-- Just store it as source evidence
v_source_values := v_source_values || jsonb_build_object(
  'registration_csv', jsonb_build_object(
    'email', v_incoming_email,
    ...
  )
);

-- Email claim lookup (Step 2) happens at MATCH time, not apply time
-- At apply time, we respect the existing email ownership
```

**If staff needs to update email:** They do it manually via the participant profile after import.

---

## 10. PROVENANCE STRUCTURE — Final Form

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
    "title": "Rev.",
    "first_name": "John",
    "last_name": "Doe",
    "country_code": "CA",
    "phone": "+16135551234",
    "kingschat_username": "johndoe",
    "kingschat_phone": "+16135551234",
    "country": "Canada",
    "zone": "Ontario Zone",
    "fellowship": "Central Fellowship",
    "designation": "Pastor",
    "status_raw": "Registered",
    "registration_date": "2027-08-15",
    "registration_id_missing": false,
    "batch_id": "batch-uuid",
    "applied_at": "2027-09-28T14:30:00Z"
  },
  "region_mismatch": {
    "incoming": "Ontari",
    "closest_match": "Ontario",
    "batch_id": "batch-uuid",
    "observed_at": "2027-09-28T14:30:00Z",
    "requires_review": true
  },
  "group_mismatch": {
    "incoming": "Media",
    "candidates": ["Group Media"],
    "batch_id": "batch-uuid",
    "observed_at": "2027-09-28T14:30:00Z",
    "requires_review": true
  }
}
```

Per-field provenance (email, region, group_name) follows the standard `{ value, source, observed_at, batch_id }` format. All metadata and mismatch data goes into `registration_csv` and mismatch-specific keys for easy discovery.

---

## 11. REQUIRED SCHEMA CHANGES — Locked Decision 14

**Migration timestamp:** `20270929000000` (safe — latest ICPLC migration is `20270928000002`)

**Changes (minimal):**

1. **Fix `icplc_import_rows.apply_status` CHECK** (Bug fix)
   ```sql
   ALTER TABLE public.icplc_import_rows
     DROP CONSTRAINT icplc_import_rows_apply_status_check,
     ADD CONSTRAINT icplc_import_rows_apply_status_check
       CHECK (apply_status IN ('kept', 'updated', 'protected', 'skipped', 'error', 'created', 'linked'));
   ```

2. **Fix `icplc_import_batches.status` CHECK** (Bug fix)
   ```sql
   ALTER TABLE public.icplc_import_batches
     DROP CONSTRAINT icplc_import_batches_status_check,
     ADD CONSTRAINT icplc_import_batches_status_check
       CHECK (status IN (
         'pending', 'matching', 'matched', 'previewing', 'previewed',
         'applying', 'applied', 'failed', 'applied_with_errors'
       ));
   ```

3. **Extend `icplc_import_batches.source` CHECK** (Support new source type)
   ```sql
   ALTER TABLE public.icplc_import_batches
     DROP CONSTRAINT icplc_import_batches_source_check,
     ADD CONSTRAINT icplc_import_batches_source_check
       CHECK (source IN ('csv', 'cmp_registrations', 'cmp_flights', 'registration_csv'));
   ```

4. **Extend `icplc_identity_maps.source_type` CHECK** (Support new source type)
   ```sql
   ALTER TABLE public.icplc_identity_maps
     DROP CONSTRAINT icplc_identity_maps_source_type_check,
     ADD CONSTRAINT icplc_identity_maps_source_type_check
       CHECK (source_type IN ('csv', 'cmp_registrations', 'cmp_flights', 'registration', 'registration_csv'));
   ```

**No new columns needed.** All metadata stored in existing JSONB columns.

---

## 12. CONSTRAINT MISMATCH PROOF — Locked Decision 13

**Evidence 1: `icplc_import_rows.apply_status` mismatch**

Existing RPC `icplc_apply_registration_csv_row` (20270926000000:256–258) executes:
```plpgsql
set apply_status = 'created'  -- Line 258
set apply_status = 'linked'   -- Line 345
```

But CHECK constraint in 20260925000005:18 only allows:
```sql
check (apply_status in ('kept', 'updated', 'protected', 'skipped', 'error'))
```

**Proof by code review (lines 256–262 of 20270926000000_icplc_csv_adapter.sql):**
```
256: set apply_status = 'created'
257: where id = p_row_id;
...
345: set apply_status = 'linked'
```

These would violate the constraint if executed.

**Evidence 2: `icplc_import_batches.status` mismatch**

Existing RPC `icplc_apply_registration_csv_batch` (20270926000000:141) executes:
```plpgsql
set status = case when v_error_count > 0 then 'applied_with_errors' else 'applied' end,
```

But CHECK constraint in 20260925000004:13 only allows:
```sql
check (status in (
  'pending', 'matching', 'matched', 'previewing', 'previewed',
  'applying', 'applied', 'failed'
))
```

`'applied_with_errors'` is not allowed.

**Proof by code review (line 141 of 20270926000000_icplc_csv_adapter.sql):**
```
141: set status = case when v_error_count > 0 then 'applied_with_errors' else 'applied' end,
```

This would violate the constraint if `v_error_count > 0`.

**Conclusion:** Both mismatches are real and present in the live schema. The proposed migration fixes both.

---

## 13. MIGRATION ORDER & SAFETY — Locked Decision 14

**Safe timestamp:** `20270929000000` (2027-09-29 00:00:00 UTC)

**Rationale:**
- Latest ICPLC migration: `20270928000002` (2027-09-28)
- New migration timestamp: `20270929000000` (2027-09-29)
- Strictly greater than all existing migrations ✓
- No conflicts with parallel branches (checked git log)

**Dependencies:**
- All migrations up to and including `20270928000002` must exist
- `icplc_import_rows` table must exist (20260925000005)
- `icplc_import_batches` table must exist (20260925000004)
- `icplc_identity_maps` table must exist (20260925000006)
- These are all present in the current schema ✓

**Side effects:**
- All existing RPCs that read from these tables continue to work (CHECK constraints are backwards-compatible — they only add new allowed values, don't remove any)
- Browser code is unaffected (no schema changes visible to RLS queries)
- Existing imports using 'csv', 'cmp_registrations', 'cmp_flights' continue working

**Migration is SAFE to apply immediately after 20270928000002.**

---

## 14. REMAINING BLOCKERS

| # | Blocker | Status | Action |
|---|---|---|---|
| 1 | Status vocabulary (17-field CSV semantics) | **BLOCKED** | Need actual Registration CSV sample or explicit Status enum from ORS. Do not guess. |
| 2 | ~~Group vs Fellowship~~ | DECIDED | Fellowship = metadata only. Group = evidence only (no overwrite). |
| 3 | ~~Phone in V1~~ | DECIDED | No phone column. Store raw only. No matching. |
| 4 | ~~KingsChat matching~~ | DECIDED | No KingsChat matching. Metadata only. |
| 5 | ~~Title in full_name~~ | DECIDED | Title = metadata only. full_name = First + Last only. |
| 6 | ~~Email handling~~ | DECIDED | Claims authority. No auto-replace slots. Preserve as evidence. |
| 7 | ~~Matching order~~ | DECIDED | Registration ID → email claim → name+org candidates → unmatched. |
| 8 | ~~Missing ID behavior~~ | DECIDED | Fall through to email. Track explicitly in source_values. |
| 9 | ~~Duplicate email~~ | DECIDED | Conflict state. Require staff review. |
| 10 | ~~Duplicate ID~~ | DECIDED | Error all rows. Batch = applied_with_errors. Rest continues. |
| 11 | ~~Possible Match state~~ | DECIDED | Derive from unmatched + candidates. No schema change. |
| 12 | Status mapping | **BLOCKED** | Same as #1. Required before implementation. |
| 13 | Constraint mismatches | VERIFIED | Both real. Fixed by migration. |
| 14 | Migration timestamp | SAFE | 20270929000000 is safe. All deps present. |

**Two blockers remain:**
1. **Status vocabulary** — Need actual CSV or semantic definition
2. **No technical blockers** — Schema, matching, resolution, provenance all designed and safe

---

## SUMMARY

**What is ready:**
- ✓ Field authority matrix (14 fields mapped, 3 metadata-only)
- ✓ Identity matching algorithm (4-step, no fuzzy auto-link)
- ✓ Edge case handling (missing ID, duplicate ID, duplicate email)
- ✓ Candidate generation (no schema change; browser-derived)
- ✓ Resolution workflow (SKIP, LINK_EXISTING, CREATE_NEW)
- ✓ Full name derivation (First + Last, no Title)
- ✓ Email handling (claims + evidence; no slot replacement)
- ✓ Provenance structure (per-field + metadata + mismatches)
- ✓ Schema changes (4 constraint fixes/extensions; 0 new columns)
- ✓ Constraint mismatch proof (2 bugs verified; fixed by migration)
- ✓ Migration safety analysis (20270929000000 is safe)

**What is blocked:**
- Status mapping (awaiting CSV sample or enum)

**Files that will need modification after this design:**
- `supabase/migrations/20270929000000_icplc_registration_csv_source.sql` (migration)
- `src/features/icplc/lib/registrationCsvMappings.js` (new; header mapping)
- `src/features/icplc/hooks/useICPLCRegistrationCsvImport.js` (new; state machine)
- `src/features/icplc/pages/RegistrationCsvImportsPage.jsx` (new; UI wizard)
- `supabase/functions/icplc-registration-csv-apply/index.ts` (new; apply edge fn)

**Files that will NOT be modified (off-limits during Phase 1):**
- `ICPLCPortal.jsx`, `ICPLCContext.jsx`, `PeoplePage.jsx`, `ParticipantTable.jsx`, etc.

---

**END OF DESIGN. Ready for implementation after Blocker #12 (Status mapping) is resolved.**
