# Communications System - Complete Documentation

## 1. DATABASE SCHEMAS

### A. Communication Campaigns & Segments

#### TABLE: communication_campaigns
```sql
CREATE TABLE public.communication_campaigns (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name              text NOT NULL,
  subject           text NOT NULL,
  body              text NOT NULL,
  preview_text      text,
  body_html         text,
  body_text         text,
  recipient_filters jsonb NOT NULL DEFAULT '[]'::jsonb,
  from_name         text,
  reply_to_email    text,
  status            text NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft','scheduled','sending','sent','cancelled','failed','retrying')),
  segment_id        uuid REFERENCES communication_segments(id) ON DELETE SET NULL,
  scheduled_at      timestamptz,
  sent_at           timestamptz,
  recipient_count   integer DEFAULT 0,
  sent_count        integer DEFAULT 0,
  failed_count      integer DEFAULT 0,
  suppressed_count  integer DEFAULT 0,
  open_count        integer DEFAULT 0,
  retry_count       integer DEFAULT 0,
  next_retry_at     timestamptz,
  last_error_at     timestamptz,
  created_by        uuid REFERENCES users(id),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

INDEXES:
  - idx_communication_campaigns (status, scheduled_at)
  - trg_comm_campaigns_updated_at (trigger for updated_at)
```

#### TABLE: communication_segments
```sql
CREATE TABLE public.communication_segments (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name             text NOT NULL,
  description      text,
  filters          jsonb NOT NULL DEFAULT '{}',
  estimated_count  integer DEFAULT 0,
  created_by       uuid REFERENCES users(id),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

INDEXES:
  - trg_comm_segments_updated_at (trigger for updated_at)
```

#### TABLE: communication_sends
```sql
CREATE TABLE public.communication_sends (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id     uuid REFERENCES communication_campaigns(id) ON DELETE CASCADE,
  recipient_email text NOT NULL,
  recipient_name  text NOT NULL,
  status          text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','sent','failed','opened','bounced','unsubscribed','retrying','suppressed')),
  resend_email_id text,
  subject_variant text,  -- 'a' | 'b' | null (for A/B testing)
  opened_at       timestamptz,
  error_message   text,
  last_error_at   timestamptz,
  sent_at         timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

INDEXES:
  - idx_communication_sends (campaign_id, status)
  - idx_communication_sends (recipient_email)
  - idx_communication_sends (resend_email_id) WHERE resend_email_id IS NOT NULL
```

#### TABLE: communication_unsubscribes
```sql
CREATE TABLE public.communication_unsubscribes (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email            text NOT NULL UNIQUE,
  full_name        text,
  reason           text,
  unsubscribed_at  timestamptz NOT NULL DEFAULT now(),
  unsubscribed_via text DEFAULT 'link'
                   CHECK (unsubscribed_via IN ('link','manual','bounce','complaint'))
);

INDEXES:
  - idx_communication_unsubscribes (email)
```

#### TABLE: communication_ab_tests
```sql
CREATE TABLE public.communication_ab_tests (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id          uuid REFERENCES communication_campaigns(id) ON DELETE CASCADE,
  subject_a            text NOT NULL,
  subject_b            text NOT NULL,
  split_percent        integer NOT NULL DEFAULT 20
                       CHECK (split_percent BETWEEN 5 AND 50),
  winner_subject       text,
  winner_chosen_at     timestamptz,
  test_duration_hours  integer NOT NULL DEFAULT 2,
  metric               text NOT NULL DEFAULT 'opens'
                       CHECK (metric IN ('opens','clicks')),
  open_rate_a          real,
  open_rate_b          real,
  created_at           timestamptz NOT NULL DEFAULT now()
);
```

### B. Email Templates

#### TABLE: communication_email_templates
```sql
CREATE TABLE public.communication_email_templates (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name              text NOT NULL,
  category          text NOT NULL DEFAULT 'announcements'
                    CHECK (category IN ('announcements','events','operational','celebrations')),
  html_content      text NOT NULL,
  preview_thumbnail text,
  is_system         boolean NOT NULL DEFAULT false,
  variables         jsonb NOT NULL DEFAULT '{"headerBg":"#4C2A92","accentColor":"#E8A020","footerText":"BLW CAN NEXUS"}'::jsonb,
  created_by        uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

INDEXES:
  - idx_email_templates_category
  - idx_email_templates_is_system
  - idx_email_templates_created_by

SEED DATA (8 System Templates):
  1. Weekly Ministry Update
  2. Event Invitation
  3. Urgent Notice
  4. Graduation Celebration
  5. Leadership Meeting
  6. Prayer Request
  7. Group Signup
  8. Feedback Survey
```

### C. External Contacts & Categories

#### TABLE: communication_contacts
```sql
CREATE TABLE public.communication_contacts (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name  text NOT NULL,
  email      text NOT NULL,
  notes      text,
  source     text NOT NULL DEFAULT 'manual'
             CHECK (source IN ('manual','imported')),
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INDEXES:
  - UNIQUE (lower(email))
```

#### TABLE: communication_categories
```sql
CREATE TABLE public.communication_categories (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  color      text NOT NULL DEFAULT '#4C2A92',
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INDEXES:
  - UNIQUE (lower(name))
```

#### TABLE: communication_contact_categories
```sql
CREATE TABLE public.communication_contact_categories (
  contact_id  uuid NOT NULL REFERENCES communication_contacts(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES communication_categories(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (contact_id, category_id)
);
```

### D. Tracking & Delivery

#### TABLE: campaign_link_clicks
```sql
CREATE TABLE public.campaign_link_clicks (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id    uuid NOT NULL REFERENCES communication_campaigns(id) ON DELETE CASCADE,
  recipient_email text NOT NULL,
  link_url       text NOT NULL,
  clicked_at     timestamptz DEFAULT now(),
  click_count    integer DEFAULT 1,
  UNIQUE (campaign_id, recipient_email, link_url)
);

INDEXES:
  - idx_link_clicks_campaign
```

#### TABLE: email_bounces
```sql
CREATE TABLE public.email_bounces (
  email       text PRIMARY KEY,
  bounce_type text NOT NULL DEFAULT 'hard'  -- 'hard' | 'soft'
  bounced_at  timestamptz DEFAULT now(),
  suppressed  boolean DEFAULT true,
  updated_at  timestamptz DEFAULT now()
);

TRIGGER: email_bounces_updated_at (updates updated_at)
```

#### TABLE: email_delivery_log
```sql
CREATE TABLE public.email_delivery_log (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_email     text NOT NULL,
  sender_email        text NOT NULL,
  subject             text NOT NULL,
  email_type          text NOT NULL,
  related_entity_type text,
  related_entity_id   uuid,
  resend_email_id     text,
  status              text NOT NULL DEFAULT 'pending',
  http_status         integer,
  error_message       text,
  sent_at             timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);

INDEXES:
  - idx_email_delivery_log_recipient_email
  - idx_email_delivery_log_email_type
  - idx_email_delivery_log_status
  - idx_email_delivery_log_sent_at
  - idx_email_delivery_log_resend_id
```

#### TABLE: email_signatures
```sql
CREATE TABLE public.email_signatures (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  signature_html text NOT NULL DEFAULT '',
  is_default     boolean NOT NULL DEFAULT false,
  created_at     timestamptz DEFAULT now(),
  updated_at     timestamptz DEFAULT now()
);
```

### E. User Invitations (Separate System)

#### TABLE: user_invitations
```sql
ALTER TABLE user_invitations ADD:
  sent_at         timestamptz,
  last_sent_at    timestamptz,
  send_count      integer NOT NULL DEFAULT 0,
  delivery_status text NOT NULL DEFAULT 'pending'
                  CHECK (delivery_status IN ('pending','sent','failed','cancelled','activated','expired')),
  delivery_error  text;

INDEXES:
  - user_invitations_delivery_status_idx (delivery_status, last_sent_at DESC)
```

### F. Application Settings (for Scheduled Sends)

#### TABLE: app_settings
```sql
CREATE TABLE public.app_settings (
  key   text PRIMARY KEY,
  value text NOT NULL
);

REQUIRED SETTINGS:
  - supabase_url: 'https://[ref].supabase.co'
  - service_role_key: '[service-role-key]'
```

---

## 2. EDGE FUNCTIONS

### A. send-communication-email/index.ts
**Location**: `supabase/functions/send-communication-email/index.ts`  
**Purpose**: Core email campaign sender for bulk communications  
**Authorization**: Bearer token (super_admin or dept_lead role)  
**HTTP Method**: POST

**Request Body**:
```typescript
{
  campaign_id?: string;           // If provided, loads campaign data
  to?: Array<{                    // If campaign_id not provided
    name: string;
    email: string;
    subgroup?: string;
    leadership_category?: string;
  }>;
  subject?: string;
  body?: string;
  body_html?: string;
  body_text?: string;
  preview_text?: string;
  reply_to?: string;
  context?: {
    space_name?: string;
    sender_name?: string;
  };
  test_email?: string;            // Override recipients for testing
}
```

**Response**:
```typescript
{
  sent: number;
  failed: number;
  errors: Array<{ name: string; email: string; error: string }>;
  skipped_unsubscribed: number;
  skipped_bounced: number;
}
```

**Key Features**:
- Recipients resolved from segment_id or recipient_filters JSONB
- Supports department, subgroup, role, leadership_category filters
- A/B testing (splits recipients, uses deterministic index)
- Link tracking (rewrites href= URLs with track-click redirect)
- Email sanitization (removes scripts, event handlers, dangerous tags)
- Sender signature appending (from email_signatures table)
- Bounce suppression (checks email_bounces.suppressed)
- Unsubscribe filtering (checks communication_unsubscribes)
- Batch sending (10 at a time, 1s delay between batches)
- Retry logic (up to 3 retries with exponential backoff: 60s, 300s, 1800s)
- Logging to absence_email_log and communication_sends tables

**Variables Substituted**:
- `{{name}}` → recipient.name
- `{{subgroup}}` → recipient.subgroup
- `{{leadership_category}}` → recipient.leadership_category
- `{{space_name}}` → context.space_name
- `{{pastor_name}}` → looked up from pastor_members table
- `{{sender_name}}` → context.sender_name or "BLW CAN NEXUS Team"
- `{{org_name}}` → "BLW CAN NEXUS"
- `{{date_today}}` → current date in en-CA format
- `{{unsubscribe_link}}` → generated token-based unsubscribe URL

**Email Headers Added**:
- `List-Unsubscribe`: unsubscribe URL for email clients
- `List-Unsubscribe-Post`: indicates one-click unsubscribe support
- `X-Entity-Ref-ID`: campaign ID or random UUID (for Resend idempotency)
- `Precedence`: "bulk" (marks as bulk email)

---

### B. send-user-invitation/index.ts
**Location**: `supabase/functions/send-user-invitation/index.ts`  
**Purpose**: User account activation invitations  
**Authorization**: Bearer token (super_admin or dept_lead role)  
**HTTP Method**: POST

**Request Body**:
```typescript
{
  invitation_id: string;          // Required
  mode?: 'send' | 'resend';       // Default: 'send'
}
```

**Response**:
```typescript
{
  invitation_id: string;
  delivery_status: 'sent' | 'failed';
  activation_url: string;
  resend: any;                    // Resend API response
}
```

**Key Features**:
- Validates caller is super_admin or dept_lead
- dept_lead can only send invitations in their own department
- Checks invitation expiry (7 days default)
- Prevents sending if status is accepted, revoked, or expired
- Calls `issue_user_invitation_token` RPC to generate token
- Optionally extends expiry on resend
- Tracks delivery attempts via `record_invitation_delivery_attempt` RPC
- Logs to activity_log table

**Email Template**:
- From: `INVITATION_FROM_EMAIL` env var
- Subject: "Activate your BLW CAN NEXUS account"
- HTML + plain text versions
- Activation link: `{FRONTEND_URL}/accept-invite?token={token}`
- Expires text: formatted date

---

### C. handle-unsubscribe/index.ts
**Location**: `supabase/functions/handle-unsubscribe/index.ts`  
**Purpose**: Process unsubscribe requests from email links  
**Authorization**: None required (public endpoint)  
**HTTP Method**: POST

**Request Body**:
```typescript
{
  email: string;
  token: string;                  // SHA-256 HMAC token
  action?: 'unsubscribe' | 'resubscribe';  // Default: 'unsubscribe'
}
```

**Response**:
```typescript
{
  success: boolean;
  error?: string;
}
```

**Key Features**:
- No authentication required (public endpoint)
- Validates token via SHA-256(email + UNSUBSCRIBE_SECRET)
- Returns 200 OK with `success: false` for invalid tokens (privacy)
- Creates/updates entry in communication_unsubscribes table
- Supports resubscribe action (deletes from table)

**Token Generation**:
```
token = btoa(SHA256(email.toLowerCase() + UNSUBSCRIBE_SECRET))
        .replace(/[+/=]/g, '')
        .slice(0, 32)
```

**SECURITY NOTE**: Token is deterministic. If UNSUBSCRIBE_SECRET leaks, attacker can forge tokens for any email.

---

### D. rsvp/index.ts
**Location**: `supabase/functions/rsvp/index.ts`  
**Purpose**: Handle RSVP responses from invitation emails  
**Authorization**: None required (token-based, public endpoint)  
**HTTP Method**: POST

**Request Body**:
```typescript
{
  token: string;                  // Invitation recipient token
  response: 'rsvp_yes' | 'rsvp_no';
}
```

**Response**:
```typescript
{
  success: boolean;
  status: 'rsvp_yes' | 'rsvp_no';
}
```

**Key Features**:
- No authentication required (public endpoint)
- Looks up invitation_recipients by token
- Prevents multiple RSVP submissions (idempotent check)
- Updates status and rsvp_at timestamp
- Sends RSVP notification email to campaign organizer (async)
- No rate limiting (vulnerability)

---

### E. resend-webhook/index.ts
**Location**: `supabase/functions/resend-webhook/index.ts`  
**Purpose**: Receive email delivery events from Resend  
**Authorization**: Webhook signature verification (Svix HMAC)  
**HTTP Method**: POST

**Setup**:
```
1. resend.com/webhooks
2. Endpoint: https://[ref].supabase.co/functions/v1/resend-webhook
3. Events: email.opened, email.bounced, email.complained, email.delivery_delayed
4. Copy signing secret → set as RESEND_WEBHOOK_SECRET env var
```

**Events Handled**:
- `email.opened`: Updates communication_sends status to 'opened', increments campaign open_count
- `email.bounced`: Records in email_bounces, adds to communication_unsubscribes (hard bounces only)
- `email.complained`: Marks as 'unsubscribed', adds to communication_unsubscribes
- `email.delivery_delayed`: Logs only, no status change

**Response**:
```typescript
{
  ok: boolean;
  event_type?: string;
  note?: string;
}
```

---

### F. send-invitations/index.ts
**Location**: `supabase/functions/send-invitations/index.ts`  
**Purpose**: Send invitation_campaigns (separate from user_invitations)  
**Authorization**: Bearer token required  
**HTTP Method**: POST

**Request Body**:
```typescript
{
  campaignId: string;             // Required
}
```

**Response**:
```typescript
{
  sent: number;
  failed: number;
  total: number;
  errors?: Array<{ email: string; error: string }>;
}
```

---

## 3. ROW LEVEL SECURITY (RLS) POLICIES

### Communication Tables (20260721000001_communication_infrastructure.sql)

#### communication_campaigns
| Operation | Role | Policy |
|-----------|------|--------|
| SELECT | authenticated | `true` (all authenticated users) |
| INSERT | authenticated | `role IN ('super_admin','dept_lead')` |
| UPDATE | authenticated | `role IN ('super_admin','dept_lead')` |
| DELETE | authenticated | `role = 'super_admin'` |

#### communication_segments
| Operation | Role | Policy |
|-----------|------|--------|
| SELECT | authenticated | `true` |
| INSERT | authenticated | `role IN ('super_admin','dept_lead')` |
| UPDATE | authenticated | `role IN ('super_admin','dept_lead')` |
| DELETE | authenticated | `role = 'super_admin'` |

#### communication_sends
| Operation | Role | Policy |
|-----------|------|--------|
| SELECT | authenticated | `true` |
| INSERT | authenticated | `role IN ('super_admin','dept_lead')` |
| UPDATE | authenticated | `role IN ('super_admin','dept_lead')` |
| DELETE | authenticated | `role = 'super_admin'` |

#### communication_unsubscribes
| Operation | Role | Policy |
|-----------|------|--------|
| SELECT | authenticated | `true` |
| INSERT | anon, authenticated | `true` (public unsubscribe link) |
| UPDATE | authenticated | `role IN ('super_admin','dept_lead')` |
| DELETE | authenticated | `role = 'super_admin'` |

#### communication_ab_tests
| Operation | Role | Policy |
|-----------|------|--------|
| SELECT | authenticated | `true` |
| INSERT | authenticated | `role IN ('super_admin','dept_lead')` |
| UPDATE | authenticated | `role IN ('super_admin','dept_lead')` |
| DELETE | authenticated | `role = 'super_admin'` |

#### communication_contacts
| Operation | Role | Policy |
|-----------|------|--------|
| SELECT | authenticated | `true` |
| INSERT | authenticated | `role IN ('super_admin','dept_lead')` |
| UPDATE | authenticated | `role IN ('super_admin','dept_lead')` |
| DELETE | authenticated | `role IN ('super_admin','dept_lead')` |

#### communication_categories
| Operation | Role | Policy |
|-----------|------|--------|
| SELECT | authenticated | `true` |
| INSERT | authenticated | `role IN ('super_admin','dept_lead')` |
| UPDATE | authenticated | `role IN ('super_admin','dept_lead')` |
| DELETE | authenticated | `role IN ('super_admin','dept_lead')` |

#### communication_contact_categories
| Operation | Role | Policy |
|-----------|------|--------|
| SELECT | authenticated | `true` |
| INSERT | authenticated | `role IN ('super_admin','dept_lead')` |
| DELETE | authenticated | `role IN ('super_admin','dept_lead')` |

### Tracking & Bounce Tables (20260731000000_rls_coverage_hardening.sql)

#### campaign_link_clicks
| Operation | Role | Policy |
|-----------|------|--------|
| SELECT | authenticated | `role IN ('super_admin','dept_lead')` |
| INSERT | authenticated | `role IN ('super_admin','dept_lead')` |

#### email_bounces
| Operation | Role | Policy |
|-----------|------|--------|
| SELECT | authenticated | `role IN ('super_admin','dept_lead')` |
| INSERT | authenticated | `role IN ('super_admin','dept_lead')` |
| UPDATE | authenticated | `role IN ('super_admin','dept_lead')` |

#### email_signatures
| Operation | Role | Policy |
|-----------|------|--------|
| ALL | authenticated | `auth.uid() = user_id` (own signatures only) |
| SELECT | authenticated | `role = 'super_admin'` (super admins see all) |

#### email_delivery_log
| Operation | Role | Policy |
|-----------|------|--------|
| SELECT | - | Only super_admin via EXISTS check on users table |

#### communication_email_templates
| Operation | Role | Policy |
|-----------|------|--------|
| SELECT | authenticated | `true` |
| INSERT | authenticated | `role IN ('super_admin','dept_lead')` |
| UPDATE | authenticated | `role IN ('super_admin','dept_lead') OR created_by = auth.uid()` |
| DELETE | authenticated | `role = 'super_admin' OR (created_by = auth.uid() AND NOT is_system)` |

---

## 4. DATABASE FUNCTIONS & RPCs

### Scheduled Campaign Functions (20260722000000_scheduled_sends.sql)

#### fire_scheduled_campaigns()
```sql
FUNCTION public.fire_scheduled_campaigns()
RETURNS void
SECURITY DEFINER

PURPOSE: Scheduled via pg_cron to run every minute
LOGIC:
  1. Load all campaigns WHERE status = 'scheduled' AND scheduled_at <= now() AND scheduled_at > now() - interval '1 hour'
  2. Mark as 'sending'
  3. Call /functions/v1/send-communication-email via HTTP POST
  4. Log results

REQUIRES: app_settings (supabase_url, service_role_key) configured
```

#### check_and_fire_campaigns_manually()
```sql
FUNCTION public.check_and_fire_campaigns_manually()
RETURNS json
SECURITY DEFINER

PURPOSE: Fallback for environments without pg_cron
USAGE: SELECT * FROM check_and_fire_campaigns_manually()
RESPONSE: { "fired": <count>, "error": <if any> }
```

### Bounce Management Functions (20260729000000_scheduled_sends_retry_and_bounce_management.sql)

#### handle_bounce_event(p_email text, p_bounce_type text, p_bounced_at timestamptz)
```sql
PURPOSE: Process bounce events from webhook
RETURNS json with affected_sends count
```

#### get_suppression_list(p_search text, p_limit int, p_offset int)
```sql
PURPOSE: Retrieve suppressed emails with pagination & search
RETURNS TABLE with email, bounce_type, bounced_at, suppressed, updated_at
```

#### unsuppress_email(p_email text)
```sql
PURPOSE: Mark single email as not suppressed
RETURNS json { success: bool, email: string }
```

#### unsuppress_all()
```sql
PURPOSE: Mark all suppressed emails as active
RETURNS json { success: bool, unsuppressed_count: int }
```

#### get_bounce_metrics()
```sql
PURPOSE: Analytics for bounce dashboard
RETURNS TABLE(
  total_bounced integer,
  hard_bounces integer,
  soft_bounces integer,
  suppressed_count integer
)
```

#### retry_failed_campaign(p_campaign_id uuid)
```sql
PURPOSE: Retry a failed campaign (max 3 retries)
RETURNS json { success: bool, retry_count: int }
LOGIC:
  1. Verify campaign exists and status = 'failed'
  2. Increment retry_count, fail if > 3
  3. Mark as 'retrying'
  4. Call send-communication-email edge function
```

### A/B Test Function (20260727000000_click_tracking_and_bounces.sql)

#### select_ab_test_winner(p_campaign_id uuid)
```sql
PURPOSE: Determine A/B test winner based on open rates
RETURNS TABLE(
  winning_variant text,  -- 'a' or 'b'
  open_rate_a real,
  open_rate_b real
)
LOGIC:
  1. Count sends per variant (subject_variant column)
  2. Count opened per variant
  3. Calculate open_rate = opened / sent
  4. Return higher rate as winner
  5. Update communication_ab_tests row with rates
```

### Invitation Functions (20260610000000_invitation_delivery.sql)

#### preview_user_invitation(p_token text)
```sql
PURPOSE: Preview invitation before accepting
RETURNS TABLE(
  invitation_id uuid,
  first_name text,
  last_name text,
  email text,
  role text,
  department_id uuid,
  department_name text,
  assigned_pastor_name text,
  expires_at timestamptz
)
LOGIC:
  1. Auto-expire if past expires_at
  2. Return invitation if status = 'pending' and not expired
```

#### resend_user_invitation(p_invitation_id uuid)
```sql
PURPOSE: Regenerate token and resend invitation
RETURNS user_invitations
LOGIC:
  1. Verify caller is super_admin or dept_lead
  2. dept_lead must be in same department
  3. Generate new token (MD5 hash of random + timestamp + uuid)
  4. Extend expires_at to now() + 7 days
  5. Reset status to 'pending', delivery_status to 'pending'
```

#### cancel_user_invitation(p_invitation_id uuid)
```sql
PURPOSE: Cancel a pending invitation
RETURNS user_invitations
LOGIC:
  1. Verify caller permission
  2. Mark status = 'cancelled', delivery_status = 'cancelled'
```

#### accept_user_invitation(p_token text)
```sql
PURPOSE: User activates account via token
RETURNS users
LOGIC:
  1. Require authenticated caller
  2. Auto-expire invitations past expires_at
  3. Find valid invitation with status = 'pending'
  4. Match invitation.email with auth.users.email (case-insensitive)
  5. Create/update users entry
  6. Mark invitation as 'accepted', delivery_status = 'activated'
```

#### record_invitation_delivery_attempt(p_invitation_id uuid, p_delivery_status text, p_delivery_error text)
```sql
PURPOSE: Log delivery attempts
LOGIC:
  1. Update user_invitations.delivery_status, delivery_error, send_count, last_sent_at
```

---

## 5. FRONTEND COMPONENTS

### Communications Feature (src/features/communications/)

**Main Exports** (`index.ts`):
- CampaignEditor
- EmailComposer
- RecipientField
- SegmentBuilder
- SegmentBuilderAdvanced
- SchedulePicker
- SendConfirmationModal
- EmailPreviewModal
- TemplateEditor
- CampaignStatus
- BounceManagement
- SuppressionList

### Key Utility Library (src/features/communications/lib/communications.js)

**Token/Template Functions**:
- `normalizeEmail(email)` → trim + lowercase
- `titleize(value)` → format "snake_case" to "Title Case"
- `slugifyLabel(value)` → lowercase + dashes
- `escapeHtml(value)` → sanitize & entities
- `stripHtmlToText(html)` → plain text conversion
- `sanitizeEmailHtml(html)` → XSS prevention
- `fillTemplateTags(template, recipient, context)` → variable substitution
- `wrapLinksForTracking(html, campaignId, recipientEmail)` → URL rewriting

**Recipient Management**:
- `buildCommunicationRecipientData(options)` → organize users by department/subgroup/category
- `resolveRecipientPills(pills, allData)` → expand pills to email list
- `segmentFiltersToRecipientPills(filters)` → convert filters to pill format
- `addUniqueRecipientPills(existing, incoming)` → deduplicate
- `extractEmailEntries(text)` → regex-based email extraction
- `parseImportedContactText(text)` → CSV/text parsing with categories
- `loadCommunicationSources(supabase)` → fetch all data sources

**Template Functions**:
- `getEmailTemplates(supabase, filters)` → list templates
- `getEmailTemplate(supabase, id)` → fetch single template
- `createEmailTemplate(supabase, payload)` → create new
- `updateEmailTemplate(supabase, id, updates)` → update
- `deleteEmailTemplate(supabase, id)` → delete
- `applyTemplateVariables(htmlContent, variables)` → substitute header/accent colors

**Analytics**:
- `getABTestResults(supabase, campaignId)` → compare open rates
- `getClickTrackingData(supabase, campaignId)` → top clicked links
- `getClickTimeline(supabase, campaignId)` → clicks by hour
- `getBounceMetrics(supabase)` → hard/soft/total bounce counts

**Campaign Management**:
- `getScheduledCampaigns(supabase)` → list upcoming sends
- `getFailedCampaigns(supabase)` → list failed + retrying
- `updateCampaignSchedule(supabase, campaignId, scheduledAt)` → schedule send
- `cancelScheduledCampaign(supabase, campaignId)` → unschedule
- `retryCampaign(supabase, campaignId)` → retry failed campaign

**Suppression List**:
- `getSuppressionList(supabase, search, limit, offset)` → paginated bounce list
- `unsuppressEmail(supabase, email)` → remove from suppression
- `unsuppressAll(supabase)` → clear all suppressions

---

## 6. ENVIRONMENT VARIABLES & CONFIGURATION

### Resend Integration
```
RESEND_API_KEY=re_xxxxxxxxx
```

### Email From Addresses
```
FROM_EMAIL=campaigns@blwcannexus.ca
INVITATION_FROM_EMAIL=invites@blwcannexus.ca
```

### Frontend URL (for links & tokens)
```
FRONTEND_URL=https://app.blwcannexus.ca
INVITATION_FRONTEND_URL=https://app.blwcannexus.ca
PUBLIC_APP_URL=https://app.blwcannexus.ca
```

### CORS Configuration
```
ALLOWED_ORIGIN=https://app.blwcannexus.ca
```

### Webhook Secret (Resend → Function)
```
RESEND_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxxxxx
```

### Unsubscribe Token Secret
```
UNSUBSCRIBE_SECRET=[any secret string, defaults to 'default' if not set]
⚠️ SECURITY: If this leaks, tokens can be forged for any email
```

### Scheduled Sends (pg_cron)
After migration 20260722000000, configure:
```sql
INSERT INTO public.app_settings (key, value) VALUES
  ('supabase_url', 'https://[ref].supabase.co'),
  ('service_role_key', '[service-role-key]');
```

---

## 7. HARD-CODED CONSTANTS & LIMITS

### Email Validation
- Subject length: 3-78 characters
- Rejects ALL_CAPS words (4+ chars) as spam trigger
- Rejects excessive punctuation (3+ ! or ?)

### Campaign Retry Logic
```
Max retries: 3
Backoff schedule:
  Retry 1: 60 seconds
  Retry 2: 300 seconds (5 min)
  Retry 3: 1800 seconds (30 min)
```

### Email Batch Sending
- Batch size: 10 emails
- Delay between batches: 1000ms (1 second)

### Token Expiration
- User invitations: 7 days

### A/B Testing
- Min split: 5%
- Max split: 50%
- Default: 20%
- Default test duration: 2 hours
- Default metric: 'opens'

### Email Template Colors (Defaults)
```
headerBg: #4C2A92 (BLW purple)
accentColor: #E8A020 (gold)
footerText: "BLW CAN NEXUS"
```

---

## 8. USER ROLES & PERMISSIONS

### Role-Based Access

| Action | super_admin | dept_lead | member | anon |
|--------|------------|-----------|--------|------|
| Create campaign | ✓ | ✓ | ✗ | ✗ |
| Send campaign | ✓ | ✓ | ✗ | ✗ |
| Send any department | ✓ | ✗ (own only) | ✗ | ✗ |
| View analytics | ✓ | ✓ | ✗ | ✗ |
| Manage contacts | ✓ | ✓ | ✗ | ✗ |
| Send invitations | ✓ | ✓ | ✗ | ✗ |
| Invite any department | ✓ | ✗ (own only) | ✗ | ✗ |
| Unsubscribe (link) | - | - | - | ✓ |
| RSVP (link) | - | - | - | ✓ |
| View suppression list | ✓ | ✓ | ✗ | ✗ |
| Unsuppress email | ✓ | ✓ | ✗ | ✗ |

---

## 9. DATA FLOW DIAGRAMS

### Campaign Send Flow
```
User: Create campaign (draft)
  ↓
Campaign data: saved to communication_campaigns
  ↓
User: Click "Send" or "Schedule"
  ↓
Frontend: POST /send-communication-email { campaign_id }
  ↓
Edge Function: fetch campaign + recipients
  ↓
Edge Function: filter unsubscribed + bounced emails
  ↓
Edge Function: for each recipient (batched):
  - Resolve template variables
  - Rewrite links for tracking
  - Append sender signature
  - A/B test variant assignment
  - Call Resend API
  - Log to communication_sends
  ↓
Edge Function: update communication_campaigns with sent_count, failed_count
  ↓
Resend sends emails
  ↓
Email client: user opens (1% sample tracked by Resend)
  ↓
Resend Webhook: POST /resend-webhook { type: 'email.opened', email_id }
  ↓
Edge Function: update communication_sends.status = 'opened'
  ↓
Edge Function: increment communication_campaigns.open_count
```

### Unsubscribe Flow
```
Email HTML: <a href="/unsubscribe?email=...&token=...">
  ↓
User clicks unsubscribe
  ↓
Frontend: POST /handle-unsubscribe { email, token, action: 'unsubscribe' }
  ↓
Edge Function: validate token (SHA-256 HMAC)
  ↓
Edge Function: upsert communication_unsubscribes
  ↓
User marked as unsubscribed, excluded from future sends
```

### Bounce Flow
```
Resend detects bounce (hard/soft)
  ↓
Resend Webhook: POST /resend-webhook { type: 'email.bounced', bounce_type }
  ↓
Edge Function: upsert email_bounces { suppressed: true }
  ↓
Edge Function: if hard bounce, add to communication_unsubscribes
  ↓
Email suppressed in future campaigns
```

---

## 10. SECURITY NOTES

### Critical Vulnerabilities
1. **Unsubscribe Token is Deterministic**
   - SHA-256(email + secret) can be forged if secret leaks
   - Solution: Use random DB-backed tokens instead

2. **No Campaign Status Validation**
   - Can potentially re-send already-sent campaigns
   - Solution: Check status !== 'sent' before sending

3. **Department Authorization Gap in Campaigns**
   - dept_lead can send to any department (no boundary check)
   - User invitations correctly enforce dept_lead.department_id
   - Solution: Apply same dept check to campaign recipient resolution

4. **RSVP Endpoint Has No Rate Limiting**
   - Attackers can spam RSVP responses (no auth required)
   - Solution: Add rate limit by IP + recipient_email

5. **Email Sanitization is Regex-Based**
   - Misses SVG/XML-based XSS, data URIs, @import CSS
   - Solution: Use DOMPurify or similar library

### Well-Implemented
- ✓ Bounce webhook signature verification (Svix HMAC-SHA256)
- ✓ Email normalization (lowercase) for consistency
- ✓ Batch sending with delays (respects Resend rate limits)
- ✓ Idempotency headers (X-Entity-Ref-ID)
- ✓ Unsubscribe linked in email client UI (List-Unsubscribe header)
- ✓ Expiring tokens on invitations (7 days)
- ✓ RLS policies restrict sensitive data (bounces, clicks)
- ✓ Sender signature sanitization (HTML escaped)
- ✓ Public unsubscribe endpoint allows anonymous action

---

## 11. EXTERNAL DEPENDENCIES

- **Resend** (Email Service Provider)
  - API: https://api.resend.com/emails
  - Webhook: https://resend.com/webhooks
  - Auth: Bearer RESEND_API_KEY

- **Supabase Edge Functions** (Serverless)
  - Runtime: Deno/TypeScript
  - Imports: @supabase/supabase-js@2.50.0, resend@latest

- **Supabase Extensions**
  - pg_cron (for scheduled sends)
  - http (for edge function calls from DB)
