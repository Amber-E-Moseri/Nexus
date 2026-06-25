# Rate Limiting Implementation

## Overview

Rate limiting protects public API endpoints from abuse, enumeration attacks, and denial-of-service (DoS) attempts. This system uses database-backed tracking to enforce sliding-window rate limits across multiple deployment instances.

## Security Model

### Threats Mitigated

1. **Token Enumeration**: Attacker tries to guess or brute-force invitation tokens
2. **Spam Attacks**: Automated tools submit thousands of RSVP responses
3. **Brute Force**: Attacker tries to enumerate valid email addresses
4. **Distributed Attacks**: Attacker uses multiple IPs from botnet

### Protection Strategy

```
IP-based limit:     10 requests / minute
Email-based limit:  20 requests / hour
Return:             429 Too Many Requests
Retry-After:        Seconds until next window (max 60)
```

**Why these numbers?**
- IP: 10/min prevents rapid-fire token enumeration (can try ~1000 tokens in 100 minutes without detection)
- Email: 20/hour prevents account abuse (20 RSVP responses per hour is unrealistic)
- Sliding window: More granular than fixed windows, harder to game

## Database Schema

### rate_limits table
Tracks request counts during the sliding window.

```sql
ip_address      TEXT          -- Client IP (extracted from X-Forwarded-For)
email           TEXT          -- Email being accessed (nullable)
endpoint        TEXT          -- Which endpoint (rsvp, unsubscribe, track_click)
attempt_count   INTEGER       -- Current count in window
window_start    TIMESTAMPTZ   -- When this window began
expires_at      TIMESTAMPTZ   -- Auto-cleanup timestamp
```

**Indexes**:
- `(ip_address, endpoint, window_start)` for IP checks
- `(email, endpoint, window_start)` for email checks
- `(expires_at)` for cleanup queries

**Cleanup**: Rows expire after 1 hour (IP window) or 1 hour (email window), then can be deleted.

### rate_limit_violations table
Logs when limits are exceeded for alerting and analysis.

```sql
ip_address      TEXT          -- Client IP
email           TEXT          -- Email (if applicable)
endpoint        TEXT          -- Which endpoint was hit
limit_type      TEXT          -- 'ip_per_minute' or 'email_per_hour'
current_count   INTEGER       -- How many requests before rejection
limit_value     INTEGER       -- What the limit was
created_at      TIMESTAMPTZ   -- When the violation occurred
```

**Use Cases**:
- Alert if single IP triggers limit >5 times/hour (likely enumeration)
- Alert if single email gets limited >3 times/hour (account abuse)
- Analyze patterns to detect botnets
- Show abuse trends in dashboards

## Implementation

### Shared Module: _shared/rateLimit.ts

Provides three main functions:

#### 1. extractClientIp(req: Request): string
Extracts real client IP from request headers.

**Header precedence**:
1. `X-Forwarded-For` (first IP if comma-separated)
2. Request origin IP (fallback)

```typescript
// Request from Vercel with proxy chain:
X-Forwarded-For: 192.168.1.1, 10.0.0.1
// Result: 192.168.1.1
```

#### 2. checkRateLimit(supabase, ipAddress, email, config): RateLimitResult
Main rate limiting logic.

**Algorithm** (per limit type):
```
1. Query for existing rate_limit record in current window
2. If record exists and count < limit:
   - Increment count
   - Return { allowed: true }
3. If record exists and count >= limit:
   - Calculate retry-after seconds
   - Return { allowed: false, retryAfterSeconds: N }
4. If no record:
   - Create new record with count = 1
   - Return { allowed: true }
```

**Sliding Window Calculation**:
```
IP window:    now - 60 seconds
Email window: now - 3600 seconds

Example:
- Request at 12:00:05, IP limit hit
- Next request at 12:01:04 (59 seconds later) → still limited
- Request at 12:01:06 (61 seconds later) → allowed
```

#### 3. checkIpRateLimit / checkEmailRateLimit
Internal functions implementing per-IP and per-email limits.

### RSVP Function Integration

**File**: `supabase/functions/rsvp/index.ts`

**Changes**:
```typescript
// 1. Extract IP from request
const ipAddress = extractClientIp(req)

// 2. Check rate limit BEFORE querying invitation
const limitResult = await checkRateLimit(supabase, ipAddress, recipient.email, {
  ipPerMinute: 10,
  emailPerHour: 20,
  endpoint: 'rsvp',
})

// 3. Return 429 if limited
if (!limitResult.allowed) {
  return jsonResponse(429,
    { error: 'Too many requests' },
    { 'Retry-After': String(limitResult.retryAfterSeconds) }
  )
}
```

**Key Security Features**:
- Rate limit check happens **before** token validation (prevents token enumeration)
- Generic error message "Invitation not found" regardless of actual reason
- Logs include IP + email for abuse investigation

## Rate Limit Response

### Normal Response (200)
```json
{
  "success": true,
  "status": "rsvp_yes"
}
```

### Rate Limited Response (429)
```http
HTTP/1.1 429 Too Many Requests
Content-Type: application/json
Retry-After: 45

{
  "error": "Too many requests. Please try again later."
}
```

**Client Behavior**:
- Must wait at least `Retry-After` seconds before retrying
- Exponential backoff recommended: 1s, 2s, 4s, 8s, etc.

## Testing

### Test 1: Normal RSVP (Under Limit)
```bash
for i in {1..9}; do
  curl -X POST http://localhost:54321/functions/v1/rsvp \
    -H "Content-Type: application/json" \
    -d '{"token": "valid-token", "response": "rsvp_yes"}'
  echo "Request $i: 200"
done

# Request 10: 200 (at limit)
curl ...

# Request 11: 429 (over limit)
curl ...
# Response: "Too many requests"
```

### Test 2: Email Rate Limiting
```bash
# Single email, multiple tokens
for i in {1..20}; do
  curl -X POST .../rsvp \
    -d '{"token": "token-$i", "response": "rsvp_yes"}'
  # Requests 1-20: 200
  # Request 21: 429 (email limit exceeded)
done
```

### Test 3: Enumeration Attack Simulation
```bash
# Attacker tries to enumerate tokens rapidly
ab -n 100 -c 10 \
  -p payload.json \
  http://localhost:54321/functions/v1/rsvp

# Expected: After 10 requests from same IP, returns 429
```

### Test 4: Check Violation Logs
```sql
-- View recent violations
SELECT ip_address, email, endpoint, limit_type, current_count, limit_value, created_at
FROM public.rate_limit_violations
WHERE created_at > now() - interval '1 hour'
ORDER BY created_at DESC;

-- IPs with many violations
SELECT ip_address, COUNT(*) as violation_count
FROM public.rate_limit_violations
WHERE created_at > now() - interval '1 hour'
GROUP BY ip_address
HAVING COUNT(*) > 5
ORDER BY violation_count DESC;
```

## Monitoring & Alerting

### Key Metrics

**Dashboard Queries**:

1. **Current Rate Limit Status**
```sql
SELECT ip_address, endpoint, attempt_count, limit_value, window_start
FROM public.rate_limits
WHERE expires_at > now()
ORDER BY attempt_count DESC
LIMIT 20;
```

2. **Top Violating IPs (Last Hour)**
```sql
SELECT ip_address, COUNT(*) as violations, COUNT(DISTINCT email) as emails
FROM public.rate_limit_violations
WHERE created_at > now() - interval '1 hour'
GROUP BY ip_address
ORDER BY violations DESC;
```

3. **Abuse Patterns**
```sql
SELECT email, COUNT(*) as attempts, COUNT(DISTINCT ip_address) as ips
FROM public.rate_limit_violations
WHERE created_at > now() - interval '1 hour'
  AND email IS NOT NULL
GROUP BY email
ORDER BY attempts DESC;
```

### Alert Rules

**Alert 1: Repeated IP Violations**
```
IF violations.ip_address has >5 violations in 1 hour
THEN send alert to #security channel
MESSAGE: "IP {ip} exceeded rate limits 6 times, possible enumeration attack"
```

**Alert 2: Email Abuse**
```
IF rate_limit_violations.email has >3 violations in 1 hour
THEN send alert to #security channel
MESSAGE: "Email {email} hit rate limits 4 times, possible account abuse or spam"
```

**Alert 3: DDoS Detection**
```
IF rate_limits.count > 1000 active records
THEN send alert to #incidents channel
MESSAGE: "Unusually high rate limit activity, possible DDoS attack"
```

## Configuration

### Per-Endpoint Limits

Currently configured:
- **RSVP**: 10/min per IP, 20/hour per email
- **Unsubscribe**: 10/min per IP, 20/hour per email (TODO)
- **Track Click**: 100/min per IP (TODO)

To adjust limits, update the `config` in each function:
```typescript
const rateLimitConfig = {
  ipPerMinute: 10,    // Change this
  emailPerHour: 20,   // Or this
  endpoint: 'rsvp',
}
```

### Database Cleanup

Rate limit records expire automatically after 1 hour. Optional cleanup query (run daily):
```sql
-- Delete expired rate limit records (keep last 7 days)
DELETE FROM public.rate_limits
WHERE expires_at < now() - interval '7 days';

-- Keep violation logs for 30 days for analysis
DELETE FROM public.rate_limit_violations
WHERE created_at < now() - interval '30 days';
```

## Migration & Rollout

### Step 1: Deploy Migration
```bash
supabase db push
```

### Step 2: Deploy Updated Function
```bash
supabase functions deploy rsvp
```

### Step 3: Monitor Logs
```bash
supabase functions logs rsvp --tail
```

Expected output: No errors, occasional "Rate limit exceeded" logs.

### Step 4: Test in Production
- Verify legitimate users can RSVP normally
- Monitor rate_limit_violations table for false positives
- Adjust limits if needed

## Troubleshooting

### "IP address shows as 'unknown'"
**Cause**: Request doesn't have X-Forwarded-For header
**Solution**: Verify proxy is correctly setting X-Forwarded-For

### "Legitimate users getting rate limited"
**Cause**: Limits too strict or user IP is shared (corporate network)
**Solution**: Increase `emailPerHour` limit, use email-based instead of IP-based

### "Rate limit records not cleaning up"
**Cause**: `expires_at` set incorrectly
**Solution**: Run cleanup query manually, check time zone settings

## Future Improvements

- [ ] Add sliding window implementation (currently fixed windows)
- [ ] Add geo-based rate limiting (different limits per region)
- [ ] Add user agent filtering (detect bots)
- [ ] Add CAPTCHA bypass after rate limit hit
- [ ] Add Redis backend for faster checking (if DB becomes bottleneck)
- [ ] Add rate limit visualization dashboard

## References

- [OWASP: Rate Limiting](https://owasp.org/www-community/attacks/Slow_HTTP_POST)
- [RFC 6585: HTTP 429 Status Code](https://tools.ietf.org/html/rfc6585)
- [Google Cloud: Rate Limiting Best Practices](https://cloud.google.com/architecture/rate-limiting-strategies-techniques)
