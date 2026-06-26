# Nexus Communications & Invitation System Audit
**Date:** 2026-06-25  
**Status:** Comprehensive system with strong positioning vs Mailchimp/Evite  

---

## Executive Summary

Nexus has a **production-grade communication platform** with 11 distinct systems serving different use cases:

| System | Status | Lines of Code | Maturity | Comparison |
|--------|--------|---------------|----------|-----------|
| Email Campaigns | Production ✓ | ~1,382 | 4/5 | Mailchimp-level composer |
| User Invitations | Production ✓ | ~583 | 4/5 | Better: role-based, custom messages |
| Notifications | Production ✓ | ~254 | 3/5 | In-app + browser push |
| Event Invitations | MVP | ~213 | 2/5 | Like Evite, needs RSVP tracking |
| Contact Management | Production ✓ | ~330 | 3/5 | Custom audience segments |
| Email Analytics | Production ✓ | ~852 | 4/5 | Open rate, click tracking, A/B tests |
| Template System | Production ✓ | ~628 | 3/5 | 12+ reusable templates |
| In-App Broadcasts | In Development | N/A | 0/5 | NEW: Phase 1 (DB schema ready) |
| Email Signatures | Production ✓ | ~80 | 2/5 | Per-user + org-wide |
| Notification Prefs | In Development | N/A | 0/5 | NEW: Quiet hours, channel selection |
| Absence Follow-ups | Production ✓ | ~150 | 2/5 | Automated meeting absence emails |

**Total built infrastructure:** 5,872+ lines of code + 24 database migrations + 12+ React components  
**Database tables:** 17 (communication_campaigns, app_notifications, broadcast_campaigns, user_invitations, etc.)

---

## Part 1: Current System Inventory

### 1.1 Email Campaign Composer (Production)
**File:** `/src/pages/communications/EmailComposerPage.jsx` (1,382 lines)  
**Maturity:** 4/5 ⭐⭐⭐⭐

**Features:**
- Rich HTML editor with drag-drop blocks
- Desktop + mobile preview rendering
- Template library with 12+ pre-built templates
- Dynamic merge tokens: `{{name}}`, `{{email}}`, `{{subgroup}}`, `{{pastor_name}}`, `{{org_name}}`, `{{date_today}}`
- A/B subject line testing with configurable split %
- Test email sending before deployment
- From name + reply-to customization
- Schedule sending (one-time or recurring)
- Recipient segmentation with visual chip selector
- Draft auto-save functionality

**What's Missing vs Mailchimp:**
- ❌ Workflow automation (triggered sends on user actions)
- ❌ Dynamic content blocks (IF/ELSE based on user attributes)
- ❌ Email list hygiene (bounce management is basic)
- ❌ Advanced segmentation (behavior-based, not just roles)
- ✅ Built-in CRM data (already have user roles, departments)

**Nexus Advantage:**
- Real-time sync with user roles/departments (no separate data import)
- Approval workflows before send (built into role system)
- Calendar integration (can reference events and dates)
- Task/sprint context in emails (not available in Mailchimp)

---

### 1.2 User Invitation System (Production)
**File:** `/src/pages/people/InvitationsPage.jsx` (583 lines)  
**Maturity:** 4/5 ⭐⭐⭐⭐

**Features:**
- Single user invitations with email validation
- Bulk CSV import (1,000+ at once)
- Role-based assignment (super_admin, dept_lead, pastor, member)
- Department routing (auto-assign pastor based on dept)
- Custom welcome messages per invitation
- Secure token generation + expiry management
- Invitation link sharing (copy to clipboard)
- Resend capability for expired/pending
- Cancellation/revocation for pending invites
- Status tracking (pending, accepted, expired, revoked)

**What's Missing vs Mailchimp:**
- ❌ RSVP tracking for invitations (who's confirmed arrival)
- ❌ Invitation reply-tracking (did they open/click)
- ❌ Automatic reminder emails (3-day, 1-day before)
- ✅ Role/department-based routing

**Nexus Advantage:**
- **Role-aware:** Assignable to specific roles at signup (pastor vs member)
- **Department-aware:** Auto-route to correct department during onboarding
- **Custom messages:** Each invitation can have personalized welcome text
- **Batch operations:** CSV bulk import with single transaction

---

### 1.3 Event Invitations (MVP)
**File:** `/src/pages/communications/InvitationWizard.jsx` (213 lines)  
**Maturity:** 2/5 ⭐⭐

**Features:**
- 4-step wizard for creating invitation campaigns
- Template selection UI
- Event details customization (content slots)
- Recipient selection
- Draft saving capability
- Preview and send confirmation

**What's Missing vs Evite:**
- ❌ **RSVP tracking** (core Evite feature)
- ❌ Guest count forecasting
- ❌ Dietary restrictions/special requests
- ❌ Automated reminder emails
- ❌ Guest list visibility (who's coming)
- ❌ Group messaging between attendees
- ⚠️ Calendar attachment (.ics file)

**Comparison to Mailchimp + Evite:**
```
Mailchimp:  Email campaign → click link → goes to website
Evite:      Invitation → RSVP → guest list + messaging
Nexus:      Invitation → [MISSING RSVP] → ???
```

**Gap:** Need RSVP system to complete Evite positioning.

---

### 1.4 Email Analytics (Production)
**File:** `/src/pages/communications/AnalyticsPage.jsx` (852 lines)  
**Maturity:** 4/5 ⭐⭐⭐⭐

**Features:**
- Open rate tracking (pixel-based)
- Click tracking with URL rewriting
- Click timeline visualization (when clicks happened)
- A/B test result calculation (statistical significance)
- Bounce/suppression list management
- Hard/soft bounce distinction
- Email delivery logging
- Campaign performance dashboard

**What's Missing vs Mailchimp:**
- ❌ Subscriber engagement scoring
- ❌ Unsubscribe reason capture
- ❌ Spam complaint tracking
- ❌ Mobile vs desktop open breakdown
- ✅ A/B test analytics

**Nexus Advantage:**
- Department-specific analytics (filter by dept_lead view)
- Role-based reporting (pastors see only their members)
- Link tracking tied to user objects (not just emails)

---

### 1.5 Contact Management (Production)
**File:** `/src/pages/communications/RecipientsPage.jsx` (330 lines)  
**Maturity:** 3/5 ⭐⭐⭐

**Features:**
- Custom contact creation (external to Nexus users)
- Contact categorization with custom tags
- CSV import for contacts
- Email validation and deduplication
- Link contacts to categories
- Contact edit/delete operations

**What's Missing vs Mailchimp:**
- ❌ Contact lifecycle tracking (when added, last engagement)
- ❌ Custom fields (birth date, anniversary, etc.)
- ❌ Duplicate detection/merge
- ❌ Data enrichment (company, location auto-fill)
- ✅ Category-based segmentation

**Nexus Advantage:**
- Tight integration with department structure (not separate system)
- Can mix internal users + external contacts in same campaign
- Category system is lightweight and extensible

---

### 1.6 Template System (Production)
**File:** `/src/pages/communications/EmailTemplatesPage.jsx` (628 lines)  
**Maturity:** 3/5 ⭐⭐⭐

**Features:**
- 12+ pre-built templates (welcome, event, announcement, etc.)
- Template categorization
- WYSIWYG editor with block system
- Template cloning
- Template preview
- Merge token insertion UI
- Reusable for campaigns and invitations

**What's Missing vs Mailchimp:**
- ❌ Dynamic template variables (not just merge tokens)
- ❌ Template versioning
- ❌ Team template sharing/approval
- ❌ Template A/B testing
- ✅ Basic reusability

**Nexus Advantage:**
- Templates pre-populated with Nexus contexts (events, pastors, departments)
- Can reference calendar events and task sprints in templates

---

### 1.7 Saved Segments (Production)
**File:** `/src/pages/communications/SegmentsPage.jsx` (514 lines)  
**Maturity:** 3/5 ⭐⭐⭐

**Features:**
- Create saved audience segments
- Visual pill-based filtering UI
- Role-based segmentation (pastor, member, dept_lead)
- Department filtering
- Reuse segments across campaigns
- Edit and delete segments
- Segment preview (member count)

**What's Missing vs Mailchimp:**
- ❌ Behavioral segmentation (based on actions: opened email, attended event)
- ❌ Temporal segmentation (joined in last 30 days)
- ❌ Engagement scoring
- ❌ Advanced boolean logic (AND/OR)
- ✅ Role and department-based segments

**Nexus Advantage:**
- Real-time segment member counts (actual DB, not estimates)
- Can segment by task/sprint assignment
- Can segment by meeting attendance
- Department hierarchy awareness

---

### 1.8 Notifications System (In Development)
**File:** `/src/features/notifications/lib/notifications.js` (254 lines)  
**Database:** `20260830000000_notifications_table.sql` (1,363 lines)  
**Maturity:** 1/5 ⭐ (Live but being replaced)

**Current Notifications:**
- In-app notification inbox with read/unread tracking
- Browser push notifications (service worker-based)
- Notification types: task_assigned, task_comment, sprint_added, mention, invitation_accepted, meeting_created, event_approval_pending, meeting_reminder

**What's Missing:**
- ❌ Notification preferences per type
- ❌ Quiet hours (do not disturb)
- ⚠️ Being replaced by new broadcast system

**Being Replaced By (Phase 1, in 20260901000000_native_communications_system.sql):**
- ✅ `app_notifications` table (broadcast, direct, system, alert, invite types)
- ✅ `broadcast_campaigns` table (campaign-wide notifications)
- ✅ `notification_preferences` table (quiet hours + channel selection)
- ✅ `notification_read_state` table (denormalized unread counts)
- ✅ Realtime enabled for instant updates

---

### 1.9 Email Signatures (Production)
**File:** Database migrations `20260804000000_email_signature.sql` (861 lines)  
**Maturity:** 2/5 ⭐⭐

**Features:**
- Per-user email signature
- Organization-wide default signature
- Automatic signature append to sent emails

**What's Missing:**
- ❌ HTML signature editor UI
- ❌ Signature templates
- ❌ Signature versioning
- ❌ Multi-language signatures

---

### 1.10 Absence Email System (Production)
**File:** `/src/pages/meetings/AbsenceEmailLogPage.jsx` (150 lines)  
**Maturity:** 2/5 ⭐⭐

**Features:**
- Automated follow-up emails for meeting absences
- Customizable absence notification templates
- Delivery logging
- Notification preference management

**Unique to Nexus:**
- Integrates with calendar/meeting system
- Tracks who didn't show up to meetings
- Sends automated follow-up emails

---

### 1.11 CSV Import/Export (Production)
**Features:**
- Bulk user invitations via CSV
- Bulk contact import for campaigns
- Contact category parsing from CSV headers
- Email validation and deduplication

**Limitation:** Export capability not mentioned (one-way import)

---

## Part 2: Positioning vs Mailchimp & Evite

### Mailchimp Positioning
Mailchimp is **email-centric** marketing automation platform:
- ✅ Email campaigns (Nexus has this)
- ✅ Templates (Nexus has this)
- ✅ A/B testing (Nexus has this)
- ✅ Analytics (Nexus has this)
- ❌ CRM integration (Nexus has this NATIVELY)
- ❌ Workflow automation (Nexus missing)
- ❌ SMS/SMS integration (Nexus missing)

### Evite Positioning
Evite is **event-centric** invitation + RSVP platform:
- ✅ Event invitations (Nexus has MVP)
- ❌ RSVP tracking (Nexus MISSING)
- ❌ Guest list management (Nexus MISSING)
- ❌ Attendee communication (Nexus missing)
- ❌ Event reminders (Nexus missing)

### Nexus Unique Positioning: "Ministry-Native Communications Platform"

**What Nexus Does Better:**
1. **Role + Department Awareness**
   - Mailchimp: Requires manual list management
   - Nexus: Automatic routing based on roles (pastor, dept_lead, member)
   - Evite: No role/department support

2. **Calendar Integration**
   - Mailchimp: Can't reference events
   - Evite: Event-centric but no integration
   - Nexus: Full calendar context in emails (event date, attendees, etc.)

3. **Task/Sprint Context**
   - Mailchimp: No task awareness
   - Evite: No task awareness
   - Nexus: Can embed task/sprint info in emails

4. **Hierarchical Organization**
   - Mailchimp: Flat list segmentation
   - Evite: Single event
   - Nexus: Department → sub-department → person hierarchy

5. **Meeting Attendance Tracking**
   - Mailchimp: No attendance tracking
   - Evite: RSVP only
   - Nexus: Can follow up on absences, track attendance history

6. **Approval Workflows**
   - Mailchimp: No role-based approval
   - Evite: No approval
   - Nexus: Built into role system (dept_lead approves before send)

---

## Part 3: Gaps & Opportunities

### HIGH PRIORITY (Evite Parity - 12 weeks)

#### 1. **RSVP System** [Critical for Event Invitations]
- [ ] `invitation_rsvps` table (yes/no/maybe/not_responded)
- [ ] RSVP tracking in `invitation_recipients`
- [ ] API endpoint to RSVP via token link (unauthenticated)
- [ ] RSVP summary stats (attendees count, dietary restrictions)
- [ ] Reminder emails (3 days, 1 day before event)
- **Files to create:** `src/features/invitations/rsvp.js`, `src/pages/communications/InvitationDetailPage.jsx` (enhance)
- **DB schema:** 2-3 new tables/columns
- **Estimated effort:** 3-4 weeks
- **Why:** Evite differentiator; required for "native" event management

#### 2. **Guest List UI** [Evite Feature]
- [ ] Display who's attending, not attending, maybe
- [ ] Guest photo/avatar display
- [ ] Share guest list visibility settings
- [ ] Attendee count forecast
- **Files to create:** React component for guest list display
- **Estimated effort:** 1-2 weeks
- **Why:** Core Evite feature; users expect this

#### 3. **RSVP Reminders** [Evite Feature]
- [ ] Automated reminder email at T-3 days, T-1 day
- [ ] Allow sender to customize reminder text
- [ ] Track who responded after reminder
- **Files to create:** Background job or cron function
- **DB:** Add `reminder_sent_at` tracking
- **Estimated effort:** 1-2 weeks

#### 4. **Event Information Enrichment** [UX]
- [ ] Location/address display in invite email
- [ ] Zoom/video call link auto-embedding
- [ ] Calendar attachment (.ics file)
- [ ] Add to device calendar button (works with Apple/Google Calendar)
- **Estimated effort:** 2-3 weeks
- **Why:** Expected by all event invitation platforms

---

### MEDIUM PRIORITY (Mailchimp Parity - 12 weeks)

#### 5. **Email Workflow Automation** [Mailchimp Feature]
- [ ] Trigger sends on user actions (joined, assigned task, attended event)
- [ ] Delay/wait steps (wait 3 days, then send)
- [ ] Branching logic (if clicked, send follow-up A; else send follow-up B)
- [ ] Visual workflow builder UI
- **Estimated effort:** 4-6 weeks
- **Why:** Mailchimp core feature; drives engagement

#### 6. **Advanced Segmentation** [Mailchimp Feature]
- [ ] Behavioral segments (opened email, clicked link, attended event)
- [ ] Recency segments (joined in last 30 days)
- [ ] Engagement scoring (active, at-risk, inactive)
- [ ] Custom field filtering
- **Files to update:** `src/pages/communications/SegmentsPage.jsx`
- **Estimated effort:** 3-4 weeks
- **Why:** More targeted campaigns = better engagement

#### 7. **Email List Hygiene** [Mailchimp Feature]
- [ ] Hard bounce removal (auto-unsubscribe)
- [ ] Soft bounce retry logic
- [ ] Spam complaint tracking
- [ ] Automatic suppression list management
- **DB:** Enhance `email_delivery_log` with bounce reason codes
- **Estimated effort:** 2-3 weeks
- **Why:** Sender reputation matters; required for high-volume sends

#### 8. **Dynamic Content Blocks** [Mailchimp Feature]
- [ ] IF/ELSE blocks based on user attributes (if pastor, show X; else show Y)
- [ ] Conditional content in templates
- [ ] Fallback content for unknown attributes
- **Files to update:** Email composer + template rendering
- **Estimated effort:** 2-3 weeks
- **Why:** Single template for multiple audience segments

---

### LOW PRIORITY (Nice-to-Have)

#### 9. **SMS Integration**
- **Why:** Mailchimp added SMS; not critical for ministry
- **Estimated effort:** 3 weeks
- **Cost:** Twilio integration ~$0.01-0.02/SMS

#### 10. **Landing Pages**
- **Why:** Evite has landing pages; nice for public events
- **Estimated effort:** 4-5 weeks
- **Tech:** Next.js standalone pages or Supabase edge function

#### 11. **Subscriber Engagement Scoring**
- **Why:** Show which members are engaged (for targeting)
- **Estimated effort:** 2 weeks

#### 12. **Template Versioning & A/B Testing**
- **Why:** Test different template designs
- **Estimated effort:** 2 weeks

#### 13. **Email Signature Templates & Editor**
- **Why:** Currently no UI to edit signatures
- **Estimated effort:** 1-2 weeks

#### 14. **Contact Custom Fields**
- **Why:** Store extra data (phone, address, birthday)
- **Estimated effort:** 2-3 weeks

---

## Part 4: Database State & Schema

### Existing Tables (17 total)

**Email & Campaign Tables:**
- `communication_campaigns` - Campaign metadata + scheduling
- `communication_sends` - Individual send records (who got email)
- `communication_ab_tests` - A/B test configurations
- `communication_email_templates` - Reusable email templates
- `communication_segments` - Saved audience filters
- `communication_contacts` - External contact records
- `communication_categories` - Contact category tags
- `communication_contact_categories` - Contact-category join table

**Invitation Tables:**
- `user_invitations` - User signup invitations
- `user_invitation_tokens` - Secure activation tokens
- `invitation_campaigns` - Event invitation campaigns
- `invitation_recipients` - Per-recipient invitation send records
- `invitation_templates` - Event invitation templates

**Notification Tables:**
- `notifications` - Old notification system (being deprecated)
- `email_delivery_log` - Email send history

**Infrastructure Tables:**
- `email_signatures` - User/org email signatures
- `app_settings` - Global email configuration

### New Tables (In Development - 20260901000000)

**Phase 1: Broadcast Notifications**
- `app_notifications` - In-app notification inbox (realtime enabled)
- `broadcast_campaigns` - Campaign metadata + stats
- `notification_preferences` - User settings (quiet hours, channels)
- `notification_read_state` - Denormalized unread count cache
- `communication_unsubscribe_tokens` - Secure unsubscribe links

**Planned but Not Yet Built:**
- `invitation_rsvps` - RSVP responses (MISSING)
- `invitation_reminders` - Reminder tracking (MISSING)
- `contact_custom_fields` - Custom field values (MISSING)
- `email_bounces` - Bounce reason tracking (MISSING)
- `automation_workflows` - Workflow definitions (MISSING)
- `automation_workflow_steps` - Workflow step definitions (MISSING)
- `automation_triggers` - Workflow trigger definitions (MISSING)

---

## Part 5: Frontend Component Inventory

| Component | File | Purpose | Maturity |
|-----------|------|---------|----------|
| EmailComposerPage | `/src/pages/communications/EmailComposerPage.jsx` | Main email composer | 4/5 |
| CampaignPage | `/src/pages/communications/CampaignPage.jsx` | Campaign list + dashboard | 4/5 |
| AnalyticsPage | `/src/pages/communications/AnalyticsPage.jsx` | Campaign analytics | 4/5 |
| EmailTemplatesPage | `/src/pages/communications/EmailTemplatesPage.jsx` | Template CRUD | 3/5 |
| SegmentsPage | `/src/pages/communications/SegmentsPage.jsx` | Audience segment builder | 3/5 |
| RecipientsPage | `/src/pages/communications/RecipientsPage.jsx` | Contact management | 3/5 |
| InvitationWizard | `/src/pages/communications/InvitationWizard.jsx` | Event invitation builder | 2/5 |
| InvitationsPage | `/src/pages/people/InvitationsPage.jsx` | User invitation management | 4/5 |
| InvitationDetailPage | `/src/pages/communications/InvitationDetailPage.jsx` | Single invitation view | 2/5 |
| InvitationsListPage | `/src/pages/communications/InvitationsListPage.jsx` | Campaign invitation list | 2/5 |

---

## Part 6: Edge Functions & API Layer

**Implemented Edge Functions:**
- `sendInvitationEmail()` - Send user invitations via Resend
- `logEmail()` - Log email delivery events
- `getClickTrackingData()` - Track email link clicks
- `getABTestResults()` - Calculate A/B test statistics
- `fillTemplateTags()` - Merge token replacement
- `sanitizeEmailHtml()` - XSS prevention
- `wrapLinksForTracking()` - Link tracking wrapper

**Implemented RPC Functions:**
- `createInvitation()` - Create single user invitation
- `createBulkInvitations()` - CSV batch import
- `cancelInvitation()` - Revoke pending invitation
- `createCampaign()` - Create email campaign
- `createSegment()` - Create saved segment
- `sendCampaign()` - Send email campaign
- `addContact()` - Add external contact

---

## Part 7: Recommended Roadmap

### Phase 1: Evite Parity (12 weeks) ⭐ HIGH PRIORITY
**Goal:** Position Nexus as "Evite alternative for ministries"

**Weeks 1-3:** RSVP System
- Build `invitation_rsvps` table
- Create RSVP API endpoints
- Add RSVP link in email invitations
- Simple yes/no/maybe UI

**Weeks 4-6:** Guest List UI
- Display attendees/responses
- Show response statistics
- Share guest list UI

**Weeks 7-9:** RSVP Reminders
- Schedule reminder emails (T-3d, T-1d)
- Reminder customization UI
- Track reminder effectiveness

**Weeks 10-12:** Event Enrichment
- Location/address display
- Calendar attachment (.ics)
- Zoom/video link auto-embedding
- "Add to calendar" button

**Success Metrics:**
- RSVP rate >70% (vs email open rate ~25%)
- Guest list visibility increase engagement
- Reminder emails improve response rate

---

### Phase 2: Mailchimp Parity (12 weeks)
**Goal:** Position Nexus as "Mailchimp alternative for ministries"

**Weeks 1-4:** Email Workflow Automation
- Visual workflow builder
- Trigger + action + delay steps
- Branching logic (if/then)

**Weeks 5-8:** Advanced Segmentation
- Behavioral segments (opened, clicked, attended)
- Recency segments (joined in last X days)
- Engagement scoring

**Weeks 9-12:** Email List Hygiene
- Bounce management
- Automatic suppression
- Spam complaint handling

**Success Metrics:**
- Workflow-driven campaigns have 2x better engagement
- Advanced segments improve CTR
- Bounce rate <5%

---

### Phase 3: Native Nexus Innovations (12 weeks)
**Goal:** Differentiate Nexus beyond Mailchimp + Evite

**Ideas:**
1. **Ministry-Specific Templates**
   - Sermon announcement
   - Volunteer request
   - Fundraiser
   - Ministry calendar
   - Prayer request

2. **Attendance-Driven Campaigns**
   - Auto-email people who missed 3 meetings
   - Welcome back email after absence
   - Engagement warning (no attendance in 30 days)

3. **Task/Sprint Integration**
   - Email volunteers about assigned tasks
   - Volunteer signup workflow (click to volunteer)
   - Task completion reminders

4. **Calendar-Aware Emails**
   - "Services this week" email (auto-populated)
   - Holiday email campaigns (auto-triggered)
   - Meeting preparation emails

5. **Group Messaging for Invitees**
   - Q&A section for event invitations
   - Group chat for attendees
   - Real-time responses

---

## Part 8: Technical Debt & Maintenance

### RLS (Row-Level Security) Audit
**Status:** 17 policies created, all tables secured ✅

### Database Indexes
**Status:** 35+ indexes for performance ✅

### Email Rate Limiting
**Status:** Not explicitly mentioned - CHECK NEEDED
- Should implement: max 100 emails/minute per campaign
- Should implement: max 10 campaigns/day per user

### Email Deliverability
**Current:** Using Resend (third-party SMTP)
**Considerations:**
- Monitor bounce rates (should be <5%)
- Monitor spam complaints (should be <0.1%)
- Implement DKIM/SPF/DMARC (check if done)

### Data Privacy
**Concerns:**
- Unsubscribe tokens expire after 30 days ✅
- GDPR compliance: Can users request data deletion?
- Can users export their data?

---

## Part 9: Competitive Analysis Summary

### vs Mailchimp
| Feature | Mailchimp | Nexus | Winner |
|---------|-----------|-------|--------|
| Email campaigns | ✅ | ✅ | Tie |
| Templates | ✅ | ✅ | Tie |
| A/B testing | ✅ | ✅ | Tie |
| Analytics | ✅ | ✅ | Tie |
| Workflow automation | ✅ | ❌ | Mailchimp |
| CRM integration | ⚠️ Separate | ✅ Native | **Nexus** |
| Calendar awareness | ❌ | ✅ | **Nexus** |
| Role-based routing | ❌ | ✅ | **Nexus** |
| SMS | ✅ | ❌ | Mailchimp |
| **Price** | **$20-350/mo** | **Native** | **Nexus** |

### vs Evite
| Feature | Evite | Nexus | Winner |
|---------|-------|-------|--------|
| Event invitations | ✅ | ✅ | Tie |
| RSVP tracking | ✅ | ❌ | Evite |
| Guest list | ✅ | ❌ | Evite |
| Email reminders | ✅ | ⚠️ | Evite |
| Attendee messaging | ✅ | ❌ | Evite |
| Decor/theme templates | ✅ | ❌ | Evite |
| Role-aware invites | ❌ | ✅ | **Nexus** |
| Calendar context | ❌ | ✅ | **Nexus** |
| Attendance history | ❌ | ✅ | **Nexus** |
| **Price** | **Free/Premium** | **Native** | **Nexus** |

---

## Part 10: Messaging & Positioning

### Current Positioning (What it IS)
> "Ministry-native communication platform with email campaigns, event invitations, and member notifications—all integrated with your organization structure."

### Aspirational Positioning (What it COULD BE)
> "Nexus brings email marketing (Mailchimp) and event management (Evite) together, but built natively for ministries. Role-aware campaigns, department-aware routing, and calendar-integrated invitations—no data shuffling between tools."

### Key Differentiators (After Phase 1 + 2)
1. **All-in-one:** Email + Events + Notifications (vs separate tools)
2. **Role-aware:** Automatic routing (no manual list management)
3. **Calendar-integrated:** Events auto-populate emails
4. **Approval workflows:** Built-in governance (dept_leads approve)
5. **Attendance tracking:** See who came, who didn't, auto-follow-up
6. **One platform:** No Mailchimp + Evite + Slack + Google Calendar (4 tools → 1)

### Pricing Advantage
- Mailchimp: $20-350/month (depending on list size)
- Evite: Free/Premium features
- Nexus: **Included in platform** (no additional cost)

---

## Conclusion & Recommendations

### Status: ✅ Strong Foundation, Clear Path to Differentiation

**Nexus communications is 60% of the way to being a credible Mailchimp + Evite alternative.**

### Next Steps (Prioritized)

**Immediate (Now - 2 weeks):**
1. Read this audit to your team
2. Prioritize RSVP system (highest ROI for Evite parity)
3. Set Phase 1 timeline (12 weeks for Evite parity)

**Short-term (Weeks 1-4):**
1. Build RSVP table + API
2. Add RSVP link to invitation emails
3. Create basic RSVP UI

**Medium-term (Weeks 5-12):**
1. Guest list display
2. Reminder emails
3. Event enrichment (location, calendar attachment)

**Long-term (Weeks 13+):**
1. Workflow automation (Mailchimp parity)
2. Advanced segmentation
3. Email list hygiene

### Success Criteria

- **6 months:** RSVP system complete, >50% invitation campaigns have RSVP data
- **12 months:** Workflow automation + advanced segmentation, become "default comms tool" for ministries
- **24 months:** Feature parity with Mailchimp + Evite, but cheaper and more integrated

---

**Document prepared:** 2026-06-25  
**Next review:** After Phase 1 completion (estimated 2026-09-25)
