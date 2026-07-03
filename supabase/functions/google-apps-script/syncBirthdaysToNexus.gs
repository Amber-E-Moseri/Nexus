/**
 * Google Apps Script: Sync Birthdays to Nexus
 *
 * This script automatically creates birthday flyer tasks in BLW Nexus
 * by reading birthdays from the current sheet and syncing them to Supabase.
 *
 * Setup:
 * 1. Create a new Google Apps Script in your Google Sheet (Extensions > Apps Script)
 * 2. Copy both syncBirthdaysToNexus.gs and CONFIG_TEMPLATE.gs into the editor
 * 3. Rename CONFIG_TEMPLATE.gs to CONFIG.gs and fill in your credentials
 * 4. Set up monthly triggers (see DEPLOYMENT.md)
 */

/**
 * Main sync function: Loads birthdays for the next month and creates tasks
 * Run this on the 30th of each month to prepare for the upcoming month
 */
function syncBirthdaysToNexus() {
  try {
    const now = new Date();
    const nextMonth = now.getMonth() + 1;
    const year = nextMonth === 12 ? now.getFullYear() + 1 : now.getFullYear();

    Logger.log(`Syncing birthdays for ${getMonthName(nextMonth)} ${year}`);

    const birthdays = loadBirthdaysForMonth_(nextMonth, year);
    Logger.log(`Found ${birthdays.length} birthdays`);

    let created = 0;
    let failed = 0;

    for (const birthday of birthdays) {
      try {
        createNexusTask_(birthday);
        created++;
      } catch (error) {
        Logger.error(`Failed to create task for ${birthday.name}: ${error.message}`);
        failed++;
      }
    }

    Logger.log(`✓ Created: ${created}, Failed: ${failed}`);
  } catch (error) {
    Logger.error(`Fatal error in syncBirthdaysToNexus: ${error.message}`);
    throw error;
  }
}

/**
 * Backfill function: Load birthdays for a specific month and create tasks
 * Use this to retroactively sync previous months if needed
 *
 * @param {number} monthNum - Month number (1-12)
 * @param {number} year - Year (e.g., 2026)
 */
function backfillMonth(monthNum, year) {
  try {
    Logger.log(`Backfilling ${getMonthName(monthNum)} ${year}`);

    const birthdays = loadBirthdaysForMonth_(monthNum, year);
    Logger.log(`Found ${birthdays.length} birthdays to backfill`);

    let created = 0;
    let skipped = 0;

    for (const birthday of birthdays) {
      try {
        // Check if task already exists to avoid duplicates
        if (!taskExistsForBirthday_(birthday)) {
          createNexusTask_(birthday);
          created++;
        } else {
          skipped++;
        }
      } catch (error) {
        Logger.error(`Failed to backfill ${birthday.name}: ${error.message}`);
      }
    }

    Logger.log(`✓ Created: ${created}, Skipped (existing): ${skipped}`);
  } catch (error) {
    Logger.error(`Error in backfillMonth: ${error.message}`);
    throw error;
  }
}

/**
 * Load birthdays from the sheet for a specific month
 * @private
 */
function loadBirthdaysForMonth_(monthNum, year) {
  const sheet = SpreadsheetApp.getActiveSheet();
  const data = sheet.getDataRange().getValues();

  const birthdays = [];

  // Skip header row (assuming row 1 is headers)
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (!row[0]) continue; // Skip empty rows

    const dateStr = row[1]; // Assuming column B has dates
    if (!dateStr) continue;

    const date = new Date(dateStr);
    if (date.getMonth() + 1 === monthNum) {
      birthdays.push({
        name: row[0],
        date: date,
        email: row[2] || '', // Optional: column C
        notes: row[3] || '',  // Optional: column D
      });
    }
  }

  return birthdays;
}

/**
 * Create a task in Nexus via REST API
 * @private
 */
function createNexusTask_(birthday) {
  const CONFIG = getConfig_();
  const dueDate = formatDateForApi_(birthday.date);

  const payload = {
    title: `Birthday Flyer - ${birthday.name}`,
    description: birthday.notes || `Create and send birthday flyer for ${birthday.name}`,
    due_date: dueDate,
    status_id: CONFIG.statusId,
    assignee_ids: CONFIG.defaultAssigneeIds || [],
    department_id: CONFIG.departmentId,
  };

  const options = {
    method: 'post',
    headers: {
      'Authorization': `Bearer ${CONFIG.serviceRoleKey}`,
      'Content-Type': 'application/json',
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  };

  const response = UrlFetchApp.fetch(CONFIG.apiUrl, options);
  const status = response.getResponseCode();

  if (status < 200 || status >= 300) {
    const body = response.getContentText();
    throw new Error(`API returned ${status}: ${body}`);
  }

  Logger.log(`✓ Created task for ${birthday.name} (${dueDate})`);
}

/**
 * Check if a task already exists for this birthday
 * @private
 */
function taskExistsForBirthday_(birthday) {
  const CONFIG = getConfig_();
  const query = encodeURIComponent(`title.ilike.%${birthday.name}%`);

  const url = `${CONFIG.apiUrl}?${query}&limit=1`;
  const options = {
    method: 'get',
    headers: {
      'Authorization': `Bearer ${CONFIG.serviceRoleKey}`,
    },
    muteHttpExceptions: true,
  };

  const response = UrlFetchApp.fetch(url, options);
  if (response.getResponseCode() === 200) {
    const data = JSON.parse(response.getContentText());
    return data.length > 0;
  }

  return false;
}

/**
 * Format date for Supabase API (YYYY-MM-DD)
 * Add +1 day to compensate for timezone offset
 * @private
 */
function formatDateForApi_(date) {
  const adjusted = new Date(date);
  adjusted.setDate(adjusted.getDate() + 1);

  const year = adjusted.getFullYear();
  const month = String(adjusted.getMonth() + 1).padStart(2, '0');
  const day = String(adjusted.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

/**
 * Load config from CONFIG.gs
 * @private
 */
function getConfig_() {
  // This function is defined in CONFIG.gs
  return CONFIG;
}

/**
 * Get month name from number
 * @private
 */
function getMonthName(monthNum) {
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  return months[monthNum - 1];
}
