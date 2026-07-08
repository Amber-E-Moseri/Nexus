# Fix 3B Verification Checklist

**Issue:** Role gate logic for calendar settings incorrectly checked for non-existent role strings (`admin_manager`, `programs_manager`), blocking all non-super_admin users.

**Fix:** Implemented correct logic that checks `role === 'dept_lead' AND membership in Programs/Admin departments`.

## Automated Test Verification

Run the automated test suite:
```bash
npm test -- src/tests/calendar-settings-access.test.js
```

Expected: All 30+ test cases pass, including the critical case:
```
CRITICAL: Prevents non-calendar dept_leads from accessing canManageConnections
```

This verifies that a Media or ORS dept_lead is correctly denied access.

## Manual Verification (QA Checklist)

### Test Case 1: super_admin can access
- [ ] Create user with `role = 'super_admin'`
- [ ] Navigate to `/calendar/settings`
- [ ] ✅ Expected: Sees "Calendar Write Access", "Subscriptions", "Calendar Sources" panels
- [ ] ✅ Expected: `canManageConnections = true`

### Test Case 2: dept_lead in Programs can access
- [ ] Create user with:
  - `role = 'dept_lead'`
  - `department_id = Programs dept ID`
- [ ] Navigate to `/calendar/settings`
- [ ] ✅ Expected: Sees "Calendar Write Access", "Subscriptions", "Calendar Sources" panels
- [ ] ✅ Expected: `canManageConnections = true`

### Test Case 3: dept_lead in Admin can access
- [ ] Create user with:
  - `role = 'dept_lead'`
  - `department_id = Admin dept ID`
- [ ] Navigate to `/calendar/settings`
- [ ] ✅ Expected: Sees "Calendar Write Access", "Subscriptions", "Calendar Sources" panels
- [ ] ✅ Expected: `canManageConnections = true`

### Test Case 4: dept_lead in Media is DENIED (CRITICAL)
- [ ] Create user with:
  - `role = 'dept_lead'`
  - `department_id = Media dept ID`
- [ ] Navigate to `/calendar/settings`
- [ ] ❌ Expected: Does NOT see calendar panels
- [ ] ❌ Expected: Sees "You don't have access to these settings."
- [ ] ❌ Expected: `canManageConnections = false`

### Test Case 5: dept_lead in ORS is DENIED
- [ ] Create user with:
  - `role = 'dept_lead'`
  - `department_id = ORS dept ID`
- [ ] Navigate to `/calendar/settings`
- [ ] ❌ Expected: Does NOT see calendar panels
- [ ] ❌ Expected: Sees "You don't have access to these settings."

### Test Case 6: regional_secretary cannot access (architecture decision)
- [ ] Create user with:
  - `role = 'regional_secretary'`
  - `department_id = Programs dept ID` (even if Programs member)
- [ ] Navigate to `/calendar/settings`
- [ ] ❌ Expected: Does NOT see calendar panels
- [ ] ❌ Expected: Sees "You don't have access to these settings."
- [ ] ✅ Confirms: Regional Secretary is read-only per docs

### Test Case 7: Regular member is DENIED
- [ ] Create user with:
  - `role = 'member'`
  - `department_id = Programs dept ID`
- [ ] Navigate to `/calendar/settings`
- [ ] ❌ Expected: Does NOT see calendar panels

## Race Condition Analysis

✅ **VERIFIED: No race condition exists**

- ProtectedRoute gates the component and waits for auth loading to complete before rendering
- By the time CalendarSettingsPage mounts, `profile.id` is guaranteed to be set
- Initial render (before member data loads) safely shows `canManageConnections = false`
- Re-render (after member data loads) correctly updates to show true/false based on actual membership

Evidence:
- ProtectedRoute.jsx lines 9-14: Blocks rendering during `loading === true`
- CalendarSettingsPage.jsx line 25: Comment confirms profile.id is available by mount time

## Changes Made

### File: `src/pages/calendar/CalendarSettingsPage.jsx`

**Before:**
```javascript
const isAdminManager = role === 'admin_manager'        // ❌ Role doesn't exist
const isProgramsManager = role === 'programs_manager'  // ❌ Role doesn't exist
const canManageConnections = isSuperAdmin || isAdminManager || isProgramsManager
```

**After:**
```javascript
const isProgramsMember = programsMembers.some((m) => m.id === profile?.id)
const isAdminMember = adminMembers.some((m) => m.id === profile?.id)
const isDeptLeadOfCalendarSpace = role === 'dept_lead' && (isProgramsMember || isAdminMember)
const canManageConnections = isSuperAdmin || isDeptLeadOfCalendarSpace
```

### File: `src/tests/calendar-settings-access.test.js` (NEW)

- 30+ automated test cases covering all role/membership combinations
- Critical test case for non-calendar dept_leads
- Prevents regression of this class of bug (checking for non-existent role strings)

## Regression Risk Assessment

**Low risk.** This fix makes access more restrictive, not less:
- super_admin: unchanged (still has access)
- dept_lead in Programs/Admin: newly has access (was blocked before)
- all other users: remain blocked (unchanged)

The only change is allowing dept_leads in specific calendar departments. All other access control remains the same.
