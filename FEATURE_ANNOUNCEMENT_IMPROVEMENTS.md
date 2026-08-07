# Feature Announcement Email Composer Improvements

## Overview

The feature announcement email system has been significantly enhanced with dual composition modes, improved visual design, server-side sanitization, and better user experience. Existing functionality remains fully backwards compatible.

---

## 1. Email Format Modes

### Standard Template Mode (Default)

A structured, form-driven email composer for quick feature announcements.

**Fields:**
- Email subject (required, auto-populated: "New in Nexus: [Feature Name]")
- Feature name (required)
- Tagline (optional, one-line hook)
- Description (required, line breaks preserved)
- Benefits (optional, one per line, up to 3 rendered as checkmark rows)
- Button label (required)
- Button URL (required)

**Audience Targeting:**
- All active users
- By department (select multiple)
- By role (select multiple)

**Result:** Professional, on-brand email with gradient purple header, personalized greeting, benefits as polished cards, and centered CTA button.

### Advanced HTML Mode

For trusted administrators who need custom campaign designs.

**Fields:**
- Email subject (required)
- Custom Email HTML (required, code editor with monospace font)
- "Insert Nexus Starter Template" button fills editor with polished starting point

**Personalization Tokens:**
- `{{firstName}}` → "Sarah" (fallback: "there")
- `{{fullName}}` → "Sarah Chen" (fallback: "there")

**Safety:**
- Server-side HTML sanitization (removes scripts, event handlers, dangerous protocols)
- Unsubscribe footer always appended (cannot be removed)
- No form injection or credential phishing possible

---

## 2. Improved Visual Design

### Standard Email Template

```
┌─────────────────────────────────────────┐
│ NEXUS                                   │  ← Logo
│ 🆕 WHAT'S NEW                          │  ← Badge
│                                         │
│ Sprint Task Board                       │  ← Large title
│ Plan your sprint visually               │  ← Tagline
└─────────────────────────────────────────┘
                                         
  Hi Sarah,                              
                                         
  Description text here. Multiple lines  
  are preserved as written.              
                                         
  ┌──────────────────────────────────────┐
  │ ✓ Drag tasks to update status        │
  │ ✓ See due dates at a glance          │
  │ ✓ Filter by assignee                 │
  └──────────────────────────────────────┘
                                         
              [Get Started]               
                                         
┌─────────────────────────────────────────┐
│ You're an active Nexus user             │
│ Unsubscribe  ·  © 2026 Nexus           │
└─────────────────────────────────────────┘
```

**Design Principles:**
- Warm off-white background (#f9f7f5)
- White content container
- Nexus purple gradient header (#4c2a92 → #6b3fb5)
- Dark readable text (#2d2a22)
- Strong visual hierarchy with generous spacing
- Email-client-safe HTML (tables, inline styles, no CSS classes)
- Mobile responsive (375px–600px)

---

## 3. Enhanced Preview Experience

### Desktop & Mobile Views
- Toggle between 600px (desktop) and 375px (mobile) previews
- Both use identical rendering functions (no divergence)
- Shows rendered subject line
- Uses same HTML builder as actual send

### Live Updates
- Preview updates when form content changes
- Format mode toggle instantly swaps templates
- Both standard and custom HTML previews work

---

## 4. Send Confirmation Modal

Before sending, admins see:
- **Audience:** "All active users" / "3 departments" / "2 roles"
- **Recipients:** "~42 eligible users (before opt-out check)"
- **Subject:** Shows exact subject line to be sent
- **Actions:** Cancel or Send announcement button

Prevents accidental sends to wrong audience or with incomplete subject.

---

## 5. Personalization & Tokens

### How It Works
1. Admin provides template with `{{firstName}}` and `{{fullName}}`
2. Email is sent to user with tokens replaced server-side
3. Fallback: "there" if first name is missing

### Example
```
Template:  "Hi {{firstName}},"
Sent:      "Hi Sarah,"           (first name from user.name)
Or:        "Hi there,"           (if name is null)
```

### Where It Works
- Standard template: "Hi {{firstName}}," greeting
- Custom HTML: Any `{{firstName}}` or `{{fullName}}` in submitted HTML

---

## 6. HTML Sanitization

### Removed (Server-Side)
- `<script>` tags and content
- `<iframe>`, `<object>`, `<embed>`, `<form>`, `<input>` tags
- Event handlers: `onclick`, `onload`, `onerror`, `onmouseover`, etc.
- Protocol attacks: `javascript:`, `vbscript:`
- Dangerous attributes: `href="javascript:..."`, `on*="..."`

### Preserved
- Layout tags: `<table>`, `<tr>`, `<td>`, `<div>`, `<span>`
- Text tags: `<p>`, `<h1>–<h4>`, `<strong>`, `<em>`, `<br>`, `<hr>`
- Lists: `<ul>`, `<ol>`, `<li>`
- Links: `<a href="https://...">`
- Images: `<img src="...">`
- Inline CSS (colors, fonts, spacing, etc.)

### Process
1. Admin submits custom HTML
2. Backend runs sanitization (Deno native regex)
3. Personalization tokens are applied
4. Unsubscribe footer is appended
5. Safe HTML is sent to mail service

---

## 7. Backwards Compatibility

### Existing Payloads Still Work
Old requests using:
```json
{
  "feature_name": "Sprint Board",
  "tagline": "...",
  "description": "...",
  "benefits": ["Drag tasks", "..."],
  "cta_label": "Try it",
  "cta_url": "/sprints"
}
```

Will be treated as `format: "standard"` with auto-generated subject.

### New Payloads
```json
{
  "format": "standard" | "html",
  "subject": "...",
  "feature_name": "..." (standard only),
  "customHtml": "..." (html only)
}
```

Both formats are supported; schema changes are non-breaking.

---

## 8. Audience Targeting (Unchanged)

- **All active users:** Sends to all active users (respecting opt-outs)
- **By department:** Select one or more departments
- **By role:** Select one or more roles (super_admin, dept_lead, etc.)

**Recipient Estimation:** Real-time count updates as selections change.

**Opt-Out Handling:**
- Users with `user_notification_prefs.email = false` for `notification_type = 'feature_announcement'` are excluded
- Skipped count shown in send result

**Weekly Send Cap:**
- Dept leads: 1 email per 7 days
- Others: 2 emails per 7 days
- Skipped users not counted toward sent total

---

## 9. Send Flow

1. **Compose:** Admin fills form in Standard or Advanced HTML mode
2. **Preview:** Desktop and mobile previews render live
3. **Review:** Click "Preview Email" to see rendering
4. **Confirm:** Click "Send Announcement" → confirmation modal appears
5. **Verify:** Modal shows audience, recipient count, and subject
6. **Send:** Click "Send Announcement" in modal to proceed
7. **Results:** Toast notification shows "Sent to X users" or error message
8. **Log:** All sends logged in Delivery Log with recipient, subject, status, timestamp

---

## 10. Delivery Log (Unchanged)

- **View:** All feature announcements sent (sortable by type, refreshable)
- **Columns:** Recipient, Type, Subject, Status, Sent at
- **Status:** "sent" (green) or "failed" (red)
- **Duration:** Last 50 by default; toggle "Show more" for last 200

---

## 11. Code Structure

### Frontend (`src/pages/admin/EmailAdminPage.jsx`)
- **State management:** `emailFormat` tracks mode, `showSendConfirm` modal state
- **Helper functions:**
  - `buildStandardAnnouncementHtml()` – generates standard template
  - `buildCustomHtml()` – wraps custom HTML with Nexus footer
  - `buildPreviewHtml()` – dispatches to appropriate builder
  - `getStarterTemplate()` – returns polished HTML starting point
  - `validateForm()` – ensures required fields before send
  - `handleSend()` – POSTs payload to edge function

### Backend (`supabase/functions/feature-announcement-email/index.ts`)
- **Auth:** Verifies super_admin role via JWT
- **Validation:** Ensures format-specific fields present
- **HTML Builders:**
  - `buildStandardAnnouncementHtml()` – standard email with gradient header
  - `buildCustomHtml()` – wraps custom HTML with Nexus footer
- **Sanitization:** `sanitizeHtml()` – removes dangerous tags and attributes
- **Personalization:** `personalizeHtml()` – replaces tokens
- **Flow:**
  1. Fetch eligible users (by targeting mode)
  2. Exclude opted-out users
  3. Apply weekly send cap
  4. For each user: sanitize/personalize HTML, send via Resend API, log result

---

## 12. Testing Checklist

### Standard Template
- [ ] Form fields appear correctly
- [ ] Benefits render as checkmark rows in preview
- [ ] Description line breaks preserved
- [ ] Subject defaults to "New in Nexus: [Feature Name]"
- [ ] Subject can be customized
- [ ] Desktop preview shows 600px width
- [ ] Mobile preview shows 375px width
- [ ] Preview button toggles visibility
- [ ] All-users targeting works
- [ ] Department targeting works
- [ ] Role targeting works
- [ ] Recipient count updates dynamically

### Advanced HTML
- [ ] Mode toggle switches to HTML fields
- [ ] Custom HTML textarea appears
- [ ] "Insert Starter Template" fills editor
- [ ] {{firstName}} token displays in preview
- [ ] {{fullName}} token displays in preview
- [ ] Tokens fallback to "there" when missing
- [ ] Subject field required
- [ ] Custom HTML field required
- [ ] Preview renders custom HTML correctly

### Sanitization
- [ ] `<script>` tags removed
- [ ] Event handlers removed (`onclick`, `onload`, etc.)
- [ ] `javascript:` URLs removed
- [ ] `<iframe>` tags removed
- [ ] Safe inline CSS remains intact
- [ ] `<a href="https://...">` links preserved

### Send & Confirmation
- [ ] Confirmation modal appears
- [ ] Audience summary correct
- [ ] Recipient count displayed
- [ ] Subject shown in modal
- [ ] Send button sends announcement
- [ ] Cancel button closes modal
- [ ] Toast shows success/error
- [ ] Delivery log updates after send
- [ ] Opted-out users excluded
- [ ] Weekly send cap honored

### Backwards Compatibility
- [ ] Old payload format still works
- [ ] Auto-generates subject for standard template
- [ ] Existing sends continue unaffected

---

## 13. Deployment Notes

### Files Changed
- `src/pages/admin/EmailAdminPage.jsx` – UI, mode selector, preview
- `supabase/functions/feature-announcement-email/index.ts` – Edge function logic

### Environment
- No new env vars required
- Uses existing `RESEND_API_KEY`, `FROM_EMAIL`, `FRONTEND_URL`

### Database
- No migrations needed
- Uses existing `email_delivery_log` table
- Uses existing `user_notification_prefs` table for opt-out checks

### Verification
- `npm run build` passes
- No TypeScript errors in edge function
- No JSX syntax errors

---

## 14. Future Enhancements (Out of Scope)

- WYSIWYG HTML editor for Advanced HTML mode
- Save/reuse email templates
- A/B testing (variant support)
- Send scheduling (future date/time)
- Drag-and-drop benefits builder instead of newline-separated
- More personalization tokens ({{department}}, {{role}})
- Subject line preview/variation suggestions

---

## Summary

The feature announcement email composer is now a powerful, dual-mode tool that enables both quick structured announcements and custom HTML campaigns, with full HTML sanitization, personalization, backwards compatibility, and a polished user experience.
