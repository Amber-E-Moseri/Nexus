# ROOT DIRECTORY CLEANUP PLAN

## Current Root Files to Clean

### 🗑️ DELETE (2 files - corrupted/temporary)
1. **C:UsersmoserDownloadsclickupsrcfeaturescalendarcomponentsCalendarGrid.jsx**
   - Reason: Corrupted file path (appears to be a Windows path embedded as filename)
   - Action: DELETE

2. **DEBUG_FOUNDATION_SCHOOL.sql**
   - Reason: Debug database file
   - Action: MOVE to `test/fixtures/` or DELETE if not needed

### 📁 MOVE TO DOCS/ (2 files - cleanup documentation)
1. **DOCS_CLEANUP_ANALYSIS.md**
   - Reason: Documentation about docs cleanup process
   - Action: MOVE to `docs/reports/DOCS_CLEANUP_ANALYSIS.md`

2. **DOCS_CLEANUP_COMPLETE.md**
   - Reason: Completion report for docs cleanup
   - Action: MOVE to `docs/reports/DOCS_CLEANUP_COMPLETE.md`

### 📁 MOVE TO DOCS/GUIDES/ (1 file - quick reference)
1. **QUICK_TEST_REFERENCE.md**
   - Reason: Testing quick reference guide
   - Action: MOVE to `docs/guides/QUICK_TEST_REFERENCE.md`

### 📁 MOVE TO SCRIPTS/ (1 file - deployment script)
1. **apply_meeting_documents.sh**
   - Reason: Shell script for document application
   - Action: MOVE to `scripts/apply_meeting_documents.sh`

---

## Summary
- **DELETE:** 2 files
- **MOVE:** 4 files
- **Result:** Clean root with only essential project files

### Root Files After Cleanup
```
Root/
├── .claude/
├── .env.example
├── .env.local
├── .git/
├── .github/
├── .gitignore
├── .vercel/
├── README.md (project readme - KEEP)
├── index.html (entry point - KEEP)
├── package.json (dependencies - KEEP)
├── package-lock.json (lock file - KEEP)
├── vite.config.js (build config - KEEP)
├── vercel.json (deployment config - KEEP)
├── apps/ (monorepo)
├── dist/ (build output)
├── docs/ (documentation)
├── node_modules/ (dependencies)
├── public/ (static files)
├── scripts/ (build/deployment scripts) - includes apply_meeting_documents.sh
├── src/ (source code)
├── supabase/ (database files)
├── test/ (test fixtures) - includes debug SQL if needed
└── tests/ (test files)
```
