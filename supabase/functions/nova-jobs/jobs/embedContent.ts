// embedContent — SERVICE ROLE job that chunks and embeds meeting minutes into nova_embeddings.
// Runs weekly; idempotent via content_hash. Only processes unembedded or changed content.
// SERVICE ROLE is required to read across all departments without RLS scoping.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { embedText, chunkText, sha256Hex, EMBEDDING_MODEL } from '../../_shared/novaEmbeddings.ts'

const BATCH_SIZE = 20  // meetings processed per run (stay within edge function timeout)

export async function embedContent(
  serviceClient: ReturnType<typeof createClient>,
): Promise<{ processed: number; chunksInserted: number; skipped: number; errors: number }> {
  let processed = 0
  let chunksInserted = 0
  let skipped = 0
  let errors = 0

  // Find recent submitted meeting minutes with content not yet embedded
  const { data: minutesRows } = await serviceClient
    .from('meeting_minutes')
    .select(`
      id, meeting_id, summary,
      meeting:meetings!meeting_id(id, title, date, department_id),
      segments:meeting_minutes_segments(notes, decisions, key_points)
    `)
    .eq('status', 'submitted')
    .not('summary', 'is', null)
    .order('created_at', { ascending: false })
    .limit(BATCH_SIZE)

  for (const row of minutesRows ?? []) {
    const meeting = Array.isArray(row.meeting) ? row.meeting[0] : row.meeting
    if (!meeting) continue

    // Assemble full text content from summary + segment notes
    const segments = (row.segments ?? []) as any[]
    const segmentText = segments
      .map((s: any) => [s.notes, s.decisions, s.key_points].filter(Boolean).join('\n'))
      .join('\n\n')

    const fullContent = [row.summary, segmentText].filter(Boolean).join('\n\n')
    if (!fullContent.trim()) { skipped++; continue }

    const contentHash = await sha256Hex(fullContent)

    // Check if already embedded with same hash
    const { data: existing } = await serviceClient
      .from('nova_embeddings')
      .select('id, content_hash')
      .eq('source_id', row.meeting_id)
      .eq('source_type', 'meeting_minutes')
      .limit(1)
      .maybeSingle()

    if (existing?.content_hash === contentHash) { skipped++; continue }

    // Delete stale chunks if content changed
    if (existing) {
      await serviceClient
        .from('nova_embeddings')
        .delete()
        .eq('source_id', row.meeting_id)
        .eq('source_type', 'meeting_minutes')
    }

    const chunks = chunkText(fullContent)

    try {
      for (let i = 0; i < chunks.length; i++) {
        const embedding = await embedText(chunks[i])
        const chunkHash = await sha256Hex(chunks[i])

        const { error } = await serviceClient
          .from('nova_embeddings')
          .upsert({
            department_id: meeting.department_id,
            source_type: 'meeting_minutes',
            source_id: row.meeting_id,
            chunk_index: i,
            content: chunks[i],
            content_hash: i === 0 ? contentHash : chunkHash,
            embedding_model: EMBEDDING_MODEL,
            embedding: `[${embedding.join(',')}]`,
          }, { onConflict: 'source_id,chunk_index' })

        if (error) { console.error('nova-embed upsert error:', error.message); errors++ }
        else chunksInserted++
      }
      processed++
    } catch (err) {
      console.error('nova-embed chunk error for meeting', row.meeting_id, ':', (err as Error).message)
      errors++
    }
  }

  return { processed, chunksInserted, skipped, errors }
}
