# NEXUS TESTING - QUICK REFERENCE GUIDE

## Running Completed Tests

### RSVP Token Validation
```bash
# Run automated token tests
node test_rsvp_tokens.js

# Expected output: All 10 tests pass
# Time: ~1 second
```

---

## Critical Test Checklist (For Manual Testing)

### 🔴 Before Production, Must Test:

#### 1. RSVP Public Page
- [ ] Navigate to: `/rsvp?token=<valid-48-char-token>`
- [ ] Page loads in < 2 seconds
- [ ] Campaign details display (title, date, time, location)
- [ ] RSVP buttons are clickable: Yes, Maybe, No
- [ ] Notes field allows typing (max 500 chars)
- [ ] Submit button works without errors
- [ ] Confirmation page shows correct response
- [ ] Try with invalid token: Shows "Invalid Invitation Link"

#### 2. Email Absent Workflow
- [ ] Open meeting report
- [ ] Mark members as absent
- [ ] Click "Email Absent (X)" button
- [ ] Email template editor opens
- [ ] Edit subject and body
- [ ] Click "Send Emails"
- [ ] **Confirmation modal appears** ← CRITICAL
- [ ] Modal shows recipient count
- [ ] Modal shows subject
- [ ] Can click Cancel or Confirm
- [ ] On Confirm: Shows "Sending..." then success message
- [ ] Check database: Entries in `absence_email_log`

#### 3. Save to Drive
- [ ] Click "Save to Drive" button on report
- [ ] If not authenticated: Redirected to Google auth
- [ ] After auth: File uploads to Google Drive
- [ ] File appears in "Nexus Reports" folder
- [ ] File naming: `Nexus-Report-{title}-{date}.pdf`
- [ ] PDF opens and shows full report content

#### 4. Security Checks
- [ ] No console errors in browser DevTools
- [ ] No sensitive data logged
- [ ] Invalid token safely rejected
- [ ] SQL injection attempts handled gracefully
- [ ] XSS attempts (HTML in title) rendered as text

---

## Key Files to Review

### Implementation Files
- `src/pages/communications/RSVPPage.jsx` - RSVP page logic
- `src/lib/rsvpTokens.js` - Token generation/validation
- `src/features/meetings/components/MeetingReportTab.jsx` - Email Absent flow
- `src/features/meetings/lib/google-drive-service.js` - Save to Drive
- `src/components/meetings/AbsenceBatchConfirmModal.jsx` - Email confirmation UI

### Test Files
- `test_rsvp_tokens.js` - Automated token tests
- `TEST_REPORT_NEXUS.md` - Detailed findings
- `TESTING_SUMMARY.md` - Roadmap & status

---

## Browser Developer Tools Check

### What to Look For:
1. **Network Tab**
   - RSVP request completes in < 1 second
   - No 404 or 500 errors
   - Email send request succeeds (200 status)

2. **Console Tab**
   - ✅ No red error messages
   - ✅ No warning about security issues
   - ✅ No console.log output (checked & cleaned)

3. **Application Tab (Local Storage)**
   - Check session is stored correctly
   - Verify no secrets in localStorage

---

## Common Issues & Fixes

### "Invalid Invitation Link"
- Check token is exactly 48 characters
- Verify token uses only A-Za-z0-9
- Confirm token exists in database

### "Email Absent button disabled"
- Ensure roster has email addresses
- At least one member must be absent
- Roster names must match attendance list

### "Save to Drive failed"
- Check Google auth is complete
- Verify Drive API scope includes `drive.file`
- Check internet connection

---

## Test Environment Setup

### Prerequisites
```bash
# Node.js 16+
node --version  # Should be v16 or higher

# Run RSVP token tests
node test_rsvp_tokens.js

# Start dev server
npm run dev  # Should start on http://localhost:5174

# Open browser to test RSVP page
# Navigate to: http://localhost:5174/rsvp?token=<token>
```

### Database Access (if needed)
```bash
# Check absence_email_log table
# SELECT * FROM absence_email_log ORDER BY sent_at DESC LIMIT 10;
```

---

## Regression Testing

### After Any Code Change, Run:
1. `node test_rsvp_tokens.js` - Should all pass
2. Manual RSVP page test - Submit a test RSVP
3. Manual Email Absent test - Send test email
4. Browser DevTools - Check for console errors

---

## Success Criteria

### ✅ Tests Pass When:
- Token tests: All 10 automated tests pass
- RSVP page: Invalid tokens rejected, valid tokens work
- Email Absent: Confirmation modal appears before send
- Save to Drive: File uploads to Google Drive successfully
- Browser console: No error messages

### ❌ Tests Fail If:
- Any token test fails
- RSVP page shows database errors
- Email sends without confirmation
- Console shows sensitive data logs
- File doesn't upload to Drive

---

## Reporting Results

Use format from `TEST_REPORT_NEXUS.md`:

```
| Test Case | Expected | Result | Status | Notes |
|-----------|----------|--------|--------|-------|
| RSVP with valid token | Form displays | ✅ | ✅ PASS | Loads in 1.2s |
| Invalid token | Error page | ✅ | ✅ PASS | User-friendly message |
| Email Absent confirm | Modal appears | ✅ | ✅ PASS | Shows 5 recipients |
```

---

## Contact & Support

- **Documentation:** See `TEST_REPORT_NEXUS.md`
- **Roadmap:** See `TESTING_SUMMARY.md`
- **Quick Test:** Run `node test_rsvp_tokens.js`

**Last Updated:** June 26, 2026
