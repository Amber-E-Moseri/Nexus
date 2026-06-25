# Programs Manager User Guide
## BLW Canada Ministry Calendar System

**Role**: Full control of Programs space calendar and events  
**What You Can Do**: Create, edit, delete, approve, and manage Programs space events and subscriptions

---

## Getting Started

### Your Permissions
- ✅ Create events in Programs space
- ✅ Edit events (your own and others)
- ✅ Delete events
- ✅ Approve/reject pending events
- ✅ Connect Google Calendar
- ✅ Create iCal subscriptions
- ❌ Cannot access Admin space
- ❌ Cannot manage other spaces

---

## Creating Events

### Step-by-Step

1. **Go to Programs Calendar**
   - Navigate to the Programs space
   - Click "Calendar" tab

2. **Click "Create Event"**
   - Opens the event creation form

3. **Fill in Event Details**
   - **Event Title** *(required)* — e.g., "Easter Celebration"
   - **Description** — Details about the event
   - **Event Type** — Choose from:
     - Conference
     - Program
     - Training
     - Prayer
     - Graduation
     - Event (default)
     - Deadline

4. **Set Event Dates**
   - **Start Date** *(required)* — When event begins
   - **End Date** — When event ends (can be same day)
   - **All-day Event** — Check if multi-hour event

5. **Optional Details**
   - **Location** — Where the event happens
   - **Priority** — High, Medium, or Low
   - **Link Sprint** — Associate with a sprint (if available)
   - **Organization-wide** — Check to make visible to everyone

6. **Submit**
   - Click "Create Event"
   - Event starts in "Pending" status
   - You'll see it in your pending queue

### Note on Status
When you create an event, it starts as **Pending** and requires manager approval before appearing to others. You can approve your own events, or another Programs Manager can approve them.

---

## Approving Events

### From the Approval Queue

1. **Go to Approvals**
   - Dashboard → "Event Approvals" section
   - See all pending events

2. **Review Event**
   - Click on event card to see details
   - Check dates, title, description

3. **Approve**
   - Click "✓ Approve" button
   - Event immediately appears to others
   - Shows in Google Calendar if connected

4. **Reject (if needed)**
   - Click "✕ Reject"
   - Enter reason (e.g., "Conflicts with Easter prayer service")
   - Creator gets notification with reason

---

## Editing Events

### Modify Existing Event

1. **Find the Event**
   - Calendar view → Click event
   - OR Event list → Click "Edit" button

2. **Update Details**
   - Change title, dates, location, etc.
   - Cannot change status (approval only)

3. **Save Changes**
   - Click "Update Event"
   - Changes sync immediately to Google Calendar (if connected)
   - Regional Secretaries see updated event

---

## Managing Google Calendar Sync

### Connect Google Calendar (First Time)

1. **Go to Programs Settings**
   - Programs space → Settings → "Calendar Integrations"

2. **Click "Connect Google Calendar"**
   - Redirects to Google login
   - You'll see permissions request
   - **Permissions**: "Access your calendars and create events"

3. **Accept Permission**
   - Click "Allow" on Google's consent screen
   - Returns to app
   - Shows "✓ Connected" message

4. **Sync Begins**
   - Automatic every 15 minutes
   - Approved events appear in Google Calendar

### Manual Sync

If you want events to sync immediately:

1. **Click "Sync Now"**
   - In Google Calendar section
   - Shows "Syncing..." while it works
   - Updates all events within seconds

### View Sync Status

- **Last synced**: Shows timestamp (e.g., "2 minutes ago")
- **Event count**: "5 events in this space (5 synced to Google)"
- **Sync direction**: Automatic bidirectional sync

### Disconnect (if needed)

1. **Click "Disconnect"**
   - Confirmation dialog appears
   - Events remain in both calendars
   - Sync stops
   - Can reconnect anytime

---

## Creating iCal Subscriptions

### What Are Subscriptions?

iCal feeds allow people to subscribe to your calendar in:
- Google Calendar
- Apple Calendar
- Microsoft Outlook
- Any calendar app that supports iCal

**Key Benefit**: Updates automatically every 15 minutes without needing the Nexus app.

### Create a Subscription

1. **Go to Subscription Manager**
   - Programs space → "Calendar" → "Subscriptions" section

2. **Click "Create Subscription"**
   - Opens subscription form

3. **Fill in Details**
   - **Name** *(required)* — e.g., "Ministry Calendar 2026"
   - **Description** — Optional details
   - **Filter by Priority** — Show only high-priority events
   - **Filter by Status** — Show only confirmed events
   - **Public** — Check to allow sharing

4. **Create**
   - System generates unique iCal feed URL
   - URL shows in the subscription card

### Share Subscription Link

1. **Find Your Subscription**
   - In the Subscriptions list

2. **Click "Copy"**
   - Copies the iCal feed URL to clipboard
   - Shows "✓ Copied" feedback

3. **Share the Link**
   - Email to team members
   - Post in Slack/Teams
   - Anyone with the link can add to their calendar

**Important**: The link doesn't require login. Anyone with it can see your calendar. Only make subscriptions public if you want that.

---

## Viewing Events

### Calendar Views

**Month View** (Default):
- See all days of the month
- Events shown as colored badges
- Click event to view details
- Navigate with Previous/Next/Today buttons

**List View**:
- Chronological list of events
- Filter by status, priority, type
- Sort by date, priority, creation
- Click to view full details

**Grid Details**:
- Hover over event badge to see title
- Color indicates status (green=approved, yellow=pending)
- Shows sprint link if associated

---

## Understanding Event Status

| Status | Meaning | Who Sees It | What You Do |
|--------|---------|------------|-----------|
| **Pending** | Awaiting approval | Only creator | Approve or reject |
| **Approved** | Ready to use | Everyone | Show in calendars |
| **Rejected** | Declined | Only creator | Can edit and resubmit |

---

## Troubleshooting

### Event Not Appearing in Google Calendar

**Possible Causes**:
1. Event status is still "Pending" (not approved yet)
2. Google Calendar not connected
3. Sync hasn't run in 15 minutes
4. Sync failed due to permission issue

**Solution**:
1. Check event status is "Approved"
2. Verify "✓ Connected" in settings
3. Click "Sync Now" to trigger manual sync
4. Check Google Calendar app (may need refresh)

### Subscription Link Not Working

**Possible Causes**:
1. Subscription is not marked "Public"
2. Shared link has typo
3. Calendar app doesn't support iCal

**Solution**:
1. Edit subscription → Check "Public" box
2. Re-copy the link
3. Try adding to Google Calendar instead
4. Contact support if issue persists

### Cannot Approve Events

**Possible Causes**:
1. Event is already approved
2. You don't have manager permission
3. Event is in Admin space (you can only manage Programs)

**Solution**:
1. Check event status (already approved?)
2. Contact admin if permission issue
3. Verify you're in Programs space, not Admin

---

## Best Practices

### Naming Events
- **Clear titles**: "Easter Celebration" not "Event 1"
- **Include location**: Helps people know where to go
- **Be specific**: "Spring Training - Volleyball" not "Training"

### Using Priorities
- **High**: Major events (Easter, VBS, conferences)
- **Medium**: Regular programs and meetings
- **Low**: Reminders, administrative notes

### Approval Workflow
- **Approve quickly**: Pending events show to limited people
- **Add notes on reject**: So creator knows why
- **Sync after approving**: Ensure Google Calendar is up to date

### Subscriptions
- **Limit what you share**: Use filters to avoid overwhelming calendars
- **Update names**: "High Priority Events Q2" is better than "Subscription 1"
- **Monitor access**: Check "Access count" to see who's using it

---

## FAQ

**Q: Can I edit events that another manager created?**  
A: Yes, managers can edit any event in the Programs space.

**Q: What happens if I edit an event on Google Calendar?**  
A: Changes sync back to Nexus automatically within 15 minutes.

**Q: Can I create recurring events?**  
A: Not yet. Currently you need to create individual events for each occurrence. This is a planned feature.

**Q: What's the difference between "Approved" and "Confirmed"?**  
A: "Approved" is status in the system. "Confirmed" is an iCal subscription filter. Approved events can be filtered as confirmed in subscriptions.

**Q: Can I delete a subscription?**  
A: Yes. People using the link will lose access once deleted. They won't get a notification.

**Q: Do I need to be online for Google Calendar to sync?**  
A: No. The system syncs automatically every 15 minutes whether you're online or not.

**Q: Can I see who's subscribed to my feeds?**  
A: You can see the access count and last accessed time. Exact user identities aren't tracked (subscriptions are public token-based).

---

## Support

### Having Issues?

1. **Check the troubleshooting section** above
2. **Review event details** (status, dates, etc.)
3. **Try manual sync** (click "Sync Now")
4. **Refresh the browser** (F5)

### Still Need Help?

- Email: nexus-support@blwcanada.org
- Slack: #calendar-support
- See admin team for permission issues

---

**Version**: 1.0  
**Last Updated**: 2026-06-25  
**For**: Programs Managers only
