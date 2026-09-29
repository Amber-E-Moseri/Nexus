/**
 * CMP Members — Inspect Raw Data Structure
 *
 * Shows the full JSON of recent members to identify membership status fields
 */

import {
  fetchMembers,
  filterMembersByDaysAdded,
} from '../../../features/icplc/lib/cmpMembers.js'

async function main() {
  const leaderToken = process.argv[2]

  if (!leaderToken) {
    console.error('Usage: node src/tests/icplc/scripts/cmpMembersInspect.script.js <leader_token>')
    process.exit(1)
  }

  try {
    const allMembers = await fetchMembers(leaderToken)
    const recentMembers = filterMembersByDaysAdded(allMembers, 30)

    console.log(`\n📊 Total recent members: ${recentMembers.length}\n`)
    console.log('🔍 Inspecting first 3 records for membership indicators:\n')

    recentMembers.slice(0, 3).forEach((m, i) => {
      console.log(`\n━━━ Member ${i + 1}: ${m.fullName} ━━━`)
      console.log(JSON.stringify(m, null, 2))
    })

    // Check for common membership fields
    console.log('\n\n📋 Field Analysis (checking first 10 members):\n')
    const fieldsToCheck = [
      'member',
      'memberStatus',
      'status',
      'isActive',
      'member_id',
      'membershipStatus',
      'verified',
      'confirmed',
      'joinedAt',
      'joinedCellAt',
      'fsStatus',
      'baptizedImmersionAt',
      'bornAgainAt',
      'firstSeenAt',
    ]

    recentMembers.slice(0, 10).forEach((m, i) => {
      console.log(`\n${i + 1}. ${m.fullName}:`)
      fieldsToCheck.forEach((field) => {
        if (field in m) {
          const val = m[field]
          console.log(`   ${field}: ${val === null ? '(null)' : val}`)
        }
      })
    })

    console.log('\n✨ Done!\n')
  } catch (err) {
    console.error('Error:', err.message)
    process.exit(1)
  }
}

main()
