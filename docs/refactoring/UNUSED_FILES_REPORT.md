# Unused Files Report - Post Phase 2 Migration

## Summary
After migrating features to the feature-first architecture, the following files can be safely deleted as they have been migrated to `src/features/`.

---

## Files Ready to Delete

### 1. Old Module Structure (src/modules/)
**These directories are fully migrated and can be deleted:**

```
src/modules/
├── automations/         → migrated to src/features/automations/
├── notifications/       → migrated to src/features/notifications/
├── spaces/              → migrated to src/features/spaces/
└── agendas/             → migrated to src/features/agendas/
```

**Status:** All imports updated. Safe to delete.

### 2. Duplicate Library Files (src/lib/)
**These files have been copied to features/ and old imports updated:**

| File | New Location | Status |
|------|-------------|--------|
| `src/lib/automations.js` | `src/features/automations/lib/` | ✅ Safe to delete |
| `src/lib/notifications.js` | `src/features/notifications/lib/` | ✅ Safe to delete |
| `src/lib/spaces.js` | `src/features/spaces/lib/` | ✅ Safe to delete |
| `src/lib/agendas.js` | `src/features/agendas/lib/` | ✅ Safe to delete |

---

## Files NOT Ready to Delete (Still in Use)

### Shared Libraries (Required by multiple features)
These should stay in `src/lib/` for now:

- `supabase.js` - Database client (used everywhere)
- `permissions.js` - Permission checks (global)
- `dateUtils.js` - Date formatting (used by 15+ files)
- `apiKeys.js` - API key management (referenced by automations)
- `taskStatuses.js` - Task status helpers (used by tasks, automations)
- `users.js` - User data (used by multiple features)
- `activityLog.js` - Activity tracking (used globally)
- `constants.js` - Global constants (used everywhere)

### Unfinished Migrations (Still in src/modules/)
Phases 3 & 4 features not yet migrated:

```
src/modules/
├── calendar/            → Phase 3 (ready to migrate)
├── communications/      → Phase 3 (ready to migrate)
├── dashboard/           → Phase 4 (ready to migrate)
├── meetings/            → Phase 4 (ready to migrate)
├── sprints/             → Phase 4 (ready to migrate)
├── tasks/               → Phase 4 (ready to migrate)
```

---

## Suggested Deletion Order

### ✅ Safe to Delete Now (Phase 2 Complete)
1. Delete `src/modules/automations/`
2. Delete `src/modules/notifications/`
3. Delete `src/modules/spaces/`
4. Delete `src/modules/agendas/`
5. Delete `src/lib/automations.js`
6. Delete `src/lib/notifications.js`
7. Delete `src/lib/spaces.js`
8. Delete `src/lib/agendas.js`

### 🔄 Delete After Phase 3 (When calendar & communications are migrated)
- `src/modules/calendar/`
- `src/modules/communications/`
- `src/lib/calendar.js`
- `src/lib/communications.js`

### 🔄 Delete After Phase 4 (When all features migrated)
- `src/modules/dashboard/`
- `src/modules/meetings/`
- `src/modules/sprints/`
- `src/modules/tasks/`
- `src/lib/meetings.js`
- `src/lib/sprints.js`
- `src/lib/tasks.js`
- `src/lib/dashboards.js`

---

## How to Verify Before Deletion

Before deleting any file, verify it's not imported:

```bash
# Check if file is imported anywhere
grep -r "from.*automations" src --include="*.jsx" --include="*.tsx" | grep -v "features"

# Should show zero results from src/lib/ or src/modules/
```

---

## Cleanup Commands

To safely remove Phase 2 files:

```bash
# Delete old modules
rm -rf src/modules/automations
rm -rf src/modules/notifications
rm -rf src/modules/spaces
rm -rf src/modules/agendas

# Delete old lib files
rm src/lib/automations.js
rm src/lib/notifications.js
rm src/lib/spaces.js
rm src/lib/agendas.js
```

---

**Generated:** 2026-06-20  
**Phase Completed:** Phase 2  
**Files Ready to Delete:** 8  
**Files to Keep:** 12+ (shared utilities)
