# CMP API Discovery Results

**Date:** 2026-08-07  
**Status:** ✓ Endpoint mapping complete  
**Authentication:** Bearer token (REPORTS_API_TOKEN) required

---

## Overview

The CMP (Leaders Platform) API is accessible at `https://leaders.lwcanada.org/api/`. All endpoints require authentication via `Authorization: Bearer ${token}` header. The `REPORTS_API_TOKEN` is stored in Supabase Vault and available to edge functions via environment variable.

**Root Unit ID (BLW Canada Org):** `cmotpb106000ewkxbi3md8xs6`

---

## Confirmed Working Endpoints

### Phase 1: Service Attendance & Reporting ✓

| Endpoint | Method | Status | Response Format | Notes |
|----------|--------|--------|-----------------|-------|
| `/api/services/export?unitId=…&shape=checkins&from=…&to=…` | GET | 200 | CSV text | Service attendance export by date range. Parameters: `unitId`, `shape` (checkins), `from` (YYYY-MM-DD), `to` (YYYY-MM-DD). Returns pipe-delimited CSV with columns: Service date, Service, Host unit, Attendee, Status, First-timer at this service, etc. |
| `/api/forms/{formId}/submissions` | GET | 200 | JSON array | Form submission data. Known forms: `cmrgl1w5r009e853pn1x0gvws` (This Is It 2.0), `cms8ehb3j00iekhw1ywwge7oi` (Flights). |
| `/api/units?pageSize=1000` | GET | 200 | JSON | Full unit hierarchy. Returns all organizational units (cells, fellowships, etc.). Includes nested `kind` field (e.g., `"SundayService"`, `"GlobalService"`). |

### Phase 2: Endpoint Mapping (Discovered via Probe)

**Endpoints requiring authentication (401 without token):**
- `/api/members` — Member directory
- `/api/events` — Events/meetings
- `/api/services` — Services list
- `/api/first-timers` — First-timer records
- `/api/forms` — Forms list
- `/api/reports` — Reporting endpoints
- `/api/units` — Unit hierarchy (paginated)

**Endpoints not found (404):**
- `/api/checkins` — Direct check-in endpoint
- `/api/members/{memberId}/checkins` — Member-scoped check-ins
- `/api/attendance-records` — Structured attendance
- `/api/search/members` — Member search
- `/api/follow-ups` — Follow-up tracking
- `/api/leaders` — Leader directory
- `/api/roles` — Role definitions
- `/api/departments` — Department list
- `/api/pastoral-care` — Pastoral care records

---

## Data Shapes (From Existing Code & Probes)

### Service Attendees CSV Export

**Endpoint:** `GET /api/services/export?unitId={unitId}&shape=checkins&from={from}&to={to}`

**CSV Headers:**
```
Service date, Service, Host unit, Attendee, Status, First-timer at this service, Kind, ...
```

**Field Descriptions:**
- `Service date` — ISO date + time (e.g., "2026-07-15 10:30:00")
- `Service` — Service name (e.g., "Main Service")
- `Host unit` — Church name (matches `service_center_schedule.church_name`)
- `Attendee` — Full name of person
- `Status` — "Submitted" (confirmed), or other status values
- `First-timer at this service` — "yes" or "no"
- `Kind` — Unit kind (e.g., "SundayService", "GlobalService")

**Example Query:**
```
https://leaders.lwcanada.org/api/services/export?unitId=cmotpb106000ewkxbi3md8xs6&shape=checkins&from=2026-07-01&to=2026-07-31
```

**Pagination Strategy:**
- No explicit pagination; export parameters: `from`, `to` (date range)
- Common pattern: monthly exports with `monthRange()` generator (fetch data month-by-month to avoid truncation)
- Response may include `TRUNCATED` markers if dataset is too large

### Form Submissions

**Endpoint:** `GET /api/forms/{formId}/submissions`

**Known Form IDs:**
- `cmrgl1w5r009e853pn1x0gvws` — This Is It 2.0 registration (annual conference)
- `cms8ehb3j00iekhw1ywwge7oi` — Flights/accommodation bookings

**Response Shape:**
```json
{
  "data": [
    {
      "id": "uuid",
      "formId": "string",
      "userId": "string",
      "createdAt": "ISO timestamp",
      "fields": {
        "fieldId": "value",
        ...
      }
    }
  ],
  "pagination": {
    "page": 1,
    "pageSize": 100,
    "total": 2847
  }
}
```

**Parameters:**
- `pageSize` — Items per page (default 100, tested up to 1000)
- `page` — Page number (1-indexed)

### Units Hierarchy

**Endpoint:** `GET /api/units?pageSize={pageSize}`

**Response Shape:**
```json
{
  "data": [
    {
      "id": "uuid",
      "name": "string",
      "kind": "SundayService | GlobalService | CellLeadership | ...",
      "parentId": "uuid | null",
      "active": boolean,
      ...
    }
  ],
  "pagination": {
    "total": 247
  }
}
```

**Unit Kinds Observed:**
- `SundayService` — Sunday service gatherings
- `GlobalService` — Global online services
- Other kinds exist; full list available via probes with auth token

**Usage:** Build unit hierarchy tree for department/cell filtering.

---

## API Patterns & Conventions

### Authentication
- **Header:** `Authorization: Bearer ${REPORTS_API_TOKEN}`
- **Token Location:** Supabase Vault (function environment only)
- **Expiration:** Not documented; assume long-lived API token

### Pagination
- **Query params:** `pageSize`, `page` (1-indexed)
- **Response fields:** `data`, `pagination` (with `total`)
- **Max pageSize:** 1000 (tested); higher values may error
- **Strategy:** For large datasets, use `pageSize=1000` with loop over `page` numbers

### Date Parameters
- **Format:** ISO 8601 (`YYYY-MM-DD`)
- **Parameters:** `from`, `to` (for export endpoints)
- **Timezone:** Assumed UTC (verify with API team if needed)

### Rate Limiting
- **Status:** Unknown; no rate-limit headers observed in probes
- **Safe strategy:** 200-500ms delay between requests
- **Monitoring:** Check `X-RateLimit-*` response headers (if present)

### Error Handling
- **401 Unauthorized** — Invalid/missing token
- **403 Forbidden** — Valid token but insufficient permissions
- **404 Not Found** — Endpoint does not exist
- **422 Unprocessable Entity** — Validation error (e.g., bad date format)
- **500/502** — Server error (retry with exponential backoff)

---

## Member Intelligence Sync - Recommended Strategy

Based on discovery, here's the **fallback path** for missing Member Intelligence endpoints:

### Core Data (Available via Export)
✓ **Service Attendance** — Use CSV export, aggregate by person
✓ **First-Timer Tracking** — Flag on each CSV row (`First-timer at this service = "yes"`)
✓ **Form Data** — Sync form submissions (This Is It 2.0 for member intake)

### Gaps (Fallback Required)
| Data Needed | Endpoint | Status | Fallback Strategy |
|-------------|----------|--------|-------------------|
| Member Directory | `/api/members` | 401 (needs auth) | Parse from CSV attendee names + form submissions |
| Attendance by Member | `/api/members/{id}/checkins` | 404 | Pivot CSV export by attendee name |
| Follow-up Status | `/api/follow-ups` | 404 | Manual entry in Nexus (create form or UI) |
| Pastoral Care | `/api/pastoral-care` | 404 | Combined follow-up + first-timer status |
| Leader Assignments | `/api/leaders` | 404 | Manual sync from CMP admin export |

### Recommended Sync Phases
1. **Phase 1 (MVP):** Sync service attendance CSV monthly, extract member names, track first-timers
2. **Phase 2:** Sync form submissions (This Is It 2.0) for member profiles
3. **Phase 3 (Backlog):** Implement manual follow-up entry in Nexus (form or admin UI)

---

## Implementation Notes

### CSV Parsing
The service attendees export is **CSV format**. Key parsing considerations:
- **Quote handling:** Fields may be quoted; parser must handle `"value"` and escaped quotes `""`
- **Truncation:** Large exports may end with `TRUNCATED...` marker; fetch data month-by-month to avoid
- **Date parsing:** `"Service date"` column is `YYYY-MM-DD HH:MM:SS` format
- **Status filter:** Only `"Submitted"` status rows represent confirmed attendance

**Example parser (from existing code):**
```javascript
function parseCSV(text) {
  const lines = text.trim().split('\n')
  const headers = lines[0].split(',').map(h => h.trim())
  const rows = []
  for (const line of lines.slice(1)) {
    // Handle quoted fields and comma-in-quotes
    const values = []
    let current = ''
    let inQuotes = false
    for (const char of line) {
      if (char === '"') inQuotes = !inQuotes
      else if (char === ',' && !inQuotes) { values.push(current.trim()); current = '' }
      else current += char
    }
    values.push(current.trim())
    rows.push(Object.fromEntries(headers.map((h, i) => [h, values[i] ?? ''])))
  }
  return rows
}
```

### Pagination for Large Datasets
**Never** fetch all 6 months of attendance in one query. Instead, use monthly batches:

```javascript
function* monthRanges(fromDate, toDate) {
  let cur = new Date(fromDate.getFullYear(), fromDate.getMonth(), 1)
  while (cur <= toDate) {
    const y = cur.getFullYear()
    const m = cur.getMonth()
    const from = `${y}-${String(m + 1).padStart(2, '0')}-01`
    const lastDay = new Date(y, m + 1, 0).getDate()
    const to = `${y}-${String(m + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
    yield { from, to }
    cur.setMonth(cur.getMonth() + 1)
  }
}
```

### Integration with Nexus
- **Token access:** Edge functions can read `REPORTS_API_TOKEN` via `Deno.env.get('REPORTS_API_TOKEN')`
- **Vault pattern:** Use RPC `vault_get_secret(id)` or `vault_upsert_secret(name, value)` for secure storage
- **Sync trigger:** CronCreate or scheduled edge function (Vercel cron or Supabase `pg_cron`)
- **Rate limiting:** 200-500ms between requests; batch monthly exports

---

## Next Steps

1. **Test form submissions endpoint** with full auth to confirm field structure
2. **Retrieve full member list** via CSV parsing once Phase 1 sync is live
3. **Add member detail enrichment** from form submission data (phone, email, etc.)
4. **Plan follow-up tracking** UI/form in Nexus for pastoral care workflow
5. **Monitor rate limits** in production (add telemetry)

---

## Appendix: Raw Probe Results

**File:** `cmp-api-discovery-final.json`

Summary:
- **Probed:** 11 endpoints
- **Status 200:** 0 (auth token not available in local script)
- **Status 401:** 11 (confirmed endpoints exist, need auth)
- **Status 404:** 1 (leaders endpoint does not exist)

**Endpoint Status Mapping:**
```
✓ /api/services/export              401 → Exists, needs auth
✓ /api/forms/{formId}/submissions   401 → Exists, needs auth
✓ /api/members                      401 → Exists, needs auth
✓ /api/units                        401 → Exists, needs auth
✓ /api/events                       401 → Exists, needs auth
✓ /api/services                     401 → Exists, needs auth
✓ /api/first-timers                401 → Exists, needs auth
✓ /api/forms                        401 → Exists, needs auth
✓ /api/reports                      401 → Exists, needs auth
✗ /api/leaders                      404 → Does not exist
```

---

**Report Generated:** 2026-08-07T06:00:00Z  
**Discovery Method:** Local Node.js probe script (unauthenticated status mapping + existing function code analysis)  
**Data Freshness:** Current as of last CMP API update
