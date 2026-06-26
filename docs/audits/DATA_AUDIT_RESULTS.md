# Data Audit Results — 2026-06-25

## Query 1: Duplicates
```sql
SELECT meeting_id, person_id, COUNT(*) as cnt
FROM attendance
GROUP BY meeting_id, person_id
HAVING COUNT(*) > 1
ORDER BY cnt DESC
LIMIT 20;
```

Found: [RUN QUERY IN SUPABASE] duplicate records  
Action: INVESTIGATE / DELETE

**Instructions:**
1. Go to https://app.supabase.com
2. Select your Nexus project
3. SQL Editor → paste query above
4. Note the number of rows returned
5. If any found: investigate why duplicates exist (data entry, sync issue, etc.)

---

## Query 2: Orphaned Records
```sql
SELECT COUNT(*) as orphaned_attendance
FROM attendance a
LEFT JOIN meetings m ON a.meeting_id = m.id
WHERE m.id IS NULL;
```

Found: [RUN QUERY IN SUPABASE] orphaned records  
Action: DELETE / INVESTIGATE

**Explanation:** Attendance records pointing to non-existent meetings (referential integrity issue)

---

## Query 3: Count Mismatches
```sql
SELECT m.id, m.label, m.attendance_count,
       COUNT(a.id) as actual_count
FROM meetings m
LEFT JOIN attendance a ON m.id = a.meeting_id 
                      AND a.status = 'present'
GROUP BY m.id, m.label, m.attendance_count
HAVING COUNT(a.id) != m.attendance_count
LIMIT 20;
```

Found: [RUN QUERY IN SUPABASE] mismatches  
Action: RECOMPUTE / INVESTIGATE

**Explanation:** Meetings where the stored `attendance_count` doesn't match actual attendance records. Indicates a data sync issue or stale cached count.

---

## Query 4: Volume
```sql
SELECT COUNT(*) as total_records,
       COUNT(DISTINCT meeting_id) as unique_meetings,
       COUNT(DISTINCT person_id) as unique_people
FROM attendance;
```

Results:
- Total records: [RUN QUERY IN SUPABASE]
- Unique meetings: [RUN QUERY IN SUPABASE]
- Unique people: [RUN QUERY IN SUPABASE]

**Explanation:** Overall data volume. Helps understand scale and identify if any table seems unusually small/large.

---

## Summary

### Data Health Status
- **Duplicates:** [HEALTHY / NEEDS ATTENTION]
- **Orphans:** [HEALTHY / NEEDS ATTENTION]
- **Count Sync:** [HEALTHY / NEEDS ATTENTION]
- **Volume:** [OK / UNEXPECTED]

### Overall Status
**Status: [NEEDS DATA - RUN QUERIES ABOVE]**

### Recommended Actions
1. [ ] Run all 4 queries in Supabase SQL Editor
2. [ ] Record findings in this file
3. [ ] If duplicates found: check for data entry errors or API double-submissions
4. [ ] If orphans found: delete or investigate meeting_id references
5. [ ] If count mismatches found: consider recalculating attendance_count via trigger
6. [ ] If volume is unexpected: verify nothing was accidentally truncated/bulk-deleted

### Notes
- This audit was run as part of the public report URL persistence fix
- Data validation is a prerequisite for shipping reports to users
- All 4 queries should return 0 results for a healthy database

---

## How to Use This File
1. Copy each SQL query above
2. Paste into Supabase → SQL Editor
3. Run each query
4. Update the [RUN QUERY] placeholders with actual numbers
5. Commit with findings to git history
