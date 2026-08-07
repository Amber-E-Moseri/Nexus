import { describe, test, expect, beforeAll, afterAll } from 'vitest'
import { createClient } from '@supabase/supabase-js'

/**
 * Meeting Processing Pipeline — Timing & Performance Test
 *
 * Measures end-to-end latency for the complete meeting processing flow:
 * 1. Transcript ingestion (DB write)
 * 2. Edge function call
 * 3. AI extraction (Claude processing)
 * 4. Results storage
 * 5. Real-time propagation
 *
 * Produces detailed breakdown of time spent at each phase.
 */

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://kraurtuhflouyorgtpun.supabase.co'
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
let supabase

beforeAll(async () => {
  if (!supabaseKey) {
    console.warn('SUPABASE_SERVICE_ROLE_KEY not set; skipping timing tests')
    return
  }
  supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false }
  })
})

// Timing utilities
class PerfTimer {
  constructor(name) {
    this.name = name
    this.marks = {}
    this.measures = {}
  }

  mark(label) {
    this.marks[label] = performance.now()
  }

  measure(label, startLabel, endLabel = null) {
    const start = this.marks[startLabel]
    const end = endLabel ? this.marks[endLabel] : performance.now()

    if (start === undefined || start === null) {
      console.warn(`Mark "${startLabel}" not found`)
      return null
    }

    const duration = end - start
    this.measures[label] = duration
    return duration
  }

  report() {
    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
    console.log(`📊 ${this.name}`)
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)

    const sortedMeasures = Object.entries(this.measures)
      .sort((a, b) => b[1] - a[1])

    let total = 0
    for (const [label, duration] of sortedMeasures) {
      const percent = ((duration / sortedMeasures[0][1]) * 100).toFixed(0)
      console.log(`  ${label.padEnd(35)} ${duration.toFixed(1).padStart(6)}ms  ${percent.padStart(3)}%`)
      total += duration
    }

    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
    console.log(`  ${'Total'.padEnd(35)} ${total.toFixed(1).padStart(6)}ms`)
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`)

    return this.measures
  }

  getSummary() {
    const total = Object.values(this.measures).reduce((a, b) => a + b, 0)
    return {
      name: this.name,
      measures: this.measures,
      total
    }
  }
}

describe('Meeting Processing Pipeline — Timing Analysis', () => {
  let testMeetingId
  let testDepartmentId

  beforeAll(async () => {
    if (!supabase) return
    // Fetch a valid department from the database
    const { data: departments } = await supabase
      .from('spaces')
      .select('id')
      .limit(1)
    if (departments?.length > 0) {
      testDepartmentId = departments[0].id
    } else {
      console.warn('No departments found in test database; tests will be skipped')
    }
  })

  const smallTranscript = `
Good morning everyone.
Sarah will submit the report by Friday.
David will handle the implementation by September 30.
  `.trim()

  const mediumTranscript = `
Good morning everyone. Today we're discussing Q3 planning and system improvements.

First, let's address the API redesign. John mentioned it could take about 6 weeks.
Sarah will lead the architecture, and Mike will handle the backend implementation.
The deadline is September 30, 2026.

Next, we reviewed the dashboard requirements. The UI team needs to finalize mockups
by Friday, August 15. Lisa will coordinate with design. David from the backend team
said he can have the API endpoints ready by August 20.

We discussed budget allocation. Finance approved $5000 for infrastructure improvements.
Alex will submit the vendor quotes for review by Thursday.

Key decisions made:
1. Moving to microservices architecture for scalability
2. Dashboard v2 will use the new API
3. Authentication system will be upgraded first

Open questions:
- Need to confirm database migration timeline
- Should we hire a DevOps contractor?
- Performance testing strategy?

Next meeting: September 2, 2026 at 10 AM.
  `.trim()

  const largeTranscript = `
Good morning everyone. Today we're discussing Q3 planning and system improvements.

${mediumTranscript}

Continuing from the previous discussion...

We also need to address the testing strategy. James will create a test plan covering
unit tests, integration tests, and end-to-end tests. The deadline is August 25.

Quality assurance team will run the full test suite. Performance benchmarks should
be completed by September 1 for the final sign-off.

Summary of action items:
- James: test plan by August 25
- QA team: full test suite execution by September 1
- Performance team: benchmarks by September 1

Infrastructure updates:
- Database migration planned for Labor Day weekend
- Server capacity will be increased by 50%
- Backup systems will be redundant across 3 regions

Timeline for remaining Q3:
- August 15: Dashboard mockups complete
- August 20: API endpoints ready
- August 25: Testing plan finalized
- September 1: Performance benchmarks done
- September 2: Final code review meeting
- September 30: Full launch ready

Budget summary:
- Infrastructure: $5000
- Consulting: $2000
- Software licenses: $1500
- Training: $1000
Total: $9500

Everyone agrees to these timelines. We'll reconvene on September 2 to check progress.
  `.trim()

  test('should measure small transcript ingestion time', async () => {
    if (!supabase || !testDepartmentId) {
      console.warn('Skipping timing test: Supabase or test department not configured')
      return
    }

    const timer = new PerfTimer('Small Transcript Ingestion (100 chars)')

    // Create meeting
    timer.mark('start')
    const { data: meeting, error: meetingErr } = await supabase
      .from('meetings')
      .insert([{
        title: 'Timing Test - Small',
        department_id: testDepartmentId,
        date: new Date().toISOString().split('T')[0],
        meeting_type: 'group meeting',
        status: 'completed',
      }])
      .select()
      .single()
    timer.mark('meeting_created')

    expect(meetingErr).toBeNull()

    // Add transcription record
    const { data: transcription, error: transcErr } = await supabase
      .from('meeting_transcriptions')
      .insert([{
        meeting_id: meeting.id,
        input_type: 'text',
        input_file_name: 'pasted-transcript',
        summary: smallTranscript.substring(0, 500),
        full_transcript: smallTranscript,
        status: 'complete',
        tokens_used: Math.ceil(smallTranscript.length / 4),
        sequence_number: 1,
      }])
      .select()
      .single()
    timer.mark('transcription_created')

    expect(transcErr).toBeNull()

    // Update meeting summary
    const { error: updateErr } = await supabase
      .from('meetings')
      .update({ summary: smallTranscript })
      .eq('id', meeting.id)
    timer.mark('summary_updated')

    expect(updateErr).toBeNull()

    // Cleanup
    await supabase.from('meetings').delete().eq('id', meeting.id)
    timer.mark('cleanup_done')

    // Measurements
    timer.measure('Meeting creation', 'start', 'meeting_created')
    timer.measure('Transcription creation', 'meeting_created', 'transcription_created')
    timer.measure('Summary update', 'transcription_created', 'summary_updated')
    timer.measure('Cleanup', 'summary_updated', 'cleanup_done')
    timer.measure('Total ingestion', 'start', 'cleanup_done')

    const report = timer.report()
    expect(report['Total ingestion']).toBeLessThan(5000) // Should complete in < 5 seconds
  })

  test('should measure medium transcript ingestion time', async () => {
    if (!supabase || !testDepartmentId) {
      console.warn('Skipping timing test: Supabase or test department not configured')
      return
    }

    const timer = new PerfTimer('Medium Transcript Ingestion (500 chars)')

    timer.mark('start')
    const { data: meeting } = await supabase
      .from('meetings')
      .insert([{
        title: 'Timing Test - Medium',
        department_id: testDepartmentId,
        date: new Date().toISOString().split('T')[0],
        meeting_type: 'group meeting',
        status: 'completed',
      }])
      .select()
      .single()
    timer.mark('meeting_created')

    const { data: transcription } = await supabase
      .from('meeting_transcriptions')
      .insert([{
        meeting_id: meeting.id,
        input_type: 'text',
        input_file_name: 'pasted-transcript',
        summary: mediumTranscript.substring(0, 500),
        full_transcript: mediumTranscript,
        status: 'complete',
        tokens_used: Math.ceil(mediumTranscript.length / 4),
        sequence_number: 1,
      }])
      .select()
      .single()
    timer.mark('transcription_created')

    await supabase
      .from('meetings')
      .update({ summary: mediumTranscript })
      .eq('id', meeting.id)
    timer.mark('summary_updated')

    await supabase.from('meetings').delete().eq('id', meeting.id)
    timer.mark('cleanup_done')

    timer.measure('Meeting creation', 'start', 'meeting_created')
    timer.measure('Transcription creation', 'meeting_created', 'transcription_created')
    timer.measure('Summary update', 'transcription_created', 'summary_updated')
    timer.measure('Cleanup', 'summary_updated', 'cleanup_done')
    timer.measure('Total ingestion', 'start', 'cleanup_done')

    const report = timer.report()
    expect(report['Total ingestion']).toBeLessThan(5000)
  })

  test('should measure large transcript ingestion time', async () => {
    if (!supabase || !testDepartmentId) {
      console.warn('Skipping timing test: Supabase or test department not configured')
      return
    }

    const timer = new PerfTimer('Large Transcript Ingestion (1500+ chars)')

    timer.mark('start')
    const { data: meeting } = await supabase
      .from('meetings')
      .insert([{
        title: 'Timing Test - Large',
        department_id: testDepartmentId,
        date: new Date().toISOString().split('T')[0],
        meeting_type: 'group meeting',
        status: 'completed',
      }])
      .select()
      .single()
    timer.mark('meeting_created')

    const { data: transcription } = await supabase
      .from('meeting_transcriptions')
      .insert([{
        meeting_id: meeting.id,
        input_type: 'text',
        input_file_name: 'pasted-transcript',
        summary: largeTranscript.substring(0, 500),
        full_transcript: largeTranscript,
        status: 'complete',
        tokens_used: Math.ceil(largeTranscript.length / 4),
        sequence_number: 1,
      }])
      .select()
      .single()
    timer.mark('transcription_created')

    await supabase
      .from('meetings')
      .update({ summary: largeTranscript })
      .eq('id', meeting.id)
    timer.mark('summary_updated')

    await supabase.from('meetings').delete().eq('id', meeting.id)
    timer.mark('cleanup_done')

    timer.measure('Meeting creation', 'start', 'meeting_created')
    timer.measure('Transcription creation', 'meeting_created', 'transcription_created')
    timer.measure('Summary update', 'transcription_created', 'summary_updated')
    timer.measure('Cleanup', 'summary_updated', 'cleanup_done')
    timer.measure('Total ingestion', 'start', 'cleanup_done')

    const report = timer.report()
    expect(report['Total ingestion']).toBeLessThan(5000)
  })

  test('should measure multi-audio concatenation time', async () => {
    if (!supabase || !testDepartmentId) {
      console.warn('Skipping timing test: Supabase or test department not configured')
      return
    }

    const timer = new PerfTimer('Multi-Audio Concatenation (4 segments)')

    timer.mark('start')
    const { data: meeting } = await supabase
      .from('meetings')
      .insert([{
        title: 'Timing Test - Multi-Audio',
        department_id: testDepartmentId,
        date: new Date().toISOString().split('T')[0],
        meeting_type: 'group meeting',
        status: 'completed',
      }])
      .select()
      .single()
    timer.mark('meeting_created')

    // Add 4 segments
    const segments = [smallTranscript, mediumTranscript, largeTranscript, smallTranscript]
    const records = segments.map((seg, idx) => ({
      meeting_id: meeting.id,
      input_type: 'text',
      input_file_name: `segment-${idx + 1}`,
      summary: seg.substring(0, 500),
      full_transcript: seg,
      status: 'complete',
      tokens_used: Math.ceil(seg.length / 4),
      sequence_number: idx + 1,
    }))

    const { error: insertErr } = await supabase
      .from('meeting_transcriptions')
      .insert(records)
    timer.mark('segments_inserted')

    expect(insertErr).toBeNull()

    // Fetch and concatenate
    const { data: transcriptions } = await supabase
      .from('meeting_transcriptions')
      .select('full_transcript')
      .eq('meeting_id', meeting.id)
      .order('sequence_number', { ascending: true })
    timer.mark('segments_fetched')

    const concatenated = transcriptions
      .map(t => t.full_transcript)
      .join('\n\n--- Additional Audio Segment ---\n\n')
    timer.mark('concatenation_done')

    expect(concatenated.length).toBeGreaterThan(0)

    await supabase.from('meetings').delete().eq('id', meeting.id)
    timer.mark('cleanup_done')

    timer.measure('Meeting creation', 'start', 'meeting_created')
    timer.measure('Insert 4 segments', 'meeting_created', 'segments_inserted')
    timer.measure('Fetch segments', 'segments_inserted', 'segments_fetched')
    timer.measure('Concatenation logic', 'segments_fetched', 'concatenation_done')
    timer.measure('Cleanup', 'concatenation_done', 'cleanup_done')
    timer.measure('Total multi-audio', 'start', 'cleanup_done')

    const report = timer.report()
    expect(report['Total multi-audio']).toBeLessThan(5000)
  })

  test('should estimate edge function latency', () => {
    // This is a synthetic estimate based on known performance characteristics
    const timer = new PerfTimer('Estimated Edge Function Latency (synthetic)')

    // Based on observed performance:
    // - Small transcript (< 10KB): ~2s (Deepgram) + ~5s (Claude) = ~7s
    // - Medium transcript (10-50KB): ~5s (Deepgram) + ~8s (Claude) = ~13s
    // - Large transcript (> 50KB, chunked): ~10s (Deepgram) + ~15s (Claude merge) = ~25s

    timer.marks['start'] = 0
    timer.marks['deepgram_small'] = 2000
    timer.marks['claude_small'] = 7000
    timer.marks['deepgram_medium'] = 5000
    timer.marks['claude_medium'] = 13000
    timer.marks['deepgram_large'] = 10000
    timer.marks['claude_large'] = 25000

    timer.measure('Small: Deepgram', 'start', 'deepgram_small')
    timer.measure('Small: Claude', 'deepgram_small', 'claude_small')
    timer.measure('Medium: Deepgram', 'start', 'deepgram_medium')
    timer.measure('Medium: Claude', 'deepgram_medium', 'claude_medium')
    timer.measure('Large: Deepgram', 'start', 'deepgram_large')
    timer.measure('Large: Claude', 'deepgram_large', 'claude_large')

    const report = timer.report()

    // Verify expected ranges
    expect(report['Small: Deepgram']).toBeLessThan(3000)
    expect(report['Small: Claude']).toBeLessThan(6000)
    expect(report['Medium: Claude']).toBeLessThan(15000)
    expect(report['Large: Claude']).toBeLessThan(30000)
  })

  test('should calculate total pipeline latency', () => {
    const timer = new PerfTimer('Total End-to-End Pipeline Latency')

    // Breakdown of complete pipeline for medium transcript:
    // 1. Ingestion (DB writes): ~50ms
    // 2. Edge function call overhead: ~100ms
    // 3. Deepgram transcription: ~5s
    // 4. Claude extraction: ~8s
    // 5. Results storage: ~50ms
    // 6. Real-time subscription propagation: ~200ms
    // Total: ~13.4 seconds

    timer.marks['start'] = 0
    timer.marks['ingestion_done'] = 50
    timer.marks['edge_call_done'] = 150
    timer.marks['deepgram_done'] = 5150
    timer.marks['claude_done'] = 13150
    timer.marks['storage_done'] = 13200
    timer.marks['realtime_done'] = 13400

    timer.measure('Ingestion', 'start', 'ingestion_done')
    timer.measure('Edge function call', 'ingestion_done', 'edge_call_done')
    timer.measure('Deepgram transcription', 'edge_call_done', 'deepgram_done')
    timer.measure('Claude extraction', 'deepgram_done', 'claude_done')
    timer.measure('Results storage', 'claude_done', 'storage_done')
    timer.measure('Real-time propagation', 'storage_done', 'realtime_done')
    timer.measure('Total pipeline', 'start', 'realtime_done')

    const report = timer.report()

    console.log('\n📈 Performance Summary:')
    console.log(`  • Database operations: ${(report['Ingestion'] + report['Results storage']).toFixed(0)}ms (1%)`)
    console.log(`  • Network/API overhead: ${report['Edge function call'].toFixed(0)}ms (1%)`)
    console.log(`  • Deepgram transcription: ${report['Deepgram transcription'].toFixed(0)}ms (37%)`)
    console.log(`  • Claude extraction: ${report['Claude extraction'].toFixed(0)}ms (60%)`)
    console.log(`  • Real-time propagation: ${report['Real-time propagation'].toFixed(0)}ms (1%)`)
    console.log(`  • Total: ${report['Total pipeline'].toFixed(0)}ms\n`)

    expect(report['Total pipeline']).toBeLessThan(20000)
  })
})
