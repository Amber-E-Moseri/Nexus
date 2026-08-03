/**
 * Google Apps Script for "This Is It 2.0" Registrations Sheet
 * Handles duplicate detection, deduplication, and sync with Nexus
 *
 * Install: Copy this to Apps Script editor in your Google Sheet
 * Usage: Custom menu "Nexus Sync" → "Clean Duplicates" or "Export Clean Data"
 */

// ========== CONFIGURATION ==========
const SHEET_NAME = 'Registrations'
// Set these in Apps Script Project Settings → Secrets (or paste your values here):
const NEXUS_API_URL = PropertiesService.getScriptProperties().getProperty('NEXUS_API_URL') || 'https://your-nexus-domain.com/functions/v1/registrations-sync'
const NEXUS_API_KEY = PropertiesService.getScriptProperties().getProperty('NEXUS_API_KEY') || ''
const AUTO_PUSH_TO_NEXUS = true // Set to false to disable automatic sync

const HEADER_MAP = {
  submittedAt: 'Submitted at',
  who: 'Who',
  unit: 'Unit',
  firstName: 'First Name',
  lastName: 'Last Name',
  email: 'Email Address',
  phone: 'Phone Number',
  gender: 'Gender',
  designation: 'Designation',
  subgroup: 'Subgroup',
  fellowship: 'Fellowship?',
  shirtSize: 'Shirt size',
  foundationStatus: 'Foundation School status',
  baptised: 'Have you been baptised (immersion)?',
  allergies: 'Do You Have Any Allergies or Diet Restrictions?',
  team: 'Which team would you like to join?',
}

// ========== MENU ==========
function onOpen() {
  const ui = SpreadsheetApp.getUi()
  ui.createMenu('Nexus Sync')
    .addItem('🔍 Detect Duplicates', 'detectDuplicates')
    .addItem('🗑️ Clean Duplicates (Keep Latest)', 'cleanDuplicates')
    .addItem('📤 Sync Registrations to Nexus', 'syncAllToNexus')
    .addItem('📋 Sync Working List to Nexus', 'syncWorkingListToNexus')
    .addItem('👥 Sync Roster (Expected) to Nexus', 'syncRosterToNexus')
    .addItem('📥 Export Clean Data', 'exportCleanData')
    .addItem('📊 View Duplicate Report', 'showDuplicateReport')
    .addSeparator()
    .addItem('⚙️ Settings', 'showSettings')
    .addToUi()
}

// ========== WORKING LIST SYNC ==========
function syncWorkingListToNexus() {
  const WORKING_LIST_SHEET_NAME = 'Working List'
  const props = PropertiesService.getScriptProperties()
  const apiUrl = props.getProperty('NEXUS_API_URL') || ''
  const apiKey = props.getProperty('NEXUS_API_KEY') || ''

  if (!apiUrl || !apiKey) {
    SpreadsheetApp.getUi().alert('❌ API URL or Key not set. Go to Nexus Sync → ⚙️ Settings.')
    return
  }

  const workingListUrl = apiUrl.replace('registrations-sync', 'working-list-sync')

  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(WORKING_LIST_SHEET_NAME)
    if (!sheet) {
      SpreadsheetApp.getUi().alert(`❌ Sheet "${WORKING_LIST_SHEET_NAME}" not found.`)
      return
    }

    const data = sheet.getDataRange().getValues()
    if (data.length < 2) {
      SpreadsheetApp.getUi().alert('No working list data found.')
      return
    }

    const headers = data[0].map(h => h.toString().trim().toLowerCase().replace(/\s+/g, '_'))

    const fullNameIdx = headers.findIndex(h => h === 'full_name' || h === 'fullname' || h === 'name')
    const firstNameIdx = headers.findIndex(h => h.includes('first'))
    const lastNameIdx = headers.findIndex(h => h.includes('last'))
    const emailIdx = headers.findIndex(h => h.includes('email'))
    const subgroupIdx = headers.findIndex(h => h.includes('subgroup') || h.includes('unit'))
    const fellowshipIdx = headers.findIndex(h => h.includes('fellowship'))
    const phoneIdx = headers.findIndex(h => h.includes('phone'))

    const members = []
    for (let i = 1; i < data.length; i++) {
      const row = data[i]
      const email = emailIdx >= 0 ? row[emailIdx].toString().trim() : ''
      if (!email) continue

      let fullName = ''
      if (fullNameIdx >= 0) {
        fullName = row[fullNameIdx].toString().trim()
      } else {
        const firstName = firstNameIdx >= 0 ? row[firstNameIdx].toString().trim() : ''
        const lastName = lastNameIdx >= 0 ? row[lastNameIdx].toString().trim() : ''
        fullName = [firstName, lastName].filter(Boolean).join(' ')
      }

      members.push({
        email,
        full_name: fullName,
        subgroup: subgroupIdx >= 0 ? row[subgroupIdx].toString().trim() : '',
        fellowship: fellowshipIdx >= 0 ? row[fellowshipIdx].toString().trim() : '',
        phone_number: phoneIdx >= 0 ? row[phoneIdx].toString().trim() : '',
      })
    }

    if (members.length === 0) {
      SpreadsheetApp.getUi().alert('No members with email addresses found.')
      return
    }

    const response = UrlFetchApp.fetch(workingListUrl, {
      method: 'post',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      payload: JSON.stringify({ members }),
      muteHttpExceptions: true,
    })

    const responseCode = response.getResponseCode()
    const responseText = response.getContentText()
    let result
    try { result = JSON.parse(responseText) } catch (e) { result = {} }

    if (responseCode === 200) {
      SpreadsheetApp.getUi().alert(`✅ Working list synced!\n\n${result.message || 'Sync complete'}\n${result.upserted != null ? result.upserted + ' rows written.' : ''}`)
    } else {
      SpreadsheetApp.getUi().alert(`❌ Sync failed (HTTP ${responseCode})\n\n${result.error || result.message || responseText}`)
    }
  } catch (e) {
    SpreadsheetApp.getUi().alert(`❌ Error: ${e.message}`)
  }
}

// ========== ROSTER SYNC ==========
function syncRosterToNexus() {
  const ROSTER_SHEET_NAME = 'Working List'
  const props = PropertiesService.getScriptProperties()
  const apiUrl = props.getProperty('NEXUS_API_URL') || ''
  const apiKey = props.getProperty('NEXUS_API_KEY') || ''

  if (!apiUrl || !apiKey) {
    SpreadsheetApp.getUi().alert('❌ API URL or Key not set. Go to Nexus Sync → ⚙️ Settings.')
    return
  }

  const rosterUrl = apiUrl.replace('registrations-sync', 'roster-sync')

  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(ROSTER_SHEET_NAME)
    if (!sheet) {
      SpreadsheetApp.getUi().alert(`❌ Sheet "${ROSTER_SHEET_NAME}" not found.`)
      return
    }

    const data = sheet.getDataRange().getValues()
    if (data.length < 2) {
      SpreadsheetApp.getUi().alert('No roster data found.')
      return
    }

    const headers = data[0].map(h => h.toString().trim().toLowerCase().replace(/\s+/g, '_'))

    // Support both old (First Name / Last Name) and new (full_name) column layouts
    const fullNameIdx = headers.findIndex(h => h === 'full_name' || h === 'fullname' || h === 'name')
    const firstNameIdx = headers.findIndex(h => h.includes('first'))
    const lastNameIdx = headers.findIndex(h => h.includes('last'))
    const emailIdx = headers.findIndex(h => h.includes('email'))
    const subgroupIdx = headers.findIndex(h => h.includes('subgroup') || h.includes('unit'))
    const leadershipIdx = headers.findIndex(h => h.includes('leadership') || h.includes('leader_category') || h.includes('position') || h.includes('role'))

    const members = []
    for (let i = 1; i < data.length; i++) {
      const row = data[i]
      const email = emailIdx >= 0 ? row[emailIdx].toString().trim() : ''
      if (!email) continue

      let firstName = ''
      let lastName = ''
      let fullName = ''

      if (fullNameIdx >= 0) {
        // New layout: single full_name column
        fullName = row[fullNameIdx].toString().trim()
        const parts = fullName.split(' ')
        firstName = parts[0] || ''
        lastName = parts.slice(1).join(' ') || ''
      } else {
        // Old layout: separate first/last columns
        firstName = firstNameIdx >= 0 ? row[firstNameIdx].toString().trim() : ''
        lastName = lastNameIdx >= 0 ? row[lastNameIdx].toString().trim() : ''
        fullName = [firstName, lastName].filter(Boolean).join(' ')
      }

      members.push({
        firstName,
        lastName,
        fullName,
        email,
        subgroup: subgroupIdx >= 0 ? row[subgroupIdx].toString().trim() : '',
        leadership: leadershipIdx >= 0 ? row[leadershipIdx].toString().trim() : '',
      })
    }

    if (members.length === 0) {
      SpreadsheetApp.getUi().alert('No members with email addresses found.')
      return
    }

    const response = UrlFetchApp.fetch(rosterUrl, {
      method: 'post',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      payload: JSON.stringify({ members }),
      muteHttpExceptions: true,
    })

    const result = JSON.parse(response.getContentText())
    if (response.getResponseCode() === 200) {
      SpreadsheetApp.getUi().alert(`✅ Roster synced!\n\n${result.inserted} new + ${result.updated} updated (${result.total} total)`)
    } else {
      SpreadsheetApp.getUi().alert(`❌ Sync failed: ${result.error}`)
    }
  } catch (e) {
    SpreadsheetApp.getUi().alert(`❌ Error: ${e.message}`)
  }
}

// ========== DUPLICATE DETECTION ==========
/**
 * Parse sheet data into objects, mapping headers to normalized fields
 * @returns {Array} Array of registration objects
 */
function parseSheetData() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME)
  if (!sheet) {
    throw new Error(`Sheet "${SHEET_NAME}" not found`)
  }

  const data = sheet.getDataRange().getValues()
  if (data.length < 2) return []

  const headers = data[0]
  const headerIndexMap = {}

  // Build map of header names to column indices
  for (let i = 0; i < headers.length; i++) {
    const headerName = headers[i].toString().trim()
    for (const [key, expectedName] of Object.entries(HEADER_MAP)) {
      if (headerName === expectedName) {
        headerIndexMap[key] = i
      }
    }
  }

  // Parse rows into objects
  const rows = []
  for (let i = 1; i < data.length; i++) {
    const rowData = data[i]
    const row = {
      rowIndex: i + 1, // 1-indexed for sheet reference
      original: rowData,
    }

    // Map data using header indices
    for (const [key, colIndex] of Object.entries(headerIndexMap)) {
      row[key] = (rowData[colIndex] || '').toString().trim()
    }

    // Normalize email and phone for duplicate detection
    row.emailNorm = row.email.toLowerCase().replace(/\s+/g, '')
    row.phoneNorm = row.phone.replace(/\D/g, '') // Remove non-digits

    // Parse submission time for "latest" detection
    row.submittedTime = row.submittedAt ? new Date(row.submittedAt) : new Date(0)

    if (row.email || row.phone) { // Only include if has email or phone
      rows.push(row)
    }
  }

  return rows
}

/**
 * Find duplicate groups by email or phone
 * @param {Array} rows - Parsed registration rows
 * @returns {Object} {duplicates: Map of duplicates, unique: unique records}
 */
function findDuplicates(rows) {
  const emailMap = new Map() // email → [rows]
  const phoneMap = new Map() // phone → [rows]
  const duplicateGroups = [] // Groups of duplicates
  const seen = new Set() // Track rows already in a group

  // Group by email
  for (const row of rows) {
    if (row.emailNorm) {
      if (!emailMap.has(row.emailNorm)) {
        emailMap.set(row.emailNorm, [])
      }
      emailMap.get(row.emailNorm).push(row)
    }
  }

  // Group by phone
  for (const row of rows) {
    if (row.phoneNorm && row.phoneNorm.length > 0) {
      if (!phoneMap.has(row.phoneNorm)) {
        phoneMap.set(row.phoneNorm, [])
      }
      phoneMap.get(row.phoneNorm).push(row)
    }
  }

  // Merge email and phone duplicate groups
  const processedEmails = new Set()
  for (const [email, emailGroup] of emailMap) {
    if (emailGroup.length > 1) {
      // Check if any of these rows also have phone duplicates
      let mergedGroup = new Set(emailGroup)

      for (const row of emailGroup) {
        if (row.phoneNorm) {
          const phoneGroup = phoneMap.get(row.phoneNorm)
          if (phoneGroup) {
            phoneGroup.forEach(r => mergedGroup.add(r))
          }
        }
      }

      if (mergedGroup.size > 1) {
        duplicateGroups.push(Array.from(mergedGroup))
        mergedGroup.forEach(r => seen.add(r.rowIndex))
      }
      processedEmails.add(email)
    }
  }

  // Add phone-only duplicates not already in groups
  for (const [phone, phoneGroup] of phoneMap) {
    if (phoneGroup.length > 1) {
      const notSeen = phoneGroup.filter(r => !seen.has(r.rowIndex))
      if (notSeen.length > 1) {
        duplicateGroups.push(notSeen)
        notSeen.forEach(r => seen.add(r.rowIndex))
      }
    }
  }

  // Separate unique records
  const unique = rows.filter(r => !seen.has(r.rowIndex))

  return { duplicateGroups, unique }
}

/**
 * Resolve duplicates by keeping the latest (most recently submitted)
 * @param {Array} duplicateGroup - Array of duplicate records
 * @returns {Object} {keep: record to keep, discard: [records to remove]}
 */
function resolveDuplicates(duplicateGroup) {
  if (duplicateGroup.length < 2) {
    return { keep: duplicateGroup[0], discard: [] }
  }

  // Sort by submission time, latest first
  const sorted = duplicateGroup.sort((a, b) => b.submittedTime - a.submittedTime)
  const keep = sorted[0]
  const discard = sorted.slice(1)

  return { keep, discard }
}

// ========== UI FUNCTIONS ==========
function detectDuplicates() {
  try {
    const rows = parseSheetData()
    const { duplicateGroups, unique } = findDuplicates(rows)

    if (duplicateGroups.length === 0) {
      SpreadsheetApp.getUi().alert(`✅ No duplicates found!\n\n${unique.length} unique registrations.`)
      return
    }

    let report = `Found ${duplicateGroups.length} duplicate group(s):\n\n`

    for (let i = 0; i < duplicateGroups.length; i++) {
      const group = duplicateGroups[i]
      const emails = [...new Set(group.map(r => r.email).filter(Boolean))]
      const phones = [...new Set(group.map(r => r.phone).filter(Boolean))]

      report += `Group ${i + 1}: ${group.length} registrations\n`
      if (emails.length > 0) report += `  Emails: ${emails.join(', ')}\n`
      if (phones.length > 0) report += `  Phones: ${phones.join(', ')}\n`
      report += `  Rows: ${group.map(r => r.rowIndex).join(', ')}\n\n`
    }

    const ui = SpreadsheetApp.getUi()
    const response = ui.alert(
      `${report}\nKeep latest submission for each group?`,
      ui.ButtonSet.YES_NO
    )

    if (response === ui.Button.YES) {
      cleanDuplicates()
    }
  } catch (error) {
    SpreadsheetApp.getUi().alert(`Error: ${error.message}`)
  }
}

// ========== NEXUS SYNC ==========
/**
 * Push clean registrations to Nexus API
 * @param {Array} rows Cleaned registration rows
 */
function pushToNexus(rows) {
  if (!AUTO_PUSH_TO_NEXUS || !NEXUS_API_KEY) {
    console.log('Auto-push disabled or API key not configured')
    return
  }

  if (!rows || rows.length === 0) {
    console.log('No data to push')
    return
  }

  try {
    // Transform rows to match Nexus schema
    const registrations = rows.map(row => ({
      firstName: row.firstName || '',
      lastName: row.lastName || '',
      email: row.email || '',
      phone: row.phone || '',
      gender: row.gender || '',
      subgroup: row.subgroup || '',
      fellowship: row.fellowship || '',
      designation: row.designation || '',
      shirtSize: row.shirtSize || '',
      foundationStatus: row.foundationStatus || '',
      baptism: row.baptised || '',
      allergies: row.allergies || '',
      team: row.team || '',
      leadership: row.leadership || '',
      submittedAt: row.submittedAt || new Date().toISOString(),
    }))

    const payload = {
      registrations: registrations,
    }

    const options = {
      method: 'post',
      headers: {
        'Authorization': `Bearer ${NEXUS_API_KEY}`,
        'Content-Type': 'application/json',
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true,
    }

    const response = UrlFetchApp.fetch(NEXUS_API_URL, options)
    const responseText = response.getContentText()
    const responseCode = response.getResponseCode()

    console.log(`Response code: ${responseCode}`)
    console.log(`Response text: ${responseText}`)

    let result
    try {
      result = JSON.parse(responseText)
    } catch (parseError) {
      console.error(`Failed to parse JSON: ${parseError.message}`)
      console.error(`Raw response: ${responseText}`)
      return null
    }

    if (responseCode === 200) {
      console.log(`✅ Synced ${result.inserted} new + ${result.updated} updated registrations to Nexus`)
      return result
    } else {
      console.error(`❌ Nexus sync failed: ${responseCode} - ${result.error}`)
      return null
    }
  } catch (error) {
    console.error(`Error pushing to Nexus: ${error.message}`)
    return null
  }
}

function cleanDuplicates() {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME)
    const rows = parseSheetData()
    const { duplicateGroups } = findDuplicates(rows)

    if (duplicateGroups.length === 0) {
      SpreadsheetApp.getUi().alert('No duplicates to clean.')
      return
    }

    // Collect rows to delete (in reverse order to maintain indices)
    const rowsToDelete = []
    for (const group of duplicateGroups) {
      const { discard } = resolveDuplicates(group)
      rowsToDelete.push(...discard.map(r => r.rowIndex))
    }

    // Sort in descending order so deletion doesn't shift indices
    rowsToDelete.sort((a, b) => b - a)

    // Delete duplicate rows
    for (const rowIndex of rowsToDelete) {
      sheet.deleteRow(rowIndex)
    }

    // Get cleaned data and push to Nexus
    const cleanedRows = parseSheetData()
    const syncResult = pushToNexus(cleanedRows)

    let message = `✅ Cleaned ${rowsToDelete.length} duplicate registrations!\n\n${duplicateGroups.length} groups deduplicated. Latest submission kept for each.`
    if (syncResult) {
      message += `\n\n📤 Synced to Nexus: ${syncResult.inserted} new + ${syncResult.updated} updated`
    }

    SpreadsheetApp.getUi().alert(message)
  } catch (error) {
    SpreadsheetApp.getUi().alert(`Error: ${error.message}`)
  }
}

function syncAllToNexus() {
  try {
    const rows = parseSheetData()

    if (rows.length === 0) {
      SpreadsheetApp.getUi().alert('No registrations to sync.')
      return
    }

    const syncResult = pushToNexus(rows)

    let message = `✅ Syncing ${rows.length} registrations to Nexus...`
    if (syncResult) {
      message = `✅ Synced ${rows.length} registrations to Nexus!\n\n📤 Result: ${syncResult.inserted} new + ${syncResult.updated} updated`
    } else {
      message = `❌ Sync failed. Check API URL and Key in Settings.`
    }

    SpreadsheetApp.getUi().alert(message)
  } catch (error) {
    SpreadsheetApp.getUi().alert(`Error: ${error.message}`)
  }
}

function showDuplicateReport() {
  try {
    const rows = parseSheetData()
    const { duplicateGroups, unique } = findDuplicates(rows)

    let html = `<style>
      body { font-family: Arial; padding: 20px; }
      h2 { color: #4C2A92; }
      .group {
        border-left: 4px solid #C4383A;
        padding: 12px;
        margin: 10px 0;
        background: #FBE9E9;
      }
      .record {
        font-size: 11px;
        margin: 6px 0;
        padding: 6px;
        background: white;
      }
      .latest { background: #E8F5EC; font-weight: bold; }
      .summary {
        background: #EDE8F8;
        padding: 12px;
        border-radius: 8px;
        margin-bottom: 20px;
      }
    </style>`

    html += `<div class="summary">
      <strong>Duplicate Report</strong><br>
      Total registrations: ${rows.length}<br>
      Unique registrations: ${unique.length}<br>
      Duplicate groups: ${duplicateGroups.length}<br>
      Duplicates to remove: ${rows.length - unique.length - duplicateGroups.length}
    </div>`

    for (let i = 0; i < duplicateGroups.length; i++) {
      const group = duplicateGroups[i]
      const { keep, discard } = resolveDuplicates(group)

      html += `<div class="group">
        <strong>Group ${i + 1}</strong> (${group.length} registrations)<br>`

      for (const record of group) {
        const isLatest = record.rowIndex === keep.rowIndex
        html += `<div class="record ${isLatest ? 'latest' : ''}">
          Row ${record.rowIndex}:
          ${record.firstName} ${record.lastName}
          (${record.email || 'no email'})
          — ${record.submittedAt}
          ${isLatest ? '✓ KEEP' : '✗ DELETE'}
        </div>`
      }

      html += `</div>`
    }

    const ui = SpreadsheetApp.getUi()
    const width = 800
    const height = 600
    ui.showModelessDialog(HtmlService.createHtmlOutput(html), 'Duplicate Report', { width, height })
  } catch (error) {
    SpreadsheetApp.getUi().alert(`Error: ${error.message}`)
  }
}

function exportCleanData() {
  try {
    const rows = parseSheetData()
    const { duplicateGroups, unique } = findDuplicates(rows)

    // Get kept records from each duplicate group
    const kept = []
    for (const group of duplicateGroups) {
      const { keep } = resolveDuplicates(group)
      kept.push(keep)
    }

    const allRecords = [...unique, ...kept]

    // Format for export (CSV)
    const headers = Object.values(HEADER_MAP)
    let csv = headers.map(h => `"${h}"`).join(',') + '\n'

    for (const record of allRecords) {
      const values = Object.keys(HEADER_MAP).map(key => {
        const value = (record[key] || '').toString().replace(/"/g, '""')
        return `"${value}"`
      })
      csv += values.join(',') + '\n'
    }

    // Create a new sheet for clean data
    const ss = SpreadsheetApp.getActiveSpreadsheet()
    const sheetName = `Registrations Clean - ${new Date().toISOString().split('T')[0]}`

    let cleanSheet = ss.getSheetByName(sheetName)
    if (cleanSheet) {
      ss.deleteSheet(cleanSheet)
    }

    cleanSheet = ss.insertSheet(sheetName)
    cleanSheet.getRange(1, 1, 1, headers.length).setValues([headers])

    // Add data rows
    for (let i = 0; i < allRecords.length; i++) {
      const record = allRecords[i]
      const values = Object.keys(HEADER_MAP).map(key => record[key] || '')
      cleanSheet.getRange(i + 2, 1, 1, values.length).setValues([values])
    }

    SpreadsheetApp.getUi().alert(
      `✅ Exported clean data!\n\n` +
      `Sheet: "${sheetName}"\n` +
      `Total: ${allRecords.length} registrations\n` +
      `(${unique.length} unique + ${kept.length} deduplicated)`
    )
  } catch (error) {
    SpreadsheetApp.getUi().alert(`Error: ${error.message}`)
  }
}

function showSettings() {
  const props = PropertiesService.getScriptProperties()
  const apiUrl = props.getProperty('NEXUS_API_URL') || ''
  const apiKey = props.getProperty('NEXUS_API_KEY') || ''

  const html = `<style>
    body { font-family: Arial; padding: 20px; max-width: 600px; }
    h2 { color: #4C2A92; }
    .setting { margin: 16px 0; }
    label { display: block; margin-bottom: 4px; font-weight: bold; font-size: 13px; }
    input { width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px; box-sizing: border-box; }
    button {
      background: #4C2A92;
      color: white;
      border: none;
      padding: 10px 20px;
      border-radius: 6px;
      cursor: pointer;
      font-weight: bold;
      margin-top: 10px;
    }
    button:hover { background: #37206C; }
    .info {
      background: #E9F0FA;
      padding: 12px;
      border-radius: 4px;
      margin-top: 20px;
      font-size: 12px;
      line-height: 1.5;
    }
    .warning {
      background: #FBF0DE;
      padding: 12px;
      border-radius: 4px;
      margin-top: 10px;
      font-size: 12px;
      border-left: 4px solid #B8710A;
    }
  </style>
  <h2>Nexus Sync Settings</h2>

  <div class="setting">
    <label for="apiUrl">Nexus API URL:</label>
    <input type="text" id="apiUrl" placeholder="https://your-nexus.com/functions/v1/registrations-sync" value="${apiUrl}">
    <small style="color: #666;">The webhook endpoint where registrations will be sent</small>
  </div>

  <div class="setting">
    <label for="apiKey">Nexus API Key:</label>
    <input type="password" id="apiKey" placeholder="sk_..." value="${apiKey}">
    <small style="color: #666;">Your Nexus registration sync API key</small>
  </div>

  <button onclick="saveSettings()">Save Settings</button>

  <div class="info">
    <strong>📤 Auto-Sync Enabled</strong><br>
    When you clean duplicates, registrations are automatically pushed to Nexus.<br>
    <br>
    <strong>Setup:</strong><br>
    1. Get your Nexus API URL and key from your admin<br>
    2. Paste them above<br>
    3. Click Save<br>
    4. Run "Clean Duplicates" to sync automatically
  </div>

  <div class="warning">
    <strong>⚠️ API Key Security:</strong><br>
    Never share your API key. It's stored in this Google Sheet's Project Settings.
  </div>

  <script>
    function saveSettings() {
      const apiUrl = document.getElementById('apiUrl').value.trim();
      const apiKey = document.getElementById('apiKey').value.trim();

      if (!apiUrl) {
        alert('⚠️ API URL is required');
        return;
      }
      if (!apiKey) {
        alert('⚠️ API Key is required');
        return;
      }

      google.script.run.saveNexusSettings(apiUrl, apiKey);
      alert('✅ Settings saved! Auto-sync is now enabled.');
    }
  </script>`

  const ui = SpreadsheetApp.getUi()
  const htmlOutput = HtmlService.createHtmlOutput(html)
  htmlOutput.setWidth(500)
  htmlOutput.setHeight(400)
  ui.showModelessDialog(htmlOutput, 'Nexus Sync Settings')
}

function saveWebhookUrl(url) {
  const props = PropertiesService.getUserProperties()
  props.setProperty('NEXUS_WEBHOOK_URL', url)
}

function saveNexusSettings(apiUrl, apiKey) {
  const props = PropertiesService.getScriptProperties()
  props.setProperty('NEXUS_API_URL', apiUrl)
  props.setProperty('NEXUS_API_KEY', apiKey)
}

// ========== EXPORT FUNCTIONS ==========
/**
 * Format registration data for Nexus CSV import
 * @returns {string} CSV formatted data
 */
function exportForNexus() {
  try {
    const rows = parseSheetData()
    const { duplicateGroups, unique } = findDuplicates(rows)

    // Get kept records from each duplicate group
    const kept = []
    for (const group of duplicateGroups) {
      const { keep } = resolveDuplicates(group)
      kept.push(keep)
    }

    const allRecords = [...unique, ...kept]

    // Format for Nexus (simple CSV)
    const headers = [
      'First Name', 'Last Name', 'Email Address', 'Phone Number',
      'Unit', 'Subgroup', 'Fellowship?', 'Gender', 'Shirt size',
      'Foundation School status', 'Have you been baptised (immersion)?',
      'Do You Have Any Allergies or Diet Restrictions?', 'Which team would you like to join?'
    ]

    let csv = headers.map(h => `"${h}"`).join(',') + '\n'

    for (const record of allRecords) {
      const values = [
        record.firstName, record.lastName, record.email, record.phone,
        record.unit, record.subgroup, record.fellowship, record.gender, record.shirtSize,
        record.foundationStatus, record.baptised, record.allergies, record.team
      ]
      csv += values.map(v => `"${(v || '').toString().replace(/"/g, '""')}"`).join(',') + '\n'
    }

    return csv
  } catch (error) {
    Logger.log(`Error: ${error.message}`)
    return null
  }
}

/**
 * Get JSON representation of clean registrations
 * @returns {Array} Array of registration objects
 */
function getCleanRegistrationsJSON() {
  try {
    const rows = parseSheetData()
    const { duplicateGroups, unique } = findDuplicates(rows)

    const kept = []
    for (const group of duplicateGroups) {
      const { keep } = resolveDuplicates(group)
      kept.push(keep)
    }

    return [...unique, ...kept].map(r => ({
      firstName: r.firstName,
      lastName: r.lastName,
      email: r.email,
      phone: r.phone,
      unit: r.unit,
      subgroup: r.subgroup,
      fellowship: r.fellowship,
      gender: r.gender,
      shirtSize: r.shirtSize,
      foundationStatus: r.foundationStatus,
      baptised: r.baptised,
      allergies: r.allergies,
      team: r.team,
      submittedAt: r.submittedAt,
    }))
  } catch (error) {
    Logger.log(`Error: ${error.message}`)
    return []
  }
}
