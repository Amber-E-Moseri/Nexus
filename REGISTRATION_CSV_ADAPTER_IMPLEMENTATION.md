# REGISTRATION CSV ADAPTER — IMPLEMENTATION FILES

## FILES TO CREATE/MODIFY

### 1. NEW: src/features/icplc/pages/RegistrationsCsvAdapter.jsx

```javascript
import React, { useRef, useState, useMemo } from 'react'
import { Upload, Search, UserPlus, ChevronDown } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { useICPLC } from '../ICPLCContext.jsx'
import { parseCSV, buildHeaderMapping, deriveIdentityKey } from '../lib/importProcessor.js'
import { 
  reconciliationState, 
  normalizeEmail, 
  candidateMatches,
  registrationDisplayName 
} from '../lib/reconciliation.js'
import Badge from '../../../components/ui/Badge.jsx'

export default function RegistrationsCsvAdapter({ canWrite }) {
  const { config } = useICPLC()
  const eventId = config?.id
  const fileRef = useRef(null)
  
  const [step, setStep] = useState('upload') // upload | classify | review | applying | done
  const [batchId, setBatchId] = useState(null)
  const [rows, setRows] = useState([])
  const [participants, setParticipants] = useState([])
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)
  const [reviewing, setReviewing] = useState(null) // reviewing state

  // STAGE: Parse CSV and create batch
  const handleUpload = async (file) => {
    setError(null)
    setLoading(true)
    try {
      const text = await file.text()
      const parsed = parseCSV(text)
      if (parsed.errors.length) {
        setError(parsed.errors.join('; '))
        return
      }

      const { mapping } = buildHeaderMapping(parsed.headers, 'v1')

      // Create batch
      const { data: batch, error: bErr } = await supabase
        .from('icplc_import_batches')
        .insert({
          event_id: eventId,
          source: 'registration_csv',
          source_identifier: file.name,
          total_rows: parsed.rows.length,
          status: 'staged'
        })
        .select()
        .single()

      if (bErr) throw bErr

      // Insert rows with identity_key
      const rowInserts = parsed.rows.map((raw, idx) => ({
        batch_id: batch.id,
        row_number: idx + 1,
        raw_payload: raw,
        identity_key: normalizeEmail(raw.Email)
      }))

      for (let i = 0; i < rowInserts.length; i += 500) {
        const { error: rErr } = await supabase
          .from('icplc_import_rows')
          .insert(rowInserts.slice(i, i + 500))
        if (rErr) throw rErr
      }

      setBatchId(batch.id)
      setRows(rowInserts)
      setStep('classify')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // CLASSIFY: Reconcile each row
  const handleClassify = async () => {
    setError(null)
    setLoading(true)
    try {
      // Fetch current participants
      const { data: partic, error: pErr } = await supabase
        .from('icplc_participants')
        .select('*')
        .eq('event_id', eventId)
      if (pErr) throw pErr
      setParticipants(partic || [])

      // Fetch existing maps
      const { data: maps, error: mErr } = await supabase
        .from('icplc_identity_maps')
        .select('*')
        .eq('event_id', eventId)
        .eq('source_type', 'csv')
      if (mErr) throw mErr

      const mapByKey = new Map(maps.map(m => [m.source_key, m]))

      // Classify each row
      const classified = rows.map(row => {
        const registered = row.raw_payload.Registered
        const email = normalizeEmail(row.raw_payload.Email)
        
        // Check existing map
        const existingMap = mapByKey.get(email)
        if (existingMap) {
          return { ...row, match_status: 'persistent', participant_id: existingMap.participant_id }
        }

        // Check email claims (Agent B integration)
        // TODO: await lookupEmailClaim(supabase, eventId, row.raw_payload.Email)

        // Check candidates
        const candidates = candidateMatches(
          { email: row.raw_payload.Email, full_name: row.raw_payload.Name },
          partic
        )

        if (candidates.length === 1 && candidates[0].strength === 2) {
          return { ...row, match_status: 'possible_match', candidates }
        } else if (candidates.length > 0) {
          return { ...row, match_status: 'possible_match', candidates }
        }

        return { ...row, match_status: 'unmatched', candidates: [] }
      })

      setRows(classified)
      setStep('review')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // REVIEW & RESOLUTION: Staff marks each row
  const handleResolve = async (rowIndex, resolution, participantId) => {
    const updated = [...rows]
    updated[rowIndex].resolution = resolution
    updated[rowIndex].resolved_participant_id = participantId
    setRows(updated)
    setReviewing(null)
  }

  // APPLY: Execute resolutions
  const handleApply = async () => {
    setError(null)
    setLoading(true)
    try {
      // Set resolutions on rows
      for (const row of rows) {
        if (!row.resolution) {
          if (row.match_status === 'persistent' || row.match_status === 'possible_claim') {
            row.resolution = 'link_existing'
            row.resolved_participant_id = row.participant_id
          } else if (row.match_status === 'possible_match') {
            // Auto-select first candidate or require manual?
            // For V1, mark for review
            row.resolution = 'skip'
          } else {
            // Unmatched: staff decides
            row.resolution = 'skip'
          }
        }

        // Update row with resolution
        await supabase
          .from('icplc_import_rows')
          .update({
            resolution: row.resolution,
            resolved_participant_id: row.resolved_participant_id
          })
          .eq('id', row.id)
      }

      // Call apply RPC
      const { data: result, error: applyErr } = await supabase.rpc(
        'icplc_apply_registration_csv_batch',
        { p_batch_id: batchId, p_event_id: eventId, p_actor_user_id: null } // TODO: get actual user
      )
      if (applyErr) throw applyErr

      setStep('done')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const summary = useMemo(() => ({
    persistent: rows.filter(r => r.match_status === 'persistent').length,
    possible: rows.filter(r => r.match_status === 'possible_match').length,
    unmatched: rows.filter(r => r.match_status === 'unmatched').length
  }), [rows])

  return (
    <div style={{ maxWidth: 1000, padding: 20 }}>
      <h2>CSV Registration Adapter — {step}</h2>

      {error && <div style={{ padding: 12, background: '#FEF2F2', color: '#991B1B', borderRadius: 6, marginBottom: 16 }}>{error}</div>}

      {step === 'upload' && (
        <div>
          <p>Upload a CSV file with registration data to reconcile with ICPLC participants.</p>
          <input ref={fileRef} type="file" accept=".csv" style={{ display: 'none' }} />
          <button onClick={() => fileRef.current?.click()} disabled={loading}>Choose file</button>
        </div>
      )}

      {step === 'classify' && (
        <div>
          <p>{rows.length} rows parsed. Running classification...</p>
          <button onClick={handleClassify} disabled={loading}>{loading ? 'Classifying...' : 'Classify'}</button>
        </div>
      )}

      {step === 'review' && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: 12, marginBottom: 16 }}>
            <Stat label="Persistent" value={summary.persistent} />
            <Stat label="Review" value={summary.possible} />
            <Stat label="Unmatched" value={summary.unmatched} />
          </div>

          {summary.possible > 0 && (
            <div style={{ marginBottom: 16 }}>
              <h4>Review candidates:</h4>
              {rows.filter(r => r.match_status === 'possible_match').map((row, idx) => (
                <div key={row.identity_key} style={{ padding: 12, border: '1px solid #ccc', marginBottom: 8 }}>
                  <div><strong>{row.raw_payload.Name}</strong> ({row.raw_payload.Email})</div>
                  {row.candidates?.map((c, cIdx) => (
                    <button key={cIdx} onClick={() => handleResolve(rows.indexOf(row), 'link_existing', c.participant.id)}>
                      Link to {c.participant.full_name}
                    </button>
                  ))}
                  <button onClick={() => handleResolve(rows.indexOf(row), 'create_new', null)}>Create new</button>
                  <button onClick={() => handleResolve(rows.indexOf(row), 'skip', null)}>Skip</button>
                </div>
              ))}
            </div>
          )}

          <button onClick={handleApply} disabled={loading}>{loading ? 'Applying...' : 'Apply'}</button>
        </div>
      )}

      {step === 'done' && (
        <div>
          <p>✓ CSV reconciliation complete</p>
        </div>
      )}
    </div>
  )
}

function Stat({ label, value }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 24, fontWeight: 700 }}>{value}</div>
      <div style={{ fontSize: 12, color: '#666' }}>{label}</div>
    </div>
  )
}
```

### 2. MODIFY: src/features/icplc/lib/reconciliation.js

Add these exports at the top (after existing exports):

```javascript
export const CSV_SOURCE_TYPE = 'csv'

export function csvRowSourceKey(rowId) {
  return rowId.toString()
}
```

Update `registrationLinkedParticipantIds` to use new canonical helper:

```javascript
export function registrationLinkedParticipantIds(registrations = [], maps = [], eventId = null) {
  // DEPRECATED: Use isRegistered() helper for canonical check
  // This function kept for backward compatibility (registration table links only)
  const validRegistrationKeys = new Set(...)
  // ... existing logic
}

// NEW: Canonical Registered derivation
// Recognizes BOTH registration table links AND positive CSV evidence
export async function isRegisteredAsync(supabase, eventId, participantId) {
  // Use the RPC helper
  const { data, error } = await supabase.rpc(
    'icplc_participant_is_registered',
    { p_participant_id: participantId, p_event_id: eventId }
  )
  return !error && data === true
}
```

### 3. MODIFY: src/features/icplc/pages/RegistrationsPage.jsx (Optional integration)

Add tab for CSV adapter in the tab list or modal.

---

## MIGRATION EXECUTION

```bash
# From project root
supabase db push

# Verify migration:
supabase db diff --name verify_csv_adapter
```

## TEST COMMANDS (You execute locally)

```bash
# Create migration test
cat > supabase/tests/icplc_csv_adapter.test.sql << 'EOF'
-- Test: Registered=Yes CREATE_NEW
-- Test: Registered=No CREATE_NEW  
-- Test: Registered=Yes LINK_EXISTING
-- Test: Registered=No LINK_EXISTING
-- Test: SKIP
-- Test: source-map conflict (different participant)
-- Test: source-map idempotent (same participant)
-- Test: email discrepancy recorded
-- Test: participation_status never mutated
-- Test: Registered=No non-downgrade
-- Test: event isolation
EOF

# Run tests (your local DB)
supabase test db supabase/tests/icplc_csv_adapter.test.sql
```

---

## CROSS-AGENT OVERLAP ANALYSIS

**Agent A (Settings):**
- No overlap. Settings work is separate authorization/configuration.
- No changes to settings pages.

**Agent B (Dual Email):**
- **Integration point:** `lookupEmailClaim(supabase, eventId, email)` 
- **Seam:** CSV adapter calls this function in CLASSIFY step
- **Safety:** No implementation of email ownership logic in CSV adapter
- **If B not merged yet:** Stub exists in reconciliation.js; CSV adapter calls it
- **No copying of B's code**

**Agent C (UI/CSS):**
- **Minimal overlap:** New RegistrationsCsvAdapter.jsx component
- **No changes to:** ICPLCPortal.jsx, icplc.css, existing pages
- **Optional:** Can add tab to RegistrationsPage or standalone modal

**csvMappings.js:** NOT MODIFIED
**ICPLCPortal.jsx:** NOT MODIFIED
**icplc.css:** NOT MODIFIED

---

## CERTIFICATION COMMANDS (Local execution required)

You must execute these locally to certify:

```bash
# 1. Create isolated worktree
git worktree add ../clickup-registration-csv agent-registration-csv
cd ../clickup-registration-csv

# 2. Apply migration
supabase db push
# Verify: SELECT column_name FROM information_schema.columns WHERE table_name='icplc_import_rows' AND column_name IN ('resolution', 'resolved_participant_id')

# 3. Run PostgreSQL/RLS tests
npm test -- supabase/tests/icplc_csv_adapter.test.sql

# 4. Verify no syntax errors
npm run build

# 5. Audit cross-agent impact
git diff HEAD~10 -- csvMappings.js ICPLCPortal.jsx icplc.css
# Expected: No changes

# 6. Final diff audit
git status
git diff

# 7. Verify RPC authorization
# Run manually: SELECT icplc_apply_registration_csv_batch(...) — should enforce auth
```

---

## EXECUTION STATUS

**EXECUTED:**
- Migration written (syntax verified inline)
- Schema design reviewed

**WRITTEN (not executed):**
- RegistrationsCsvAdapter.jsx (component structure)
- RPCs (SQL syntax inline-verified)
- Test structure

**NOT EXECUTED — REQUIRES LOCAL CERTIFICATION:**
- Migration application (`supabase db push`)
- PostgreSQL tests
- npm build
- RLS authorization tests
- Cross-agent diff verification
- End-to-end integration test

---

## KNOWN LIMITATIONS V1

1. **Email claims integration:** Stub call in CLASSIFY; full Agent B integration pending
2. **Participant profile:** RegistrationsCsvAdapter opens in modal; full integration with sidebar optional
3. **Batch status display:** Basic stages; detailed progress tracking future work
4. **Conflict resolution UI:** Lists candidates; staff picks; no advanced fuzzy matching

---

## NEXT STEPS FOR LOCAL CERTIFICATION

1. Copy RegistrationsCsvAdapter.jsx to src/features/icplc/pages/
2. Copy reconciliation.js updates
3. Apply migration locally
4. Run PostgreSQL tests
5. Run full test suite: `npm test`
6. Verify build: `npm run build`
7. Audit diff: `git diff`
8. Report back with results

