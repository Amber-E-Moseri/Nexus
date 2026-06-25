import { Anthropic } from '@anthropic-ai/sdk'
import { supabase } from '../supabase'

const anthropic = new Anthropic({
  apiKey: import.meta.env.VITE_ANTHROPIC_API_KEY,
})

// ============================================================================
// AI Transcription Processing — Extract decisions & action items from transcripts
// ============================================================================

/**
 * Process meeting transcript with Claude API
 * Extracts: summary, key points, decisions, action items
 *
 * @param {string} transcript - Meeting transcript or notes text
 * @param {Object} meetingContext - Meeting details for Claude context
 * @returns {Object} { success, data: {...}, error }
 */
export async function processTranscriptionWithClaude(transcript, meetingContext) {
  const startTime = Date.now()

  const systemPrompt = `You are a meeting assistant for BLW Canada. Extract structured information from meeting transcripts.

Context:
- Meeting Type: ${meetingContext.meetingType || 'General'}
- Date: ${meetingContext.date || 'Not specified'}
- Moderator: ${meetingContext.moderator || 'Not specified'}

IMPORTANT: Return ONLY valid JSON (no markdown, no code blocks, no extra text):

{
  "summary": "1-paragraph overview of the meeting (3-4 sentences max)",
  "keyPoints": ["key point 1", "key point 2", "key point 3"],
  "decisions": ["decision 1", "decision 2", "decision 3"],
  "actionItems": [
    {
      "action": "what needs to be done (specific and actionable)",
      "owner": "who should do it (empty string if not mentioned)",
      "dueDate": "yyyy-mm-dd or empty string if not mentioned",
      "priority": "high|medium|low"
    }
  ]
}

Extraction Rules:
- Summary: 3-4 sentences, covers main topics and outcomes
- Key points: 3-5 important points discussed
- Decisions: Only items explicitly decided during meeting
- Action items: Must be specific tasks, not topics
- If owner not mentioned, leave empty string
- If due date not mentioned, leave empty string
- Priority: high=urgent/critical, medium=important, low=nice-to-have
- Extract only what's actually discussed, don't invent details`

  try {
    const response = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 2000,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: `Process this meeting transcript:\n\n${transcript}`,
        },
      ],
    })

    // Extract JSON from response
    const content = response.content[0].text
    const jsonMatch = content.match(/\{[\s\S]*\}/)

    if (!jsonMatch) {
      throw new Error('Claude response did not contain valid JSON')
    }

    const parsed = JSON.parse(jsonMatch[0])

    // Normalize empty strings to null for dates and owners
    const normalizedActionItems = (parsed.actionItems || []).map(item => ({
      action: item.action || '',
      owner: item.owner || null,
      dueDate: item.dueDate || null,
      priority: item.priority || 'medium',
    }))

    const processingTime = Math.round((Date.now() - startTime) / 1000)

    return {
      success: true,
      data: {
        summary: parsed.summary || '',
        keyPoints: parsed.keyPoints || [],
        decisions: parsed.decisions || [],
        extractedActionItems: normalizedActionItems,
        tokensUsed: response.usage.input_tokens + response.usage.output_tokens,
        processingTimeSeconds: processingTime,
      },
    }
  } catch (err) {
    console.error('Claude API error:', err)

    const processingTime = Math.round((Date.now() - startTime) / 1000)

    return {
      success: false,
      error: err.message || 'Failed to process transcript with Claude',
      processingTimeSeconds: processingTime,
    }
  }
}

/**
 * Save transcription result to database
 *
 * @param {string} meetingId - Meeting ID
 * @param {Object} transcriptionData - Processed transcription data
 * @param {string} userId - User ID (creator)
 * @returns {Object} Saved transcription record
 */
export async function saveTranscriptionResult(meetingId, transcriptionData, userId) {
  const { data, error } = await supabase
    .from('meeting_transcriptions')
    .insert([
      {
        meeting_id: meetingId,
        input_type: transcriptionData.inputType || 'transcript',
        input_file_name: transcriptionData.fileName || 'pasted_transcript',
        input_file_size: transcriptionData.fileSize || null,
        summary: transcriptionData.summary,
        key_points: transcriptionData.keyPoints,
        decisions: transcriptionData.decisions,
        extracted_action_items: transcriptionData.extractedActionItems,
        status: 'complete',
        processing_time_seconds: transcriptionData.processingTimeSeconds,
        tokens_used: transcriptionData.tokensUsed,
        created_by: userId,
        processed_at: new Date().toISOString(),
      },
    ])
    .select()
    .single()

  if (error) {
    throw new Error(`Failed to save transcription: ${error.message}`)
  }

  return data
}

/**
 * Get latest transcription for a meeting
 *
 * @param {string} meetingId - Meeting ID
 * @returns {Object|null} Latest transcription record or null
 */
export async function getTranscription(meetingId) {
  const { data, error } = await supabase
    .from('meeting_transcriptions')
    .select('*')
    .eq('meeting_id', meetingId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error && error.code !== 'PGRST116') {
    throw new Error(`Failed to get transcription: ${error.message}`)
  }

  return data
}

/**
 * Get all transcriptions for a meeting
 *
 * @param {string} meetingId - Meeting ID
 * @returns {Array} All transcription records
 */
export async function getTranscriptionHistory(meetingId) {
  const { data, error } = await supabase
    .from('meeting_transcriptions')
    .select('*')
    .eq('meeting_id', meetingId)
    .order('created_at', { ascending: false })

  if (error) {
    throw new Error(`Failed to get transcription history: ${error.message}`)
  }

  return data || []
}

/**
 * Delete a transcription record
 *
 * @param {string} transcriptionId - Transcription ID
 * @returns {void}
 */
export async function deleteTranscription(transcriptionId) {
  const { error } = await supabase
    .from('meeting_transcriptions')
    .delete()
    .eq('id', transcriptionId)

  if (error) {
    throw new Error(`Failed to delete transcription: ${error.message}`)
  }
}

/**
 * Update transcription with user edits before saving to minutes
 *
 * @param {string} transcriptionId - Transcription ID
 * @param {Object} updates - Updated fields (summary, decisions, extractedActionItems)
 * @returns {Object} Updated transcription record
 */
export async function updateTranscriptionBeforeSave(transcriptionId, updates) {
  const { data, error } = await supabase
    .from('meeting_transcriptions')
    .update({
      summary: updates.summary,
      decisions: updates.decisions,
      extracted_action_items: updates.extractedActionItems,
      updated_at: new Date().toISOString(),
    })
    .eq('id', transcriptionId)
    .select()
    .single()

  if (error) {
    throw new Error(`Failed to update transcription: ${error.message}`)
  }

  return data
}

/**
 * Calculate cost of processing (tokens * rate)
 * Approximate: $0.003 per 1K input tokens, $0.015 per 1K output tokens
 *
 * @param {number} tokensUsed - Total tokens used
 * @returns {number} Estimated cost in USD (cents)
 */
export function calculateProcessingCost(tokensUsed) {
  // Sonnet 3.5 pricing: $3 per 1M input, $15 per 1M output
  // Average: ~$0.005 per 1K tokens
  return (tokensUsed / 1000) * 0.005 * 100 // Convert to cents
}
