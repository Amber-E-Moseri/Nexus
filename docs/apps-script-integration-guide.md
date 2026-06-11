# BLW Canada OS — Apps Script Integration Guide

## Overview
Connect Google Sheets workflows to BLW Canada OS through the public Task API.

## API Endpoint
`https://[your-project-ref].supabase.co/functions/v1/task-api`

## Authentication
Include your API key in every request:

`x-api-key: blwk_your_key_here`

## Create a task from Apps Script

```javascript
function createOSTask(title, description, priority, dueDate, externalKey) {
  const API_URL = 'https://YOUR-PROJECT-REF.supabase.co/functions/v1/task-api/tasks'
  const API_KEY = 'blwk_your_key_here' // Store in PropertiesService in production

  const payload = {
    title: title,
    description: description || null,
    priority: priority || 'medium',
    due_date: dueDate || null,
    source_name: 'Google Sheets',
    source_type: 'sheets',
    external_unique_key: externalKey,
  }

  const options = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': API_KEY,
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  }

  const response = UrlFetchApp.fetch(API_URL, options)
  const result = JSON.parse(response.getContentText())

  if (result.duplicate) {
    Logger.log('Task already exists: ' + result.task.id)
    return result.task
  }

  return result.task
}
```

## Birthday Production Example

```javascript
function syncBirthdayTasks() {
  const sheet = SpreadsheetApp.getActiveSheet()
  const rows = sheet.getDataRange().getValues()

  rows.slice(1).forEach(function(row) {
    const name = row[0]
    const birthday = row[1]
    const email = row[2]

    if (!name || !birthday) return

    const dateStr = Utilities.formatDate(new Date(birthday), 'UTC', 'yyyy-MM-dd')
    const externalKey = 'birthday-' + email + '-' + dateStr

    createOSTask(
      'Birthday production: ' + name,
      'Prepare birthday graphic and post for ' + name,
      'medium',
      dateStr,
      externalKey
    )
  })
}
```

## Storing your API key safely

```javascript
function setApiKey() {
  PropertiesService.getScriptProperties().setProperty('OS_API_KEY', 'blwk_your_key')
}

function getApiKey() {
  return PropertiesService.getScriptProperties().getProperty('OS_API_KEY')
}
```

## Rate limits
- 100 requests per minute per API key
- Max 200 tasks per `GET /tasks` request
- No rate limit on `GET /spaces` or `GET /sprints`

## Error codes
| Code | Meaning |
|------|---------|
| `401` | Invalid, revoked, or expired API key |
| `400` | Missing required field (`title`) |
| `200` + `duplicate: true` | Task already exists — no duplicate created |
| `500` | Server error — retry with exponential backoff |
