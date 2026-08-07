// Nova budget health check.
// Runs daily via cron. Alerts via Slack webhook when monthly spend exceeds thresholds.
// Uses service-role client (called from nova-jobs dispatcher only).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const BUDGET_WARN_PCT = 80   // warn at 80% of monthly budget
const BUDGET_CRIT_PCT = 95   // critical at 95%

export interface BudgetStatus {
  estimatedTotalUsd: number
  dailyAvgUsd: number
  monthlyBudgetUsd: number
  burnPct: number
  alertLevel: 'ok' | 'warning' | 'critical'
}

async function sendSlackAlert(
  webhookUrl: string,
  text: string,
  alertLevel: 'warning' | 'critical',
): Promise<void> {
  const emoji = alertLevel === 'critical' ? '🚨' : '⚠️'
  await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: `${emoji} *Nova Budget Alert*\n${text}`,
      username: 'Nova Monitor',
    }),
  }).catch((e) => console.error('Slack alert failed:', e.message))
}

export async function checkBudgetHealth(
  serviceClient: ReturnType<typeof createClient>,
): Promise<BudgetStatus> {
  const monthlyBudgetUsd = parseFloat(Deno.env.get('NOVA_MONTHLY_BUDGET_USD') ?? '50')
  const slackWebhook = Deno.env.get('NOVA_SLACK_ALERT_WEBHOOK')

  const { data, error } = await serviceClient.rpc('estimate_nova_monthly_cost')

  if (error) {
    console.error('checkBudgetHealth: RPC failed:', error.message)
    return {
      estimatedTotalUsd: 0,
      dailyAvgUsd: 0,
      monthlyBudgetUsd,
      burnPct: 0,
      alertLevel: 'ok',
    }
  }

  const row = data?.[0] ?? {}
  const estimatedTotalUsd = parseFloat(row.estimated_total_usd ?? '0')
  const dailyAvgUsd = parseFloat(row.daily_avg_usd ?? '0')
  const burnPct = monthlyBudgetUsd > 0 ? (estimatedTotalUsd / monthlyBudgetUsd) * 100 : 0

  let alertLevel: 'ok' | 'warning' | 'critical' = 'ok'

  if (burnPct >= BUDGET_CRIT_PCT) {
    alertLevel = 'critical'
    if (slackWebhook) {
      await sendSlackAlert(
        slackWebhook,
        `${burnPct.toFixed(1)}% of monthly budget used ($${estimatedTotalUsd.toFixed(2)} of $${monthlyBudgetUsd}). ` +
        `Daily avg: $${dailyAvgUsd.toFixed(3)}. Nova may be unavailable soon.`,
        'critical',
      )
    }
  } else if (burnPct >= BUDGET_WARN_PCT) {
    alertLevel = 'warning'
    if (slackWebhook) {
      await sendSlackAlert(
        slackWebhook,
        `${burnPct.toFixed(1)}% of monthly budget used ($${estimatedTotalUsd.toFixed(2)} of $${monthlyBudgetUsd}). ` +
        `Daily avg: $${dailyAvgUsd.toFixed(3)}.`,
        'warning',
      )
    }
  }

  console.log(
    `nova budget: $${estimatedTotalUsd.toFixed(3)} / $${monthlyBudgetUsd} (${burnPct.toFixed(1)}%) — ${alertLevel}`,
  )

  return { estimatedTotalUsd, dailyAvgUsd, monthlyBudgetUsd, burnPct, alertLevel }
}
