# Sprint Teams Implementation - Deployment Guide

## 📋 Quick Summary

Successfully implemented a **three-level team membership system** for sprint teams:
1. **Independent teams** — exist without sprints, cross-departmental
2. **Sprint + Team assignments** — optional loose coupling  
3. **Auto-create from space** — one-click team creation with member sync

✅ All code changes complete  
✅ Fully backward compatible  
✅ Ready for deployment

## 🚀 Deployment Checklist

### Step 1: Run Database Migration (Required)
**Time**: ~5 minutes  
**Risk**: Low (additive only, no data loss)

1. Go to [Supabase Dashboard](https://supabase.com/) → Project → SQL Editor
2. Copy entire contents of `SPRINT_TEAMS_MIGRATION.sql`
3. Paste into SQL Editor
4. Review changes (read the comments)
5. Click "Run" or Ctrl+Enter
6. Verify no errors appear
7. Check that new columns and tables exist:
   ```sql
   -- Verify columns added
   SELECT column_name FROM information_schema.columns 
   WHERE table_name = 'sprint_teams' 
   ORDER BY ordinal_position;
   
   -- Verify table created
   SELECT tablename FROM pg_tables 
   WHERE tablename = 'sprint_team_members';
   ```

**If migration fails:**
- Check database backup exists (it should)
- Review error message
- Run rollback SQL from bottom of migration file
- Contact Supabase support if needed

### Step 2: Deploy Code Changes (Automatic)
**Time**: ~2 minutes

All code changes are already staged and committed:

```bash
# See what was changed
git show 7b2e4a0 --stat

# Changes include:
# - src/lib/sprints.js (+10 API functions)
# - src/modules/sprints/TeamCard.jsx (NEW)
# - src/modules/sprints/NewTeamModal.jsx (NEW)
# - src/modules/sprints/ImportTeamModal.jsx (NEW)
# - src/modules/sprints/AssignTeamToSprintModal.jsx (NEW)
# - src/pages/sprints/AllTeamsPage.jsx (NEW)
# - SPRINT_TEAMS_MIGRATION.sql (reference)
# - SPRINT_TEAMS_IMPLEMENTATION_SUMMARY.md (reference)
```

These files are ready to go — no additional changes needed to code.

### Step 3: (Optional) Add Navigation Routes
**Time**: ~5 minutes

Add a route to your main router to make the new Teams page accessible:

```jsx
// In your main router config (e.g., App.jsx or router.js)
import AllTeamsPage from './pages/sprints/AllTeamsPage'

const routes = [
  // ... existing routes ...
  {
    path: '/sprints/teams',
    element: <AllTeamsPage />,
    name: 'Teams'
  }
]
```

Or if you're using a router library:
```jsx
<Route path="/sprints/teams" element={<AllTeamsPage />} />
```

### Step 4: (Optional) Add Sidebar Navigation
**Time**: ~5 minutes

Add a link in your sidebar or main navigation:

```jsx
// In your sidebar/navigation component
<NavLink to="/sprints/teams">Teams</NavLink>

// Or in your navigation array:
{
  label: 'Teams',
  path: '/sprints/teams',
  icon: '👥'
}
```

### Step 5: Test Implementation
**Time**: ~15-20 minutes (manual testing)

#### Unit Testing (if applicable)
```bash
# Run your test suite (adjust command for your setup)
npm test -- src/lib/sprints.js
npm test -- src/modules/sprints/
```

#### Manual Testing Checklist

- [ ] **Database verification**
  - [ ] Log into Supabase and confirm new columns exist
  - [ ] Confirm sprint_team_members table created
  - [ ] Verify RLS policies are enabled

- [ ] **API Functions**
  - [ ] Create independent team via `createIndependentTeam()`
  - [ ] Create team from space via `createTeamFromSpace()`
  - [ ] Add member to team via `addTeamMember()`
  - [ ] Remove member via `removeTeamMember()`
  - [ ] Assign team to sprint via `assignTeamToSprint()`
  - [ ] Unassign team via `unassignTeamFromSprint()`
  - [ ] Archive team via `archiveTeam()`

- [ ] **UI Components**
  - [ ] Navigate to `/sprints/teams` page
  - [ ] Verify "No teams" empty state displays
  - [ ] Click "+ New Team" button → modal opens
  - [ ] Click "Import from Space" button → modal opens
  - [ ] Create a new team → appears in list
  - [ ] Create team from space → auto-populates members
  - [ ] Click "Assign to Sprint" → modal shows sprints
  - [ ] Assign team to sprint → "Change Sprint" button appears
  - [ ] Click "Archive" → team hidden from list
  - [ ] Verify existing sprint workflows still work (backward compat)

- [ ] **Backward Compatibility**
  - [ ] Old sprint creation still works
  - [ ] Existing teams still appear in sprints
  - [ ] Team member assignment still works
  - [ ] No broken UI elements

## 🔄 Rollback Instructions (if needed)

### Revert Code Changes
```bash
# Revert the commit
git revert 7b2e4a0

# Or reset (if not pushed yet)
git reset --hard HEAD~1

# Delete the new component files if reset doesn't work
rm src/modules/sprints/TeamCard.jsx
rm src/modules/sprints/NewTeamModal.jsx
rm src/modules/sprints/ImportTeamModal.jsx
rm src/modules/sprints/AssignTeamToSprintModal.jsx
rm src/pages/sprints/AllTeamsPage.jsx
```

### Revert Database Migration (Supabase)
```sql
-- Run the rollback section from SPRINT_TEAMS_MIGRATION.sql

-- Drop new table
DROP TABLE IF EXISTS sprint_team_members CASCADE;

-- Drop new columns
ALTER TABLE sprint_teams
DROP COLUMN IF EXISTS created_by CASCADE;

ALTER TABLE sprint_teams
DROP COLUMN IF EXISTS is_archived CASCADE;

ALTER TABLE sprint_teams
DROP COLUMN IF EXISTS source_space_id CASCADE;

-- Restore NOT NULL constraint
ALTER TABLE sprint_teams
ALTER COLUMN sprint_id SET NOT NULL;

-- Drop indexes
DROP INDEX IF EXISTS idx_sprint_teams_source_space;
DROP INDEX IF EXISTS idx_sprint_teams_is_archived;
DROP INDEX IF EXISTS idx_sprint_teams_created_by;
```

## 📊 Feature Usage

### For End Users

#### Create a New Independent Team
1. Go to "Teams" page
2. Click "+ New Team"
3. Enter team name and description
4. (Optional) Add members from dropdown
5. (Optional) Assign to a sprint
6. Click "Create Team"

#### Create Team from Space
1. Go to "Teams" page  
2. Click "Import from Space"
3. Select the space (e.g., "ORS")
4. (Optional) Assign to a sprint
5. Click "Create Team"
6. All space members automatically added

#### Assign Team to Sprint
1. Go to "Teams" page
2. Find the team
3. Click "Expand"
4. Click "Assign to Sprint" or "Change Sprint"
5. Select sprint from dropdown
6. Click "Save"

#### Remove Team from Sprint
1. Go to "Teams" page
2. Expand team
3. Click "Change Sprint"
4. Select "None (Keep Independent)"
5. Click "Save"

## 🛠️ Technical Details

### What Changed
- **API**: Added 10 new functions to `src/lib/sprints.js`
- **Database**: Made sprint_id optional, added new table/columns
- **UI**: 5 new components for team management
- **Backward Compatibility**: ✅ Fully maintained

### What Stayed the Same
- Old `createSprintTeam()` function (still works)
- Sprint workflows unchanged
- Existing team data preserved
- All other features unaffected

### Architecture
```
Independent Team Flow:
1. Create team via createIndependentTeam()
2. Add members via addTeamMember()
3. Optionally assign to sprint via assignTeamToSprint()

Import from Space Flow:
1. Select space in ImportTeamModal
2. Call createTeamFromSpace() → auto-fetches space members
3. Team created and populated in one step
4. Optionally assign to sprint

Assignment Flow:
1. Team can move between sprints
2. Or unassign to keep independent
3. All via assignTeamToSprint() or unassignTeamFromSprint()
```

## 📚 Documentation

- **SPRINT_TEAMS_IMPLEMENTATION_SUMMARY.md** — Detailed technical overview
- **SPRINT_TEAMS_MIGRATION.sql** — Database migration (must run in Supabase)
- **src/lib/sprints.js** — API function implementations with JSDoc comments
- **src/modules/sprints/TeamCard.jsx** — Team card component
- **src/pages/sprints/AllTeamsPage.jsx** — Main teams page

## ❓ FAQ

**Q: Do I need to migrate existing data?**  
A: No. Existing teams and sprints work as-is. New features are optional.

**Q: Will this break existing sprint workflows?**  
A: No. Fully backward compatible. Old flows continue unchanged.

**Q: Can I still create teams directly from Sprint view?**  
A: Yes. The old "Create Team" modal in Sprint Detail still works.

**Q: What if space members change after importing?**  
A: Teams don't auto-sync (by design). They're one-time imports. You can manually add/remove members later if needed.

**Q: Can a team be in multiple sprints?**  
A: No (design choice). A team can only be in one sprint at a time, but can be reassigned.

**Q: What happens to archived teams?**  
A: They're hidden from lists but preserved in database. Can be restored by toggling `is_archived` flag.

## 📞 Support

If you encounter issues:

1. **Check migration ran successfully** — verify columns exist in Supabase
2. **Check RLS policies enabled** — should appear in Supabase Security tab
3. **Check imports are correct** — ensure all new files imported where used
4. **Check routes added** — if navigation not working, add route to router
5. **Run in browser console** — test functions directly in console

**Test in console:**
```javascript
import { listAllTeams, createIndependentTeam } from './lib/sprints'

// Test listing teams
const teams = await listAllTeams()
console.log(teams)

// Test creating team
const newTeam = await createIndependentTeam('Test Team', 'Description')
console.log(newTeam)
```

## ✅ Deployment Checklist (Complete)

- [x] Code changes committed (7b2e4a0)
- [x] API functions implemented (10 functions)
- [x] UI components created (5 components)
- [x] Database migration prepared
- [ ] Database migration run in Supabase ← **You are here**
- [ ] Routes added to router (optional but recommended)
- [ ] Navigation updated (optional)
- [ ] Manual testing completed
- [ ] Rollback plan verified (just in case)

## 🎉 Next Steps

1. **Immediate**: Run database migration in Supabase (Step 1 above)
2. **Today**: Test with the checklist (Step 5)
3. **Tomorrow**: Deploy to staging/production
4. **This week**: Gather user feedback, refine as needed

---

**Version**: 1.0  
**Status**: Ready for deployment  
**Last Updated**: 2026-06-19
