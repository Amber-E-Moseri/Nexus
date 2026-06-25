# Google Calendar Integration Setup Guide
## BLW Canada Ministry Calendar System

This guide walks through setting up Google Calendar OAuth and configuring the sync scheduler.

---

## Part 1: Google Cloud Project Setup

### 1.1 Create a Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Click "Select a Project" → "New Project"
3. Enter project name: `BLW Canada Calendar Sync`
4. Click "Create"
5. Wait for the project to be created

### 1.2 Enable Google Calendar API

1. In the Google Cloud Console, go to "APIs & Services" → "Library"
2. Search for "Google Calendar API"
3. Click on it and press "Enable"

### 1.3 Create OAuth 2.0 Credentials

1. Go to "APIs & Services" → "Credentials"
2. Click "Create Credentials" → "OAuth 2.0 Client ID"
3. If prompted, configure the OAuth consent screen first:
   - Choose "External" for user type
   - Fill in the app name: "BLW Canada Calendar"
   - Add your email as support contact
   - Add scopes: `https://www.googleapis.com/auth/calendar`
   - Add test users (optional)

4. Back on Credentials page:
   - Application type: "Web application"
   - Name: "Calendar Sync Web Client"
   - Authorized JavaScript origins: 
     - `https://app.blwcanada.org`
     - `http://localhost:5173` (development)
   - Authorized redirect URIs:
     - `https://api.blwcanada.org/functions/v1/calendar-google-oauth`
     - `http://localhost:54321/functions/v1/calendar-google-oauth` (development)
   - Click "Create"

5. Copy the credentials:
   - **Client ID** → Store in `VITE_GOOGLE_CLIENT_ID`
   - **Client Secret** → Store in `GOOGLE_CLIENT_SECRET` (backend only)

---

## Part 2: Supabase Setup

### 2.1 Deploy Edge Functions

1. **Install Supabase CLI**:
   ```bash
   npm install -g supabase
   ```

2. **Link your project**:
   ```bash
   supabase link --project-ref xxxxx
   ```

3. **Deploy edge functions**:
   ```bash
   supabase functions deploy calendar-google-oauth
   supabase functions deploy calendar-google-sync
   supabase functions deploy calendar-ical-feed
   ```

4. **Verify deployment**:
   ```bash
   supabase functions list
   ```

### 2.2 Set Environment Variables

Set these in Supabase project settings:

**Edge Function Secrets** (Project Settings → Edge Functions → Secrets):
```
GOOGLE_CLIENT_ID = your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET = your-client-secret
FRONTEND_URL = https://app.blwcanada.org (or http://localhost:5173)
ENCRYPTION_KEY = your-32-character-random-secret-key
```

**Database Environment** (Project Settings → Database):
- Already configured by migrations

### 2.3 Configure the Scheduler

The sync scheduler needs to run every 15 minutes. Choose one of these options:

**Option A: Supabase Webhooks (Recommended)**
1. Go to Database → Webhooks → Create a new webhook
2. Configure:
   - **Name**: `Calendar Sync Scheduler`
   - **Events**: Any event (not used, just needs one)
   - **URL**: `https://your-project.supabase.co/functions/v1/calendar-google-sync`
   - **HTTP Method**: POST
   - **Headers**: Add header
     - Key: `Authorization`
     - Value: `Bearer your-supabase-service-role-key`
3. **Schedule**: `0 */15 * * * *` (every 15 minutes, UTC)

**Option B: External Cron Service (if Webhooks unavailable)**
Use a service like [cron-job.org](https://cron-job.org/) or AWS CloudWatch:

```bash
# Every 15 minutes
0 */15 * * * *

# URL: https://your-project.supabase.co/functions/v1/calendar-google-sync
# Method: POST
# Header: Authorization: Bearer your-service-role-key
```

**Option C: Supabase PgCron (Database)**
If PgCron extension is enabled:

```sql
SELECT cron.schedule(
  'calendar-sync-15min',
  '*/15 * * * *',
  $$
    SELECT http_post(
      'https://your-project.supabase.co/functions/v1/calendar-google-sync',
      '{}',
      'application/json'
    )
  $$
);
```

---

## Part 3: Environment Variables

### Frontend (.env.local)
```env
VITE_GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=xxxxx
```

### Backend (Supabase Edge Functions)
Already set in Part 2.2

### Local Development
Create `.env.local` in project root:
```env
SUPABASE_URL=http://localhost:54321
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=xxxxx
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_REDIRECT_URI=http://localhost:54321/functions/v1/calendar-google-oauth
ENCRYPTION_KEY=your-32-char-secret-key
FRONTEND_URL=http://localhost:5173
```

---

## Part 4: Testing the Integration

### 4.1 Local Testing

1. **Start local Supabase**:
   ```bash
   supabase start
   ```

2. **Run the app**:
   ```bash
   npm run dev
   ```

3. **Connect Google Calendar** (as Programs Manager):
   - Go to Programs space settings
   - Click "Connect Google Calendar"
   - You'll be redirected to Google login
   - Approve the permission request
   - You should see "✓ Connected" message

4. **Verify sync**:
   - Create a test event in Nexus
   - Click "Sync Now"
   - Check your Google Calendar - event should appear
   - Modify the event in Google Calendar
   - Wait 15 minutes or click "Sync Now" again
   - Changes should appear in Nexus

### 4.2 iCal Feed Testing

1. **Create a subscription**:
   - Go to SubscriptionManager component
   - Create a subscription (copy the URL)

2. **Add to Google Calendar**:
   - Open Google Calendar
   - Click "+" next to "Other calendars"
   - Select "Subscribe to calendar"
   - Paste the iCal URL
   - The calendar should appear

3. **Test auto-update**:
   - Create a new event in Nexus
   - Approve it
   - Wait 15 minutes or trigger sync
   - The event should appear in your Google Calendar automatically

### 4.3 Troubleshooting

**OAuth redirect fails**:
- Verify redirect URI in Google Cloud Console matches exactly
- Check FRONTEND_URL environment variable
- Ensure cookies are enabled in browser

**Events not syncing**:
- Check that event status is "approved"
- Verify sync is enabled in google_calendar_sync table
- Check edge function logs: `supabase functions list`
- Look for errors in Supabase logs

**iCal feed shows nothing**:
- Verify subscription token is correct
- Check that events are "approved" status
- Ensure subscription is_public = true
- Verify space_id matches

**Too many sync errors**:
- Check Google API quota limits
- Verify access token hasn't expired
- Check for network connectivity issues

---

## Part 5: Production Deployment

### 5.1 Pre-Deployment Checklist

- [ ] Google Cloud credentials set in production Supabase
- [ ] Frontend environment variables configured
- [ ] Scheduler webhook/cron configured
- [ ] Edge functions deployed to production
- [ ] Database migrations applied
- [ ] RLS policies verified
- [ ] Test sync with production data

### 5.2 Deployment Steps

1. **Deploy migrations**:
   ```bash
   supabase db push
   ```

2. **Deploy edge functions**:
   ```bash
   supabase functions deploy calendar-google-oauth --prod
   supabase functions deploy calendar-google-sync --prod
   supabase functions deploy calendar-ical-feed --prod
   ```

3. **Update Supabase secrets**:
   - Set all environment variables in production project
   - Rotate any development-only keys

4. **Configure production scheduler**:
   - Set up webhook/cron in production Supabase

5. **Test in production**:
   - Have a Programs Manager connect their Google Calendar
   - Verify sync works
   - Check iCal feeds
   - Monitor sync logs

### 5.3 Monitoring

**Check sync status**:
```sql
SELECT * FROM public.calendar_sync_status
ORDER BY sync_started_at DESC
LIMIT 10;
```

**View sync errors**:
```sql
SELECT * FROM public.calendar_sync_log
WHERE status = 'error'
ORDER BY sync_started_at DESC;
```

**Check sync frequency**:
```sql
SELECT
  DATE_TRUNC('minute', sync_started_at) as minute,
  COUNT(*) as sync_count,
  SUM(synced_events) as total_events
FROM public.calendar_sync_log
WHERE sync_started_at > NOW() - INTERVAL '1 hour'
GROUP BY DATE_TRUNC('minute', sync_started_at)
ORDER BY minute DESC;
```

---

## Part 6: Security Considerations

### OAuth Token Security

1. **Access Tokens**:
   - Short-lived (typically 3600 seconds)
   - Refreshed automatically before expiration
   - Sent over HTTPS only

2. **Refresh Tokens**:
   - Never leave the database
   - Encrypted in transit
   - Stored in Supabase (encrypted at rest)
   - Rotate on user revocation

3. **Client Secret**:
   - Only used server-side (edge functions)
   - Never sent to browser
   - Store in Supabase secrets, not environment files

### RLS Policies

- Only calendar managers can see/manage sync configuration
- Users can only create subscriptions for spaces they have access to
- Subscription tokens are unique and hard to guess

### Permissions

- Programs Manager can only sync Programs space
- Admin Manager can only sync Admin space
- Regional Secretary cannot connect Google Calendar
- RLS enforces all access control at database level

---

## Part 7: Troubleshooting Guide

### Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| 401 Unauthorized on OAuth | Invalid client secret | Verify credentials in Google Cloud Console |
| Redirect loop | Mismatched redirect URI | Check Google Cloud Console vs code |
| Sync not running | Scheduler not configured | Set up webhook or cron job |
| Events sync very slowly | Rate limiting | Google API limits 1000 calls/min per IP |
| iCal feed returns 404 | Invalid token | Verify subscription token is correct |
| Google token expires | Refresh token not saved | Check google_refresh_token in DB |

### Debug Steps

1. **Check edge function logs**:
   ```bash
   supabase functions list
   supabase functions logs calendar-google-oauth
   ```

2. **Check database**:
   ```sql
   SELECT * FROM public.google_calendar_sync WHERE sync_enabled = TRUE;
   SELECT * FROM public.calendar_sync_log ORDER BY sync_started_at DESC LIMIT 5;
   ```

3. **Check browser console**:
   - Network tab → OAuth requests
   - Console → any error messages

4. **Check RLS policies**:
   ```sql
   SELECT * FROM pg_policies WHERE tablename LIKE 'calendar_%';
   ```

---

## References

- [Google Calendar API Docs](https://developers.google.com/calendar/api/guides/overview)
- [OAuth 2.0 for Web Applications](https://developers.google.com/identity/protocols/oauth2/web-server-flow)
- [RFC 5545 (iCalendar Format)](https://tools.ietf.org/html/rfc5545)
- [Supabase Edge Functions](https://supabase.com/docs/guides/functions)
- [Supabase Webhooks/Scheduler](https://supabase.com/docs/guides/webhooks)

---

## Support

For issues or questions:
1. Check this guide first
2. Review [CALENDAR_IMPLEMENTATION_GUIDE.md](../CALENDAR_IMPLEMENTATION_GUIDE.md)
3. Check Supabase function logs
4. Check database activity logs
5. Review Google Cloud OAuth logs

**Last Updated**: 2026-06-25
