/**
 * CMP Members — Last Month Added
 *
 * Exports members added in the last 30 days (or custom days)
 *
 * Usage: node src/tests/icplc/cmpMembersRecent.test.js <leader_token> [days]
 *
 * Example:
 *   node src/tests/icplc/cmpMembersRecent.test.js <token>        # Last 30 days
 *   node src/tests/icplc/cmpMembersRecent.test.js <token> 7      # Last 7 days
 *   node src/tests/icplc/cmpMembersRecent.test.js <token> 60     # Last 60 days
 *
 * Output: cmp-members-recent.csv
 */

import { writeFileSync } from 'fs'
import { resolve } from 'path'
import {
  fetchMembers,
  filterMembersByDaysAdded,
  getMembershipStatus,
  membersToCSV,
} from '../../features/icplc/lib/cmpMembers.js'

async function main() {
  const leaderToken = process.argv[2]
  const days = parseInt(process.argv[3], 10) || 30

  if (!leaderToken) {
    console.error('Usage: node src/tests/icplc/cmpMembersRecent.test.js <leader_token> [days]')
    console.error('\nExamples:')
    console.error('  node src/tests/icplc/cmpMembersRecent.test.js <token>        # Last 30 days')
    console.error('  node src/tests/icplc/cmpMembersRecent.test.js <token> 7      # Last 7 days')
    process.exit(1)
  }

  console.log(`🔍 Fetching ALL CMP members added in last ${days} days...\n`)

  try {
    const allMembers = await fetchMembers(leaderToken)
    const recentMembers = filterMembersByDaysAdded(allMembers, days)

    console.log(`📊 Members Added (${days} days): ${recentMembers.length}\n`)

    // Classify by membership status
    const members = recentMembers.filter((m) => getMembershipStatus(m) === 'Member')
    const prospects = recentMembers.filter((m) => getMembershipStatus(m) === 'Prospect')

    console.log(`  Members:   ${members.length} (${((members.length / recentMembers.length) * 100).toFixed(1)}%)`)
    console.log(`  Prospects: ${prospects.length} (${((prospects.length / recentMembers.length) * 100).toFixed(1)}%)\n`)

    // Export to CSV
    const csv = membersToCSV(recentMembers)
    const outputPath = resolve('cmp-members-recent.csv')
    writeFileSync(outputPath, csv, 'utf-8')

    console.log(`✅ Exported to: ${outputPath}`)
    console.log(`   Lines: ${csv.split('\n').length} (1 header + ${recentMembers.length} data rows)\n`)

    // Show samples
    if (recentMembers.length > 0) {
      console.log('📄 Sample Members (first 5):')
      recentMembers.slice(0, 5).forEach((m, i) => {
        const roles = m.roles?.length > 0 ? ` [${m.roles.join(', ')}]` : ''
        console.log(`   ${i + 1}. ${m.fullName} (${m.unit?.name || 'N/A'})${roles}`)
        console.log(`      Added: ${new Date(m.createdAt).toLocaleDateString()}`)
      })
      console.log()
    } else {
      console.log('⚠️  No members found in this date range.\n')
    }

    console.log('✨ Done!\n')
  } catch (err) {
    console.error('Error:', err.message)
    process.exit(1)
  }
}

main()
