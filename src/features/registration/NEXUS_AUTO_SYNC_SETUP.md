# Nexus Auto-Sync Setup — Google Sheets → Nexus

## Overview

Registrations now sync **automatically** from Google Sheets to Nexus when you clean duplicates. No manual CSV import needed.

## Setup Steps

### Step 1: Get Your API Credentials

Contact your Nexus admin to get:
- **Nexus API URL**: The endpoint where registrations sync (usually `https://your-domain.com/functions/v1/registrations-sync`)
- **Nexus API Key**: A secret key that authorizes your Google Sheets to push data

### Step 2: Configure AppScript

1. Open your Google Sheet (with "Registrations" tab)
2. Click **Extensions** → **Apps Script**
3. In the Apps Script editor, click **Project Settings** (gear icon)
4. Scroll down to **Script properties**
5. Add two new properties:
   ```
   Property: NEXUS_API_URL
   Value: https://your-nexus-domain.com/functions/v1/registrations-sync
   ```
   ```
   Property: NEXUS_API_KEY
   Value: sk_your_api_key_here
   ```
6. Close Project Settings

### Step 3: Configure via Settings Menu

Alternatively, you can configure directly in the sheet:

1. Go back to your Google Sheet
2. Click **Nexus Sync** → **⚙️ Settings**
3. Paste your **Nexus API URL** and **Nexus API Key**
4. Click **Save Settings**

## How It Works

### Before (Manual)
```
1. Clean duplicates in Google Sheets
2. Export CSV from Google Sheets
3. Go to Nexus /registration page
4. Import CSV manually
5. Wait for data to appear
```

### After (Auto-Sync)
```
1. Clean duplicates in Google Sheets
2. ✅ Registrations auto-sync to Nexus
3. Done — data appears in Nexus instantly
```

## Workflow

1. **Collect registrations** in your Google Form → auto-fills Registrations sheet
2. Click **Nexus Sync** → **Detect Duplicates** (preview, optional)
3. Click **Nexus Sync** → **Clean Duplicates (Keep Latest)**
4. ✅ System automatically:
   - Removes duplicate rows from Google Sheets
   - Pushes clean data to Nexus API
   - Shows how many registrations were inserted/updated
5. Done! Check your Nexus `/registration` page to see the data

## What Gets Synced

All registration fields are sent to Nexus:
- Name, Email, Phone
- Gender, Subgroup, Fellowship
- Shirt Size, Foundation Status, Baptism status
- Allergies/Diet Restrictions
- Team preference, Leadership role
- Arrival/Departure flight info
- Submission timestamp

## Troubleshooting

### "Unauthorized: Invalid API key"
- Check that your NEXUS_API_KEY is correct (copy-paste carefully)
- Make sure there are no extra spaces before/after
- Verify with your Nexus admin that the key is valid

### "Error: registrations-sync endpoint not found"
- Verify the NEXUS_API_URL is correct
- Check that your Nexus admin has deployed the sync function
- The URL should end with `/registrations-sync` (not `/registration`)

### Sync shows 0 inserted/updated
- Check that email addresses in the sheet are unique
- Verify that emails are lowercase and don't have extra spaces
- Make sure all required fields are filled (email is mandatory)

### Data appears in Google Sheets but not in Nexus
- Check the Apps Script logs: **Extensions** → **Apps Script** → **Execution log**
- Verify the API key is correct (Settings menu or Project Settings)
- Look for errors in the sync response

## Disabling Auto-Sync

If you want to disable automatic syncing (and go back to manual CSV import):

**Option 1:** Remove the API key
- Go to **Nexus Sync** → **⚙️ Settings**
- Clear the **Nexus API Key** field
- Click Save

**Option 2:** In Apps Script Project Settings
- Delete the `NEXUS_API_KEY` property
- Auto-sync will be disabled

## Security Notes

- **API Key**: Keep it private. Never share it publicly.
- **Project Settings**: Only editors of this Google Sheet can see the key
- **Data**: All registrations are sent over HTTPS (encrypted in transit)
- **Storage**: Data is stored in Nexus Supabase with RLS protection

## Testing the Connection

To test if your setup works:

1. Add a test registration to your Google Sheet (or Google Form)
2. Click **Nexus Sync** → **Clean Duplicates (Keep Latest)**
3. Check the alert message for the sync result:
   - ✅ "Synced X new + Y updated registrations to Nexus" = Success
   - ❌ "Nexus sync failed" = Check your API key and URL

## Feedback

If you encounter issues:
1. Check the Apps Script execution log for error details
2. Verify your API credentials with your Nexus admin
3. Ensure the Registrations sheet name is exactly "Registrations" (case-sensitive)

---

**Auto-Sync is now enabled by default.** You can sync multiple times — registrations are upserted (updated if they already exist, inserted if new).
