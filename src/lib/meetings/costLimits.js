import { supabase } from '../supabase'

// ============================================================================
// Cost Control & Rate Limiting for AI Transcription Processing
// ============================================================================

const LIMITS = {
  // Daily limits
  maxDailyProcesses: 50, // Max 50 transcriptions per day
  maxDailySpend: 0.50, // Max $0.50 per day (1000+ transcripts)

  // Per-transcript limits
  maxTranscriptChars: 50000, // Max 50K characters (~12,000 words, 30 min meeting)
  maxTokensPerTranscript: 2000, // Max output tokens

  // Rate limiting
  minSecondsBetweenProcesses: 2, // Minimum 2 seconds between calls
  maxProcessesPerHour: 30, // Max 30 per hour (prevent rapid-fire)

  // Warning thresholds
  costWarningThreshold: 0.30, // Warn when approaching daily limit
  transcriptSizeWarning: 40000, // Warn for large transcripts
}

/**
 * Check if AI processing is enabled
 * Admin can disable to pause all processing
 */
export async function isProcessingEnabled() {
  try {
    const { data, error } = await supabase
      .from('system_settings')
      .select('value')
      .eq('key', 'ai_processing_enabled')
      .single()

    if (error) return true // Default to enabled
    return data.value !== 'false'
  } catch {
    return true // Default to enabled
  }
}

/**
 * Check if user can process transcription
 * Returns: { allowed: boolean, reason?: string, stats?: {...} }
 */
export async function canProcessTranscript(userId, transcriptLength) {
  // 1. Check if processing is enabled
  const enabled = await isProcessingEnabled()
  if (!enabled) {
    return {
      allowed: false,
      reason: 'AI transcription processing is currently disabled by admin',
    }
  }

  // 2. Check transcript size
  if (transcriptLength > LIMITS.maxTranscriptChars) {
    return {
      allowed: false,
      reason: `Transcript too long. Max ${LIMITS.maxTranscriptChars} characters. Yours: ${transcriptLength}`,
    }
  }

  if (transcriptLength < 50) {
    return {
      allowed: false,
      reason: 'Transcript too short. Need at least 50 characters.',
    }
  }

  // 3. Check daily limits
  const today = new Date().toISOString().split('T')[0]

  const { data: todayProcesses, error: countError } = await supabase
    .from('meeting_transcriptions')
    .select('tokens_used')
    .eq('created_by', userId)
    .gte('created_at', `${today}T00:00:00`)
    .eq('status', 'complete')

  if (countError) {
    console.error('Error checking daily limit:', countError)
    return { allowed: true } // Allow on error (fail open)
  }

  const processCount = todayProcesses?.length || 0
  const totalSpend = (todayProcesses?.reduce((sum, p) => sum + (p.tokens_used || 0), 0) || 0) / 1000 * 0.005

  // Check process count
  if (processCount >= LIMITS.maxDailyProcesses) {
    return {
      allowed: false,
      reason: `Daily limit reached. Max ${LIMITS.maxDailyProcesses} transcriptions per day.`,
      stats: { processCount, totalSpend },
    }
  }

  // Check spend
  if (totalSpend >= LIMITS.maxDailySpend) {
    return {
      allowed: false,
      reason: `Daily spending limit reached. Max $${LIMITS.maxDailySpend} per day.`,
      stats: { processCount, totalSpend },
    }
  }

  // 4. Check rate limiting (max per hour)
  const oneHourAgo = new Date(Date.now() - 3600000).toISOString()

  const { data: hourlyProcesses, error: hourlyError } = await supabase
    .from('meeting_transcriptions')
    .select('id')
    .eq('created_by', userId)
    .gte('created_at', oneHourAgo)
    .eq('status', 'complete')

  if (hourlyError) {
    console.error('Error checking hourly limit:', hourlyError)
    return { allowed: true } // Allow on error
  }

  if ((hourlyProcesses?.length || 0) >= LIMITS.maxProcessesPerHour) {
    return {
      allowed: false,
      reason: `Hourly limit reached. Max ${LIMITS.maxProcessesPerHour} transcriptions per hour. Try again in a few minutes.`,
      stats: { processCount, totalSpend },
    }
  }

  // 5. Warnings (allowed but notify user)
  const warnings = []

  if (transcriptLength > LIMITS.transcriptSizeWarning) {
    warnings.push(`Large transcript (${transcriptLength} chars). Processing may take longer.`)
  }

  const costProjection = totalSpend + 0.001 // Add ~1 more transcription
  if (costProjection > LIMITS.costWarningThreshold) {
    warnings.push(`Daily spending at ${(costProjection * 100).toFixed(1)}¢. Approaching $${LIMITS.maxDailySpend} limit.`)
  }

  return {
    allowed: true,
    warnings,
    stats: {
      processCount,
      totalSpend,
      remainingToday: LIMITS.maxDailyProcesses - processCount,
      spendingRemaining: LIMITS.maxDailySpend - totalSpend,
    },
  }
}

/**
 * Get today's usage stats for a user
 */
export async function getTodayStats(userId) {
  const today = new Date().toISOString().split('T')[0]

  const { data: processes } = await supabase
    .from('meeting_transcriptions')
    .select('tokens_used, processing_time_seconds, status, error_message')
    .eq('created_by', userId)
    .gte('created_at', `${today}T00:00:00`)

  const stats = {
    totalProcesses: processes?.length || 0,
    completedProcesses: processes?.filter(p => p.status === 'complete').length || 0,
    failedProcesses: processes?.filter(p => p.status === 'error').length || 0,
    totalTokens: processes?.reduce((sum, p) => sum + (p.tokens_used || 0), 0) || 0,
    totalCost: ((processes?.reduce((sum, p) => sum + (p.tokens_used || 0), 0) || 0) / 1000 * 0.005) * 100, // cents
    averageProcessingTime:
      processes?.filter(p => p.status === 'complete').length > 0
        ? Math.round(
            processes
              .filter(p => p.status === 'complete')
              .reduce((sum, p) => sum + (p.processing_time_seconds || 0), 0) /
              processes.filter(p => p.status === 'complete').length
          )
        : 0,
  }

  return {
    ...stats,
    remaining: {
      processes: Math.max(0, LIMITS.maxDailyProcesses - stats.completedProcesses),
      spend: Math.max(0, LIMITS.maxDailySpend - stats.totalCost / 100),
    },
  }
}

/**
 * Admin function: Disable/enable processing
 */
export async function setProcessingEnabled(enabled, adminUserId) {
  const { error } = await supabase
    .from('system_settings')
    .upsert(
      {
        key: 'ai_processing_enabled',
        value: enabled ? 'true' : 'false',
        updated_by: adminUserId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'key' }
    )

  if (error) throw error
}

/**
 * Admin function: Set daily spend limit
 */
export async function setDailySpendLimit(amountDollars, adminUserId) {
  if (amountDollars < 0.01) {
    throw new Error('Minimum daily limit is $0.01')
  }

  const { error } = await supabase
    .from('system_settings')
    .upsert(
      {
        key: 'ai_daily_spend_limit',
        value: amountDollars.toString(),
        updated_by: adminUserId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'key' }
    )

  if (error) throw error
}

/**
 * Admin function: Set daily process limit
 */
export async function setDailyProcessLimit(count, adminUserId) {
  if (count < 1) {
    throw new Error('Minimum daily limit is 1 process')
  }

  const { error } = await supabase
    .from('system_settings')
    .upsert(
      {
        key: 'ai_daily_process_limit',
        value: count.toString(),
        updated_by: adminUserId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'key' }
    )

  if (error) throw error
}

/**
 * Get current limits
 */
export async function getLimits() {
  return {
    ...LIMITS,
    costPerThousandTokens: 0.005, // Haiku pricing
    modelCost: {
      inputTokens: 0.80, // per 1M
      outputTokens: 4.0, // per 1M
    },
  }
}

/**
 * Alert threshold: Send notification when close to limit
 */
export async function checkAlertThresholds(userId) {
  const stats = await getTodayStats(userId)
  const alerts = []

  // 80% of process limit
  if (stats.completedProcesses >= LIMITS.maxDailyProcesses * 0.8) {
    alerts.push({
      level: 'warning',
      message: `Approaching daily process limit: ${stats.completedProcesses}/${LIMITS.maxDailyProcesses}`,
    })
  }

  // 80% of spend limit
  if (stats.totalCost / 100 >= LIMITS.maxDailySpend * 0.8) {
    alerts.push({
      level: 'warning',
      message: `Approaching daily spending limit: $${(stats.totalCost / 100).toFixed(2)}/$${LIMITS.maxDailySpend}`,
    })
  }

  // High failure rate
  if (stats.totalProcesses > 5 && stats.failedProcesses / stats.totalProcesses > 0.2) {
    alerts.push({
      level: 'warning',
      message: `High failure rate: ${stats.failedProcesses}/${stats.totalProcesses} failed`,
    })
  }

  return alerts
}
