# Flock CRM → Nexus Integration Setup

## Overview
This document explains how to set up and configure the Flock CRM integration with Nexus for the Regional Secretary role.

**Status:** Integration complete and ready for configuration.

---

## Architecture

Flock CRM is integrated as a **restricted sidebar item** in Nexus that:
- ✅ Appears only to users with `regional_secretary` role
- ✅ Maintains Flock CRM's independent backend architecture
- ✅ Respects Nexus design system (colors, spacing, styling)
- ✅ Does not interfere with existing Nexus modules
- ✅ Embeds Flock via iframe for complete isolation

**Data Flow:**
```
Nexus Sidebar (Confidential Section)
    ↓
[Access Check: regional_secretary role?]
    ↓ YES
Flock CRM Page (FlockCRMPage)
    ↓
FlockCRMWrapper Component
    ↓
Flock CRM API (Google Apps Script)
    ↓
Flock CRM Backend (unchanged)
    ↓
Google Sheets (PEOPLE, INTERACTIONS, etc.)
```

---

## Files Added/Modified

### New Files Created:
1. **`src/components/flock/FlockCRMWrapper.jsx`**
   - Main integration component
   - Handles API connectivity checks
   - Manages loading/error states
   - Embeds Flock via iframe

2. **`src/components/flock/FlockCRMWrapper.css`**
   - Component-specific styling
   - Loading spinner animation
   - Error state styling
   - Respects Nexus design tokens

3. **`src/pages/flock/FlockCRMPage.jsx`**
   - Page-level component
   - Access control wrapper
   - Page header and layout

### Modified Files:
1. **`src/components/layout/Sidebar.jsx`**
   - Added Flock CRM nav item (conditional on `regional_secretary` role)
   - Added "Confidential" section header
   - Added Phone icon import
   - Added FLOCK_CRM_CONFIG import

2. **`src/lib/permissions.js`**
   - Added `FLOCK_CRM_CONFIG` export
   - Includes role check function

3. **`src/App.jsx`**
   - Added FlockCRMPage lazy import
   - Added `/flock-crm` route with role protection

4. **`.env.local`**
   - Added `VITE_FLOCK_CRM_ENABLED` (set to `false` by default)
   - Added `VITE_FLOCK_CRM_API_URL` placeholder

5. **`.env.example`**
   - Added same environment variables for reference

---

## Configuration Steps

### Step 1: Get Flock CRM Deployment URL
1. Go to your Flock CRM Google Apps Script project
2. Click **"Deploy" → "New Deployment"** (or manage existing)
3. Copy the deployment URL (looks like: `https://script.google.com/macros/d/{DEPLOYMENT_ID}/usercurrent/exec`)
4. Keep this URL safe—you'll need it next

### Step 2: Update Environment Variables
In `.env.local`:

```env
VITE_FLOCK_CRM_ENABLED=true
VITE_FLOCK_CRM_API_URL=https://script.google.com/macros/d/YOUR_DEPLOYMENT_ID/usercurrent/exec
```

Replace `YOUR_DEPLOYMENT_ID` with the actual ID from Step 1.

### Step 3: Verify User Role
Ensure the user who will access Flock CRM has the `regional_secretary` role in Nexus:

```sql
-- Check current role
SELECT user_id, role FROM user_roles 
WHERE user_email = 'regional.secretary@example.com';

-- If not set, update role
UPDATE user_roles 
SET role = 'regional_secretary' 
WHERE user_email = 'regional.secretary@example.com';
```

### Step 4: Test the Integration
1. **Start the Nexus dev server:**
   ```bash
   npm run dev
   ```

2. **Log in as Regional Secretary:**
   - Use the Regional Secretary's Nexus credentials
   - Should see "Flock CRM" item in sidebar (Confidential section)
   - Click to open Flock CRM in main content area

3. **Verify Access Control:**
   - Log in as a different role (pastor, dept_lead, etc.)
   - Should NOT see "Flock CRM" in sidebar
   - If you try to access `/flock-crm` directly, should see access denied message

4. **Check Browser Console:**
   - Should be no errors
   - API connectivity should be logged on load

### Step 5: Optional—Log Access (Audit Trail)
To track who accesses Flock CRM, add audit logging in `src/pages/flock/FlockCRMPage.jsx`:

```javascript
useEffect(() => {
  logFlockAccess(profile?.id, 'viewed')
}, [profile?.id])

async function logFlockAccess(userId, action) {
  await supabase
    .from('audit_log')
    .insert({
      user_id: userId,
      module: 'flock_crm',
      action: action,
      timestamp: new Date().toISOString(),
      scope: 'confidential'
    })
}
```

---

## UI Integration

### Sidebar Layout
When Flock CRM is enabled and user has access:

```
┌─────────────────────┐
│ NEXUS               │
├─────────────────────┤
│ ... other items ... │
├─────────────────────┤  ← Confidential section
│ ☎ Flock CRM         │  ← New item (Regional Sec only)
└─────────────────────┘
```

### Main Content Area
Displays Flock CRM in an iframe with:
- Header: "Flock CRM" title + subtitle
- Full-height iframe embedded below
- Seamless Nexus styling

---

## Troubleshooting

### "Flock CRM Unavailable" Error
**Cause:** API is unreachable or URL is incorrect.
- [ ] Verify `VITE_FLOCK_CRM_API_URL` is correct
- [ ] Check Google Apps Script is deployed
- [ ] Test URL directly in browser: `https://script.google.com/macros/d/{ID}/usercurrent/exec?action=quickStats`
- [ ] Check CORS headers on Google Apps Script

### "Access Denied" Message
**Cause:** User doesn't have `regional_secretary` role.
- [ ] Check user's role in Nexus database
- [ ] Update role if needed: `UPDATE user_roles SET role = 'regional_secretary' WHERE ...`

### Flock CRM Not Visible in Sidebar
**Cause:** Feature is disabled or user lacks permissions.
- [ ] Verify `VITE_FLOCK_CRM_ENABLED=true` in `.env.local`
- [ ] Check `VITE_FLOCK_CRM_API_URL` is set
- [ ] Reload browser (Ctrl+Shift+R to clear cache)
- [ ] Check browser console for errors

### Iframe Won't Load
**Cause:** Sandbox restrictions or CORS issues.
- [ ] Check iframe `sandbox` attributes in `FlockCRMWrapper.jsx`
- [ ] Verify Google Apps Script allows embedding
- [ ] Check browser console for iframe errors

---

## Security Notes

✅ **Access Control:** Role-based access verified both in sidebar and on route
✅ **Iframe Isolation:** Flock runs in restricted iframe sandbox
✅ **No Backend Changes:** Flock CRM code.gs remains completely untouched
✅ **Independent Data:** Flock data lives in separate Google Sheet, no Nexus DB access
✅ **Audit Ready:** Can add logging to audit_log table if needed

---

## Future Enhancements

Once integration is working:

1. **Dashboard Widget**
   - Show "due count" on Nexus dashboard
   - Quick action button to open Flock CRM

2. **Notifications Integration**
   - Integrate Flock's daily reminders with Nexus notifications

3. **Deeper Auth Integration**
   - Pass logged-in pastor name to Flock
   - Auto-fill some fields

4. **Mobile Responsive**
   - Optimize Flock view for mobile within Nexus

5. **Role Expansion**
   - Later allow Pastors limited Flock access

---

## Files Reference

| File | Purpose |
|------|---------|
| `src/components/flock/FlockCRMWrapper.jsx` | Main integration component |
| `src/components/flock/FlockCRMWrapper.css` | Styling |
| `src/pages/flock/FlockCRMPage.jsx` | Page wrapper |
| `src/lib/permissions.js` | Permission config |
| `src/components/layout/Sidebar.jsx` | Navigation item |
| `src/App.jsx` | Routing |
| `.env.local` | Local configuration |

---

## Support

**Issue?** Check the troubleshooting section above or review:
- Browser DevTools Console for errors
- Network tab for API connectivity
- React DevTools for component state

**Questions about Flock CRM itself?** See the Flock CRM documentation/README in the extracted zip.

---

## Deployment Checklist

Before going live:

- [ ] Flock CRM Google Apps Script deployed and working
- [ ] `VITE_FLOCK_CRM_ENABLED=true` in production environment
- [ ] `VITE_FLOCK_CRM_API_URL` set to correct deployment URL
- [ ] Regional Secretary user role configured
- [ ] Testing completed with Regional Secretary role
- [ ] Other roles tested for access denial
- [ ] No console errors
- [ ] Audit logging configured (optional)

---

**Integration Status: ✅ Complete and Ready for Configuration**
