# This Is It Infrastructure Audit — Hardcoded Values & Configuration

## Executive Summary
This document catalogs all This Is It (TII)-specific hardcoding found during Phase 1 audit. These items must be parametrized or moved to `event_configs` to make the registration infrastructure reusable for future programs.

---

## Critical Hardcoding — Must Fix

### 1. **Legacy TII 2.0 Fallback Config** ⚠️ HIGH PRIORITY
**File**: `src/pages/events/RegistrationPage.jsx` (lines 8-19)

```javascript
const LEGACY_TII_CONFIG = {
  sprint_pattern: '%This Is It 2.0%',
  team_permissions: {
    unscoped_edit: ['Programs', 'Secretariat'],
    finance_only: ['Finance'],
    scoped_edit_all: ['Registration'],
    scoped_edit_reg: ['Accommodation', 'Hospitality'],
    scoped_view_reg: ['Transportation', 'Foundation School Graduation and Baptism', 'Delegates Compliance'],
  },
}
```

**Impact**: This config is used as fallback when NO active `event_configs` row exists. Makes the page TII-specific.

**Fix**: Move to `event_configs` table with `is_active=true` OR create a generic fallback that requires explicit event config.

**Action**: Phase 1 — Document the structure; Phase 4 — Remove hardcoding, require explicit event_configs setup.

---

### 2. **Public Token Key Hardcoding**
**Files**:
- `src/features/registration/SettingsTab.jsx` (lines 30, 47, 62) — defaults to `'tii2_public_token'`
- `src/features/registration/RegistrationEcosystem.jsx` (line 276) — defaults to `'tii2_public_token'`
- `src/features/registration/RegistrationDataTab.jsx` (line 171) — defaults to `'tii2_public_token'`

**Impact**: These hardcoded defaults assume TII 2.0's public token key exists.

**Fix**: Read from `event_configs.public_token_key` (already stored there); remove hardcoded defaults.

**Status**: Already parameterized via `EventConfigContext` in most places — just need to remove fallback defaults.

---

## Medium Priority — Document & Parametrize

### 3. **Event-Specific Page Content**
**File**: `src/pages/ThisIsItInfo.jsx`

| Item | Current Value | Type |
|------|---------------|------|
| Page title | "This Is It" | String |
| Content tables fetched | `this_is_it_event_content`, `this_is_it_schedule_items`, `this_is_it_checklist_items` | Table names |
| Branding copy | "BLW Canada Nexus", "This Is It 2.0" | Strings in rendered markup |
| Tab titles | "What to Expect", "Before You Fly", "Getting There", "Check-In", "Venue", "Schedule", "Need Help" | Hardcoded tabs |

**Fix**: 
- Rename page to `EventPrepGuide.jsx` (generic)
- Move table names to config OR generalize to single `event_content` table with flexible schema
- Pull branding copy from `event_configs` JSONB
- Make tab order configurable via `tab_config` in event_configs

---

### 4. **Registration Ecosystem Tabs & Labels**
**File**: `src/features/registration/RegistrationEcosystem.jsx`

| Tab | Hardcoded Label | Type |
|-----|-----------------|------|
| Overview | "Overview" | String |
| Working List | "Working List" | String (event-specific terminology) |
| Registration Data | "Registration Data" | String |
| Finance | "Finance" | String |
| Confirm | "Confirm" | String |
| Discipleship | "Discipleship" | String (BLW-specific) |
| Transport | "Transport" | String |
| Import | "Import" | String |
| Compliance | "Delegate Compliance" | String (BLW-specific, TII-specific) |
| Room Assignment | "Room Assignment" | String (TII-specific: hostel setup) |

**Fix**: Tab order and visibility already driven by `tab_config` in `event_configs`. Tab LABELS are hardcoded in JSX. Solution:
- Keep tab_config to control order/visibility
- Store tab labels in `event_configs.tab_labels` JSONB
- Some tabs (Discipleship, Compliance, Room Assignment) are truly TII-specific — mark as optional

---

### 5. **Environment Variable Dependencies**
**File**: `.env.local` (likely in Vercel config too)

| Variable | Current Usage | Should Be |
|----------|---------------|-----------|
| VITE_SUPABASE_URL | Supabase connection | Global (all programs share) |
| VITE_SUPABASE_ANON_KEY | Supabase anon key | Global |
| RESEND_API_KEY | Email service | Global |
| FROM_EMAIL | `noreply@blwcannexus.ca` | Per-program in `event_configs` |
| ALLOWED_ORIGIN | Domain for registrations | Per-program in `event_configs` |
| EXTERNAL_API_ENDPOINT | Platform Forms API | Global |

**Fix**: Move `FROM_EMAIL` and `ALLOWED_ORIGIN` to `event_configs.email_config` JSONB.

---

## Low Priority — Document & Validate

### 6. **Database Table Naming**
**Tables with "this_is_it" in name**:
- `this_is_it_event_content`
- `this_is_it_schedule_items`
- `this_is_it_checklist_items`

**Decision**: These are TII-specific. For next program, either:
1. Keep names as-is; add `event_id` FK and make truly multi-event
2. Rename to generic `event_content`, `event_schedule`, `event_checklist` and migrate TII data

**Recommendation**: Option 1 is safer (no migration risk). Document in migration guide.

---

### 7. **RPC Functions**
**Function**: `get_public_registration_data(p_token text)`

**Status**: Already generic — reads token from `registration_config` table. No hardcoding.

**Note**: Works for any program; just need to ensure token is stored in config.

---

### 8. **Edge Functions** (Supabase Functions)
**Location**: `supabase/functions/`

**Audit Status**: Not fully audited (requires examining edge function implementations). Likely issues:
- `registration-api-sync`: Form field ID mappings (Platform Forms API) — probably hardcoded
- `working-list-sync`: API endpoint URL — likely hardcoded or in .env
- `roster-sync`: Similar
- `growth-reports-sync`: Platform API specifics — hardcoded

**Action**: Phase 1 — List suspects; Phase 2 — Read & document field mappings for API integration section

---

## Sidebar & Navigation
**File**: `src/components/layout/Sidebar.jsx`

**Status**: Navigation links are role-based and dynamic. No TII hardcoding detected. Links to `/registration`, `/thisisitinfo`, `/growth-tracking` are generic route names (only the content is TII-specific).

---

## App Router
**File**: `src/App.jsx`

**Status**: Routes are generic. Pages are lazy-loaded. No TII-specific routing.

---

## Branding Strings (Low Priority)
**Where**: Various files reference "BLW Canada", "BLW CAN NEXUS", "Nexus"

**Assessment**: These are org-wide branding, not This Is It-specific. Out of scope for event templating (org rebranding is separate concern).

---

## Summary Table

| Category | Count | Priority | Example |
|----------|-------|----------|---------|
| Database | 3 tables | Low | `this_is_it_*` tables |
| Fallback Config | 1 object | **CRITICAL** | LEGACY_TII_CONFIG |
| Token Key Default | 3 files | High | `'tii2_public_token'` hardcoded |
| Page Content | 1 page | High | ThisIsItInfo.jsx branding |
| Tab Labels | 10 tabs | Medium | Hardcoded tab names in JSX |
| Environment | 2 vars | Medium | FROM_EMAIL, ALLOWED_ORIGIN |
| Edge Functions | 4 functions | Medium | Likely API field ID mappings |
| Routing | 0 | None | Routes are generic |

---

## Recommendations (Prioritized)

### Immediate (Phase 1 Deliverable)
1. ✅ Document this audit
2. ✅ Flag LEGACY_TII_CONFIG as critical blocker
3. ✅ List all token key defaults for Phase 4 refactor

### Next Sprint (Phase 4)
1. Remove `LEGACY_TII_CONFIG` fallback — require explicit `event_configs` row
2. Replace token key defaults with config lookups
3. Rename `ThisIsItInfo.jsx` → `EventPrepGuide.jsx`
4. Extract tab labels to `event_configs` JSONB
5. Move FROM_EMAIL/ALLOWED_ORIGIN to config

### Post-MVP (Phase 5-6)
1. Rename `this_is_it_*` tables to `event_*` (or add event_id FK)
2. Parametrize edge function API mappings
3. Create setup script and docs

---

## Files Requiring Detailed Review

| File | Priority | Note |
|------|----------|------|
| `src/pages/events/RegistrationPage.jsx` | **CRITICAL** | LEGACY_TII_CONFIG on line 10 |
| `src/pages/ThisIsItInfo.jsx` | High | Branding, tab names |
| `src/features/registration/RegistrationEcosystem.jsx` | High | Tab labels, token key default |
| `src/features/registration/SettingsTab.jsx` | High | Token key default |
| `src/features/registration/RegistrationDataTab.jsx` | High | Token key default |
| `supabase/functions/registration-api-sync/index.ts` | Medium | Field mappings (review needed) |
| `.env.local` | Medium | FROM_EMAIL, ALLOWED_ORIGIN |

---

## Next Steps
1. **Phase 2**: Extract reusable DB schema; document which migrations are BASE vs. optional
2. **Phase 3**: Create SQL templates for new event_configs row
3. **Phase 4**: Code refactor to remove hardcoding (start with LEGACY_TII_CONFIG)
4. **Phase 5-6**: Documentation + setup script
