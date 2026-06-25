# User-Scoped Integrations

## Overview

Integrations can now be assigned to **individual users** in addition to departments and global availability. This allows for highly personalized integration settings.

## Three Scope Levels

### 1. Global Integrations
- Available to **all users** in the workspace
- No department or user restrictions
- Example: Foundation School, CAN Map, Canva

```
Scope: Global (all users)
→ Visible to everyone (subject to role restrictions)
```

### 2. Department-Scoped Integrations
- Available to users in **specific departments**
- Can select multiple departments
- Example: Department-specific Zoom, team Slack channels

```
Scope: Department(s)
Departments: [Communications, Worship]
→ Only visible to users in Communications or Worship
```

### 3. User-Scoped Integrations
- Available to **individual users only**
- Can select multiple specific users
- Example: Personal email forwarding, custom API keys, individual Zapier configs

```
Scope: Individual User(s)
Users: [Alice Smith, Bob Johnson]
→ Only visible to Alice and Bob
```

## How to Create User-Scoped Integrations

### Admin Setup

1. Go to **Settings → Integrations** (admin only)
2. Click **"Manage integrations"**
3. Click **"Add integration"** or edit existing
4. Fill in basic details:
   - Name
   - Type
   - Launch URL
   - Description
   - Icon
5. Set **Scope** to **"Individual User(s)"**
6. Select **Users** from the list
7. Click **"Add integration"**

### User Experience

Users only see integrations assigned to:
- Global scope
- Their department (if department-scoped)
- Their user ID (if user-scoped)

## Use Cases

### Personal Tools
- **Email Signature Settings** — User-specific, only visible to that person
- **Personal Calendar** — Individual user's calendar integration
- **API Keys** — User's Zapier/Integromat keys stored per person

### Team-Specific Tools
- **Slack Channel** — Different Slack channels for different users
- **Google Drive** — User's personal Drive, not shared
- **Custom Webhook** — User's private webhook endpoint

### Hybrid Setups
- **Zoom** → Global (everyone gets default Zoom)
- **Zoom (Premium)** → Department-scoped (Premium features for leadership)
- **Zoom (Personal)** → User-scoped (CEO's personal meeting room)

### Training & Onboarding
- **Training Documentation** → Available to new hires only
- **Onboarding Checklist** → One-time setup tool for specific user
- **Internal Wiki** → Department-scoped during training period

## Database Schema

```sql
external_integrations table:

user_id uuid          -- Legacy: single user
user_ids uuid[]       -- New: multiple users
scope text            -- 'global', 'departments', 'users'
```

## RLS Policy

The Row Level Security policy grants access if user is:

```
Super Admin (always sees all)
OR
Global integration + correct role
OR
Single department integration + user in department
OR
Multi-department integration + user in one of departments
OR
Single user integration + user ID matches
OR
Multi-user integration + user ID in array
```

## API Examples

### Create User-Scoped Integration

```javascript
const { data } = await supabaseClient
  .from('external_integrations')
  .insert({
    name: 'Alice\'s Custom API',
    type: 'custom',
    launch_url: 'https://api.example.com/alice',
    scope: 'users',
    user_ids: ['alice-user-id'],
    enabled: true,
  })
```

### Create Multi-User Integration

```javascript
const { data } = await supabaseClient
  .from('external_integrations')
  .insert({
    name: 'Leadership Team Tools',
    type: 'custom',
    launch_url: 'https://internal.example.com/leadership',
    scope: 'users',
    user_ids: [
      'pastor-id',
      'director-id',
      'admin-id',
    ],
    enabled: true,
  })
```

### Update Integration Scope

```javascript
// Change from global to user-scoped
const { data } = await supabaseClient
  .from('external_integrations')
  .update({
    scope: 'users',
    user_ids: ['user-id-1', 'user-id-2'],
  })
  .eq('id', integrationId)
```

## UI Behavior

### Scope Selector
```
[Global (all users)  ▼]
[Department(s)       ▼]
[Individual User(s)  ▼]
```

### Department Scope
Shows when scope is set to "Department(s)"
```
☐ All departments (global)
☑ Communications
☑ Worship
☐ Student Ministry
```

### User Scope
Shows when scope is set to "Individual User(s)"
```
☐ All users (global)
☑ Alice Smith (alice@example.com)
☑ Bob Johnson (bob@example.com)
☐ Carol White (carol@example.com)
```

## Visibility Rules

User sees integration if:

```javascript
IF super_admin THEN
  see everything
ELSE IF scope === 'global' THEN
  see if role matches (all, dept_lead, super_admin)
ELSE IF scope === 'departments' THEN
  see if user.department IN integration.department_ids
ELSE IF scope === 'users' THEN
  see if auth.uid() IN integration.user_ids
END IF
```

## Migration from Old Format

Existing integrations using `user_id` (single user) automatically migrate:

```javascript
// Old format
user_id: 'uuid-of-user'
user_ids: null

// Migrated to
user_id: 'uuid-of-user'  // kept for compatibility
user_ids: ['uuid-of-user']
scope: 'users'
```

## Backward Compatibility

The system supports three formats:

1. **Legacy single user** — `user_id = 'uuid'`
2. **New multi-user** — `user_ids = ['uuid1', 'uuid2']`
3. **No user scope** — `user_id = null, user_ids = null`

New UI automatically converts between formats.

## Security

✓ **Row-level security** ensures users can't see integrations assigned to others
✓ **Super admins** can manage all user-scoped integrations
✓ **Privacy** — User's personal integrations are not visible to other users
✓ **Audit trail** — All integration changes logged

## Performance

- GIN indexes on `user_ids` for fast lookups
- RLS policy optimized for array queries
- No N+1 problems with proper indexing
- Efficient department and user lookups

## Troubleshooting

### Integration Not Visible to User

Check:
1. Is `enabled = true`?
2. Is user's ID in `user_ids`?
3. Is user's role visible_to compliant?

```sql
SELECT * FROM external_integrations
WHERE 'user-id' = ANY(user_ids) AND enabled = true;
```

### Scope Not Updating

Verify:
- Scope field is set correctly
- Arrays are properly formatted
- At least one user/department selected

## Comparison Table

| Feature | Global | Department | User |
|---------|--------|------------|------|
| Visibility | All users | Department members | Selected users |
| Use case | Shared tools | Team tools | Personal/custom |
| Scalability | Very high | High | Low |
| Management | Easy | Medium | Complex |
| Privacy | Low | Medium | High |
| Examples | Canva, Drive | Slack, Zoom | API keys, webhooks |

## Future Enhancements

- [ ] User groups (assign group of users at once)
- [ ] Role-based scope (visible to all admins, all pastors, etc.)
- [ ] Time-limited access (integration available until date)
- [ ] Conditional display (show if user has permission X)
- [ ] Access requests (users request access to integrations)
