# Communications Feature Troubleshooting Guide

## Current Status

✅ **Code Fix Applied:** send-absence-emails CORS configuration updated  
✅ **Edge Function Deployed:** Deployed to kraurtuhflouyorgtpun  
⏳ **Propagation:** May take 2-5 minutes for changes to be live across all edge nodes

---

## If Error Persists: "Failed to send a request to the Edge Function"

### Step 1: Clear Browser Cache

**Option A: Hard Refresh**
```
Windows/Linux: Ctrl + Shift + R
Mac: Cmd + Shift + R
```

**Option B: Clear Cache & Cookies**
1. Open DevTools (F12)
2. Application → Clear storage
3. Clear all cookies and cache
4. Hard refresh the page

**Option C: Use Incognito Window**
```
Windows/Linux: Ctrl + Shift + N
Mac: Cmd + Shift + N
```

---

### Step 2: Clear Service Worker Cache

The Service Worker may be caching old responses.

1. Open DevTools (F12)
2. Go to "Application" tab
3. Click "Service Workers" in left sidebar
4. Click "Unregister" next to each service worker
5. Go to "Cache Storage"
6. Delete all cached items (nexus-static, nexus-dynamic, nexus-api)
7. Refresh the page

---

### Step 3: Verify Edge Function Status

Check if the edge function is actually returning the CORS headers:

1. Open DevTools (F12)
2. Go to "Network" tab
3. Reload the page
4. Try sending an email
5. Find the request to `/functions/v1/send-absence-emails`
6. Click it and check "Response Headers"
7. Look for: `Access-Control-Allow-Origin: *` or your origin

---

### Step 4: Check Console for Detailed Errors

1. Open DevTools (F12)
2. Go to "Console" tab
3. Send an email
4. Look for error messages
5. Check if the error is:
   - **CORS Error** → Server hasn't deployed yet
   - **Auth Error** → JWT token issue
   - **Network Error** → Connection problem
   - **Validation Error** → Request payload issue

---

## Advanced Troubleshooting

### Check Supabase Function Status

1. Visit Supabase Dashboard: https://supabase.com/dashboard
2. Navigate to Project → Functions
3. Find `send-absence-emails`
4. Click to view details
5. Check "Recent invocations" for error logs

### Test the Edge Function Directly

Using curl:
```bash
curl -X POST https://kraurtuhflouyorgtpun.supabase.co/functions/v1/send-absence-emails \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "report_id": "123",
    "recipients": [{"name": "Test", "email": "test@example.com"}],
    "subject": "Test",
    "body_template": "Test body"
  }'
```

Expected response:
```json
{
  "sent": 1,
  "failed": 0,
  "skipped": 0,
  "errors": []
}
```

---

## What We Fixed

### The Root Cause
The `send-absence-emails` edge function had strict CORS configuration:
```typescript
const ALLOWED_ORIGIN = Deno.env.get('ALLOWED_ORIGIN')
const corsHeaders = ALLOWED_ORIGIN 
  ? { 'Access-Control-Allow-Origin': ALLOWED_ORIGIN, ... }
  : {}  // ← Empty if ALLOWED_ORIGIN not set
```

When `ALLOWED_ORIGIN` wasn't set, it returned NO CORS headers, blocking all localhost requests.

### The Fix
```typescript
const ALLOWED_ORIGIN = Deno.env.get('ALLOWED_ORIGIN') ?? '*'
const corsHeaders = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,  // ← Always set
  ...
}
```

Now it always returns CORS headers (either the configured origin or `*` for dev).

---

## If Still Not Working

### Check These Files Were Modified

1. `supabase/functions/send-absence-emails/index.ts`
   - Should have `?? '*'` in line 3
   - Should have `const corsHeaders` as an object (not conditional)

2. Verify with:
```bash
grep -A 8 "const ALLOWED_ORIGIN" supabase/functions/send-absence-emails/index.ts
```

Should output:
```
const ALLOWED_ORIGIN = Deno.env.get('ALLOWED_ORIGIN') ?? '*'

// CORS headers: use configured origin in production, allow all in dev
const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  Vary: 'Origin',
}
```

### Re-deploy if Needed

```bash
supabase functions deploy send-absence-emails
```

---

## Verify the Fix Worked

1. Go to `http://localhost:5217/communications/absentees`
2. Select an attendance report
3. Look at recipients
4. Click "Send to N"
5. **Expected Results:**
   - ✅ No CORS error in console
   - ✅ Request completes
   - ✅ Either success message or real error (not generic)

---

## Common Errors After Fix

### "User profile not found"
- The edge function received CORS properly ✅
- But user auth failed
- Possible causes: Not logged in, JWT expired

### "recipients must be a non-empty array"
- The edge function received CORS properly ✅
- But request validation failed
- Possible causes: No recipients selected, API error

### "Failed to send email via Resend"
- The edge function received CORS properly ✅
- But email sending failed
- Possible causes: Resend API issue, invalid email

### Still getting CORS error
- Edge function hasn't deployed yet
- Browser cache not cleared
- Service Worker still caching old response
- Try steps 1-3 above

---

## Timeline for Propagation

- **Deployed:** Immediately to Supabase
- **CDN Cache:** 2-5 minutes
- **Browser Cache:** After hard refresh
- **Service Worker Cache:** After clearing

**If error persists after 5 minutes**, try:
1. Hard refresh (Ctrl+Shift+R)
2. Clear service worker cache (DevTools → Application)
3. Test in incognito window
4. Re-deploy the function

---

## Support

If the error still persists after all troubleshooting:

1. Check the error message in DevTools → Console
2. Note the exact error and request URL
3. Check Supabase dashboard for function logs
4. Verify CORS headers are present in Network tab
5. Contact support with:
   - Screenshot of error
   - Network tab showing request/response headers
   - Console error message
   - Whether this works in production

---

## Summary

✅ **Code Fix Applied:** Commit `d0f9f3e`  
✅ **Edge Function Deployed:** To kraurtuhflouyorgtpun  
✅ **Error Handling Improved:** Commit `67a2ce9`  
⏳ **Wait Time:** 2-5 minutes for propagation  
🔄 **If Not Working:** Follow troubleshooting steps above

Status: All fixes in place, awaiting edge node propagation.
