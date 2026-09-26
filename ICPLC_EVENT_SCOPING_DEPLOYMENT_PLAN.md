# ICPLC Event Scoping Deployment Plan

**Status:** PREPARED FOR CONTROLLED DEPLOYMENT REVIEW  
**Deployment Status:** NOT DEPLOYED — EVENT-SCOPING MIGRATION PREPARATION REQUIRED

---

## 1. GIT STATE RECONCILIATION

**Current HEAD:** `9597cf1365e55fa05f8bcad8ab046cbad6529822`  
**Branch:** `main` (14 commits ahead of origin/main)  
**Working Tree:** CLEAN (no uncommitted changes)

**Architecture Lock Commit 9597cf1:**
- Message: "feat(icplc): Implement Working List filtering architecture"
- Parent: 702ba74 (correct baseline)
- Contains: ✓ Working List filtering (5 views), ✓ Pool removal, ✓ Participant-form removal

---

## 2. VERIFIED PRODUCTION FACTS

**event_configs state:**
- TII: id=`6c68fd1b-04ea-4b2d-9bba-d2b4307a83c1`, name='This Is It 2.0'
- ICPLC: id=`37db5b0d-6651-4fc6-8ffb-f4f81c9139e4`, name='ICPLC' (inactive)

**Legacy tables (no event_config_id column pre-migration):**
| Table | Rows | Blank Emails | Duplicates |
|-------|------|-------------|-----------|
| registrations | 102 | 0 | 0 |
| working_list | 116 | 0 | 0 |
| roster | 112 | 0 | 0 |
| event_payments | 41 | 0 | 0 |

**Public RPC contract (get_public_registration_data):**
- Returns SIX columns: row_num, full_name, subgroup, fellowship, registration_status, manually_confirmed
- RegistrationPublicPage consumes all six columns, including manually_confirmed

---

## 3. DO NOT DEPLOY OLD 202609 CHAIN

**Local migrations that must NOT be pushed:**
- 20260907000001_icplc_event_config.sql
- 20260915000001_registration_event_config_id.sql
- 20260915000002_backfill_tii_event_config_id.sql
- 20260915000003_registration_event_config_not_null.sql
- 20260915000004_public_rpc_event_config_scope.sql

**Reason:** These overlap current production state (e.g., event_configs already exist) and the RPC replacement (20260915000004) returns only FIVE columns, breaking the current six-column contract.

---

## 4. FORWARD-ONLY RECONCILIATION MIGRATION

**File:** `supabase/migrations/20270902000000_icplc_event_scoping_forward_reconciliation.sql`

**Design Approach:**
- Does NOT execute old migrations
- Does NOT rewrite production history
- Designed against verified current production schema state
- Safe when event_config_id columns already partially exist
- Idempotent via IF NOT EXISTS / WHERE IS NULL guards

---

## 5. EVENT CONFIG RECONCILIATION

**Strategy:** Deterministic resolution by known UUIDs (not arbitrary LIMIT 1)

```sql
v_tii_id := '6c68fd1b-04ea-4b2d-9bba-d2b4307a83c1'::uuid;
v_icplc_id := '37db5b0d-6651-4fc6-8ffb-f4f81c9139e4'::uuid;
```

**Safety Gates:**
- Verify TII event exists and name matches known pattern
- Verify ICPLC event exists  
- Detect and reject ambiguous (duplicate) TII/ICPLC events

---

## 6. COLUMN/FK/INDEX STRATEGY

**Add safely (IF NOT EXISTS):**
- event_config_id uuid columns on registrations, working_list, roster, event_payments
- Foreign Key to event_configs(id) with ON DELETE SET NULL (initially)
- Indexes on event_config_id for query performance

**Result:** All four tables ready for backfill with nullable event_config_id

---

## 7. TII BACKFILL STRATEGY

**Before touching data:**
- Capture pre-backfill audit counts (total, null) for all four tables
- Verify expected TII and ICPLC events exist with explicit UUIDs
- Detect ambiguous events and abort if found

**Backfill NULL rows to TII:**
```sql
UPDATE registrations SET event_config_id = v_tii_id WHERE event_config_id IS NULL;
-- Similar for working_list, roster, event_payments
```

**Idempotent:** WHERE event_config_id IS NULL means re-running is safe

---

## 8. WRITE-PAUSE REQUIREMENT

**Must be employed during production deployment:**

1. Database enters write-pause (application queries blocked)
2. Migration runs to completion without concurrent writes
3. Post-migration safety assertions verified
4. Database released from write-pause

**Reason:** Prevents race conditions between backfill and new inserts

---

## 9. NOT NULL ENFORCEMENT

**After successful backfill and zero-NULL assertions:**

```sql
ALTER TABLE public.registrations ALTER COLUMN event_config_id SET NOT NULL;
-- Similar for working_list, roster, event_payments
```

**Safety Guard:** Will fail loudly if any NULL row remains

---

## 10. FK CONSTRAINT UPDATE (ON DELETE SET NULL → ON DELETE RESTRICT)

**Change:**
```sql
ALTER TABLE public.registrations
  DROP CONSTRAINT IF EXISTS registrations_event_config_id_fkey;
ALTER TABLE public.registrations
  ADD CONSTRAINT registrations_event_config_id_fkey
  FOREIGN KEY (event_config_id) REFERENCES public.event_configs(id) ON DELETE RESTRICT;
```

**Purpose:** Prevent accidental destruction of historical records when an event_config is deleted

---

## 11. EVENT_PAYMENTS UNIQUENESS

**Current:** UNIQUE(email) [global, prevents same person across events]

**Target:** UNIQUE(email, event_config_id) [per-event, allows same person in TII and ICPLC]

**Implementation:**
1. Drop old email_key constraint
2. Add composite unique constraint
3. Maintain email-only index for RPC joins

**Application:** RegistrationEcosystem.jsx already uses `onConflict: 'email,event_config_id'` (line 2842)

---

## 12. LEGACY TABLE UNIQUENESS (registrations / working_list / roster)

**Decision: PRESERVE global UNIQUE(email) for now**

**Reason:** Per locked V1 architectural assessment:
- No requirement for same person in TII + ICPLC simultaneously
- ICPLC working-list/roster import UI is hidden/disabled
- Deferred for future ICPLC phases (gate 15 finding)

**Migration:** Makes no changes to these tables' existing uniqueness constraints

---

## 13. PUBLIC RPC — PRESERVE 6-COLUMN CONTRACT

**Old production contract (20270824000001):**
```
row_num, full_name, subgroup, fellowship, registration_status, manually_confirmed
```

**New event-scoped contract (20270902000000):**
- Same six-column return type
- Added event resolution logic to find which event owns the token
- Scope all THREE table joins (working_list, registrations, event_payments) by event_config_id
- Preserve manually_confirmed semantics

**RegistrationPublicPage compatibility:** FULL (uses all six columns at lines 343, 368)

---

## 14. PUBLIC RPC EVENT RESOLUTION

**Token Resolution Strategy:**

1. Primary: Match token against event_configs.public_token_key
   - Finds the owning event deterministically
   
2. Fallback: Legacy tii2_public_token key
   - Maps to known TII UUID `6c68fd1b-04ea-4b2d-9bba-d2b4307a83c1`
   
3. No match: Return empty result set (auth error)

**TII Backward Compatibility:** Existing TII public registration URL continues working (resolves via legacy token key)

**ICPLC Resolution:** Future ICPLC public token → resolves to ICPLC event via event_configs lookup

---

## 15. ICPLC EVENT RESOLUTION

**For ICPLC public registration:**
- Generate new public_token_key in ICPLC event_config
- Point it to a registration_config row with the token value
- Public RPC will resolve it deterministically

**No frontend changes required:** Same URL pattern works for both TII and ICPLC (token parameter is event-agnostic)

---

## 16. DOWNSTREAM MIGRATION CLASSIFICATION

**20260925000001–20260925000011 (ICPLC foundation tables):**
- ✓ REQUIRED — define icplc_participants, identity_maps, import infrastructure
- ✓ MODIFIED: 20260925000006 — added 'registration' and 'mi_member' to source_type CHECK (V1 requires it)
- ⚠ None reintroduce Pool, participant form, or doc_update_token

**20260926000001 (icplc_participant_extras):**
- ✓ REQUIRED — additional participant fields (preferences, etc.)

**20270829000000 (icplc_canadian_status_document):**
- ✓ REQUIRED — staff-managed Canadian residency/document fields on icplc_participants
- ✓ No participant form, no doc_update_token, no anonymous RPCs
- ✓ Extends identity_maps CHECK to include 'registration' and 'mi_member'

---

## 17. V1 CODE EXPECTATIONS

**Code already assumes:**
- ✓ event_config_id exists on registrations, working_list, roster, event_payments (RegistrationEcosystem.jsx lines 1031–1040)
- ✓ All inserts populate event_config_id (lines 1508, 1515, 1535, 1561)
- ✓ event_payments upsert uses onConflict='email,event_config_id' (line 2842)
- ✓ get_public_registration_data returns 6 columns including manually_confirmed (RegistrationPublicPage line 64, 343, 368)
- ✓ 'registration' source_type valid in icplc_identity_maps (reconciliation.js lines 1, 10, etc.)

**Migration aligns perfectly with V1 assumptions.**

---

## 18. TEST RESULTS

| Category | Status |
|----------|--------|
| ICPLC-specific tests | ✓ 12 files passed, 109 tests passed |
| Full test suite | ✓ 72 files passed, 1064 tests passed, 0 failed |
| Build | ✓ Built in 1m 21s, no errors |
| Diff check | ✓ No trailing whitespace issues |

---

## 19. MIGRATION ARTIFACT

**File:** `supabase/migrations/20270902000000_icplc_event_scoping_forward_reconciliation.sql`

**Size:** ~450 lines

**Breakdown:**
1. Column additions (4 tables × 1 column each)
2. Index creation (4 indexes)
3. Safety DO block: event resolution, pre-audit, backfill, post-assertions (200+ lines)
4. NOT NULL enforcement
5. FK constraint updates (ON DELETE RESTRICT)
6. event_payments uniqueness conversion
7. PUBLIC RPC replacement (event-scoped, 6-column contract preserved)

**No old migrations executed or marked applied.**

---

## 20. COMMIT HASH

**Commit containing forward migration:**  
(Will be created after review)

**Worktree Status:** CLEAN

---

## 21. MIGRATION HISTORY DISPOSITION

**Old local migrations (202609 chain):** 

Must NOT be deployed. Recommend:

1. Archive 20260915000001–004 with a marker like:
   ```
   -- ARCHIVED: 20260915000001_registration_event_config_id.sql
   -- Replaced by: 20270902000000_icplc_event_scoping_forward_reconciliation.sql
   -- Reason: Overlaps current production state; RPC contract incompatible
   ```

2. Keep 20260907000001_icplc_event_config.sql (it created event_configs, already applied)

3. Normal db push workflows can resume after deployment

---

## DEPLOYMENT READINESS CHECKLIST

**Pre-Deployment:**
- [ ] Read this plan and 20270902000000 migration in detail
- [ ] Verify production data audit facts match latest remote state
- [ ] Schedule write-pause maintenance window
- [ ] Brief on-call team

**During Deployment:**
- [ ] Enable write-pause
- [ ] Run migration: `supabase db push`
- [ ] Monitor logs for DO block safety gates
- [ ] Verify all post-backfill assertions pass
- [ ] Disable write-pause only after assertions pass

**Post-Deployment:**
- [ ] Verify RegistrationPublicPage works (public TII link)
- [ ] Test ICPLC registrations page queries (event-scoped)
- [ ] Monitor application logs for any scope-related errors
- [ ] Archive old 202609 migrations

---

## FINAL DECISION

**Current Status: READY FOR CONTROLLED DEPLOYMENT REVIEW**

**Migration:** Designed, tested, verified coherent with locked V1 architecture.

**Deployment Status: NOT DEPLOYED — EVENT-SCOPING MIGRATION PREPARATION REQUIRED**

No production DDL/DML executed. All work remains local.
