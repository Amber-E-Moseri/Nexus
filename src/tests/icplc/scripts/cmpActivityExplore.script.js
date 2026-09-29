/**
 * CMP Activity API — Explore Endpoints
 *
 * Test various API endpoints to find attendance/activity data
 */

const leaderToken = process.argv[2]
const memberId = process.argv[3] || 'cmowbbyjv000bj1thc59gz98q'

if (!leaderToken) {
  console.error('Usage: node src/tests/icplc/scripts/cmpActivityExplore.script.js <token> [memberId]')
  process.exit(1)
}

async function testEndpoint(url, name) {
  try {
    console.log(`\n🔗 Testing: ${name}`)
    console.log(`   URL: ${url}`)

    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${leaderToken}`,
        'Content-Type': 'application/json',
      },
    })

    console.log(`   Status: ${res.status} ${res.statusText}`)

    if (res.ok) {
      const data = await res.json()
      console.log(`   ✅ SUCCESS`)
      console.log(`   Response keys: ${Object.keys(data).slice(0, 5).join(', ')}${Object.keys(data).length > 5 ? '...' : ''}`)
      if (data.data) console.log(`   Data length: ${Array.isArray(data.data) ? data.data.length : 'object'}`)
      return data
    } else {
      console.log(`   ❌ FAILED`)
      const text = await res.text()
      if (text) console.log(`   Error: ${text.slice(0, 100)}`)
    }
  } catch (err) {
    console.log(`   ❌ ERROR: ${err.message}`)
  }

  return null
}

async function main() {
  console.log(`\n📊 Testing CMP Activity Endpoints`)
  console.log(`Member ID: ${memberId}\n`)

  const endpoints = [
    // Activity endpoints
    [`https://leaders.lwcanada.org/api/members/${memberId}/activity`, 'Member Activity'],
    [`https://leaders.lwcanada.org/api/members/${memberId}/checkins`, 'Member Check-ins'],
    [`https://leaders.lwcanada.org/api/members/${memberId}/attendance`, 'Member Attendance'],
    [`https://leaders.lwcanada.org/api/activity?memberId=${memberId}`, 'Activity by Member'],
    [`https://leaders.lwcanada.org/api/checkins?memberId=${memberId}`, 'Check-ins by Member'],
    [`https://leaders.lwcanada.org/api/attendance?memberId=${memberId}`, 'Attendance by Member'],

    // Meeting/Cell endpoints
    [`https://leaders.lwcanada.org/api/meetings?memberId=${memberId}`, 'Meetings by Member'],
    [`https://leaders.lwcanada.org/api/members/${memberId}/meetings`, 'Member Meetings'],

    // Generic
    [`https://leaders.lwcanada.org/api/members/${memberId}`, 'Member Details (extended)'],
  ]

  let found = null
  for (const [url, name] of endpoints) {
    const result = await testEndpoint(url, name)
    if (result && !found) found = result
  }

  if (found) {
    console.log('\n\n✅ Found working endpoint! Full response sample:')
    console.log(JSON.stringify(found, null, 2).slice(0, 500))
  }

  console.log('\n✨ Done!\n')
}

main()
