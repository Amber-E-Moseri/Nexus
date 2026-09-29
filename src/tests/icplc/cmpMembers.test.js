/**
 * CMP Members API — Fetch, Filter & Export to CSV
 *
 * Usage: node src/tests/icplc/cmpMembers.test.js <leader_token>
 *
 * Output: cmp-members.csv
 */

import { writeFileSync } from 'fs'
import { resolve } from 'path'
import {
  fetchMembersByRoles,
  membersToCSV,
  TARGET_ROLES,
} from '../../features/icplc/lib/cmpMembers.js'

async function main() {
  const leaderToken = process.argv[2]

  if (!leaderToken) {
    console.error('Usage: node src/tests/icplc/cmpMembers.test.js <leader_token>')
    console.error('\nExample:')
    console.error('  node src/tests/icplc/cmpMembers.test.js abc123def456')
    process.exit(1)
  }

  console.log('🔍 Fetching CMP members...\n')
  console.log(`Target roles: ${TARGET_ROLES.join(', ')}\n`)

  try {
    const data = await fetchMembersByRoles(leaderToken)

    console.log('📊 Members by Role:\n')

    TARGET_ROLES.forEach((role) => {
      const count = data.byRole[role]?.length || 0
      const pct = ((count / data.filtered) * 100).toFixed(1)
      console.log(`  ${role.padEnd(30)} ${count.toString().padStart(3)} (${pct}%)`)
    })

    console.log(`\n  ${'TOTAL'.padEnd(30)} ${data.filtered.toString().padStart(3)} of ${data.total} members\n`)

    // Export to CSV
    const csv = membersToCSV(data.members)
    const outputPath = resolve('cmp-members.csv')
    writeFileSync(outputPath, csv, 'utf-8')

    console.log(`✅ Exported to: ${outputPath}`)
    console.log(`   Lines: ${csv.split('\n').length} (1 header + ${data.filtered} data rows)\n`)

    // Show sample
    if (data.members.length > 0) {
      console.log('📄 Sample Member:')
      const sample = data.members[0]
      console.log(`   Name: ${sample.fullName}`)
      console.log(`   Email: ${sample.email}`)
      console.log(`   Phone: ${sample.phone}`)
      console.log(`   Roles: ${sample.roles?.join('; ') || 'N/A'}`)
      console.log(`   Unit: ${sample.unit?.name || 'N/A'}`)
      console.log(`   Active: ${sample.isActive}\n`)
    }

    console.log('✨ Done!\n')
  } catch (err) {
    console.error('Error:', err.message)
    process.exit(1)
  }
}

main()
