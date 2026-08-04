# Architecture & Implementation Decisions

This document captures recent architecture decisions, new features, and deployment changes for BLW CAN NEXUS. For comprehensive decision catalog, see [docs/architecture/decision-catalog.md](docs/architecture/decision-catalog.md).

## New Features (August 2026)

### 1. Test Reports API Integration
**File:** `supabase/functions/test-reports-api/index.ts`

Exploratory integration with external leadership/attendance reporting system (`leaders.lwcanada.org`). This edge function probes the API to:
- Enumerate unit kinds and counts
- Test date-range filtering on service/checkin exports (`from/to` vs `startDate/endDate` params)
- Validate CSV export shape

**Status:** Proof-of-concept; not yet connected to UI or automations.

**Next:** Determine if date-range params are supported; then wire attendance sync into the main attendance/reporting pipeline.

### 2. Phone Number Field in Working List
**Migration:** `20270804000045_working_list_phone_number.sql`

Added `phone_number` text column to `working_list` table. This:
- Supports phone-based contact workflows (SMS reminders, call lists)
- Synced from Google Sheets via `working-list-sync` edge function
- Clears existing rows on migration (user re-imports from Sheets)

**Reasoning:** Ministry event coordination often requires phone contact; previously this data was discarded during sync.

**Related functions:**
- `working-list-sync` edge function now maps `phone_number`, `phoneNumber`, or `phone` from incoming payload
- Apps Script `appScript.gs` includes phone in data export

### 3. Registration Data Gap-Fill Pattern
**Migrations:** 
- `20270804000043_fix_public_registration_rpc_gap_fill.sql` — Primary + gap-fill query
- `20270804000044_fix_public_rpc_include_manual_confirmations.sql` — Manual confirmation support

The `get_public_registration_data(token)` RPC now:
- Queries `working_list` as primary source (everyone expected to attend)
- Gap-fills from `registrations` table for people not on working list (manually added via registration form)
- Honors manual confirmations stored in `registration_config.confirmations` JSONB blob (format: `{ "email@x.com": { "inState": true } }`)
- Matches against `event_payments` for paid-in-full confirmation

**Why:** Working list (from Google Sheets) is the source-of-truth for who is expected; registrations table catches anyone who signed up outside the main roster. Manual confirmations allow quick approval without full payment processing.

**Status columns:**
- `not_registered` — on working list, no registration entry
- `registered_outstanding` — registered but unpaid or not manually confirmed
- `confirmed` — paid in full OR manually confirmed

---

## Architecture Patterns

### Registration Data Flow
```
Google Sheets (working_list) → working-list-sync → working_list table
           ↓
    Registration Form → registrations table
           ↓
  get_public_registration_data(token) RPC
           ↓
  RegistrationPublicPage (display) + RegistrationDataTab (internal)
```

**Multi-source pattern:** Working list + registrations + manual confirmations + payments, all deduplicated by email.

### Edge Function: working-list-sync
**Endpoint:** `POST /functions/v1/working-list-sync`  
**Auth:** Bearer token (`REGISTRATION_SYNC_API_KEY`)  
**Payload:**
```json
{
  "members": [
    {
      "email": "user@example.com",
      "full_name": "Jane Doe",
      "phone_number": "+1-555-0123",
      "subgroup": "Young Adults",
      "fellowship": "Fellowship Name"
    }
  ]
}
```

**Behavior:**
- Upserts rows on `email` conflict
- Deduplicates incoming data (set-based)
- Returns count of upserted rows
- Called from Apps Script after Google Sheets clean/export

---

## Setup & Deployment

### New Edge Functions
Deploy after migrations:
```bash
supabase functions deploy test-reports-api
supabase functions deploy working-list-sync
```

### Required Secrets
| Secret | Function | Purpose |
| --- | --- | --- |
| `REPORTS_API_TOKEN` | `test-reports-api` | Bearer token for leaders.lwcanada.org API calls |
| `REGISTRATION_SYNC_API_KEY` | `working-list-sync` | Auth token for Google Sheets sync requests |

### Migration Order (August updates)
Apply these in order after your current migration:
1. `20270804000043_fix_public_registration_rpc_gap_fill.sql`
2. `20270804000044_fix_public_rpc_include_manual_confirmations.sql`
3. `20270804000045_working_list_phone_number.sql`

After applying migration 45, users must re-sync from Google Sheets (all working_list rows are cleared).

### Apps Script Updates
The `appScript.gs` now includes:
- Phone number in export payload (`phone_number`, `phoneNumber`, or `phone` field names supported)
- Menu option: "📋 Sync Working List to Nexus"

To use:
1. Deploy edge function `working-list-sync`
2. Set `NEXUS_API_KEY` in Apps Script project settings
3. Run "Sync Working List to Nexus" from Custom menu

---

## Related Features (Pre-existing)

### Registration System
- **File:** `src/pages/events/RegistrationPublicPage.jsx`
- **DB:** `registrations`, `event_payments`, `working_list`, `registration_config`
- **Public page:** Public registration form with RSVP tracking
- **Internal tabs:** RegistrationDataTab (with gap-fill query), RegistrationPaymentsTab, RoomAssignmentTab

### Attendance Tracking
- **File:** `src/features/meetings/components/StatsCards.jsx`
- **DB:** `calendar_events`, meeting attendance records
- **External integration:** Test Reports API (pending)

---

## Known Gaps

- **test-reports-api:** Not yet wired to UI or automations. Need to:
  - Determine final API date-range parameter names
  - Build sync function to pull checkins into attendance table
  - Add UI for manual sync trigger or cron schedule

- **Phone notifications:** Phone field exists, but SMS/call workflows not yet implemented.

---

## See Also

- [docs/architecture/decision-catalog.md](docs/architecture/decision-catalog.md) — Full archive of 35+ decisions
- [docs/features/registration-ecosystem.md](docs/features/registration-ecosystem.md) — Detailed registration feature docs
- [CLAUDE.md](CLAUDE.md) — Project conventions, tech stack, RLS patterns
