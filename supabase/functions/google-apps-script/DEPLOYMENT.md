# Birthday Sync Script Deployment Guide

This directory contains the Google Apps Script that automatically creates birthday flyer tasks in BLW Nexus.

## Quick Setup

### 1. Prepare Your Google Sheet

- Open or create the Google Sheet with your birthday data
- Columns should be:
  - **A:** Name (e.g., "John Doe")
  - **B:** Birth Date (e.g., "1990-07-15")
  - **C:** Email (optional)
  - **D:** Notes (optional)

### 2. Create the Apps Script

1. Open your Google Sheet
2. Go to **Extensions** → **Apps Script**
3. Delete any default code
4. Copy the contents of `syncBirthdaysToNexus.gs` into the editor
5. Create a new file: **+ (icon)** → **Script**
6. Name it **CONFIG** (exactly)
7. Copy contents of `CONFIG_TEMPLATE.gs` into CONFIG.gs
8. **Edit the CONFIG values** (see below)
9. **Save** the project

### 3. Configure Credentials

In **CONFIG.gs**, replace these placeholders:

```javascript
const CONFIG = {
  projectUrl: 'https://YOUR_PROJECT.supabase.co',
  serviceRoleKey: 'eyJ...',  // From Supabase dashboard
  apiUrl: 'https://YOUR_PROJECT.supabase.co/rest/v1/tasks',
  departmentId: 'YOUR_SPACE_UUID',
  statusId: 'YOUR_TODO_STATUS_UUID',
  defaultAssigneeIds: [],
};
```

**Where to find these values:**

| Value | Location |
|-------|----------|
| `projectUrl` | Supabase Dashboard → Settings → API → Project URL |
| `serviceRoleKey` | Supabase Dashboard → Settings → API → Service Role Key |
| `apiUrl` | `{projectUrl}/rest/v1/tasks` |
| `departmentId` | Nexus → Space Settings → Space ID (or check URL `/spaces/{id}`) |
| `statusId` | Nexus → Space Settings → Task Statuses → Click "To Do" → Copy ID |
| `defaultAssigneeIds` | Nexus → Team → Click member → Copy ID (optional) |

**IMPORTANT:** Never commit CONFIG.gs to version control. Add to `.gitignore`:

```
supabase/functions/google-apps-script/CONFIG.gs
```

### 4. Set Up Monthly Trigger

The script is designed to run on the **30th of each month** at a specific time.

1. In the Apps Script editor, go to **Triggers** (clock icon on left)
2. Click **+ Create a new trigger**
3. Configure:
   - **Function:** `syncBirthdaysToNexus`
   - **Deployment:** Head
   - **Event source:** Time-driven
   - **Type:** Month
   - **Day of month:** 30th
   - **Time:** 12:00 AM (or your preferred time)
   - **Timezone:** America/Toronto (or your timezone)
4. **Save**

### 5. Manual Testing

Before the scheduled date, test manually:

1. In Apps Script editor, select `syncBirthdaysToNexus` from the dropdown
2. Click **Run** (play icon)
3. Check the **Execution log** (View → Logs) for success/errors
4. Verify a task was created in Nexus → Your Space → Tasks

### 6. Backfill Past Months (Optional)

If you need to create tasks for months that have already passed:

1. In Apps Script editor, go to **Execution log**
2. Find the `backfillMonth` function in the code
3. In the editor, paste this into the console:

```javascript
backfillMonth(7, 2026);  // July 2026
backfillMonth(6, 2026);  // June 2026
```

4. Click **Run** to execute

---

## Troubleshooting

### "Authorization failed"
- Check that `serviceRoleKey` is correct (from Supabase)
- Verify it's the **Service Role** key, not the Anon key
- Service Role key should start with `eyJ...`

### "API returned 400/401"
- Verify `apiUrl` is correct
- Check that `departmentId` and `statusId` are valid UUIDs
- Ensure credentials have access to your Supabase project

### "No birthdays found"
- Check that birth dates are in column B
- Dates should be formatted as `YYYY-MM-DD` or a standard date format
- Verify rows don't have empty cells that break parsing

### "Task created but no status shows"
- Ensure `statusId` is for an active status (not archived)
- Check that the status belongs to your department
- Verify in Nexus: Space Settings → Task Statuses → Status is marked "Active"

### Script ran but no tasks appeared
- Check the Execution log for errors
- Verify the birth dates are actually in the current/next month
- Confirm your Nexus account has permission to create tasks in that space

---

## Security Notes

- **Never commit CONFIG.gs** — it contains API keys
- Add to `.gitignore`:
  ```
  supabase/functions/google-apps-script/CONFIG.gs
  ```
- If you accidentally commit credentials, regenerate your Service Role Key in Supabase immediately
- Only admins should have access to the Apps Script file

---

## Maintenance

- Review the script before each deployment cycle (e.g., yearly)
- Update `CONFIG.gs` if IDs change (space reorganization, status hierarchy updates)
- Check the execution log monthly to catch any failures
- Keep your Google Sheet's birth date column up to date

---

## What This Script Does

**On the 30th of each month:**
1. Reads all birthdays from your Google Sheet for the **upcoming month**
2. For each birthday found:
   - Creates a new task titled "Birthday Flyer - [Name]"
   - Sets the due date to the birth date
   - Assigns the status "To Do"
   - Optionally assigns to default team members
3. Logs results (created/failed count)

**Example:**
- Run on June 30th → Creates tasks for all July birthdays
- Run on July 30th → Creates tasks for all August birthdays
