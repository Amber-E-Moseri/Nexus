# Elvanto Attendance Import Guide

## Overview

Import attendance data from Elvanto CSV exports into BLW Canada OS. This guide explains how to export from Elvanto, import into OS, and troubleshoot common issues.

## Quick Start

1. **Export from Elvanto**: Open meeting → Attendance → Export as CSV
2. **Import in OS**: Meetings → Select meeting → "Import from Elvanto"
3. **Review**: Check preview (will import X records, Y mismatches)
4. **Confirm**: Click "Import"
5. **Fix**: Address any person mismatches

## Prerequisites

- Access to Elvanto with meeting attendance records
- Access to BLW Canada OS as admin
- People in Elvanto must have names matching (or similar to) OS user names

## CSV Format

Elvanto exports attendance as CSV with these columns:

```
Meeting,Date,Time,PersonName,PersonID,Status,Percentage
```

**Required columns:**
- `Meeting` — Meeting name (e.g., "Foundation School Leads Weekly")
- `Date` — Meeting date (YYYY-MM-DD, MM/DD/YYYY, or DD/MM/YYYY format)
- `PersonName` — Person's name as listed in Elvanto (e.g., "John Doe" or "J.D.")
- `Status` — Attendance status: Present, Absent, Late, Excused

**Optional columns:**
- `Time` — Meeting start time (14:00, 2:00 PM, etc.)
- `PersonID` — Elvanto external person ID (speeds up matching)
- `Percentage` — Attendance percentage from Elvanto

**Example CSV:**

```csv
Meeting,Date,Time,PersonName,PersonID,Status,Percentage
Foundation School Leads,2024-06-16,14:00,Amara D.,person_123,Present,100%
Foundation School Leads,2024-06-16,14:00,Grace M.,person_456,Present,96%
Foundation School Leads,2024-06-16,14:00,Joel O.,person_789,Present,88%
Pastors Cell Leaders,2024-06-15,18:00,David T.,person_101,Absent,92%
Media Production,2024-06-13,10:00,Sarah E.,person_202,Absent,64%
```

## Step-by-Step Import

### 1. Export from Elvanto

1. Open Elvanto
2. Navigate to the meeting you want to export attendance for
3. Click **Attendance** tab
4. Look for **Export** button (usually in top-right)
5. Click **Export as CSV**
6. Save file (e.g., `meeting_2024-06-16.csv`)

### 2. Open BLW Canada OS

1. Go to **Meetings** module
2. Select the meeting matching the Elvanto export
3. Click **Import Attendance from Elvanto** button (or similar)

### 3. Select CSV File

1. In the import modal, click **Select CSV File**
2. Browse to your downloaded Elvanto CSV
3. Click **Open**

### 4. Review Preview

The import modal shows:
- **Total records** — How many people in CSV
- **Valid records** — How many will be imported
- **Invalid rows** — How many have issues (won't be imported)
- **Preview table** — First 5 records for review
- **Mismatches** — People not found in OS

If everything looks correct, proceed to step 5.

**If there are issues:**
- Check that person names match in Elvanto and OS
- Fix names in Elvanto, re-export, and try again
- Or manually add missing people to OS before importing

### 5. Click Import

1. Click **Import** button
2. Wait for import to complete (usually 1-2 seconds)
3. See results: "✅ Imported 33 records"

### 6. Address Mismatches (if any)

If the import shows mismatches like:
```
⚠️ Sarah E. — Person not found
⚠️ Unknown Person — Person not found
```

You have two options:

**Option A: Add person to OS**
1. Go to **People** → **Add Person**
2. Enter name exactly as shown in Elvanto
3. Retry import

**Option B: Fix name in Elvanto**
1. Go back to Elvanto
2. Edit the person's name to match OS
3. Re-export CSV
4. Retry import in OS

## Person Matching Strategy

The import uses a smart matching algorithm to find people:

### Step 1: External ID Match (Fastest)
If CSV includes `PersonID` (Elvanto external ID), system uses that first.
- Example: `person_123` → matches instantly
- **Why**: Unambiguous, no fuzzy guessing needed

### Step 2: Exact Name Match
If name exactly matches OS user, system matches immediately.
- Example: `"John Doe"` → matches `"John Doe"` (case-insensitive)
- **Why**: Safe, no guessing

### Step 3: Fuzzy Name Match
If exact match fails, system tries flexible matching:
- **Substring match**: `"J.D."` matches `"John Doe"` (initials)
- **Last name match**: `"Doe"` matches `"John Doe"` (if 3+ chars)
- **Partial match**: `"John"` in `"John Michael Doe"` (substring)
- **Why**: Handles nickname variations and abbreviated names

### Step 4: No Match → Logged as Mismatch
If none of the above work:
- Person is skipped (not imported)
- Name is logged as mismatch
- Import continues with other people
- **Why**: Don't block entire import for 1-2 people

## Handling Mismatches

### Common Mismatch Reasons

| Issue | Solution |
|-------|----------|
| Person's name in Elvanto differs from OS (e.g., "Amy" vs "Amara") | Add OS user name as alias in Elvanto, or manually add person to OS |
| Person is new (in Elvanto but not yet in OS) | Add to OS first, then retry import |
| Typo in Elvanto name | Fix typo in Elvanto, re-export, retry import |
| Person has informal name in Elvanto (e.g., "Pete" vs "Peter") | Add name variant as alias or manually add to OS |

### Viewing Mismatch Log

After import, if there are mismatches:
1. Check the results screen for list of unmatched names
2. Write down names
3. Either:
   - Add them to OS **People** module
   - Or fix names in Elvanto and re-import

## Attendance Calculation

After import:
- **Attendance percentage** is calculated from all meetings
- Formula: `(Number of "Present" meetings) / (Total meetings) × 100%`
- Example: User attended 8 of 10 meetings = 80%

### Watch List

Users with attendance < 75% appear on the **Watch List**:
- Automatically identified after import
- Used to flag people needing follow-up
- Absence follow-ups can be drafted for them

## Bulk Import (Large Files)

If importing 100+ people:
1. Performance: Import completes in <2 seconds (even for 500 people)
2. No special handling needed — just import normally
3. System will match as many as possible, log mismatches

## Duplicate Prevention

If you accidentally import the same CSV twice:
- **No duplicates created** — system recognizes duplicates
- Same attendance records are **updated** (not added again)
- `marked_at` timestamp is refreshed

## Data Tracked

When you import, the system records:
- `meeting_id` — Which meeting
- `user_id` — Which person
- `status` — Present/Absent/Late/Excused
- `attendance_percentage` — From Elvanto (if provided)
- `marked_at` — When import happened
- `source` — Marked as `'elvanto_import'` (for audit trail)

The `source` field helps distinguish:
- `'manual'` — Marked manually in OS
- `'elvanto_import'` — Imported from Elvanto CSV
- `'qr_scan'` — Future: scanned at meeting (not yet implemented)

## Troubleshooting

### Problem: "CSV missing required columns"

**Cause**: Exported file is missing Date, PersonName, or Status column

**Solution**:
1. Open CSV in Excel or text editor
2. Check that columns include: `Meeting`, `Date`, `PersonName`, `Status`
3. If columns are named differently (e.g., "Attendee" instead of "PersonName"), manually rename them
4. Save and re-import

**Elvanto tip**: If exporting from Elvanto, use the standard CSV export (don't customize columns)

### Problem: "Person not found" mismatches

**Cause**: Person exists in Elvanto but not in OS, or name doesn't match

**Solution**:
1. Open OS → People module
2. Search for person by name
3. If not found, click **Add Person** and create them
4. Ensure name matches Elvanto exactly (or close enough for fuzzy match)
5. Go back and retry import

**Fuzzy match tips**:
- `"John D."` will match `"John Doe"`
- `"Doe"` will match `"John Doe"` (if 3+ chars)
- `"jdoe"` (initials) will match `"John Doe"` if it's `"J.D."` in the CSV

### Problem: Import hangs or times out

**Cause**: Network issue or very large file (1000+ records)

**Solution**:
1. Wait 30 seconds — import may be processing
2. If still hanging, close modal and retry
3. If file is very large (1000+ records), split into smaller CSVs
4. Import smaller batches separately

### Problem: Wrong attendance data imported

**Cause**: Person matched incorrectly (fuzzy match error)

**Solution**:
1. Check the preview before importing
2. If preview shows wrong person matched, close modal
3. Fix name in Elvanto or OS
4. Re-export from Elvanto
5. Retry import with corrected data

**How to fix**:
- Manual attendance records can be edited or deleted in meeting detail
- Mark correct person and status manually if needed
- Re-import later when names are fixed

### Problem: Some people imported, others not

**Cause**: Mix of matched and unmatched people

**Solution**:
1. Review the mismatches list shown in results
2. Add unmatched people to OS
3. Re-import the same CSV — duplicates are handled (updated, not re-added)
4. This time more people will match

## Performance

- **CSV parsing**: <100ms (even for 1000 records)
- **Person matching**: ~50ms per person (parallel lookup)
- **Batch import**: <2 seconds for 100+ people
- **Trend calculation**: <1 second (updates user % and watch list)

## Security

- **Data isolation**: Attendance only visible to users in same department
- **Audit trail**: All imports logged with `source = 'elvanto_import'`
- **No direct access**: You cannot manually edit import source (read-only)
- **Background processing**: No sensitive data exposed during import

## API Reference (For Developers)

If building custom integration:

```typescript
// Parse CSV
import { parseElvantoCSV } from './lib/csv/elvanto-attendance-parser'
const result = parseElvantoCSV(csvText)
// result.records: parsed attendance records
// result.errors: validation errors
// result.summary: total/valid/invalid counts

// Import to database
import { importElvantoAttendance } from './lib/csv/attendanceImportLib'
const summary = await importElvantoAttendance(records, meetingId)
// summary.imported: number of records imported
// summary.skipped: number skipped (mismatches)
// summary.mismatches: array of unmatched people

// Recalculate trends
import { recalculateAttendanceTrends } from './lib/meetings'
const trends = await recalculateAttendanceTrends(meetingId)
// trends.usersUpdated: how many user % updated
// trends.watchListCount: how many < 75%
// trends.avgAttendancePercentage: average % across users
```

## FAQ

**Q: Can I import the same CSV twice?**  
A: Yes. Duplicates are detected by (meeting_id, user_id) and updated, not re-added.

**Q: What if person's name in OS is different from Elvanto?**  
A: Fuzzy matching handles most variations. If not, add the name as an alias or manually add to OS.

**Q: Does import overwrite manual attendance records?**  
A: No. Import adds new records or updates existing ones from `'elvanto_import'` source. Manual records are separate.

**Q: Can I edit attendance after import?**  
A: Yes. Edit in meeting detail. You can manually change status or delete imported records.

**Q: What's the watch list?**  
A: People with <75% attendance across all meetings. Automatically updated after import.

**Q: How far back does attendance calculation go?**  
A: Trends calculated from all `meeting_attendance` records for that user (no date limit).

**Q: Can I import for a past meeting?**  
A: Yes. Select the meeting (any date) and import. Attendance % is still calculated.

**Q: What if I delete a person from OS?**  
A: Their attendance records remain in database. If re-added to OS with same ID, records re-appear.

**Q: Is there a size limit on CSV files?**  
A: No hard limit. Tested with 500+ record CSVs. Very large files (10,000+) may take longer.

## Support

If you encounter issues:
1. Check **Troubleshooting** section above
2. Review the import results screen (lists specific mismatches)
3. Verify CSV format matches Elvanto export
4. Check that person names in OS match (or are similar to) Elvanto

For technical issues:
- Contact your administrator
- Check system logs for error details
- Consider splitting large imports into smaller batches

---

**Last Updated**: June 2024  
**Version**: 1.0  
**Related Docs**: [Meetings Module](./MEETINGS.md), [Attendance Trends](./ATTENDANCE_TRENDS.md)
