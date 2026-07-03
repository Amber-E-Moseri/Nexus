/**
 * Configuration Template for Birthday Sync Script
 *
 * SETUP INSTRUCTIONS:
 * 1. In your Google Apps Script editor, create a new file (+ > Script)
 * 2. Rename it to "CONFIG" (remove the _TEMPLATE suffix)
 * 3. Copy this entire contents into CONFIG.gs
 * 4. Replace all YOUR_* placeholders with actual values
 * 5. Keep this file PRIVATE — never commit it to version control
 */

const CONFIG = {
  // Supabase Project URL (found in Supabase dashboard > Project Settings > API)
  // Example: https://kraurtuhflouyorgtpun.supabase.co
  projectUrl: 'YOUR_SUPABASE_PROJECT_URL',

  // Supabase Service Role Key (SENSITIVE — keep private!)
  // Found in Supabase dashboard > Project Settings > API > Service Role Key
  // WARNING: This key has full database access. Never share or commit.
  serviceRoleKey: 'YOUR_SERVICE_ROLE_KEY',

  // Nexus API endpoint for tasks
  // Usually: https://your-domain.com/api/tasks
  // Or via Supabase REST: https://YOUR_PROJECT.supabase.co/rest/v1/tasks
  apiUrl: 'YOUR_TASKS_API_ENDPOINT',

  // Space (Department) ID where birthday tasks are created
  // Find this in Nexus: Space Settings > Details > Space ID
  departmentId: 'YOUR_DEPARTMENT_ID',

  // Status ID for new birthday tasks (default "To Do")
  // Find this in Nexus: Space Settings > Task Statuses > View Details on "To Do"
  // Or query: SELECT id FROM task_status_definitions WHERE name = 'To Do' LIMIT 1
  statusId: 'YOUR_STATUS_ID',

  // (Optional) Default assignee IDs to assign birthday tasks to
  // Format: ['uuid1', 'uuid2', 'uuid3']
  // Leave empty array [] if you don't want automatic assignment
  defaultAssigneeIds: [],
};

/**
 * FINDING YOUR IDS:
 *
 * Department ID:
 *   - Go to Nexus > Any Space > Settings
 *   - Look for "Space ID" or "Department ID"
 *   - Or check the URL: /spaces/{id}
 *
 * Status ID:
 *   - Go to Nexus > Space Settings > Task Statuses
 *   - Click on "To Do" or your preferred status
 *   - Copy the ID from the status details
 *
 * Service Role Key:
 *   - Go to Supabase dashboard > Your Project > Settings > API
 *   - Copy the "Service Role" key (starts with "eyJ...")
 *   - WARNING: This is sensitive. Keep it secret!
 *
 * Assignee IDs (optional):
 *   - Go to Nexus > Team Settings > View Members
 *   - Click on a member to see their ID
 *   - Copy the UUID
 */
