# Integration Scoping Guide

## Complete Feature Set

Integrations now support **three levels of scoping**:

1. **Global** — Available to all users
2. **Department** — Available to specific departments
3. **User** — Available to individual users

Mix and match to build flexible access controls.

## Quick Start

### Creating a Global Integration
- Scope: **Global (all users)**
- Users see: Integration in their dashboard
- Example: CAN Map, Foundation School

### Creating a Department Integration
- Scope: **Department(s)**
- Select: One or more departments
- Users in that dept see: Integration in their dashboard
- Example: Department-specific Zoom, team Slack

### Creating a User Integration
- Scope: **Individual User(s)**
- Select: One or more users
- Only those users see: Integration in their dashboard
- Example: Personal API keys, custom webhooks

## UI Flow

### Admin Panel
```
Settings → Integrations → Manage Integrations
↓
Create New Integration
↓
Fill Details (Name, URL, Type, etc.)
↓
Choose Scope:
  ├─ Global (all users)
  ├─ Department(s) [select departments]
  └─ Individual User(s) [select users]
↓
Save
```

### User View
```
User Dashboard
↓
Shows integrations where:
  ✓ Global scope
  ✓ Department scope + user in dept
  ✓ User scope + user is selected
```

## Feature Matrix

| Feature | Global | Department | User |
|---------|:------:|:----------:|:----:|
| **Scope Selection** | ✓ | ✓ | ✓ |
| **Multi-select** | N/A | ✓ | ✓ |
| **RLS Protected** | ✓ | ✓ | ✓ |
| **Audit Logging** | ✓ | ✓ | ✓ |
| **Role Filtering** | ✓ | ✓ | ✓ |
| **User Count** | All | Many | Few |
| **Admin Effort** | Low | Medium | High |

## Real-World Examples

### Example 1: Gradual Rollout
```
Week 1: Global launch (everyone)
  └─ All users see "CAN Map"

Week 3: Department trial (specific team)
  └─ Only Communications dept sees "Email Templates" integration

Week 5: Personal customization (power users)
  └─ CEO has "Personal Dashboard" integration (user-scoped)
```

### Example 2: Multi-Tool Slack Setup
```
Global Slack
  └─ Everyone uses workspace #general

Dept Slack (Communications)
  └─ Marketing team has their own channel integration

User Slack (Pastor Personal)
  └─ Pastor gets personal notification channel
```

### Example 3: Security Tiers
```
Canva (Global)
  └─ All staff can create graphics

Google Drive (Department)
  └─ Only Communications has advanced sharing

API Keys (User)
  └─ Individuals manage their own Zapier/custom configs
```

## Implementation Details

### Database
```sql
external_integrations:
- scope TEXT              -- 'global', 'departments', 'users'
- department_ids UUID[]   -- For department scope
- user_ids UUID[]         -- For user scope
```

### RLS Policy
```sql
User can see integration if:
  ✓ Super admin (sees all)
  ✓ Global + correct role
  ✓ Department scope + in dept
  ✓ User scope + is that user
```

### UI Components
```
DeptSelect           -- Multi-select departments
UserSelect           -- Multi-select users
ScopeSelector        -- Choose scope type
ConditionalDisplay   -- Show fields based on scope
```

## Workflow: Adding a Multi-Dept Integration

1. **Admin opens Integrations**
   - Click "Manage integrations"

2. **Creates new integration**
   - Name: "Slack Hub"
   - Type: "custom"
   - URL: "https://slack.com"

3. **Sets scope**
   - Scope: "Department(s)"

4. **Selects departments**
   - ☑ Communications
   - ☑ Worship
   - ☑ Student Ministry

5. **Saves**
   - Appears in 3 departments' dashboards
   - Not visible to other departments

## Workflow: Adding a User-Specific Integration

1. **Admin opens Integrations**
   - Click "Manage integrations"

2. **Creates new integration**
   - Name: "CEO's Dashboard"
   - Type: "custom"
   - URL: "https://internal.com/ceo"

3. **Sets scope**
   - Scope: "Individual User(s)"

4. **Selects users**
   - ☑ Jane Smith (Pastor)

5. **Saves**
   - Only Jane sees this integration
   - Private, customized experience

## Migration: Converting Existing Integrations

### From Global → Department
```
Before: Global Slack integration (everyone sees)
After:  Department Slack integration (only Comms dept sees)

Steps:
1. Edit integration
2. Change scope to "Department(s)"
3. Select "Communications"
4. Save
```

### From Global → User
```
Before: Everyone sees "Personal Tools"
After:  Only Alice sees "Alice's Tools"

Steps:
1. Edit integration
2. Change scope to "Individual User(s)"
3. Select "Alice Smith"
4. Save
```

## Troubleshooting

### Integration Not Appearing

**Check:**
1. Is integration enabled?
   ```sql
   SELECT enabled FROM external_integrations WHERE id = 'x'
   -- Should be TRUE
   ```

2. Does scope match?
   ```sql
   -- Global?
   scope = 'global'

   -- Department?
   user_dept IN (SELECT unnest(department_ids))

   -- User?
   user_id = ANY(user_ids)
   ```

3. Is role permitted?
   ```sql
   -- Check visible_to matches user's role
   visible_to IN ('all', user_role, 'super_admin')
   ```

### Can't Select Departments/Users

**Solution:**
- Admin must load departments/users first
- Check if `users` or `departments` tables have data
- Refresh page to reload lists

## Performance Considerations

### Global Integrations
- Fast queries (no filtering needed)
- Scales to any number of users
- Index on `scope = 'global'`

### Department Scoped
- Fast with GIN index on `department_ids`
- Scales well (typical 10-100 departments)
- User's department cached in JWT

### User Scoped
- Fast lookups via GIN array index
- Scales for < 1000 per-user integrations
- User ID already in JWT

## Security Model

```
Authentication Layer
  ↓
Authorization (RLS) Layer
  ├─ Super admin? → See all
  ├─ Global scope? → See if role matches
  ├─ Department scope? → See if in dept
  └─ User scope? → See if user ID matches
  ↓
Encryption Layer (for secrets)
```

## Best Practices

✅ **DO**
- Use global for workspace-wide tools (Canva, CAN Map)
- Use department for team-specific tools (departmental Slack)
- Use user for personal/custom integrations (API keys, webhooks)
- Review scope when onboarding new staff
- Document why each integration has its scope

❌ **DON'T**
- Make everything user-scoped (hard to manage)
- Change scope on live integrations without notice
- Mix visibility and scope settings confusingly
- Create duplicate integrations when scope change works
- Forget to test RLS policies after changes

## Testing

### Test Global Integration
```
1. Create with scope: 'global'
2. Login as different user
3. Verify integration appears
```

### Test Department Integration
```
1. Create with scope: 'departments', depts: ['dept-a']
2. Login as user in dept-a
3. ✓ Should see integration
4. Login as user in dept-b
5. ✗ Should NOT see integration
```

### Test User Integration
```
1. Create with scope: 'users', users: ['alice-id']
2. Login as alice
3. ✓ Should see integration
4. Login as bob
5. ✗ Should NOT see integration
```

## API Reference

### Query Accessible Integrations

```javascript
// For current user, RLS automatically filters
const { data } = await supabaseClient
  .from('external_integrations')
  .select('*')
  .eq('enabled', true)
// Returns only integrations user can access
```

### Admin: View All Integrations

```javascript
// Super admins see everything
const { data } = await supabaseClient
  .from('external_integrations')
  .select('*')
// Returns all integrations (RLS allows super admin)
```

### Create Integration

```javascript
await supabaseClient
  .from('external_integrations')
  .insert({
    name: 'My Integration',
    scope: 'users',
    user_ids: ['user-id-1', 'user-id-2'],
    enabled: true,
  })
```

## Related Documentation

- [MULTI_DEPT_INTEGRATIONS.md](MULTI_DEPT_INTEGRATIONS.md) — Department scoping details
- [USER_SCOPED_INTEGRATIONS.md](USER_SCOPED_INTEGRATIONS.md) — User scoping details
- [INTEGRATION_IMPLEMENTATION_SUMMARY.md](INTEGRATION_IMPLEMENTATION_SUMMARY.md) — Full feature overview
