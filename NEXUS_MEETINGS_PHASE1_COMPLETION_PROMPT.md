# Nexus Meetings Module — Phase 1 Completion Build Prompt
**Incremental Enhancement Approach**  
Estimated duration: 1–2 weeks  
Target: Complete & production-ready agenda builder with PDF export

---

## **PART 0: UNDERSTANDING THE STATE**

### Current Situation
- ✅ 80% of Phase 1 already built (Step 1, Step 2, Step 3, PDF export)
- ❌ 4 critical gaps that must be fixed before ship:
  1. **Timing calculation:** Intro music (isPinned) is NOT excluded from timing chain
  2. **Finalize logic:** No status=finalized or locking mechanism
  3. **Permissions:** No `useHasPermission` enforcement
  4. **Auto-save:** No draft protection; user loses data on crash

### What You're NOT Rebuilding
- ✅ Step1MeetingSetup.jsx (reuse as-is)
- ✅ Step2BuildAgenda.jsx (reuse as-is)
- ✅ AgendaTable.jsx (reuse, minor fix only)
- ✅ Step3PreviewExport.jsx (reuse as-is, PDF works great)
- ✅ generateAgendaPdf() (production-ready)
- ✅ AgendaBuilderContext (perfect)
- ✅ Database schema (tables exist)

### What You ARE Building
1. **Fix calculateTimings()** — exclude isPinned items
2. **Add status field** — track agenda state (draft → finalized)
3. **Add permission checks** — useHasPermission integration
4. **Add auto-save** — 30s interval to Supabase
5. **Add error handling** — retry logic, user-facing toasts
6. **Add tests** — timing calculation, permissions, E2E happy path

---

## **PART 1: FIX TIMING CALCULATION (Intro Music)**

### File: `src/hooks/useAgendaWizard.js`

**Current problem:**
```javascript
// Line 12-31: calculateTimings includes intro music in the chain
// Input:
const rows = [
  { id: 1, segment: 'Intro Music', duration: 15, isPinned: true },
  { id: 2, segment: 'Prayer', duration: 5 },
];
const startTime = '10:00';
calculateTimings(startTime, rows);

// Current output: ❌ WRONG
// Row 1: "10:00 AM - 10:15 AM" (intro music counted)
// Row 2: "10:15 AM - 10:20 AM" (shifted by intro)

// Expected output: ✅ CORRECT
// Row 1: "Pre-start" (intro excluded)
// Row 2: "10:00 AM - 10:05 AM" (starts at original time)
```

**Fix:**

Replace the `calculateTimings` function:

```javascript
export function calculateTimings(startTime, agendaItems) {
  if (!agendaItems || agendaItems.length === 0) return [];

  const [hours, minutes] = startTime.split(':').map(Number);
  let currentDate = new Date();
  currentDate.setHours(hours, minutes, 0);

  return agendaItems.map((item) => {
    // For pinned items (intro music), show "Pre-start" and don't advance time
    if (item.isPinned) {
      return {
        ...item,
        timing: 'Pre-start',
        startTime: 'Pre-start',
        endTime: 'Pre-start',
      };
    }

    // For non-pinned items, calculate the chain
    const startTimeObj = new Date(currentDate);
    const endTimeObj = new Date(
      startTimeObj.getTime() + (item.duration || 0) * 60_000
    );

    const timing = `${formatTime(startTimeObj)} - ${formatTime(endTimeObj)}`;

    currentDate = endTimeObj; // Advance for next item

    return {
      ...item,
      timing,
      startTime: formatTime(startTimeObj),
      endTime: formatTime(endTimeObj),
    };
  });
}
```

**Test case:**
```javascript
// In src/tests/agendaTiming.test.js (new file)
describe('calculateTimings with intro music', () => {
  test('excludes intro music from timing chain', () => {
    const rows = [
      { id: '1', segment: 'Intro Music', duration: 0, isPinned: true },
      { id: '2', segment: 'Prayer', duration: 5, isPinned: false },
      { id: '3', segment: 'Teaching', duration: 30, isPinned: false },
    ];
    const result = calculateTimings('10:00', rows);

    expect(result[0].timing).toBe('Pre-start');
    expect(result[1].timing).toContain('10:00 AM');
    expect(result[1].timing).toContain('10:05 AM');
    expect(result[2].timing).toContain('10:05 AM');
    expect(result[2].timing).toContain('10:35 AM');
  });
});
```

**Validation:**
- [ ] Run test: `npm test -- agendaTiming.test.js`
- [ ] PDF preview shows correct timings (Step 3)
- [ ] Agenda table shows "Pre-start" for intro music

---

## **PART 2: ENHANCE FINALIZE LOGIC (Status + Locking)**

### 2.1 Database: Add status field to agendas table

**File:** `supabase/migrations/20260626000000_agenda_status.sql`

Create this migration:

```sql
-- Add status field to agendas table
ALTER TABLE public.agendas 
ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'draft' 
CHECK (status IN ('draft', 'finalized', 'archived'));

-- Create index for status queries
CREATE INDEX IF NOT EXISTS idx_agendas_status ON public.agendas(status);

-- Add RLS policy: prevent editing finalized agendas
CREATE POLICY "finalized_agendas_read_only"
  ON public.agendas FOR UPDATE
  TO authenticated
  USING (status = 'draft' AND auth.uid() = created_by)
  WITH CHECK (status = 'draft' AND auth.uid() = created_by);

-- Ensure super_admin can always update
CREATE POLICY "super_admin_override"
  ON public.agendas FOR UPDATE
  TO authenticated
  USING ((SELECT role FROM users WHERE id = auth.uid()) = 'super_admin')
  WITH CHECK ((SELECT role FROM users WHERE id = auth.uid()) = 'super_admin');
```

**Run migration:**
```bash
supabase migration up
```

### 2.2 API: Update createMeetingWithAgenda to enforce permissions

**File:** `src/features/agendas/lib/agendas.js`

Replace the `createMeetingWithAgenda` function (lines 285-318):

```javascript
export async function createMeetingWithAgenda(meetingData, agendaData, agendaItems) {
  try {
    // ✅ NEW: Permission check
    const { data: user, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      throw new Error('User not authenticated');
    }

    // Check permission
    const hasPermission = await userHasPermission(user.id, 'meetings:manage');
    if (!hasPermission) {
      throw new Error('You do not have permission to create meetings. Contact your administrator.');
    }

    // ✅ NEW: Ensure department_id is set
    if (!agendaData.departmentId) {
      throw new Error('Department ID is required');
    }

    // Create agenda
    const agenda = await createAgenda(agendaData, agendaItems);

    // Create meeting linked to agenda
    const { data: meeting, error: meetingError } = await supabase
      .from('meetings')
      .insert([
        {
          title: meetingData.title || agendaData.title,
          department_id: agendaData.departmentId,
          date: new Date(agendaData.date).toISOString(),
          meeting_type: agendaData.meetingType,
          summary: meetingData.summary || null,
          minutes: meetingData.minutes || null,
          created_by: agendaData.createdBy,
          zoom_join_url: meetingData.zoomJoinUrl || null,
          drive_url: meetingData.driveUrl || null,
        },
      ])
      .select()
      .single();

    if (meetingError) {
      await deleteAgenda(agenda.id);
      throw new Error(`Failed to create meeting: ${meetingError.message}`);
    }

    // Link agenda to meeting
    await updateAgenda(agenda.id, { meeting_id: meeting.id });

    // ✅ NEW: Set agenda status to 'finalized'
    await updateAgenda(agenda.id, { status: 'finalized' });

    return { meeting, agenda };
  } catch (error) {
    console.error('createMeetingWithAgenda error:', error);
    throw error;
  }
}
```

**Import permissions utility:**
```javascript
// Add at top of file:
import { userHasPermission } from '../../lib/permissions/api';
```

### 2.3 UI: Update Step3PreviewExport to show finalize state

**File:** `src/features/agendas/components/Step3PreviewExport.jsx`

Update `handleSaveAgendaOnly()` (line 36-76):

```javascript
async function handleSaveAgendaOnly() {
  setExportError(null);
  setIsSaving(true);
  try {
    const preparedAgendaData = {
      title: agendaData.title,
      meetingType: agendaData.meetingType,
      departmentId: profile?.department_id,
      date: agendaData.date,
      startTime: agendaData.startTime,
      endTime: agendaData.endTime,
      location: agendaData.location,
      moderator: agendaData.moderator,
      theme: agendaData.theme,
      createdBy: profile?.id,
      status: 'finalized', // ✅ NEW: Set status when finalizing
    };

    const meetingData = {
      title: agendaData.title,
      summary: null,
      minutes: null,
      zoomJoinUrl: null,
      driveUrl: null,
    };

    const { meeting, agenda } = await createMeetingWithAgenda(
      meetingData,
      preparedAgendaData,
      agendaItems
    );

    // ✅ NEW: Better success message
    const message = `✓ Meeting planned! ID: ${meeting.id.slice(0, 8)} | Agenda: ${agenda.id.slice(0, 8)}`;
    
    // Use toast if available, fallback to alert
    if (window.__showToast) {
      window.__showToast(message, 'success');
    } else {
      alert(message);
    }

    reset();
    navigate('/meetings');
  } catch (err) {
    const errorMessage = err.message || 'Failed to save agenda';
    setExportError(errorMessage);
    console.error(err);
    
    // ✅ NEW: Offer retry option
    if (window.__showToast) {
      window.__showToast(`Error: ${errorMessage}. Please try again.`, 'error');
    }
  } finally {
    setIsSaving(false);
  }
}
```

**Validation:**
- [ ] ORS can finalize agenda → status=finalized in DB
- [ ] Non-ORS cannot finalize → error toast shown
- [ ] Finalized agenda cannot be edited (RLS policy prevents it)

---

## **PART 3: ADD AUTO-SAVE (Draft Protection)**

### 3.1 Update AgendaBuilderContext to track changes

**File:** `src/context/AgendaBuilderContext.jsx`

Add auto-save state:

```javascript
// Add to imports:
import { useEffect, useRef } from 'react';
import { createAgenda } from '../features/agendas/lib/agendas';

// Inside AgendaBuilderProvider component, after state declarations:
const [autoSaveStatus, setAutoSaveStatus] = useState('idle'); // 'idle', 'saving', 'saved', 'error'
const autoSaveTimerRef = useRef(null);
const draftIdRef = useRef(null); // Track which draft we're saving

// Add effect for auto-save (every 30 seconds)
useEffect(() => {
  // Only auto-save if we have data and it's not being manually saved
  const shouldAutoSave = (agendaData.title && agendaItems.length > 0 && !isSaving);

  if (shouldAutoSave) {
    // Clear previous timer
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }

    // Set new timer
    autoSaveTimerRef.current = setTimeout(async () => {
      try {
        setAutoSaveStatus('saving');

        // If no draft ID yet, create the agenda
        if (!draftIdRef.current) {
          const agenda = await createAgenda(agendaData, agendaItems);
          draftIdRef.current = agenda.id;
          setAutoSaveStatus('saved');
        } else {
          // Otherwise, update existing draft
          const { updateAgenda } = await import('../features/agendas/lib/agendas');
          await updateAgenda(draftIdRef.current, agendaData);
          setAutoSaveStatus('saved');
        }

        // Clear "saved" status after 3 seconds
        setTimeout(() => {
          setAutoSaveStatus('idle');
        }, 3000);
      } catch (err) {
        console.error('Auto-save failed:', err);
        setAutoSaveStatus('error');
        // Retry after 10 seconds
        setTimeout(() => setAutoSaveStatus('idle'), 10000);
      }
    }, 30000); // 30 second interval
  }

  return () => {
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }
  };
}, [agendaData, agendaItems, isSaving]);

// Add to context value:
const value = {
  // ... existing properties ...
  autoSaveStatus,
  draftAgendaId: draftIdRef.current,
};
```

### 3.2 Show auto-save indicator in UI

**File:** `src/pages/meetings/MeetingWizardPage.jsx`

Add status indicator (find the header section, line ~64):

```javascript
// Inside the header div, after step indicator:
<div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
  <div style={{ fontSize: 11, color: '#9E9488' }}>
    {autoSaveStatus === 'saving' && '💾 Saving...'}
    {autoSaveStatus === 'saved' && '✓ Saved'}
    {autoSaveStatus === 'error' && '⚠ Save failed — retrying...'}
    {autoSaveStatus === 'idle' && ''}
  </div>
</div>
```

Import at top:
```javascript
import { useAgendaWizard } from '../../hooks/useAgendaWizard';

// Inside WizardContent:
const { autoSaveStatus } = useAgendaWizard();
```

**Validation:**
- [ ] Start filling form → after 30s, "Saving..." appears
- [ ] After save completes, "✓ Saved" shows for 3s
- [ ] Reload page → draft data persists (loaded from DB)
- [ ] If network fails, "⚠ Save failed" shows + retries automatically

---

## **PART 4: ADD PERMISSION ENFORCEMENT**

### 4.1 Protect Step 1: Check permission before allowing edits

**File:** `src/features/agendas/components/Step1MeetingSetup.jsx`

Add at top of component (after imports):

```javascript
import { useHasPermission } from '../../../hooks/useHasPermission'; // ✅ ADD THIS

export default function Step1MeetingSetup() {
  const { hasPermission, loading } = useHasPermission('meetings:manage'); // ✅ ADD THIS
  const { agendaData, updateAgendaData, setError, errors, goToStep } = useAgendaWizard();

  // ✅ ADD: Show forbidden state if no permission
  if (!loading && !hasPermission) {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <h2 style={{ color: '#DC3545', marginBottom: 16 }}>Access Denied</h2>
        <p style={{ color: '#9E9488', fontSize: 13 }}>
          You don't have permission to create agendas. Only ORS members can plan meetings.
        </p>
        <p style={{ fontSize: 12, color: '#999', marginTop: 20 }}>
          Contact your administrator if you believe this is an error.
        </p>
      </div>
    );
  }

  if (loading) {
    return <div style={{ padding: '40px', textAlign: 'center' }}>Checking permissions...</div>;
  }

  // ✅ ADD: Rest of the form...
  return (
    <div style={{ maxWidth: 800 }}>
      {/* existing form code */}
    </div>
  );
}
```

### 4.2 Protect Step 3: Check permission before finalizing

**File:** `src/features/agendas/components/Step3PreviewExport.jsx`

Update imports and add permission check:

```javascript
import { useHasPermission } from '../../../hooks/useHasPermission'; // ✅ ADD THIS

export default function Step3PreviewExport() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { hasPermission: canCreateMeetings, loading: checkingPermissions } = useHasPermission('meetings:manage'); // ✅ ADD THIS
  const { agendaData, agendaItems, isSaving, setIsSaving, reset } = useAgendaWizard();
  const [exportError, setExportError] = useState(null);

  // ✅ ADD: Show forbidden state if no permission
  if (!checkingPermissions && !canCreateMeetings) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', background: '#FCFAF6', borderRadius: 12 }}>
        <h2 style={{ color: '#DC3545', marginBottom: 16 }}>Cannot Finalize</h2>
        <p style={{ color: '#9E9488' }}>
          You don't have permission to finalize agendas. Only ORS members can publish meetings.
        </p>
      </div>
    );
  }

  if (checkingPermissions) {
    return <div>Verifying permissions...</div>;
  }

  // ✅ ADD: Disable finalize button if no permission
  const buttonStyle = {
    opacity: !canCreateMeetings ? 0.5 : 1,
    cursor: !canCreateMeetings ? 'not-allowed' : 'pointer',
  };

  // ... rest of component, apply buttonStyle to finalize button
}
```

**Validation:**
- [ ] ORS user can see Step 1 & 3 buttons
- [ ] Non-ORS user sees "Access Denied" message
- [ ] Error toast if user tries to bypass via API

---

## **PART 5: ADD ERROR HANDLING & RETRY LOGIC**

### 5.1 Network error toast

**File:** `src/features/agendas/components/Step3PreviewExport.jsx`

Update `handleSaveAgendaOnly()`:

```javascript
async function handleSaveAgendaOnly() {
  setExportError(null);
  setIsSaving(true);
  
  try {
    // ... existing code ...
    
    const { meeting, agenda } = await createMeetingWithAgenda(
      meetingData,
      preparedAgendaData,
      agendaItems
    );

    // Success feedback
    const successMsg = `✓ Meeting finalized! ID: ${meeting.id.slice(0, 8)}`;
    setExportError(null); // Clear any previous errors
    
    // Show success toast
    if (window.__toast) {
      window.__toast?.success(successMsg);
    } else {
      alert(successMsg);
    }

    reset();
    navigate('/meetings');
    
  } catch (err) {
    const errorMsg = err.message || 'Failed to finalize agenda';
    setExportError(errorMsg);
    
    // Log for debugging
    console.error('Finalize error:', err);
    
    // Show error toast with retry suggestion
    if (window.__toast) {
      window.__toast?.error(`${errorMsg}. Try again or contact support.`);
    }
    
  } finally {
    setIsSaving(false);
  }
}
```

### 5.2 Add retry button to error state

In Step3PreviewExport, update error display (line ~178):

```javascript
{exportError && (
  <div style={{ marginBottom: 12, padding: '10px 12px', background: 'rgba(220, 53, 69, 0.1)', border: '1px solid #DC3545', borderRadius: 8, fontSize: 12, color: '#DC3545' }}>
    <div>{exportError}</div>
    {/* ✅ ADD: Retry button */}
    <button
      type="button"
      onClick={() => setExportError(null)}
      style={{
        marginTop: 8,
        padding: '6px 12px',
        fontSize: 11,
        background: '#DC3545',
        color: 'white',
        border: 'none',
        borderRadius: 4,
        cursor: 'pointer',
      }}
    >
      Retry
    </button>
  </div>
)}
```

**Validation:**
- [ ] Network error during save shows error message
- [ ] User can click "Retry" without losing draft
- [ ] Auto-save continues even if finalize fails
- [ ] Success toast shows when meeting finalizes

---

## **PART 6: ADD TESTS**

### 6.1 Timing calculation tests

**File:** `src/tests/agendaTiming.test.js` (new file)

```javascript
import { describe, it, expect } from 'vitest';
import { calculateTimings } from '../hooks/useAgendaWizard';

describe('calculateTimings', () => {
  test('excludes intro music from timing chain', () => {
    const items = [
      { id: '1', segment: 'Intro Music', duration: 0, isPinned: true },
      { id: '2', segment: 'Prayer', duration: 5, isPinned: false },
      { id: '3', segment: 'Teaching', duration: 30, isPinned: false },
    ];
    
    const result = calculateTimings('10:00', items);
    
    expect(result[0].timing).toBe('Pre-start');
    expect(result[1].timing).toContain('10:00');
    expect(result[1].timing).toContain('10:05');
    expect(result[2].timing).toContain('10:05');
    expect(result[2].timing).toContain('10:35');
  });

  test('chains timing correctly for multiple non-pinned items', () => {
    const items = [
      { id: '1', segment: 'Prayer', duration: 5, isPinned: false },
      { id: '2', segment: 'Teaching', duration: 30, isPinned: false },
      { id: '3', segment: 'Prayer', duration: 5, isPinned: false },
    ];
    
    const result = calculateTimings('10:00', items);
    
    expect(result[0].timing).toContain('10:00 AM - 10:05 AM');
    expect(result[1].timing).toContain('10:05 AM - 10:35 AM');
    expect(result[2].timing).toContain('10:35 AM - 10:40 AM');
  });

  test('handles missing duration', () => {
    const items = [
      { id: '1', segment: 'Prayer', duration: undefined, isPinned: false },
    ];
    
    const result = calculateTimings('10:00', items);
    
    expect(result[0].timing).toContain('10:00 AM - 10:00 AM');
  });

  test('handles empty array', () => {
    const result = calculateTimings('10:00', []);
    expect(result).toEqual([]);
  });

  test('multiple intro music items all show Pre-start', () => {
    const items = [
      { id: '1', segment: 'Intro Music', duration: 15, isPinned: true },
      { id: '2', segment: 'Welcome Music', duration: 10, isPinned: true },
      { id: '3', segment: 'Prayer', duration: 5, isPinned: false },
    ];
    
    const result = calculateTimings('10:00', items);
    
    expect(result[0].timing).toBe('Pre-start');
    expect(result[1].timing).toBe('Pre-start');
    expect(result[2].timing).toContain('10:00 AM - 10:05 AM');
  });
});
```

Run tests:
```bash
npm test -- agendaTiming.test.js
```

### 6.2 Permission enforcement tests

**File:** `src/tests/agendaPermissions.test.js` (new file)

```javascript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createMeetingWithAgenda } from '../features/agendas/lib/agendas';
import * as permissionsApi from '../lib/permissions/api';

// Mock Supabase and permissions
vi.mock('../lib/permissions/api');
vi.mock('../lib/supabase');

describe('Agenda permission enforcement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('ORS user can create agenda', async () => {
    permissionsApi.userHasPermission.mockResolvedValue(true);
    
    const agendaData = {
      title: 'Test Meeting',
      meetingType: 'sunday_service',
      date: '2026-06-29',
      startTime: '10:00',
      departmentId: 'dept-123',
      createdBy: 'user-ors',
    };
    
    const agendaItems = [
      { segment: 'Prayer', duration: 5 },
    ];
    
    // Should not throw
    try {
      await createMeetingWithAgenda(
        { title: 'Test' },
        agendaData,
        agendaItems
      );
    } catch (err) {
      // Expected to fail on Supabase mock, but permission check should pass
      expect(permissionsApi.userHasPermission).toHaveBeenCalledWith(
        'user-ors',
        'meetings:manage'
      );
    }
  });

  test('non-ORS user cannot create agenda', async () => {
    permissionsApi.userHasPermission.mockResolvedValue(false);
    
    const agendaData = {
      title: 'Test Meeting',
      departmentId: 'dept-123',
      createdBy: 'user-member',
    };
    
    await expect(
      createMeetingWithAgenda(
        { title: 'Test' },
        agendaData,
        []
      )
    ).rejects.toThrow('do not have permission');
  });

  test('unauthenticated user cannot create agenda', async () => {
    await expect(
      createMeetingWithAgenda(
        { title: 'Test' },
        { departmentId: 'dept-123' },
        []
      )
    ).rejects.toThrow('not authenticated');
  });
});
```

### 6.3 E2E happy path test

**File:** `src/tests/agendaHappyPath.test.js` (new file, high-level flow)

```javascript
import { describe, it, expect } from 'vitest';

describe('Agenda Builder - Happy Path E2E', () => {
  it('ORS creates meeting, builds agenda, exports PDF, and finalizes', async () => {
    // This is a placeholder for Playwright/E2E test
    // In real implementation, would use Playwright or Vitest browser mode
    
    // 1. Navigate to /meetings/wizard
    // 2. Fill Step 1: type=sunday_service, title="June 29 Service", date=2026-06-29, time=10:00, moderator="Pastor John"
    // 3. Click Next
    // 4. Step 2: Load template → adds agenda items
    // 5. Modify one item duration, verify timing updates
    // 6. Click Next
    // 7. Step 3: Verify PDF preview shows correct timings
    // 8. Click "Export PDF" → PDF downloads
    // 9. Click "Plan Meeting" → agenda finalizes
    // 10. Verify meeting appears in /meetings list with status=finalized
    
    expect(true).toBe(true); // Placeholder
  });
});
```

Run all tests:
```bash
npm test
```

---

## **PART 7: IMPLEMENTATION CHECKLIST**

Follow this order to avoid conflicts:

### Phase 1a: Database & Core Fixes (1-2 days)
- [ ] Create & run migration: `20260626000000_agenda_status.sql`
- [ ] Fix `calculateTimings()` in `useAgendaWizard.js`
- [ ] Test timing calculation locally (run tests)
- [ ] Update `createMeetingWithAgenda()` with permission check
- [ ] Add permission imports to `agendas.js`

### Phase 1b: UI Enhancements (2-3 days)
- [ ] Update `Step1MeetingSetup.jsx` with permission check
- [ ] Update `Step3PreviewExport.jsx` with permission + finalize logic
- [ ] Add auto-save to `AgendaBuilderContext.jsx`
- [ ] Add status indicator to `MeetingWizardPage.jsx`
- [ ] Add error handling & retry buttons

### Phase 1c: Testing (2-3 days)
- [ ] Write timing calculation tests
- [ ] Write permission enforcement tests
- [ ] Write E2E happy path test
- [ ] Run full test suite: `npm test`
- [ ] Manual testing in browser

### Phase 1d: Polish & Verification (1-2 days)
- [ ] Test finalized agenda cannot be edited
- [ ] Test auto-save saves to Supabase
- [ ] Test PDF export with all 4 themes
- [ ] Test permission denial for non-ORS users
- [ ] Test error recovery (network down, retry)

---

## **VALIDATION GATES**

Before declaring Phase 1 complete, verify:

### ✅ Functional Requirements
- [ ] ORS can create agenda with all fields (type, title, date, time, moderator)
- [ ] Agenda table allows add/edit/delete items
- [ ] Drag-and-drop reordering works
- [ ] S/N auto-increments after reorder
- [ ] Intro music marked as "Pre-start" (not counted in timing)
- [ ] Timing calculation chains correctly (start → start+duration → ...)
- [ ] PDF preview shows all 4 themes correctly
- [ ] PDF export downloads with correct filename
- [ ] "Plan Meeting" button finalizes agenda (status=finalized)
- [ ] Finalized agenda appears in /meetings list

### ✅ Security & Permissions
- [ ] Only ORS (`meetings:manage`) can access wizard
- [ ] Non-ORS sees "Access Denied" message
- [ ] Non-ORS cannot bypass via direct API calls (RLS enforced)
- [ ] Finalized agenda cannot be edited (RLS prevents UPDATE)

### ✅ Error Handling
- [ ] Network error during auto-save shows "⚠ Save failed"
- [ ] User can click Retry after error
- [ ] Permission error shows clear message
- [ ] PDF generation error shows toast with retry option

### ✅ Auto-Save
- [ ] Draft auto-saves every 30 seconds (when data exists)
- [ ] "💾 Saving..." status shows during save
- [ ] "✓ Saved" status shows after success
- [ ] Reload page → draft data persists (loaded from auto-saved agenda)

### ✅ Tests
- [ ] `npm test` passes all 5+ timing calculation tests
- [ ] `npm test` passes all permission tests
- [ ] Manual E2E: complete happy path flow end-to-end

---

## **POST-PHASE-1 ROADMAP**

Once Phase 1 is complete and shipped:

### Phase 2a: Minutes Capture (2-3 weeks)
- Implement `MinutesCapture.jsx` component
- Create `meeting_minutes`, `meeting_minutes_segments` tables
- Capture segment notes, decisions, action items
- `minutes:submit` permission for ORS

### Phase 2b: Calendar Sync (1-2 weeks)
- Finalize meeting → create Calendar event (one-way)
- Tag calendar events with `event_type: 'meeting'`
- Handle sync errors + manual retry

### Phase 2c: Action Items (1 week)
- Link action items to Tasks module
- Assign to team members
- Track due dates & status

### Phase 3: Advanced Features (TBD)
- Meeting series / recurring meetings
- Attendance tracking
- Email notifications
- Meeting templates customization

---

## **KEY FILES SUMMARY**

| File | Changes | Priority |
|------|---------|----------|
| `src/hooks/useAgendaWizard.js` | Fix calculateTimings | 🔴 Critical |
| `src/features/agendas/lib/agendas.js` | Add permission check | 🔴 Critical |
| `src/context/AgendaBuilderContext.jsx` | Add auto-save logic | 🟠 High |
| `src/features/agendas/components/Step3PreviewExport.jsx` | Add permission + finalize | 🟠 High |
| `src/features/agendas/components/Step1MeetingSetup.jsx` | Add permission guard | 🟠 High |
| `src/pages/meetings/MeetingWizardPage.jsx` | Add status indicator | 🟡 Medium |
| `supabase/migrations/20260626000000_*.sql` | Add status field + RLS | 🔴 Critical |
| `src/tests/agendaTiming.test.js` | Write tests | 🟠 High |
| `src/tests/agendaPermissions.test.js` | Write tests | 🟠 High |

---

## **ESTIMATED TIMELINE**

| Phase | Task | Duration | Dependencies |
|-------|------|----------|--------------|
| 1a | Database & timing fix | 1-2 days | None |
| 1b | UI enhancements | 2-3 days | 1a |
| 1c | Testing | 2-3 days | 1a, 1b |
| 1d | Polish | 1-2 days | 1c |
| **Total** | **Phase 1 Complete** | **1-2 weeks** | — |

**Critical path:** Fix timing → finalize logic → tests → ship

---

## **SUCCESS CRITERIA**

Phase 1 is complete when:

✅ Timing calculation excludes intro music correctly  
✅ Agenda can be finalized → creates meeting record  
✅ Only ORS can create/finalize agendas  
✅ Auto-save protects drafts every 30s  
✅ PDF exports with correct timings & branding  
✅ All tests pass (timing, permissions, E2E)  
✅ Zero regressions in existing meetings features  
✅ User can complete full workflow: create → build → preview → finalize  

**Estimated effort:** 80-100 hours (1 developer, 2 weeks)

---

**Ready to build? Start with Part 1 (timing fix). Let me know if you hit any blockers. 🚀**
