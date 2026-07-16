import { deactivateExpiredSprintMembers } from '../features/sprints/lib/sprints'

/**
 * Daily scheduled task to deactivate expired temporary sprint members
 * Call this once per day (e.g., at midnight UTC via cron job)
 *
 * Usage in GitHub Actions or external cron:
 * curl -X POST https://your-api-endpoint.com/scheduled/deactivate-temp-members
 */
export async function scheduleTemporaryMemberDeactivation() {
  console.log('[Scheduled Task] Running temporary member deactivation...')
  try {
    const result = await deactivateExpiredSprintMembers()
    console.log('[Scheduled Task] Success:', result)
    return {
      success: true,
      ...result,
    }
  } catch (error) {
    console.error('[Scheduled Task] Error:', error)
    return {
      success: false,
      error: error.message,
    }
  }
}

export default scheduleTemporaryMemberDeactivation
