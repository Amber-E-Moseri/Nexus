# Super Admin Integration Control

## Overview

Super admins have complete control over all integrations in the workspace, including the ability to:

- Create and manage global integrations (visible to all users)
- Create department-scoped integrations (visible to specific departments)
- **Create user-scoped integrations (assign to individual users)**

This guide covers the super admin capabilities for managing individual user integrations.

## Super Admin Capabilities

### 1. Global Integrations
**Visibility:** All workspace users  
**Use Case:** Company-wide tools (Canva, Google Drive, etc.)

```
Scope: Global (all users)
→ Everyone in workspace sees this integration
```

### 2. Department Integrations
**Visibility:** Members of selected departments  
**Use Case:** Department-specific tools (team Slack, departmental Zoom)

```
Scope: Department(s)
Departments: [Communications, Worship]
→ Only users in these departments see the integration
```

### 3. Individual User Integrations ⭐ ADMIN ONLY
**Visibility:** Specific users you select  
**Use Case:** Personal customizations, individual API keys, custom workflows

```
Scope: Individual User(s)
Users: [Alice Smith, Bob Johnson]
→ Only Alice and Bob see this integration
→ Super admin can manage for any user
```

## Why Individual User Integrations?

### Use Cases

**1. Personal API Keys**
- User has Zapier account they want to use
- Admin creates integration scoped to just that user
- Other users don't see it

**2. Custom Workflows**
- CEO has personal dashboard/tools
- Admin sets up integration visible only to them
- Keeps workspace uncluttered

**3. Trial Rollout**
- Testing new tool with select users first
- Create user-scoped integration
- Later expand to department or global if successful

**4. One-Time Tools**
- Integration needed by one person for project
- Admin can assign without cluttering everyone's view
- Can be deleted when no longer needed

**5. Security/Privacy**
- Sensitive integrations (personal webhooks, custom APIs)
- Only visible to authorized individual
- Admin-controlled access

## How to Assign Integration to Individual User

### Via Admin Panel

1. **Settings → Integrations** (super admin only)
2. **Manage Integrations** button
3. **Add Integration** or edit existing
4. Fill in details:
   - Name (e.g., "Alice's Custom API")
   - Type (custom, Zapier, API key, etc.)
   - URL
   - Description
5. **Set Scope:** "Individual User(s)"
6. **Select Users:** Check boxes for specific users
   - Leave unchecked for none (or click "All users" to make global)
7. **Save**

### Via Edit
1. Click on existing integration
2. Change Scope to "Individual User(s)"
3. Select specific users
4. Save

## User Experience

### What Users See

**Global Integration:**
- Alice sees it
- Bob sees it
- Carol sees it

**Department Integration (Communications):**
- Alice (Communications) sees it ✓
- Bob (Worship) doesn't see it ✗
- Carol (Communications) sees it ✓

**User Integration (just Alice):**
- Alice sees it ✓
- Bob doesn't see it ✗
- Carol doesn't see it ✗

### User View
Users only see integrations assigned to:
- Global scope
- Their department (if department-scoped)
- Their user ID (if user-scoped)

Users cannot see:
- Integrations for other users
- Integrations for other departments
- Admin-only integrations (unless they're assigned)

## Admin Panel Features

### Management Dashboard
Admin sees:
- All integrations (global, department, user)
- Who each integration is assigned to
- Scope of each integration
- Enable/disable toggles

### User-Scoped Indicators
- 👤 Icon indicates user-scoped integration
- Shows list of users with access
- Clear labels: "Admin Only"

### Bulk Operations (Future)
- Assign integration to multiple users at once
- Change scope in bulk
- Clone integration for another user

## Best Practices

✅ **DO**
- Use clear, descriptive names for user-scoped integrations
- Document why integration is user-specific
- Review user-scoped integrations regularly
- Archive or delete when no longer needed
- Use for legitimate admin/user customizations

❌ **DON'T**
- Create user-scoped integrations without user permission
- Hide integrations to bypass access controls
- Create duplicate integrations when scope change works
- Forget to clean up old user-scoped integrations
- Use to restrict general workspace tools

## Examples

### Example 1: CEO Dashboard
```
Name: CEO Dashboard & Reports
Scope: Individual User(s)
Users: [CEO Name]
URL: https://internal.company.com/ceo-dashboard
Description: Personal analytics and reporting dashboard

Result: Only CEO sees this integration
```

### Example 2: Zapier Trial
```
Name: Zapier Automation (Beta)
Scope: Individual User(s)
Users: [Alice Smith, Bob Johnson]
URL: https://zapier.com
Description: Testing Zapier automation workflows with select users

Result: Only Alice and Bob see it during trial
→ Later convert to global or department scope if successful
```

### Example 3: Personal Webhook
```
Name: Bob's Custom Webhook
Scope: Individual User(s)
Users: [Bob Johnson]
URL: https://api.custom.com/webhook/bob
Description: Bob's personal webhook for custom integrations

Result: Only Bob can see and configure
```

### Example 4: Staged Rollout
```
Week 1: User-scoped to [Alice]
  Testing new tool with single power user

Week 2: User-scoped to [Alice, Bob, Carol]
  Expanding to team leads for testing

Week 3: Department-scoped to [Communications, Leadership]
  Approved for wider use

Week 4: Global
  Everyone has access
```

## Security & Privacy

### Data Access
- User-scoped integrations are RLS protected
- Only assigned user and super admin can see
- Other users cannot access or view
- Activity is logged

### Admin Responsibility
- Super admins can create and manage user integrations
- Only create with legitimate purpose
- Users should be informed of integrations assigned to them
- Regular audit of user-scoped integrations

### Audit Trail
All integration actions logged:
- Who created it
- When it was created
- Who it's assigned to
- Any modifications
- When it was deleted

## API Reference

### Create User-Scoped Integration (Admin)

```javascript
const { data } = await supabaseClient
  .from('external_integrations')
  .insert({
    name: 'Alice\'s Personal Tool',
    type: 'custom',
    launch_url: 'https://example.com/alice',
    scope: 'users',
    user_ids: ['alice-user-id'],
    enabled: true,
    created_by: admin_user_id,
  })
```

### Query User-Scoped Integrations

```javascript
// Super admin sees all
const { data } = await supabaseClient
  .from('external_integrations')
  .select('*')
  .eq('scope', 'users')

// Regular user sees only assigned to them
const { data } = await supabaseClient
  .from('external_integrations')
  .select('*')
  .eq('scope', 'users')
// RLS automatically filters to user's own integrations
```

### Update Scope

```javascript
// Change to user-scoped
await supabaseClient
  .from('external_integrations')
  .update({
    scope: 'users',
    user_ids: ['user-id-1', 'user-id-2'],
  })
  .eq('id', integration_id)
```

## Troubleshooting

### User Can't See Integration
**Check:**
1. Integration enabled? `enabled = true`
2. User's ID in `user_ids`? 
3. User account active?

### Scope Won't Change to User
**Check:**
1. At least one user selected?
2. Users exist in system?
3. Browser cache cleared?

### Can't Select Users
**Solution:**
- Refresh page to reload user list
- Check if `users` table has data
- Verify user is super_admin role

## Related Documentation

- [INTEGRATION_SCOPING_GUIDE.md](INTEGRATION_SCOPING_GUIDE.md) — Complete scoping overview
- [USER_SCOPED_INTEGRATIONS.md](USER_SCOPED_INTEGRATIONS.md) — Technical user scoping details
- [MULTI_DEPT_INTEGRATIONS.md](MULTI_DEPT_INTEGRATIONS.md) — Department scoping guide
