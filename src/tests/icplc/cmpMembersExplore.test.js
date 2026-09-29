/**
 * CMP Members — Explore Attendance Data
 *
 * Digs through member records to find attendance count / engagement fields
 */

import {
  fetchMembers,
  filterMembersByDaysAdded,
} from '../../features/icplc/lib/cmpMembers.js'

async function main() {
  const leaderToken = process.argv[2]

  if (!leaderToken) {
    console.error('Usage: node src/tests/icplc/cmpMembersExplore.test.js <leader_token>')
    process.exit(1)
  }

  try {
    const allMembers = await fetchMembers(leaderToken)
    const recentMembers = filterMembersByDaysAdded(allMembers, 30)

    console.log('\n📊 Total recent members: ' + recentMembers.length + '\n')

    // Find members with joinedCellAt
    const withCellJoin = recentMembers.filter((m) => m.joinedCellAt)
    console.log('✅ Joined Cell: ' + withCellJoin.length + '\n')

    // Analyze a few members with cell join
    console.log('🔍 Sample members WITH joinedCellAt:\n')
    withCellJoin.slice(0, 3).forEach((m, i) => {
      console.log(`${i + 1}. ${m.fullName}`)
      console.log(`   joinedCellAt: ${m.joinedCellAt}`)
      console.log(`   lastSeenAt: ${m.lastSeenAt}`)
      console.log(`   firstAttendedAt: ${m.discipleshipProfile?.firstAttendedAt || 'N/A'}`)
      console.log(`   Full record keys:`)
      console.log(
        '   ' +
          Object.keys(m)
            .filter((k) => !k.startsWith('_') && k !== 'unit' && k !== 'discipleshipProfile')
            .join(', '),
      )
      console.log()
    })

    // Check members WITHOUT joinedCellAt for engagement
    const withoutCellJoin = recentMembers.filter((m) => !m.joinedCellAt)
    console.log(
      '\n📋 Analyzing ' +
        withoutCellJoin.length +
        ' members WITHOUT joinedCellAt for engagement signals:\n',
    )

    const engagementSignals = {
      hasLastSeenAt: 0,
      hasFirstAttendedAt: 0,
      hasMultipleAttendances: 0,
      hasAttendanceRecord: 0,
      hasBornAgainAt: 0,
      hasBaptizedAt: 0,
    }

    withoutCellJoin.forEach((m) => {
      if (m.lastSeenAt) engagementSignals.hasLastSeenAt++
      if (m.discipleshipProfile?.firstAttendedAt) engagementSignals.hasFirstAttendedAt++
      if (m.bornAgainAt) engagementSignals.hasBornAgainAt++
      if (m.baptizedImmersionAt) engagementSignals.hasBaptizedAt++
    })

    Object.entries(engagementSignals).forEach(([key, count]) => {
      console.log(`  ${key}: ${count}`)
    })

    // Show samples of engaged prospects
    console.log('\n📋 Prospects WITH lastSeenAt (potentially engaged):\n')
    const engagedProspects = withoutCellJoin.filter((m) => m.lastSeenAt)
    engagedProspects.slice(0, 5).forEach((m, i) => {
      console.log(`${i + 1}. ${m.fullName}`)
      console.log(`   lastSeenAt: ${m.lastSeenAt}`)
      console.log(`   firstAttendedAt: ${m.discipleshipProfile?.firstAttendedAt || 'N/A'}`)
      console.log()
    })

    console.log(
      '\n💡 FINDINGS: Attendance tracking likely via lastSeenAt field (check-in timestamps)\n',
    )
    console.log('To get 3+ attendances, we would need:')
    console.log('  - Access to an attendance/check-in API endpoint')
    console.log('  - Or a count field if available in the member record')
    console.log('  - Or reconstruct from timestamps\n')

    console.log('✨ Done!\n')
  } catch (err) {
    console.error('Error:', err.message)
    process.exit(1)
  }
}

main()
