# AI Processing Cost Controls

## Overview

Built-in cost controls prevent runaway API charges for AI transcription processing.

**Default Limits**:
- Daily processing: 50 transcriptions (enough for 1 month of meetings)
- Daily spending: $0.50 (covers ~1000 transcriptions with Haiku)
- Per-transcript: 50,000 characters max
- Rate limiting: 30 per hour, 2 seconds between calls

---

## Limits Explained

### Daily Process Limit (Default: 50)
**What it does**: Limits how many transcriptions can be processed per day

**Cost impact**: 
- 50 transcriptions × $0.0005 = ~$0.025/day
- Annual: ~$9 (very low)

**When to adjust**:
- Increase if you have many meetings per day
- Decrease if you want to be more conservative

**Example**:
- 10 meetings/day = ~10 transcriptions needed → set to 15 (buffer for retries)
- 100 meetings/day = ~100 transcriptions → set to 120

### Daily Spend Limit (Default: $0.50)
**What it does**: Stops processing once daily spending reaches this amount

**Cost impact**:
- $0.50/day × 30 days = ~$15/month
- But realistically: Haiku costs ~$0.0005/transcript, so $0.50 = 1000 transcriptions

**When to adjust**:
- Lower for tighter control ($0.10 = 200 transcriptions)
- Raise if you process many large transcripts
- Never set below $0.01

**Safeguard**: Warns users at 80% of limit, blocks at 100%

### Per-Transcript Limits (Default: 50,000 chars)
**What it does**: Prevents extremely large transcripts from using many tokens

**Character counts**:
- 50,000 chars ≈ 12,500 words ≈ 30-minute meeting at normal speech pace
- Typical meeting: 2,000-5,000 chars

**When to adjust**:
- Keep at default (covers all normal meetings)
- Lower only if you want to restrict very long sessions

### Rate Limiting
**Per hour**: 30 transcriptions max
**Between calls**: 2 seconds minimum

**What this prevents**: Someone hammering the API with 100 calls in 1 second

---

## How It Works

### User Processing Flow

```
User clicks "Process with AI"
          ↓
Check 1: Transcript length < 50K chars? ✓
          ↓
Check 2: Processing enabled? ✓
          ↓
Check 3: User under daily process limit? ✓
          ↓
Check 4: User under daily spend limit? ✓
          ↓
Check 5: Rate limit OK (not > 30/hour)? ✓
          ↓
Processing allowed! ✓
```

If ANY check fails → User sees error message (not a surprise charge)

### Daily Stats Display

Users see in TranscriptionUploadPanel:
```
📊 Today's Usage
✓ 12/50 transcriptions
💰 $0.02/$0.50
```

**Warnings trigger at**:
- 80% of process limit (40/50 = ⚠️)
- 80% of spend limit ($0.40 = ⚠️)

---

## Admin Controls

### Enable/Disable Processing

Immediately pause all AI transcription:
```
🛑 DISABLE Processing
```

Use when:
- API key quota exceeded
- Unexpected charges occurring
- Maintenance or testing

Instantly re-enable when ready:
```
✅ ENABLE Processing
```

### Adjust Daily Limits

**In admin panel** (AIProcessingAdminPanel component):

```
Daily Spending Limit: _____ $ [Update]
Daily Process Limit:  _____ transcriptions [Update]
```

Changes take effect immediately for all users.

### Audit Log

All admin changes logged in `system_settings_audit` table:
- Who changed what
- Old value → new value
- Timestamp

Example:
```
User: amber@blwcan.org
Changed: ai_daily_spend_limit
$0.50 → $1.00
2026-06-27 10:30:05 UTC
```

---

## Cost Projection

### Haiku 3.5 Pricing

| Metric | Cost |
|--------|------|
| Per transcript (typical) | $0.0005 |
| Per month (100 meetings) | ~$0.05 |
| Per year (1000 meetings) | ~$0.50 |

### With Default Limits ($0.50/day)

| Scenario | Cost | Notes |
|----------|------|-------|
| 1 meeting/day | $0.15/month | Very light use |
| 10 meetings/day | $1.50/month | Typical church |
| 50 meetings/day | $7.50/month | Heavy use |

**All well under the $0.50/day limit ($15/month budget)**

---

## Safety Features

### 1. User Warnings
- Transcript too long? → "Large transcript detected"
- Approaching limits? → "Only 3 transcriptions left today"
- Daily limit hit? → "Daily limit reached, try tomorrow"

### 2. Automatic Blocking
- Over daily limit? → Cannot process, must wait until tomorrow
- Processing disabled? → Cannot process, contact admin
- Rate limited? → Cannot process, wait a few seconds

### 3. No Silent Overcharges
- All checks happen BEFORE API call
- No charges occur if limits exceeded
- User always sees reason if blocked

### 4. Audit Trail
- Every process tracked in `meeting_transcriptions`
- Who, when, cost, success/failure
- Admin can review history anytime

---

## Configuration

### Default Limits (in costLimits.js)

```javascript
const LIMITS = {
  maxDailyProcesses: 50,      // Can change via admin panel
  maxDailySpend: 0.50,         // Can change via admin panel
  maxTranscriptChars: 50000,   // Hard limit (can edit code)
  maxTokensPerTranscript: 2000,// Hard limit (can edit code)
  minSecondsBetweenProcesses: 2,
  maxProcessesPerHour: 30,
  costWarningThreshold: 0.30,  // Warn at 80%
  transcriptSizeWarning: 40000,// Warn if > 40K chars
}
```

**Change via admin panel**: Daily limits (spend + processes)
**Change in code**: Token limits, rate limits, warning thresholds

---

## Troubleshooting

### "Daily limit reached"
**Cause**: User hit daily process or spend limit
**Solution**: 
- User can retry tomorrow
- Admin can increase limit (AIProcessingAdminPanel)
- Admin can disable limit enforcement temporarily

### "Transcript too long"
**Cause**: Transcript > 50,000 characters
**Solution**:
- User should split into smaller sections
- Admin can increase limit in code (line 8)

### "Rate limited"
**Cause**: Too many rapid requests
**Solution**:
- Wait 2+ seconds between requests
- Don't try to process > 30 in one hour

### Unexpected spending
**Cause**: Processing enabled + heavy usage
**Solution**:
1. Check admin audit log (who processed what)
2. Disable processing temporarily
3. Lower daily spend limit
4. Review usage in `meeting_transcriptions` table

---

## Monitoring

### Check Daily Usage

For a specific user:
```sql
SELECT 
  created_at,
  tokens_used,
  processing_time_seconds,
  status
FROM meeting_transcriptions
WHERE created_by = 'USER_ID'
  AND created_at >= TODAY
ORDER BY created_at DESC
```

### Check Total Monthly Spend

```sql
SELECT 
  DATE_TRUNC('month', created_at) as month,
  COUNT(*) as transcriptions,
  SUM(tokens_used) as total_tokens,
  (SUM(tokens_used) / 1000.0 * 0.005) as cost_dollars
FROM meeting_transcriptions
WHERE status = 'complete'
GROUP BY month
ORDER BY month DESC
```

### Monitor for High Costs

Set up alert: If `SUM(tokens_used) / 1000 * 0.005 > daily_limit` for 3+ days, notify admin

---

## Best Practices

### For Users
1. ✅ Check daily stats before processing
2. ✅ Use clear, complete transcripts (better extraction = fewer retries)
3. ✅ Review extracted content before saving (catches errors early)
4. ✅ Contact admin if you hit limits unexpectedly

### For Admins
1. ✅ Set daily limits based on meeting volume
2. ✅ Monitor monthly costs monthly
3. ✅ Disable processing during high-risk periods (testing, etc.)
4. ✅ Review audit log monthly for anomalies
5. ✅ Communicate limits to team ("We have 50 transcriptions/day budget")

### Cost Optimization
1. ✅ Use Haiku (we do) - 10x cheaper than Sonnet
2. ✅ Encourage quality transcripts - fewer retries
3. ✅ Batch transcripts during off-hours if possible
4. ✅ Review failed transcriptions - understand why they failed

---

## FAQ

**Q: Can I process unlimited transcriptions?**
A: No, limits exist to prevent accidental charges. But limits are configurable. Contact admin to adjust.

**Q: What if I hit the daily limit?**
A: Processing is blocked until next day (UTC midnight). Plan ahead or ask admin to increase limit.

**Q: Can the API charge me without warning?**
A: No. All checks happen before the API call. If blocked, you see the reason immediately.

**Q: How much does this really cost?**
A: Using Haiku 3.5: ~$0.0005 per transcript. For 1000 meetings/year: ~$0.50 (negligible).

**Q: What if I need unlimited processing?**
A: Switch to Sonnet (10x more expensive) or set high limits. Contact admin.

**Q: Who can change the limits?**
A: Only users with `administrator` role in org_members.

---

## Support

- Tech questions: Check PHASE_3A_AI_TRANSCRIPTION.md
- Cost questions: See "Cost Projection" above
- Admin panel: AIProcessingAdminPanel.jsx
- API limits: costLimits.js
