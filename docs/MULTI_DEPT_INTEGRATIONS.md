# Multi-Department Integrations

## Overview

Integrations can now be assigned to **multiple departments**, allowing a single integration to be available to different department groups without duplicating entries.

## How It Works

### Visibility Model

An integration is visible to a user if:

1. **No department restrictions** (global)
   - `department_id = null` AND `department_ids = []`
   - User must have appropriate role (all, super_admin, or dept_lead)

2. **Single department** (legacy support)
   - `department_id = user's department`
   - User must be in that specific department

3. **Multiple departments**
   - `user's department IN department_ids`
   - User must be in one of the assigned departments

### Database

Two columns support department scoping:

```sql
department_id uuid              -- Legacy: single department
department_ids uuid[]           -- New: multiple departments
```

Both can coexist for backward compatibility. The RLS policy handles both cases.

## UI Features

### Department Selection

When editing an integration, you can now:

- **Select no departments** → Integration is global
- **Select one or more departments** → Integration only visible to those departments

The UI shows checkboxes for each department:

```
☐ All departments (global)
☑ Communications
☑ Worship
☐ Children's Ministry
☐ Student Ministry
```

### Managing Integrations

- **Add** — Create new integration and assign to departments
- **Edit** — Change department assignments
- **Save** — Persists to database
- **Delete** — Removes integration

## API Usage

### Create Multi-Department Integration

```javascript
const { data } = await supabaseClient
  .from('external_integrations')
  .insert({
    name: 'Slack Notification Hub',
    type: 'slack',
    launch_url: 'https://slack.com',
    department_ids: ['dept-id-1', 'dept-id-2'],
    enabled: true,
  })
```

### Query Accessible Integrations

```javascript
// User only sees integrations for their department(s)
const { data } = await supabaseClient
  .from('external_integrations')
  .select('*')
  .eq('enabled', true)
// RLS automatically filters based on user's department
```

### Update Departments

```javascript
const { data } = await supabaseClient
  .from('external_integrations')
  .update({
    department_ids: ['new-dept-id-1', 'new-dept-id-2'],
  })
  .eq('id', integrationId)
```

## RLS Policy

The Row Level Security policy automatically handles:

- Super admins can see all integrations
- Regular users only see integrations matching their department
- Global integrations visible to all authorized users
- Multiple department assignments are transparent

## Migration

Run the migration to add the feature:

```bash
supabase migration up
# or manually execute: 20260625000005_multi_dept_integrations.sql
```

Existing integrations continue to work with `department_id`. New integrations should use `department_ids`.

## UI Components Updated

### IntegrationsSection.jsx

- `DeptSelect` component now supports multi-select mode
- Displays checkboxes instead of dropdown when `multiple={true}`
- Handles array of department IDs

```javascript
<DeptSelect
  value={integration.department_ids}
  onChange={(value) => onChange({ ...integration, department_ids: value })}
  departments={departments}
  multiple={true}
/>
```

### Features

- Check "All departments" to clear selections (global)
- Check individual departments to restrict
- Empty selection = global availability

## Example Use Cases

### Global Integration
- **Foundation School** — Available to all users
- `department_ids = []`
- `department_id = null`

### Department-Specific Tool
- **Children's Ministry Zoom** — Only for Children's team
- `department_ids = [uuid-of-childrens-ministry]`

### Multi-Team Tool
- **Event Planning Hub** — Shared by Communications and Worship
- `department_ids = [uuid-communications, uuid-worship]`

### Legacy Single Department
- **Old Zoom Config** — Still using old system
- `department_id = uuid-of-dept`
- `department_ids = []` (not set)

## Backward Compatibility

The system supports both `department_id` and `department_ids`:

- Existing integrations with `department_id` still work
- New integrations should use `department_ids`
- Can migrate old integrations by populating `department_ids` from `department_id`

### Migration Script

To migrate existing integrations:

```sql
UPDATE public.external_integrations
SET department_ids = CASE 
  WHEN department_id IS NOT NULL THEN ARRAY[department_id]
  ELSE array[]::uuid[]
END
WHERE department_ids IS NULL OR array_length(department_ids, 1) IS NULL;
```

## Performance

- GIN index on `department_ids` for fast lookups
- RLS policy optimized for multi-department queries
- No additional queries required

## Future Enhancements

- [ ] Bulk assignment to multiple departments
- [ ] Department groups (assign group of departments at once)
- [ ] Template integrations (copy setup to multiple departments)
- [ ] Integration templates library

## Troubleshooting

### Integration Not Visible

Check:
- Is `enabled = true`?
- Does user's department match `department_ids`?
- Is role visible_to condition met?

```sql
SELECT * FROM external_integrations
WHERE id = 'integration-id'
  AND enabled = true;
```

### RLS Errors

Verify:
- User has correct department assignment
- `public.current_user_department()` returns correct value
- Policy syntax is valid

## Testing

```javascript
// Test 1: Create global integration
const global = await createIntegration({ department_ids: [] })

// Test 2: Create dept-specific integration
const deptSpecific = await createIntegration({ 
  department_ids: [deptId] 
})

// Test 3: Create multi-department integration
const multi = await createIntegration({ 
  department_ids: [dept1, dept2, dept3] 
})

// Test 4: User in dept1 should see multi and dept-specific, not deptSpecific from dept2
```
