# AppScript Setup Guide — This Is It 2.0 Registrations

## Installation

### Step 1: Open Apps Script Editor
1. Open your **Google Sheet** with the "Registrations" tab
2. Click **Extensions** → **Apps Script**
3. Delete any existing default code
4. Copy the entire contents of `appScript.gs` and paste it into the editor
5. Click **Save** (or Ctrl+S)

### Step 2: Grant Permissions
1. Click **Run** → Select `onOpen`
2. Google will ask for permissions to access the Sheet
3. Click **Review Permissions** → **Allow**

### Step 3: Reload the Sheet
1. Go back to your Google Sheet
2. Refresh the page
3. You should see a new menu: **Nexus Sync** at the top

---

## Features

### 🔍 Detect Duplicates
Shows a preview of all duplicates found by email or phone number.

**What it does:**
- Groups registrations by email address or phone number
- Counts how many duplicates exist
- Shows which rows are duplicates
- Asks if you want to clean them

### 🗑️ Clean Duplicates (Keep Latest)
Removes duplicate registrations, keeping **only the latest submission** for each email/phone.

**Algorithm:**
1. Groups records by email OR phone number
2. Sorts each group by submission time (Submitted at)
3. Keeps the most recent submission
4. Deletes all older duplicates
5. Shows how many were removed

**Example:**
```
Group 1 (Email: john@example.com):
  Row 5 - John Doe - 2024-01-10 → DELETE (old)
  Row 8 - John Doe - 2024-01-15 → KEEP (latest)
  Row 12 - John Doe - 2024-01-20 → DELETE (old)
```

### 📥 Export Clean Data
Creates a new sheet with all duplicates already removed and cleaned.

**Output:** New sheet named `Registrations Clean - YYYY-MM-DD` with:
- No duplicate registrations
- All records in the same format
- Ready to import into Nexus

### 📊 View Duplicate Report
Opens a detailed HTML report showing:
- Total registrations
- Number of duplicates
- Each duplicate group with before/after
- Which records will be kept vs. deleted
- Submission dates for comparison

---

## Duplicate Detection Logic

### How Email/Phone Matching Works

1. **Email matching:**
   - Normalizes: lowercase + removes whitespace
   - Treats `john@example.com` and `JOHN@EXAMPLE.COM` as the same

2. **Phone matching:**
   - Removes all non-digits
   - Treats `(555) 123-4567`, `555-123-4567`, `5551234567` as the same

3. **Combined matching:**
   - If two registrations share email OR phone, they're considered duplicates
   - Example: Same email from different phones = duplicate
   - Example: Same phone from different emails = duplicate

### Example Duplicate Groups

**Group 1 — Same Email:**
```
Row 5: john@example.com, (555) 111-1111, Submitted 2024-01-10
Row 8: john@example.com, (555) 222-2222, Submitted 2024-01-15 ← KEEP (latest)
```
Result: Delete row 5, keep row 8

**Group 2 — Same Phone:**
```
Row 12: john@example.com, 555-123-4567, Submitted 2024-01-05
Row 15: jane@example.com,  555-123-4567, Submitted 2024-01-20 ← KEEP (latest)
```
Result: Delete row 12, keep row 15

**Group 3 — Linked via Email & Phone:**
```
Row 3: john@example.com, 555-111-1111, Submitted 2024-01-01
Row 7: john@example.com, 555-222-2222, Submitted 2024-01-10
Row 9: jane@example.com,  555-222-2222, Submitted 2024-01-20 ← KEEP (latest)
```
Result: All three are in the same group; keep row 9 (most recent), delete rows 3 & 7

---

## Workflow

### Typical Usage:

1. **Collect registrations** in the "Registrations" sheet
2. Click **Nexus Sync** → **Detect Duplicates** (preview step)
3. Review the report if you want (`📊 View Duplicate Report`)
4. Click **Nexus Sync** → **Clean Duplicates (Keep Latest)**
5. Click **Nexus Sync** → **📥 Export Clean Data** (creates new sheet)
6. Copy the new sheet data and paste into Nexus `/registration` → **Import Data** tab

---

## Troubleshooting

### AppScript menu doesn't appear
- Make sure you saved the script
- Refresh the Google Sheet (F5 or Ctrl+R)
- Check that the SHEET_NAME in the script is `Registrations`

### "Sheet 'Registrations' not found"
- Rename your tab to exactly `Registrations` (case-sensitive recommended)
- Or update `SHEET_NAME` in the AppScript at the top

### No duplicates found but I think there are some
- Check that email addresses match exactly (case/whitespace)
- Phone numbers must have same digits (punctuation is ignored)
- Both email AND phone must be present (can't detect on partial data)

### Script runs slowly
- For 1000+ registrations, it may take 10-30 seconds
- Google Sheets has speed limits; this is normal

---

## Integration with Nexus

### Auto-Sync (Future)

Add a webhook to automatically push cleaned data to Nexus:

```javascript
// In appScript.gs, after deduplication:
const cleanData = getCleanRegistrationsJSON()
UrlFetchApp.fetch('https://your-nexus.com/api/registrations/sync', {
  method: 'post',
  headers: { 'Authorization': 'Bearer YOUR_API_KEY' },
  payload: JSON.stringify(cleanData),
  contentType: 'application/json',
})
```

### Manual Sync

For now, export the clean data and paste it into Nexus:
1. `📥 Export Clean Data` → Creates new sheet
2. Select all data in new sheet
3. Copy (Ctrl+C)
4. Go to Nexus `/registration` page
5. **Import Data** tab → **Registrations** section → paste

---

## Header Map Reference

The script maps these Google Form headers to Nexus fields:

| Nexus Field | Google Form Header |
|---|---|
| `firstName` | First Name |
| `lastName` | Last Name |
| `email` | Email Address |
| `phone` | Phone Number |
| `unit` | Unit |
| `subgroup` | Subgroup |
| `fellowship` | Fellowship? |
| `gender` | Gender |
| `shirtSize` | Shirt size |
| `foundationStatus` | Foundation School status |
| `baptised` | Have you been baptised (immersion)? |
| `allergies` | Do You Have Any Allergies or Diet Restrictions? |
| `team` | Which team would you like to join? |
| `submittedAt` | Submitted at |

---

## Tips

- **Before cleaning:** Always run **Detect Duplicates** first to preview
- **Backup:** The script doesn't delete the original Registrations sheet, just marks rows for deletion
- **Multiple imports:** If you re-import form responses, run Clean Duplicates each time
- **Dates:** Submission time is used for "latest" detection — make sure your form timestamps are accurate
