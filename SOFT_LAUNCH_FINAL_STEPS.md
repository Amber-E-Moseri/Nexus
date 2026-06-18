# Invitation Platform: Final Steps for Soft Launch

## ✅ Completed Today
1. ✅ CSV Importer component with 4-step flow (upload → map → preview → import)
2. ✅ Step3Recipients integration (toggle: Manual Entry / CSV Import)
3. ✅ Email sending library with test mode support
4. ✅ Step4PreviewSend test mode toggle (🧪 Test Mode default ON)
5. ✅ Supabase edge function for production email sending
6. ✅ Build passes with no errors

---

## 🔨 REMAINING WORK (2-3 hours for full soft launch)

### Step 1: Phase 3 - Communications Integration (1 hour)
**Goal:** Add Invitations tab to Communications module

**File:** `src/pages/communications/CommunicationsPage.jsx`

**Change needed:**
```jsx
// Find the main Communications component
// Add tab navigation before the content:

const [view, setView] = useState('campaigns')

// Add tab buttons:
<div style={{ display: 'flex', gap: '12px', borderBottom: '1px solid #EDE8DC', marginBottom: '24px' }}>
  <button
    onClick={() => setView('campaigns')}
    style={{
      padding: '8px 16px',
      borderBottom: view === 'campaigns' ? '3px solid #4C2A92' : 'none',
      background: 'none',
      cursor: 'pointer',
      fontWeight: view === 'campaigns' ? 600 : 400
    }}
  >
    Campaigns
  </button>
  <button
    onClick={() => setView('invitations')}
    style={{
      padding: '8px 16px',
      borderBottom: view === 'invitations' ? '3px solid #4C2A92' : 'none',
      background: 'none',
      cursor: 'pointer',
      fontWeight: view === 'invitations' ? 600 : 400
    }}
  >
    Invitations
  </button>
</div>

// Conditional rendering:
{view === 'campaigns' && <CampaignsList />}
{view === 'invitations' && <InvitationWizard />}
```

---

### Step 2: Phase 4 - Seed Templates (30 min)
**Goal:** Add default templates to database

**File:** Create `supabase/seed.sql`

```sql
-- Get org_id (replace with actual org_id from your database):
-- SELECT id FROM organizations LIMIT 1;

INSERT INTO invitation_templates (
  org_id,
  name,
  description,
  occasion,
  theme_config,
  animation_config,
  content_slots,
  token_fields,
  email_subject,
  email_preview,
  status
) VALUES
(
  '00000000-0000-0000-0000-000000000001', -- CHANGE THIS to real org_id
  'Graduation Ceremony',
  'Elegant graduation invitation with gold accents',
  'graduation',
  '{"palette":{"envelope_body":"#1a3a2a","envelope_flap":"#1f4a30","seal":"#c9a227","card_bg":"#fefdf8","accent":"#c9a227","text_primary":"#1a3a2a","text_secondary":"#666"},"fonts":{"display":"Playfair Display","body":"Inter","accent":"Dancing Script"},"layout_variant":"classic"}',
  '{"envelope_style":"classic","flap_animation":"rotate3d","card_reveal":"slide_up","particles":"confetti","particle_colors":["#c9a227","#1a3a2a","#fefdf8"],"seal_icon":"🎓","ambient":"stars"}',
  '{"event_name":"Graduation Ceremony","event_date":"June 15, 2025","event_time":"2:00 PM","venue":"University Auditorium","message":"We cordially invite you to celebrate"}',
  '[{"key":"recipient_name","label":"Full Name","required":true},{"key":"degree","label":"Degree","required":false}]',
  'You''re Invited to {{event_name}}',
  'Dear {{recipient_name}}, we''re delighted...',
  'active'
),
(
  '00000000-0000-0000-0000-000000000001', -- SAME org_id
  'Wedding Reception',
  'Romantic wedding invitation',
  'wedding',
  '{"palette":{"envelope_body":"#2d1b3d","envelope_flap":"#3d2650","seal":"#d4af37","card_bg":"#fffbf5","accent":"#d4af37","text_primary":"#2d1b3d","text_secondary":"#666"},"fonts":{"display":"Great Vibes","body":"Lora","accent":"Playfair Display"},"layout_variant":"classic"}',
  '{"envelope_style":"classic","flap_animation":"rotate3d","card_reveal":"slide_up","particles":"none","particle_colors":["#d4af37"],"seal_icon":"💍","ambient":"none"}',
  '{"event_name":"Wedding Reception","event_date":"July 20, 2025","event_time":"6:00 PM","venue":"The Garden Estates","message":"Together with our hearts..."}',
  '[{"key":"recipient_name","label":"Guest Name","required":true},{"key":"plus_one","label":"Plus One","required":false}]',
  'Together With',
  'Our hearts overflow with joy...',
  'active'
);
```

**Steps to run:**
1. Get your org_id from Supabase:
   ```sql
   SELECT id FROM organizations LIMIT 1;
   ```
2. Replace `'00000000-0000-0000-0000-000000000001'` with actual org_id
3. Save as `supabase/seed.sql`
4. Run: `supabase db push` (or paste into Supabase SQL Editor)

---

### Step 3: Create Sample CSV for Testing
**File:** `test-recipients.csv`

```csv
email,name,degree
john.doe@example.com,John Doe,Bachelor of Science
jane.smith@example.com,Jane Smith,Master of Arts
bob.wilson@example.com,Bob Wilson,Doctor of Philosophy
```

---

### Step 4: Test the Full Workflow
1. **Start app:** `npm run dev`
2. **Navigate:** Communications → Invitations tab
3. **Create campaign:**
   - Step 1: Pick "Graduation Ceremony" template
   - Step 2: Fill event details
   - Step 3: Upload test-recipients.csv
     - Map: email → email, name → name, degree → degree
     - Preview shows 3 recipients
   - Step 4: Review
     - Toggle shows "🧪 Test Mode (No Emails)"
     - Click "Test Send"
4. **Verify:**
   - Success message: "Campaign [TEST MODE] sent successfully! (3 recipients)"
   - Check database:
     ```sql
     SELECT status, sent_at FROM invitation_recipients 
     WHERE campaign_id = 'xxx'
     LIMIT 3;
     ```
     Should show: status='sent', sent_at=(current timestamp)

---

## 📋 Soft Launch Deployment Checklist

- [ ] Add Invitations tab to Communications (Phase 3)
- [ ] Seed 2 templates in database (Phase 4)
- [ ] Create test CSV file
- [ ] Run full workflow test locally
- [ ] `npm run build` passes ✅ (already done)
- [ ] Deploy to staging/production
  ```bash
  git add .
  git commit -m "feat: Add invitation CSV importer and test mode email sending"
  git push origin feature/scheduled-sends-bounce-management
  ```

---

## 🎯 Success Criteria (Soft Launch)

✅ **User can:**
1. Create invitation from template
2. Upload recipients via CSV
3. Preview recipients before sending
4. Send test (no emails) to mark as sent
5. Open invitation link without auth
6. View animated invitation
7. RSVP yes/no
8. See response recorded in database

✅ **Test Mode:**
- Default ON in soft launch
- Recipients marked as 'sent' immediately
- No emails sent (safe testing)
- Success message confirms test mode

✅ **Production Mode (optional, post-launch):**
- Toggle OFF to send real emails via Resend
- RESEND_API_KEY set in Supabase secrets
- Edge function deployed
- Emails arrive with personalization tokens

---

## 📞 Support

**If stuck on any step:**
1. Check database tables exist: `invitation_templates`, `invitation_campaigns`, `invitation_recipients`
2. Verify org_id is correct in seed.sql
3. Check build: `npm run build`
4. Check console for errors: `npm run dev`

---

**Estimated time to completion:** 2-3 hours
**Current status:** ✅ Code complete, ready for integration

