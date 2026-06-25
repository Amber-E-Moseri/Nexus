# Phase 5: Security Hotfixes Guide

This document provides detailed instructions for implementing the three critical security fixes to existing code.

## Overview

Three vulnerabilities have been identified in the existing email system:

1. **Deterministic Unsubscribe Tokens** - SHA256 tokens can be forged if secret leaks
2. **Department Authorization Bypass** - dept_lead can email other departments  
3. **Campaign Status Not Validated** - Can re-send already-sent campaigns

---

## Fix #1: Replace Deterministic Tokens with Secure Random Tokens

### Affected Files
- `supabase/functions/send-communication-email/index.ts` (update email generation)
- `supabase/functions/handle-unsubscribe/index.ts` (complete rewrite)
- Database: `communication_unsubscribe_tokens` table (already created in Phase 1)

### Why This Matters
- Current implementation: `token = SHA256(email + UNSUBSCRIBE_SECRET)`
- **Vulnerability**: If `UNSUBSCRIBE_SECRET` leaks, attacker can forge tokens for any email
- **Solution**: Use random tokens stored in DB, marked as used/expired

### Changes Required

#### A. send-communication-email/index.ts

**Location**: Around line 148 (in `generateToken()` function used for unsubscribe links)

**REMOVE THIS**:
```typescript
async function generateToken(email: string): Promise<string> {
  const key = Deno.env.get('UNSUBSCRIBE_SECRET') ?? 'default'
  const data = new TextEncoder().encode(email + key)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return btoa(String.fromCharCode(...new Uint8Array(hash)))
    .replace(/[+/=]/g, '')
    .slice(0, 32)
}
```

**REPLACE WITH THIS**:
```typescript
async function generateUnsubscribeToken(email: string, supabase: ReturnType<typeof createClient>): Promise<string> {
  // Generate random token
  const randomBytes = crypto.getRandomValues(new Uint8Array(32))
  const token = btoa(String.fromCharCode(...randomBytes))
    .replace(/[+/=]/g, '')
    .slice(0, 32)

  // Insert into database (expires in 30 days)
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
  await supabase
    .from('communication_unsubscribe_tokens')
    .insert({
      email: email.toLowerCase(),
      token,
      expires_at: expiresAt,
    })

  return token
}
```

**Location**: Around line 619 (in `renderHtmlShell()` function)

**CHANGE THIS**:
```typescript
const token = await generateToken(recipient.email)
const unsubUrl = `${frontendUrl}/unsubscribe?email=${encodeURIComponent(recipient.email)}&token=${token}`
```

**TO THIS**:
```typescript
const token = await generateUnsubscribeToken(recipient.email, supabase)
const unsubUrl = `${frontendUrl}/unsubscribe?email=${encodeURIComponent(recipient.email)}&token=${token}`
```

#### B. handle-unsubscribe/index.ts

**COMPLETE REWRITE** - Replace entire file with:

```typescript
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.0'

const ALLOWED_ORIGIN = Deno.env.get('ALLOWED_ORIGIN')

const corsHeaders = ALLOWED_ORIGIN
  ? {
      'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
      'Access-Control-Allow-Headers': 'content-type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
    }
  : {}

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (request.method !== 'POST') {
    return json(405, { error: 'Method not allowed' })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!supabaseUrl || !serviceRoleKey) {
    return json(500, { error: 'Missing environment variables' })
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey)

  let body: { email?: string; token?: string; action?: string } | null = null
  try {
    body = await request.json()
  } catch {
    return json(400, { error: 'Invalid JSON body' })
  }

  if (!body?.email || !body?.token) {
    return json(400, { error: 'email and token are required' })
  }

  const email = body.email.toLowerCase()
  const token = body.token
  const action = body.action ?? 'unsubscribe'

  try {
    // Look up token in database
    const { data: tokenData, error: tokenError } = await supabase
      .from('communication_unsubscribe_tokens')
      .select('*')
      .eq('email', email)
      .eq('token', token)
      .single()

    if (tokenError || !tokenData) {
      // Token not found - return 200 for privacy (don't reveal valid emails)
      return json(200, { success: false, error: 'invalid_token' })
    }

    // Check if token is expired
    if (new Date(tokenData.expires_at) < new Date()) {
      return json(200, { success: false, error: 'token_expired' })
    }

    // Check if token already used
    if (tokenData.used_at) {
      return json(200, { success: false, error: 'token_already_used' })
    }

    // Mark token as used
    await supabase
      .from('communication_unsubscribe_tokens')
      .update({ used_at: new Date().toISOString() })
      .eq('id', tokenData.id)

    // Handle resubscribe (delete from unsubscribes table)
    if (action === 'resubscribe') {
      const { error } = await supabase
        .from('communication_unsubscribes')
        .delete()
        .eq('email', email)

      if (error) {
        return json(500, { error: error.message })
      }
      return json(200, { success: true })
    }

    // Default: unsubscribe (add to unsubscribes table)
    const { error: unsubError } = await supabase
      .from('communication_unsubscribes')
      .upsert({ email, unsubscribed_via: 'link' }, { onConflict: 'email' })

    if (unsubError) {
      return json(500, { error: unsubError.message })
    }

    return json(200, { success: true })
  } catch (error) {
    console.error('Error in handle-unsubscribe:', error)
    return json(500, { error: error instanceof Error ? error.message : 'Unknown error' })
  }
})
```

---

## Fix #2: Add Department Boundary Checks

### Affected File
- `supabase/functions/send-communication-email/index.ts`

### Why This Matters
- dept_lead can currently send to ANY department
- Should only be able to send within their own department
- User invitations already have this check; email campaigns do not

### Changes Required

**Location**: Around line 312 (in `fetchCampaignRecipients()` function)

**ADD THIS VALIDATION** after resolving recipients:

```typescript
// Validate dept_lead only sends within own department
if (userProfile.role === 'dept_lead') {
  const pills: RecipientPill[] = campaign.recipient_filters ?? []
  for (const pill of pills) {
    if (pill.type === 'department' && pill.deptId !== userProfile.department_id) {
      return jsonResponse(403, {
        error: 'Department leads can only send to their own department',
      })
    }
    // Optional: also block if sending to "all_roster" or other broad filters
    if (pill.type === 'all_roster') {
      return jsonResponse(403, {
        error: 'Department leads cannot send to all roster; please select specific recipients',
      })
    }
  }
}
```

---

## Fix #3: Add Campaign Status Validation

### Affected File
- `supabase/functions/send-communication-email/index.ts`

### Why This Matters
- Currently can send a campaign multiple times (race condition)
- Edge function should validate campaign is in 'draft' status before sending
- Prevents accidental double-sends if function retried

### Changes Required

**Location**: Around line 461 (after fetching campaign from DB)

**ADD THIS VALIDATION** before processing recipients:

```typescript
// Validate campaign status is 'draft' (Phase 1: no scheduling)
if (typedCampaign.status !== 'draft') {
  return jsonResponse(422, {
    error: `Campaign cannot be sent while in '${typedCampaign.status}' status`,
  })
}

// Mark as sending immediately (prevent double-sends)
await supabaseService
  .from('communication_campaigns')
  .update({ status: 'broadcasting' })
  .eq('id', requestBody.campaign_id)
```

**Location**: Around line 738 (at the end of the function, when updating campaign)

**CHANGE THIS**:
```typescript
await supabaseService
  .from('communication_campaigns')
  .update({
    status: 'broadcast',
    broadcast_at: new Date().toISOString(),
    sent_count: inAppSent,
  })
  .eq('id', requestBody.campaign_id)
```

**TO THIS**:
```typescript
await supabaseService
  .from('communication_campaigns')
  .update({
    status: 'broadcast',
    broadcast_at: new Date().toISOString(),
    sent_count: inAppSent,
  })
  .eq('id', requestBody.campaign_id)

// If error during sending, update status to 'failed'
// (This is already in the catch block, ensure it's there)
```

---

## Fix #4: Add RLS Policy for Department-Scoped Campaigns

### Affected File
- `supabase/migrations/20260731000000_rls_coverage_hardening.sql` (if present)

### Why This Matters
- RLS policy currently allows dept_lead to SELECT/INSERT all campaigns
- Should restrict to own campaigns only (by created_by = auth.uid())

### Changes Required

**If not already present**, add this policy to the migrations file:

```sql
-- RLS: dept_lead can only see/manage own campaigns
DROP POLICY IF EXISTS "dept_lead_own_campaigns" ON public.communication_campaigns;
CREATE POLICY "dept_lead_own_campaigns"
  ON public.communication_campaigns FOR ALL
  TO authenticated
  USING (
    (auth.jwt() ->> 'role') = 'super_admin'
    OR (
      (auth.jwt() ->> 'role') = 'dept_lead'
      AND created_by = auth.uid()
    )
  )
  WITH CHECK (
    (auth.jwt() ->> 'role') = 'super_admin'
    OR (
      (auth.jwt() ->> 'role') = 'dept_lead'
      AND created_by = auth.uid()
    )
  );
```

---

## Testing the Fixes

### Test #1: Verify Deterministic Tokens Rejected

1. Generate an old SHA256 token manually:
   ```typescript
   const oldToken = "abc123..." // from old unsubscribe link
   ```

2. Call handle-unsubscribe with old token:
   ```bash
   curl -X POST http://localhost:54321/functions/v1/handle-unsubscribe \
     -H "Content-Type: application/json" \
     -d '{"email":"test@example.com","token":"abc123...","action":"unsubscribe"}'
   ```

3. **Expected**: `{ success: false, error: "invalid_token" }`

### Test #2: Verify dept_lead Can't Email Other Departments

1. Create a broadcast campaign with recipient filter: `{"type":"department","deptId":"dept-xyz"}`
2. Log in as dept_lead from different department (dept-abc)
3. Call broadcast-campaign edge function
4. **Expected**: `{ error: "Department leads can only send to their own department" }`

### Test #3: Verify Resending Sent Campaign Blocked

1. Send a campaign successfully (status becomes 'broadcast')
2. Try to send the same campaign again
3. **Expected**: `{ error: "Campaign cannot be sent while in 'broadcast' status" }`

---

## Deployment Order

1. **First**: Deploy Phase 1 migrations (database tables)
2. **Second**: Deploy Phase 2 edge functions (broadcast-campaign, mark-notification-read)
3. **Third**: Apply security hotfixes to existing functions (handle-unsubscribe, send-communication-email)
4. **Fourth**: Deploy Phase 3 React components and Phase 4 hook

---

## Rollback Plan

If issues arise:

1. **Revert handle-unsubscribe**: Restore old SHA256 version (users can still unsubscribe with old links)
2. **Revert send-communication-email**: Remove dept_lead checks (less secure but functional)
3. **Revert campaign status check**: Can resend but adds safeguard later

All changes are **backward compatible** - no breaking changes to users or existing data.

---

## Verification Checklist

After deploying hotfixes:

- [ ] Old unsubscribe tokens rejected (test curl above)
- [ ] dept_lead blocked from other departments (test broadcast)
- [ ] Sent campaigns cannot be re-sent (test status validation)
- [ ] Email system still works for super_admin (send campaign as admin)
- [ ] Logs show no errors in edge functions (check Supabase function logs)

