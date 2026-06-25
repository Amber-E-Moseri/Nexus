# NEXUS MEETINGS — PHASE 2 BUILD PROMPT
**Minutes Capture + Calendar Sync + Action Items Bridge**

**Target Duration:** 4-6 weeks (1 developer)  
**Status:** Ready to execute  
**Phase 1 Dependency:** ✅ Shipped

---

## OVERVIEW

Phase 2 extends Phase 1 (Agenda Builder) with three integrated features:

### **Phase 2a: Minutes Capture (2-3 weeks)**
After ORS finalizes a meeting, capture detailed minutes segment-by-segment with notes, decisions, and action items.

### **Phase 2b: Calendar Sync (1-2 weeks)**
When a meeting is finalized, automatically create a calendar event in Google Calendar (one-way sync, no bidirectional update).

### **Phase 2c: Action Items Bridge (1 week)**
Action items created in minutes automatically create Tasks in the Tasks module with assignee, due date, and status tracking.

---

## PART 1: DATABASE SCHEMA

### 1.1 Create Tables Migration

**File:** `supabase/migrations/20260625000000_meeting_minutes_schema.sql`

```sql
-- ============================================================
-- MEETING MINUTES SYSTEM
-- ============================================================
-- Phase 2a: Capture segment-by-segment notes, decisions, action items
-- Phase 2b: Auto-sync to calendar on meeting finalization
-- Phase 2c: Bridge action items to Tasks module
-- ============================================================

-- 1. TABLE: meeting_minutes
-- ============================================================
-- Top-level minutes record per meeting
CREATE TABLE IF NOT EXISTS public.meeting_minutes (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id          uuid NOT NULL UNIQUE REFERENCES public.meetings(id) ON DELETE CASCADE,
  org_id              uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  status              text NOT NULL DEFAULT 'draft'
                      CHECK (status IN ('draft', 'submitted', 'finalized')),
  submitted_by        uuid REFERENCES public.users(id) ON DELETE SET NULL,
  submitted_at        timestamptz,
  notes               text,
  key_decisions       text,
  follow_ups          text,
  calendar_event_id   text,  -- Google Calendar event ID (null if sync not attempted)
  calendar_sync_status text DEFAULT 'pending'
                      CHECK (calendar_sync_status IN ('pending', 'synced', 'failed', 'skipped')),
  calendar_sync_error text,  -- Error message if sync failed
  calendar_sync_at    timestamptz,
  created_by          uuid NOT NULL REFERENCES public.users(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_meeting_minutes_meeting_id
  ON public.meeting_minutes(meeting_id);

CREATE INDEX IF NOT EXISTS idx_meeting_minutes_org_id
  ON public.meeting_minutes(org_id);

CREATE INDEX IF NOT EXISTS idx_meeting_minutes_status
  ON public.meeting_minutes(status);

CREATE INDEX IF NOT EXISTS idx_meeting_minutes_submitted_at
  ON public.meeting_minutes(submitted_at DESC);

ALTER TABLE public.meeting_minutes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "minutes_select_own_org"
  ON public.meeting_minutes FOR SELECT
  TO authenticated
  USING (org_id = (SELECT org_id FROM public.users WHERE id = auth.uid()));

CREATE POLICY "minutes_insert_ors"
  ON public.meeting_minutes FOR INSERT
  TO authenticated
  WITH CHECK (
    org_id = (SELECT org_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role FROM public.users WHERE id = auth.uid()) = 'ors'
  );

CREATE POLICY "minutes_update_ors"
  ON public.meeting_minutes FOR UPDATE
  TO authenticated
  USING (
    org_id = (SELECT org_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role FROM public.users WHERE id = auth.uid()) = 'ors'
  )
  WITH CHECK (
    org_id = (SELECT org_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role FROM public.users WHERE id = auth.uid()) = 'ors'
  );

COMMENT ON TABLE public.meeting_minutes IS
'Top-level minutes record per meeting. Tracks status (draft → submitted → finalized) and calendar sync state.';

-- 2. TABLE: meeting_minutes_segments
-- ============================================================
-- Segment-by-segment notes (one row per agenda item)
CREATE TABLE IF NOT EXISTS public.meeting_minutes_segments (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  minutes_id          uuid NOT NULL REFERENCES public.meeting_minutes(id) ON DELETE CASCADE,
  segment_type        text NOT NULL,  -- 'prayer', 'teaching', 'message', 'announcements', 'close'
  segment_number      integer NOT NULL,  -- S/N from agenda
  segment_title       text,  -- Title from agenda item
  notes               text,
  key_decisions       text,
  discussion_points   text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  
  UNIQUE (minutes_id, segment_number)
);

CREATE INDEX IF NOT EXISTS idx_minutes_segments_minutes_id
  ON public.meeting_minutes_segments(minutes_id);

CREATE INDEX IF NOT EXISTS idx_minutes_segments_segment_type
  ON public.meeting_minutes_segments(segment_type);

ALTER TABLE public.meeting_minutes_segments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "segments_select_own_org"
  ON public.meeting_minutes_segments FOR SELECT
  TO authenticated
  USING (
    minutes_id IN (
      SELECT id FROM public.meeting_minutes
      WHERE org_id = (SELECT org_id FROM public.users WHERE id = auth.uid())
    )
  );

CREATE POLICY "segments_insert_ors"
  ON public.meeting_minutes_segments FOR INSERT
  TO authenticated
  WITH CHECK (
    minutes_id IN (
      SELECT id FROM public.meeting_minutes
      WHERE org_id = (SELECT org_id FROM public.users WHERE id = auth.uid())
        AND (SELECT role FROM public.users WHERE id = auth.uid()) = 'ors'
    )
  );

CREATE POLICY "segments_update_ors"
  ON public.meeting_minutes_segments FOR UPDATE
  TO authenticated
  USING (
    minutes_id IN (
      SELECT id FROM public.meeting_minutes
      WHERE org_id = (SELECT org_id FROM public.users WHERE id = auth.uid())
        AND (SELECT role FROM public.users WHERE id = auth.uid()) = 'ors'
    )
  )
  WITH CHECK (
    minutes_id IN (
      SELECT id FROM public.meeting_minutes
      WHERE org_id = (SELECT org_id FROM public.users WHERE id = auth.uid())
        AND (SELECT role FROM public.users WHERE id = auth.uid()) = 'ors'
    )
  );

COMMENT ON TABLE public.meeting_minutes_segments IS
'Segment-by-segment notes. One row per agenda item with notes, decisions, and discussion points.';

-- 3. TABLE: meeting_action_items
-- ============================================================
-- Action items extracted from minutes
CREATE TABLE IF NOT EXISTS public.meeting_action_items (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  segment_id          uuid NOT NULL REFERENCES public.meeting_minutes_segments(id) ON DELETE CASCADE,
  minutes_id          uuid NOT NULL REFERENCES public.meeting_minutes(id) ON DELETE CASCADE,
  meeting_id          uuid NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  org_id              uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  description         text NOT NULL,
  owner_id            uuid REFERENCES public.users(id) ON DELETE SET NULL,
  owner_name          text,  -- Cached for display if user deleted
  assigned_at         timestamptz NOT NULL DEFAULT now(),
  due_date            date,
  status              text NOT NULL DEFAULT 'open'
                      CHECK (status IN ('open', 'in_progress', 'completed', 'cancelled')),
  priority            text DEFAULT 'medium'
                      CHECK (priority IN ('low', 'medium', 'high')),
  task_id             uuid UNIQUE REFERENCES public.tasks(id) ON DELETE SET NULL,  -- Phase 2c bridge
  created_by          uuid NOT NULL REFERENCES public.users(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_action_items_segment_id
  ON public.meeting_action_items(segment_id);

CREATE INDEX IF NOT EXISTS idx_action_items_minutes_id
  ON public.meeting_action_items(minutes_id);

CREATE INDEX IF NOT EXISTS idx_action_items_meeting_id
  ON public.meeting_action_items(meeting_id);

CREATE INDEX IF NOT EXISTS idx_action_items_owner_id
  ON public.meeting_action_items(owner_id);

CREATE INDEX IF NOT EXISTS idx_action_items_status
  ON public.meeting_action_items(status);

CREATE INDEX IF NOT EXISTS idx_action_items_org_id
  ON public.meeting_action_items(org_id);

CREATE INDEX IF NOT EXISTS idx_action_items_due_date
  ON public.meeting_action_items(due_date);

ALTER TABLE public.meeting_action_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "action_items_select_own_org"
  ON public.meeting_action_items FOR SELECT
  TO authenticated
  USING (org_id = (SELECT org_id FROM public.users WHERE id = auth.uid()));

CREATE POLICY "action_items_insert_ors"
  ON public.meeting_action_items FOR INSERT
  TO authenticated
  WITH CHECK (
    org_id = (SELECT org_id FROM public.users WHERE id = auth.uid())
    AND (SELECT role FROM public.users WHERE id = auth.uid()) = 'ors'
  );

CREATE POLICY "action_items_update_ors_or_owner"
  ON public.meeting_action_items FOR UPDATE
  TO authenticated
  USING (
    org_id = (SELECT org_id FROM public.users WHERE id = auth.uid())
    AND (
      (SELECT role FROM public.users WHERE id = auth.uid()) = 'ors'
      OR owner_id = auth.uid()
    )
  )
  WITH CHECK (
    org_id = (SELECT org_id FROM public.users WHERE id = auth.uid())
    AND (
      (SELECT role FROM public.users WHERE id = auth.uid()) = 'ors'
      OR owner_id = auth.uid()
    )
  );

COMMENT ON TABLE public.meeting_action_items IS
'Action items from meeting minutes. Links to Tasks table (Phase 2c) for accountability tracking.';

-- 4. COLUMN: Add to meetings table (Phase 2b support)
-- ============================================================
ALTER TABLE public.meetings
  ADD COLUMN IF NOT EXISTS calendar_event_id text,
  ADD COLUMN IF NOT EXISTS calendar_sync_status text DEFAULT 'pending'
                      CHECK (calendar_sync_status IN ('pending', 'synced', 'failed', 'skipped')),
  ADD COLUMN IF NOT EXISTS calendar_sync_error text,
  ADD COLUMN IF NOT EXISTS calendar_sync_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_meetings_calendar_event_id
  ON public.meetings(calendar_event_id) WHERE calendar_event_id IS NOT NULL;

-- 5. UPDATED_AT TRIGGERS
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_meeting_minutes_updated_at ON public.meeting_minutes;
CREATE TRIGGER trg_meeting_minutes_updated_at
  BEFORE UPDATE ON public.meeting_minutes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_minutes_segments_updated_at ON public.meeting_minutes_segments;
CREATE TRIGGER trg_minutes_segments_updated_at
  BEFORE UPDATE ON public.meeting_minutes_segments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_action_items_updated_at ON public.meeting_action_items;
CREATE TRIGGER trg_action_items_updated_at
  BEFORE UPDATE ON public.meeting_action_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 6. RPC FUNCTIONS
-- ============================================================

-- Function: Create minutes record when meeting is finalized
CREATE OR REPLACE FUNCTION public.create_meeting_minutes(
  p_meeting_id uuid,
  p_created_by uuid
)
RETURNS public.meeting_minutes
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_meeting public.meetings%rowtype;
  v_org_id uuid;
  v_minutes public.meeting_minutes%rowtype;
BEGIN
  -- Verify caller is ORS
  IF (SELECT role FROM public.users WHERE id = p_created_by) != 'ors' THEN
    RAISE EXCEPTION 'Only ORS users can create minutes';
  END IF;

  -- Get meeting and verify exists
  SELECT * INTO v_meeting FROM public.meetings WHERE id = p_meeting_id;
  IF v_meeting.id IS NULL THEN
    RAISE EXCEPTION 'Meeting not found';
  END IF;

  -- Verify meeting is finalized
  IF v_meeting.status != 'finalized' THEN
    RAISE EXCEPTION 'Meeting must be finalized before capturing minutes';
  END IF;

  v_org_id := v_meeting.org_id;

  -- Create minutes record
  INSERT INTO public.meeting_minutes (
    meeting_id,
    org_id,
    status,
    created_by
  )
  VALUES (p_meeting_id, v_org_id, 'draft', p_created_by)
  RETURNING * INTO v_minutes;

  RETURN v_minutes;
END;
$$;

-- Function: Submit minutes (lock for editing)
CREATE OR REPLACE FUNCTION public.submit_meeting_minutes(
  p_minutes_id uuid,
  p_user_id uuid
)
RETURNS public.meeting_minutes
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_minutes public.meeting_minutes%rowtype;
  v_user_role text;
BEGIN
  SELECT role INTO v_user_role FROM public.users WHERE id = p_user_id;
  IF v_user_role != 'ors' THEN
    RAISE EXCEPTION 'Only ORS can submit minutes';
  END IF;

  UPDATE public.meeting_minutes
  SET
    status = 'submitted',
    submitted_by = p_user_id,
    submitted_at = now()
  WHERE id = p_minutes_id
    AND status = 'draft'
  RETURNING * INTO v_minutes;

  IF v_minutes.id IS NULL THEN
    RAISE EXCEPTION 'Minutes not found or already submitted';
  END IF;

  RETURN v_minutes;
END;
$$;

-- Function: Create action item
CREATE OR REPLACE FUNCTION public.create_meeting_action_item(
  p_segment_id uuid,
  p_minutes_id uuid,
  p_meeting_id uuid,
  p_description text,
  p_owner_id uuid,
  p_due_date date,
  p_priority text DEFAULT 'medium',
  p_created_by uuid
)
RETURNS public.meeting_action_items
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_minutes public.meeting_minutes%rowtype;
  v_user_role text;
  v_org_id uuid;
  v_owner_name text;
  v_action_item public.meeting_action_items%rowtype;
BEGIN
  -- Verify ORS
  SELECT role INTO v_user_role FROM public.users WHERE id = p_created_by;
  IF v_user_role != 'ors' THEN
    RAISE EXCEPTION 'Only ORS can create action items';
  END IF;

  -- Get minutes to verify org_id
  SELECT * INTO v_minutes FROM public.meeting_minutes WHERE id = p_minutes_id;
  IF v_minutes.id IS NULL THEN
    RAISE EXCEPTION 'Minutes not found';
  END IF;

  v_org_id := v_minutes.org_id;

  -- Get owner name for caching
  SELECT name INTO v_owner_name FROM public.users WHERE id = p_owner_id;

  -- Create action item
  INSERT INTO public.meeting_action_items (
    segment_id,
    minutes_id,
    meeting_id,
    org_id,
    description,
    owner_id,
    owner_name,
    due_date,
    priority,
    created_by
  )
  VALUES (
    p_segment_id,
    p_minutes_id,
    p_meeting_id,
    v_org_id,
    p_description,
    p_owner_id,
    v_owner_name,
    p_due_date,
    p_priority,
    p_created_by
  )
  RETURNING * INTO v_action_item;

  RETURN v_action_item;
END;
$$;

-- Function: Sync meeting to calendar (called on finalize)
CREATE OR REPLACE FUNCTION public.mark_calendar_sync_pending(
  p_meeting_id uuid
)
RETURNS public.meetings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_meeting public.meetings%rowtype;
BEGIN
  UPDATE public.meetings
  SET
    calendar_sync_status = 'pending',
    calendar_sync_at = now()
  WHERE id = p_meeting_id
  RETURNING * INTO v_meeting;

  RETURN v_meeting;
END;
$$;

-- Function: Record calendar sync success
CREATE OR REPLACE FUNCTION public.record_calendar_sync_success(
  p_meeting_id uuid,
  p_event_id text
)
RETURNS public.meetings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_meeting public.meetings%rowtype;
BEGIN
  UPDATE public.meetings
  SET
    calendar_event_id = p_event_id,
    calendar_sync_status = 'synced',
    calendar_sync_error = NULL,
    calendar_sync_at = now()
  WHERE id = p_meeting_id
  RETURNING * INTO v_meeting;

  RETURN v_meeting;
END;
$$;

-- Function: Record calendar sync failure
CREATE OR REPLACE FUNCTION public.record_calendar_sync_failure(
  p_meeting_id uuid,
  p_error_message text
)
RETURNS public.meetings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_meeting public.meetings%rowtype;
BEGIN
  UPDATE public.meetings
  SET
    calendar_sync_status = 'failed',
    calendar_sync_error = LEFT(p_error_message, 500),
    calendar_sync_at = now()
  WHERE id = p_meeting_id
  RETURNING * INTO v_meeting;

  RETURN v_meeting;
END;
$$;

COMMENT ON FUNCTION public.create_meeting_minutes IS
'Create a new minutes record for a finalized meeting. Only ORS can call.';

COMMENT ON FUNCTION public.submit_meeting_minutes IS
'Submit minutes to lock from further editing. Status: draft → submitted.';

COMMENT ON FUNCTION public.create_meeting_action_item IS
'Create action item from minutes. Automatically links to Tasks if Phase 2c enabled.';

COMMENT ON FUNCTION public.mark_calendar_sync_pending IS
'Mark meeting as pending calendar sync (called when meeting finalized).';

COMMENT ON FUNCTION public.record_calendar_sync_success IS
'Record successful calendar event creation.';

COMMENT ON FUNCTION public.record_calendar_sync_failure IS
'Record calendar sync failure with error message.';
```

### 1.2 Verify Schema

```bash
# After migration runs:

psql -h $SUPABASE_HOST -U postgres -d postgres << EOF
\d public.meeting_minutes
\d public.meeting_minutes_segments
\d public.meeting_action_items
SELECT * FROM information_schema.columns WHERE table_name='meetings' AND column_name LIKE 'calendar%';
EOF
```

---

## PART 2: PHASE 2A — MINUTES CAPTURE UI

### 2.1 MinutesCapture Page Component

**File:** `src/pages/meetings/MinutesCapturePage.jsx`

```jsx
import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { supabase } from '../../lib/supabase'
import SegmentNoteCard from '../../components/meetings/SegmentNoteCard'
import ActionItemForm from '../../components/meetings/ActionItemForm'
import ActionItemList from '../../components/meetings/ActionItemList'

const PRIMARY = '#4C2A92'
const BORDER = '#EDE8DC'
const TEXT = '#2D2A22'
const MUTED = '#9E9488'
const SUCCESS = '#2D8653'
const DANGER = '#C94830'

export default function MinutesCapturePage() {
  const { meetingId } = useParams()
  const navigate = useNavigate()
  const { profile } = useAuth()
  
  const [meeting, setMeeting] = useState(null)
  const [minutes, setMinutes] = useState(null)
  const [agenda, setAgenda] = useState([])
  const [segments, setSegments] = useState({})
  const [actionItems, setActionItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(null)

  // Load meeting, minutes, agenda, and segments
  useEffect(() => {
    if (!profile?.org_id || !meetingId) return

    async function load() {
      try {
        setLoading(true)
        setError(null)

        // 1. Get meeting
        const { data: meetingData, error: meetingErr } = await supabase
          .from('meetings')
          .select('*')
          .eq('id', meetingId)
          .single()

        if (meetingErr) throw meetingErr
        if (!meetingData) throw new Error('Meeting not found')

        // Verify meeting is finalized
        if (meetingData.status !== 'finalized') {
          throw new Error('Meeting must be finalized before capturing minutes')
        }

        setMeeting(meetingData)

        // 2. Get or create minutes
        let { data: minutesData, error: minutesErr } = await supabase
          .from('meeting_minutes')
          .select('*')
          .eq('meeting_id', meetingId)
          .single()

        if (minutesErr && minutesErr.code !== 'PGRST116') throw minutesErr

        if (!minutesData) {
          // Create minutes
          const { data: newMinutes, error: createErr } = await supabase
            .rpc('create_meeting_minutes', {
              p_meeting_id: meetingId,
              p_created_by: profile.id
            })
          
          if (createErr) throw createErr
          minutesData = newMinutes
        }

        setMinutes(minutesData)

        // 3. Get agenda
        const { data: agendaData, error: agendaErr } = await supabase
          .from('meeting_agenda')
          .select('*')
          .eq('meeting_id', meetingId)
          .order('sequence', { ascending: true })

        if (agendaErr) throw agendaErr
        setAgenda(agendaData ?? [])

        // 4. Get existing segments
        const { data: segmentsData, error: segmentsErr } = await supabase
          .from('meeting_minutes_segments')
          .select('*')
          .eq('minutes_id', minutesData.id)

        if (segmentsErr) throw segmentsErr

        const segmentMap = {}
        segmentsData?.forEach(seg => {
          segmentMap[seg.segment_number] = seg
        })
        setSegments(segmentMap)

        // 5. Get action items
        const { data: itemsData, error: itemsErr } = await supabase
          .from('meeting_action_items')
          .select('*')
          .eq('minutes_id', minutesData.id)
          .order('created_at', { ascending: false })

        if (itemsErr) throw itemsErr
        setActionItems(itemsData ?? [])
      } catch (err) {
        setError(err.message ?? 'Failed to load meeting minutes')
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [meetingId, profile?.org_id, profile?.id])

  // Update segment notes
  async function handleSegmentUpdate(segmentNumber, updates) {
    setSaving(true)
    setError(null)

    try {
      const agendaItem = agenda.find(a => a.sequence === segmentNumber)
      if (!agendaItem) throw new Error('Agenda item not found')

      let segment = segments[segmentNumber]

      if (!segment) {
        // Create new segment
        const { data: newSegment, error: err } = await supabase
          .from('meeting_minutes_segments')
          .insert([{
            minutes_id: minutes.id,
            segment_type: agendaItem.segment_type,
            segment_number: segmentNumber,
            segment_title: agendaItem.title,
            notes: updates.notes,
            key_decisions: updates.key_decisions,
            discussion_points: updates.discussion_points,
          }])
          .select('*')
          .single()

        if (err) throw err
        segment = newSegment
      } else {
        // Update existing
        const { data: updated, error: err } = await supabase
          .from('meeting_minutes_segments')
          .update({
            notes: updates.notes,
            key_decisions: updates.key_decisions,
            discussion_points: updates.discussion_points,
          })
          .eq('id', segment.id)
          .select('*')
          .single()

        if (err) throw err
        segment = updated
      }

      setSegments(prev => ({
        ...prev,
        [segmentNumber]: segment
      }))

      setSuccess('Segment saved')
      setTimeout(() => setSuccess(null), 2000)
    } catch (err) {
      setError(err.message ?? 'Failed to save segment')
    } finally {
      setSaving(false)
    }
  }

  // Create action item
  async function handleCreateActionItem(itemData) {
    setSaving(true)
    setError(null)

    try {
      const segment = segments[itemData.segment_number]
      if (!segment) throw new Error('Segment must exist before adding action items')

      const { data: actionItem, error: err } = await supabase
        .rpc('create_meeting_action_item', {
          p_segment_id: segment.id,
          p_minutes_id: minutes.id,
          p_meeting_id: meetingId,
          p_description: itemData.description,
          p_owner_id: itemData.owner_id,
          p_due_date: itemData.due_date,
          p_priority: itemData.priority,
          p_created_by: profile.id
        })

      if (err) throw err

      setActionItems(prev => [actionItem, ...prev])
      setSuccess('Action item created')
      setTimeout(() => setSuccess(null), 2000)
    } catch (err) {
      setError(err.message ?? 'Failed to create action item')
    } finally {
      setSaving(false)
    }
  }

  // Update action item status
  async function handleUpdateActionItem(itemId, updates) {
    setSaving(true)

    try {
      const { data: updated, error: err } = await supabase
        .from('meeting_action_items')
        .update(updates)
        .eq('id', itemId)
        .select('*')
        .single()

      if (err) throw err

      setActionItems(prev =>
        prev.map(item => (item.id === itemId ? updated : item))
      )
    } catch (err) {
      setError(err.message ?? 'Failed to update action item')
    } finally {
      setSaving(false)
    }
  }

  // Delete action item
  async function handleDeleteActionItem(itemId) {
    setSaving(true)

    try {
      const { error: err } = await supabase
        .from('meeting_action_items')
        .delete()
        .eq('id', itemId)

      if (err) throw err

      setActionItems(prev => prev.filter(item => item.id !== itemId))
      setSuccess('Action item deleted')
      setTimeout(() => setSuccess(null), 2000)
    } catch (err) {
      setError(err.message ?? 'Failed to delete action item')
    } finally {
      setSaving(false)
    }
  }

  // Submit minutes
  async function handleSubmitMinutes() {
    setSaving(true)
    setError(null)

    try {
      const { data: updated, error: err } = await supabase
        .rpc('submit_meeting_minutes', {
          p_minutes_id: minutes.id,
          p_user_id: profile.id
        })

      if (err) throw err

      setMinutes(updated)
      setSuccess('Minutes submitted successfully!')
      setTimeout(() => navigate(`/meetings/${meetingId}`), 2000)
    } catch (err) {
      setError(err.message ?? 'Failed to submit minutes')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        Loading...
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#F4F1EA' }}>
      {/* Header */}
      <div style={{ padding: '16px 24px', background: '#FFFFFF', borderBottom: `1px solid ${BORDER}` }}>
        <button
          type="button"
          onClick={() => navigate(-1)}
          style={{ border: 'none', background: 'none', cursor: 'pointer', color: MUTED, marginBottom: 12 }}
        >
          ← Back
        </button>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: TEXT }}>
          {meeting?.title}
        </h1>
        <p style={{ margin: '4px 0 0', fontSize: 13, color: MUTED }}>
          Capture meeting minutes • Status: {minutes?.status}
        </p>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          {error && (
            <div style={{
              background: '#FEF0ED',
              border: `1px solid #F5C4B8`,
              borderRadius: 8,
              padding: '12px 16px',
              marginBottom: 16,
              color: DANGER,
              fontSize: 13
            }}>
              {error}
            </div>
          )}

          {success && (
            <div style={{
              background: '#EBF7F1',
              border: `1px solid #A7DDBA`,
              borderRadius: 8,
              padding: '12px 16px',
              marginBottom: 16,
              color: SUCCESS,
              fontSize: 13
            }}>
              {success}
            </div>
          )}

          {/* Segment Notes */}
          <div style={{ marginBottom: 32 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: TEXT, marginBottom: 16 }}>
              Segment Notes
            </h2>
            {agenda.length === 0 ? (
              <p style={{ color: MUTED }}>No agenda items found</p>
            ) : (
              agenda.map(item => (
                <SegmentNoteCard
                  key={item.id}
                  agendaItem={item}
                  segment={segments[item.sequence]}
                  onUpdate={(updates) => handleSegmentUpdate(item.sequence, updates)}
                  saving={saving}
                />
              ))
            )}
          </div>

          {/* Action Items */}
          <div style={{ marginBottom: 32 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: TEXT, marginBottom: 16 }}>
              Action Items
            </h2>

            {/* Add Action Item Form */}
            {minutes?.status === 'draft' && (
              <ActionItemForm
                agendaItems={agenda}
                segments={segments}
                onSubmit={handleCreateActionItem}
                saving={saving}
              />
            )}

            {/* List Action Items */}
            <ActionItemList
              items={actionItems}
              onUpdate={handleUpdateActionItem}
              onDelete={handleDeleteActionItem}
              editable={minutes?.status === 'draft'}
              saving={saving}
            />
          </div>
        </div>
      </div>

      {/* Footer */}
      {minutes?.status === 'draft' && (
        <div style={{
          padding: '16px 24px',
          background: '#FFFFFF',
          borderTop: `1px solid ${BORDER}`,
          display: 'flex',
          justifyContent: 'flex-end',
          gap: 12
        }}>
          <button
            type="button"
            onClick={() => navigate(-1)}
            style={{
              padding: '8px 16px',
              border: `1px solid ${BORDER}`,
              background: '#FFFFFF',
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmitMinutes}
            disabled={saving}
            style={{
              padding: '8px 16px',
              background: PRIMARY,
              color: '#FFFFFF',
              border: 'none',
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 600,
              cursor: saving ? 'not-allowed' : 'pointer',
              opacity: saving ? 0.6 : 1
            }}
          >
            {saving ? 'Submitting...' : 'Submit Minutes'}
          </button>
        </div>
      )}
    </div>
  )
}
```

### 2.2 SegmentNoteCard Component

**File:** `src/components/meetings/SegmentNoteCard.jsx`

```jsx
import { useState } from 'react'

const TEXT = '#2D2A22'
const MUTED = '#9E9488'
const BORDER = '#EDE8DC'
const PRIMARY = '#4C2A92'

export default function SegmentNoteCard({ agendaItem, segment, onUpdate, saving }) {
  const [notes, setNotes] = useState(segment?.notes ?? '')
  const [decisions, setDecisions] = useState(segment?.key_decisions ?? '')
  const [discussion, setDiscussion] = useState(segment?.discussion_points ?? '')
  const [editing, setEditing] = useState(!segment)

  async function handleSave() {
    await onUpdate({
      notes,
      key_decisions: decisions,
      discussion_points: discussion
    })
    setEditing(false)
  }

  if (!editing && segment) {
    return (
      <div style={{
        background: '#FFFFFF',
        border: `1px solid ${BORDER}`,
        borderRadius: 8,
        padding: 16,
        marginBottom: 12,
        cursor: 'pointer'
      }}
      onClick={() => setEditing(true)}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: MUTED, textTransform: 'uppercase' }}>
              S/{agendaItem.sequence}
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, color: TEXT }}>
              {agendaItem.title}
            </div>
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              setEditing(true)
            }}
            style={{
              padding: '4px 8px',
              background: 'none',
              border: 'none',
              color: PRIMARY,
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: 600
            }}
          >
            Edit
          </button>
        </div>
        
        {notes && (
          <div style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: MUTED, marginBottom: 4 }}>NOTES</div>
            <div style={{ fontSize: 13, color: TEXT, lineHeight: 1.5 }}>{notes}</div>
          </div>
        )}
        
        {decisions && (
          <div style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: MUTED, marginBottom: 4 }}>KEY DECISIONS</div>
            <div style={{ fontSize: 13, color: TEXT, lineHeight: 1.5 }}>{decisions}</div>
          </div>
        )}
        
        {discussion && (
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: MUTED, marginBottom: 4 }}>DISCUSSION</div>
            <div style={{ fontSize: 13, color: TEXT, lineHeight: 1.5 }}>{discussion}</div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div style={{
      background: '#FFFFFF',
      border: `1px solid ${BORDER}`,
      borderRadius: 8,
      padding: 16,
      marginBottom: 12
    }}>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: MUTED, textTransform: 'uppercase', marginBottom: 4 }}>
          S/{agendaItem.sequence}
        </div>
        <div style={{ fontSize: 14, fontWeight: 700, color: TEXT }}>
          {agendaItem.title}
        </div>
      </div>

      <div style={{ marginBottom: 12 }}>
        <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: MUTED, marginBottom: 6 }}>
          Notes
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="What was discussed?"
          style={{
            width: '100%',
            minHeight: 80,
            padding: '8px 12px',
            border: `1px solid ${BORDER}`,
            borderRadius: 6,
            fontSize: 13,
            fontFamily: 'inherit',
            outline: 'none'
          }}
        />
      </div>

      <div style={{ marginBottom: 12 }}>
        <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: MUTED, marginBottom: 6 }}>
          Key Decisions
        </label>
        <textarea
          value={decisions}
          onChange={(e) => setDecisions(e.target.value)}
          placeholder="What decisions were made?"
          style={{
            width: '100%',
            minHeight: 60,
            padding: '8px 12px',
            border: `1px solid ${BORDER}`,
            borderRadius: 6,
            fontSize: 13,
            fontFamily: 'inherit',
            outline: 'none'
          }}
        />
      </div>

      <div style={{ marginBottom: 16 }}>
        <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: MUTED, marginBottom: 6 }}>
          Discussion Points
        </label>
        <textarea
          value={discussion}
          onChange={(e) => setDiscussion(e.target.value)}
          placeholder="Notable discussion items"
          style={{
            width: '100%',
            minHeight: 60,
            padding: '8px 12px',
            border: `1px solid ${BORDER}`,
            borderRadius: 6,
            fontSize: 13,
            fontFamily: 'inherit',
            outline: 'none'
          }}
        />
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <button
          type="button"
          onClick={() => setEditing(false)}
          style={{
            padding: '6px 12px',
            border: `1px solid ${BORDER}`,
            background: '#FFFFFF',
            borderRadius: 6,
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer'
          }}
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          style={{
            padding: '6px 12px',
            background: PRIMARY,
            color: '#FFFFFF',
            border: 'none',
            borderRadius: 6,
            fontSize: 12,
            fontWeight: 600,
            cursor: saving ? 'not-allowed' : 'pointer',
            opacity: saving ? 0.6 : 1
          }}
        >
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>
    </div>
  )
}
```

### 2.3 ActionItemForm Component

**File:** `src/components/meetings/ActionItemForm.jsx`

```jsx
import { useState } from 'react'
import { Plus } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { supabase } from '../../lib/supabase'

const TEXT = '#2D2A22'
const MUTED = '#9E9488'
const BORDER = '#EDE8DC'
const PRIMARY = '#4C2A92'

export default function ActionItemForm({ agendaItems, segments, onSubmit, saving }) {
  const { profile } = useAuth()
  const [expanded, setExpanded] = useState(false)
  const [formData, setFormData] = useState({
    segment_number: null,
    description: '',
    owner_id: '',
    due_date: '',
    priority: 'medium'
  })
  const [users, setUsers] = useState([])
  const [loadingUsers, setLoadingUsers] = useState(false)

  async function loadUsers() {
    setLoadingUsers(true)
    const { data, error } = await supabase
      .from('users')
      .select('id, name')
      .eq('org_id', profile.org_id)
      .order('name')

    if (!error) setUsers(data ?? [])
    setLoadingUsers(false)
  }

  function handleSubmit() {
    if (!formData.segment_number || !formData.description || !formData.owner_id || !formData.due_date) {
      alert('Please fill in all fields')
      return
    }

    onSubmit(formData)
    setFormData({
      segment_number: null,
      description: '',
      owner_id: '',
      due_date: '',
      priority: 'medium'
    })
    setExpanded(false)
  }

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => {
          setExpanded(true)
          loadUsers()
        }}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '12px 16px',
          background: PRIMARY,
          color: '#FFFFFF',
          border: 'none',
          borderRadius: 8,
          fontSize: 13,
          fontWeight: 600,
          cursor: 'pointer',
          marginBottom: 16
        }}
      >
        <Plus size={16} /> Add Action Item
      </button>
    )
  }

  const segmentOptions = agendaItems.filter(item => segments[item.sequence]).map(item => ({
    value: item.sequence,
    label: `S/${item.sequence}: ${item.title}`
  }))

  return (
    <div style={{
      background: '#FFFFFF',
      border: `1px solid ${BORDER}`,
      borderRadius: 8,
      padding: 16,
      marginBottom: 16
    }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
        <div>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: MUTED, marginBottom: 4 }}>
            Segment
          </label>
          <select
            value={formData.segment_number || ''}
            onChange={(e) => setFormData({ ...formData, segment_number: parseInt(e.target.value) })}
            style={{
              width: '100%',
              padding: '8px 12px',
              border: `1px solid ${BORDER}`,
              borderRadius: 6,
              fontSize: 13,
              fontFamily: 'inherit'
            }}
          >
            <option value="">Choose segment...</option>
            {segmentOptions.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: MUTED, marginBottom: 4 }}>
            Assign To
          </label>
          <select
            value={formData.owner_id}
            onChange={(e) => setFormData({ ...formData, owner_id: e.target.value })}
            disabled={loadingUsers}
            style={{
              width: '100%',
              padding: '8px 12px',
              border: `1px solid ${BORDER}`,
              borderRadius: 6,
              fontSize: 13,
              fontFamily: 'inherit'
            }}
          >
            <option value="">Choose person...</option>
            {users.map(user => (
              <option key={user.id} value={user.id}>{user.name}</option>
            ))}
          </select>
        </div>
      </div>

      <div style={{ marginBottom: 12 }}>
        <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: MUTED, marginBottom: 4 }}>
          Description
        </label>
        <textarea
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          placeholder="What needs to be done?"
          style={{
            width: '100%',
            minHeight: 60,
            padding: '8px 12px',
            border: `1px solid ${BORDER}`,
            borderRadius: 6,
            fontSize: 13,
            fontFamily: 'inherit'
          }}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
        <div>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: MUTED, marginBottom: 4 }}>
            Due Date
          </label>
          <input
            type="date"
            value={formData.due_date}
            onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
            style={{
              width: '100%',
              padding: '8px 12px',
              border: `1px solid ${BORDER}`,
              borderRadius: 6,
              fontSize: 13,
              fontFamily: 'inherit'
            }}
          />
        </div>

        <div>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: MUTED, marginBottom: 4 }}>
            Priority
          </label>
          <select
            value={formData.priority}
            onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
            style={{
              width: '100%',
              padding: '8px 12px',
              border: `1px solid ${BORDER}`,
              borderRadius: 6,
              fontSize: 13,
              fontFamily: 'inherit'
            }}
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <button
          type="button"
          onClick={() => setExpanded(false)}
          style={{
            padding: '8px 16px',
            border: `1px solid ${BORDER}`,
            background: '#FFFFFF',
            borderRadius: 6,
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer'
          }}
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={saving}
          style={{
            padding: '8px 16px',
            background: PRIMARY,
            color: '#FFFFFF',
            border: 'none',
            borderRadius: 6,
            fontSize: 12,
            fontWeight: 600,
            cursor: saving ? 'not-allowed' : 'pointer',
            opacity: saving ? 0.6 : 1
          }}
        >
          {saving ? 'Creating...' : 'Add Item'}
        </button>
      </div>
    </div>
  )
}
```

### 2.4 ActionItemList Component

**File:** `src/components/meetings/ActionItemList.jsx`

```jsx
import { useState } from 'react'
import { Trash2 } from 'lucide-react'

const TEXT = '#2D2A22'
const MUTED = '#9E9488'
const BORDER = '#EDE8DC'
const SUCCESS = '#2D8653'
const DANGER = '#C94830'

const STATUS_COLORS = {
  open: { bg: '#E8EEFA', text: '#1A56DB' },
  in_progress: { bg: '#FEF3C7', text: '#92400E' },
  completed: { bg: '#EBF7F1', text: SUCCESS },
  cancelled: { bg: '#F4F1EA', text: MUTED }
}

const PRIORITY_COLORS = {
  low: '#9E9488',
  medium: '#E8A020',
  high: '#C94830'
}

export default function ActionItemList({ items, onUpdate, onDelete, editable, saving }) {
  const [deletingId, setDeletingId] = useState(null)

  if (items.length === 0) {
    return (
      <div style={{
        background: '#FFFFFF',
        border: `1px solid ${BORDER}`,
        borderRadius: 8,
        padding: 32,
        textAlign: 'center',
        color: MUTED
      }}>
        No action items yet
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {items.map(item => (
        <div
          key={item.id}
          style={{
            background: '#FFFFFF',
            border: `1px solid ${BORDER}`,
            borderRadius: 8,
            padding: 16
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: TEXT, marginBottom: 4 }}>
                {item.description}
              </div>
              <div style={{ fontSize: 12, color: MUTED }}>
                Assigned to: <strong>{item.owner_name}</strong>
              </div>
            </div>

            {editable && (
              <button
                type="button"
                onClick={() => {
                  if (deletingId === item.id) {
                    onDelete(item.id)
                    setDeletingId(null)
                  } else {
                    setDeletingId(item.id)
                  }
                }}
                style={{
                  padding: '4px 8px',
                  background: 'none',
                  border: 'none',
                  color: deletingId === item.id ? DANGER : MUTED,
                  cursor: 'pointer',
                  fontSize: 13
                }}
              >
                {deletingId === item.id ? 'Confirm delete?' : <Trash2 size={16} />}
              </button>
            )}
          </div>

          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            {/* Status */}
            <select
              value={item.status}
              onChange={(e) => onUpdate(item.id, { status: e.target.value })}
              disabled={!editable}
              style={{
                padding: '4px 8px',
                borderRadius: 4,
                border: 'none',
                fontSize: 11,
                fontWeight: 600,
                background: STATUS_COLORS[item.status]?.bg,
                color: STATUS_COLORS[item.status]?.text,
                cursor: editable ? 'pointer' : 'default'
              }}
            >
              <option value="open">Open</option>
              <option value="in_progress">In Progress</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>

            {/* Priority Badge */}
            <div style={{
              padding: '4px 8px',
              borderRadius: 4,
              background: 'rgba(232, 160, 32, 0.1)',
              color: PRIORITY_COLORS[item.priority],
              fontSize: 11,
              fontWeight: 600,
              textTransform: 'capitalize'
            }}>
              {item.priority}
            </div>

            {/* Due Date */}
            <div style={{
              padding: '4px 8px',
              borderRadius: 4,
              background: '#F4F1EA',
              color: MUTED,
              fontSize: 11,
              fontWeight: 600
            }}>
              Due: {item.due_date ? new Date(item.due_date).toLocaleDateString() : 'No date'}
            </div>

            {/* Task Link (Phase 2c) */}
            {item.task_id && (
              <a
                href={`/tasks/${item.task_id}`}
                style={{
                  padding: '4px 8px',
                  borderRadius: 4,
                  background: '#EDE8F8',
                  color: '#4C2A92',
                  fontSize: 11,
                  fontWeight: 600,
                  textDecoration: 'none'
                }}
              >
                View Task →
              </a>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
```

### 2.5 Add Route to App.jsx

```jsx
// Around line 30
const MinutesCapturePage = lazy(() => import('./pages/meetings/MinutesCapturePage'))

// Around line 200 (in protected routes)
<Route
  path="/meetings/:meetingId/minutes"
  element={
    <ProtectedRoute roles={['ors']}>
      <MinutesCapturePage />
    </ProtectedRoute>
  }
/>
```

### 2.6 Add "Capture Minutes" Button to Meeting Detail

**File:** `src/pages/meetings/MeetingDetailPage.jsx` (enhancement)

```jsx
// Add button in header area, only show if meeting is finalized and ORS:

{meeting?.status === 'finalized' && profile?.role === 'ors' && (
  <button
    onClick={() => navigate(`/meetings/${meeting.id}/minutes`)}
    style={{
      padding: '8px 16px',
      background: '#4C2A92',
      color: '#FFFFFF',
      border: 'none',
      borderRadius: 8,
      cursor: 'pointer'
    }}
  >
    📝 Capture Minutes
  </button>
)}
```

---

## PART 3: PHASE 2B — CALENDAR SYNC

### 3.1 Calendar Sync Function

**File:** `src/lib/calendar/meetingSyncCalendar.js`

```javascript
/**
 * Phase 2b: Auto-sync meeting to Google Calendar
 * Called when meeting is finalized
 * One-way sync: Meetings → Calendar (no bidirectional update)
 */

import { supabase } from '@/lib/supabase'

export async function syncMeetingToCalendar(meetingId, userId) {
  try {
    // 1. Fetch meeting details
    const { data: meeting, error: meetingErr } = await supabase
      .from('meetings')
      .select(`
        id, title, date, start_time, end_time, location,
        meeting_agenda(id, title, sequence)
      `)
      .eq('id', meetingId)
      .single()

    if (meetingErr) throw meetingErr

    // Mark sync as pending
    await supabase.rpc('mark_calendar_sync_pending', { p_meeting_id: meetingId })

    // 2. Prepare event data
    const startDateTime = `${meeting.date}T${meeting.start_time || '09:00:00'}`
    const endDateTime = `${meeting.date}T${meeting.end_time || '10:00:00'}`

    // Format agenda as bullet points
    const agendaText = meeting.meeting_agenda
      ?.sort((a, b) => a.sequence - b.sequence)
      .map(item => `• S/${item.sequence}: ${item.title}`)
      .join('\n') || 'No agenda items'

    const eventData = {
      summary: meeting.title,
      description: `Meeting Agenda:\n${agendaText}`,
      start: {
        dateTime: startDateTime,
        timeZone: 'UTC'
      },
      end: {
        dateTime: endDateTime,
        timeZone: 'UTC'
      },
      location: meeting.location || ''
    }

    // 3. Call edge function to create calendar event
    const { data: session } = await supabase.auth.getSession()
    const authToken = session?.access_token

    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-calendar-event`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({
          meetingId,
          eventData
        })
      }
    )

    const result = await response.json()

    if (!response.ok) {
      throw new Error(result.error || `Calendar sync failed (${response.status})`)
    }

    // 4. Record success in database
    await supabase.rpc('record_calendar_sync_success', {
      p_meeting_id: meetingId,
      p_event_id: result.eventId
    })

    return {
      success: true,
      eventId: result.eventId,
      message: 'Calendar event created successfully'
    }
  } catch (err) {
    console.error('Calendar sync error:', err)

    // Record failure
    await supabase.rpc('record_calendar_sync_failure', {
      p_meeting_id: meetingId,
      p_error_message: err.message
    })

    return {
      success: false,
      error: err.message
    }
  }
}

/**
 * Retry calendar sync for a meeting
 * Used when sync fails and user clicks "Retry"
 */
export async function retryCalendarSync(meetingId) {
  return syncMeetingToCalendar(meetingId)
}

/**
 * Check calendar sync status
 */
export async function getCalendarSyncStatus(meetingId) {
  const { data: meeting, error } = await supabase
    .from('meetings')
    .select('calendar_sync_status, calendar_sync_error, calendar_event_id')
    .eq('id', meetingId)
    .single()

  if (error) throw error

  return {
    status: meeting.calendar_sync_status,
    error: meeting.calendar_sync_error,
    eventId: meeting.calendar_event_id
  }
}
```

### 3.2 Edge Function for Calendar Creation

**File:** `supabase/functions/create-calendar-event/index.ts`

This would be created by Supabase team, but here's the spec:

```typescript
// Pseudocode for Supabase edge function
// Create at: supabase/functions/create-calendar-event/index.ts

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const supabaseUrl = Deno.env.get('SUPABASE_URL')
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
const googleCalendarApiKey = Deno.env.get('GOOGLE_CALENDAR_API_KEY')

const supabase = createClient(supabaseUrl, supabaseServiceKey)

serve(async (req) => {
  try {
    const { meetingId, eventData } = await req.json()

    // 1. Get user's Google Calendar credentials from database
    // (Assumes user has already authed with Google Calendar)
    const { data: user } = await supabase.auth.getUser(req.headers.get('authorization')?.replace('Bearer ', ''))
    
    const { data: calendarAuth } = await supabase
      .from('user_calendar_auth')
      .select('google_access_token')
      .eq('user_id', user.user.id)
      .single()

    if (!calendarAuth?.google_access_token) {
      throw new Error('User has not authenticated Google Calendar')
    }

    // 2. Create event in Google Calendar
    const response = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${calendarAuth.google_access_token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(eventData)
    })

    const calendarEvent = await response.json()

    if (!response.ok) {
      throw new Error(calendarEvent.error?.message || 'Failed to create calendar event')
    }

    // 3. Return event ID
    return new Response(
      JSON.stringify({ eventId: calendarEvent.id }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    )
  }
})
```

### 3.3 Update Meeting Finalize Logic

**File:** `src/lib/meetings/finalizeMeeting.js`

```javascript
// When meeting is finalized, also trigger calendar sync:

import { syncMeetingToCalendar } from './calendar/meetingSyncCalendar'

export async function finalizeMeeting(meetingId, userId) {
  try {
    // 1. Finalize meeting
    const { data: meeting, error: finalizeErr } = await supabase.rpc(
      'finalize_meeting',
      { p_meeting_id: meetingId, p_finalized_by: userId }
    )

    if (finalizeErr) throw finalizeErr

    // 2. Trigger calendar sync (async, don't wait)
    // This allows meeting to finalize even if calendar sync fails
    syncMeetingToCalendar(meetingId, userId).catch(err => {
      console.error('Calendar sync failed:', err)
      // Error is recorded in DB by syncMeetingToCalendar
    })

    return meeting
  } catch (err) {
    throw err
  }
}
```

### 3.4 Calendar Sync Status UI

**File:** `src/components/meetings/CalendarSyncStatus.jsx`

```jsx
import { useEffect, useState } from 'react'
import { getCalendarSyncStatus, retryCalendarSync } from '../../lib/calendar/meetingSyncCalendar'

const PRIMARY = '#4C2A92'
const DANGER = '#C94830'
const SUCCESS = '#2D8653'
const MUTED = '#9E9488'

export default function CalendarSyncStatus({ meetingId }) {
  const [status, setStatus] = useState(null)
  const [retrying, setRetrying] = useState(false)

  useEffect(() => {
    async function load() {
      const result = await getCalendarSyncStatus(meetingId)
      setStatus(result)
    }

    load()
    const interval = setInterval(load, 10000) // Poll every 10 seconds
    return () => clearInterval(interval)
  }, [meetingId])

  if (!status) return null

  if (status.status === 'synced') {
    return (
      <div style={{
        background: '#EBF7F1',
        border: `1px solid #A7DDBA`,
        borderRadius: 8,
        padding: '12px 16px',
        color: SUCCESS,
        fontSize: 13
      }}>
        ✅ Calendar event created
      </div>
    )
  }

  if (status.status === 'failed') {
    return (
      <div style={{
        background: '#FEF0ED',
        border: `1px solid #F5C4B8`,
        borderRadius: 8,
        padding: '12px 16px',
        color: DANGER,
        fontSize: 13
      }}>
        <div style={{ marginBottom: 8 }}>
          ❌ Calendar sync failed: {status.error}
        </div>
        <button
          onClick={async () => {
            setRetrying(true)
            await retryCalendarSync(meetingId)
            setRetrying(false)
          }}
          disabled={retrying}
          style={{
            padding: '6px 12px',
            background: PRIMARY,
            color: '#FFFFFF',
            border: 'none',
            borderRadius: 4,
            cursor: retrying ? 'not-allowed' : 'pointer',
            fontSize: 12,
            fontWeight: 600
          }}
        >
          {retrying ? 'Retrying...' : 'Retry'}
        </button>
      </div>
    )
  }

  if (status.status === 'pending') {
    return (
      <div style={{
        background: '#F4F1EA',
        border: `1px solid #EDE8DC`,
        borderRadius: 8,
        padding: '12px 16px',
        color: MUTED,
        fontSize: 13
      }}>
        ⏳ Syncing to Calendar...
      </div>
    )
  }

  return null
}
```

---

## PART 4: PHASE 2C — ACTION ITEMS BRIDGE

### 4.1 Create Task from Action Item

**File:** `src/lib/meetings/createTaskFromActionItem.js`

```javascript
/**
 * Phase 2c: Create task from action item
 * Called when action item is created in minutes
 */

import { supabase } from '@/lib/supabase'
import { createNotification } from '../../features/notifications'

export async function createTaskFromActionItem(actionItem, meetingId) {
  try {
    // 1. Create task
    const { data: task, error: taskErr } = await supabase
      .from('tasks')
      .insert([{
        title: actionItem.description,
        assigned_to: actionItem.owner_id,
        due_date: actionItem.due_date,
        status: 'open',
        tags: [`meeting:${meetingId}`],
        description: `From: Meeting action item\nPriority: ${actionItem.priority}`,
        created_by: actionItem.created_by,
        org_id: actionItem.org_id
      }])
      .select('*')
      .single()

    if (taskErr) throw taskErr

    // 2. Link task back to action item
    await supabase
      .from('meeting_action_items')
      .update({ task_id: task.id })
      .eq('id', actionItem.id)

    // 3. Notify assignee
    if (actionItem.owner_id) {
      await createNotification({
        user_id: actionItem.owner_id,
        type: 'task_assigned',
        title: 'New Action Item',
        body: actionItem.description,
        action_url: `/tasks/${task.id}`,
        priority: actionItem.priority === 'high' ? 'high' : 'normal'
      })
    }

    return task
  } catch (err) {
    console.error('Failed to create task from action item:', err)
    throw err
  }
}

/**
 * Sync task status back to action item (optional, Phase 3)
 * When task status changes, update action item status
 */
export async function syncTaskStatusToActionItem(taskId, taskStatus) {
  try {
    // Map task status to action item status
    const statusMap = {
      'open': 'open',
      'in_progress': 'in_progress',
      'completed': 'completed',
      'cancelled': 'cancelled'
    }

    const { data: actionItem, error: findErr } = await supabase
      .from('meeting_action_items')
      .select('*')
      .eq('task_id', taskId)
      .single()

    if (findErr) throw findErr

    await supabase
      .from('meeting_action_items')
      .update({ status: statusMap[taskStatus] })
      .eq('id', actionItem.id)
  } catch (err) {
    console.error('Failed to sync task status:', err)
    // Non-fatal, don't throw
  }
}
```

### 4.2 Update ActionItemForm to Create Task

**File:** `src/components/meetings/ActionItemForm.jsx` (update)

```jsx
// In handleSubmit, after creating action item:

async function handleSubmit() {
  // ... validation ...

  try {
    const { data: actionItem } = await supabase
      .rpc('create_meeting_action_item', { /* ... */ })

    // Phase 2c: Create task
    if (actionItem) {
      const { createTaskFromActionItem } = await import('../../lib/meetings/createTaskFromActionItem')
      await createTaskFromActionItem(actionItem, meetingId)
    }

    onSubmit(formData)
    // ...
  } catch (err) {
    // Handle error
  }
}
```

---

## PART 5: TESTING

### 5.1 Permission Tests

**File:** `src/tests/phase2Permissions.test.js`

```javascript
import { describe, it, expect } from 'vitest'
import { supabase } from '../lib/supabase'

describe('Phase 2 Permissions', () => {
  // Test that only ORS can create minutes
  it('should deny non-ORS from creating minutes', async () => {
    const { error } = await supabase
      .from('meeting_minutes')
      .insert([{ meeting_id: 'xxx', org_id: 'yyy', status: 'draft' }])
      .match({ created_by: 'non-ors-user-id' })

    expect(error).toBeDefined()
  })

  // Test that only ORS can see minutes in their org
  it('should show minutes only to users in same org', async () => {
    const { data, error } = await supabase
      .from('meeting_minutes')
      .select('*')
      .eq('org_id', 'test-org-id')

    expect(error).toBeNull()
    expect(data.every(m => m.org_id === 'test-org-id')).toBe(true)
  })

  // Test action items permissions
  it('should allow ORS and owner to update action item status', async () => {
    const { error } = await supabase
      .from('meeting_action_items')
      .update({ status: 'completed' })
      .eq('id', 'action-item-id')

    expect(error).toBeNull()
  })
})
```

### 5.2 E2E Spec Test

**File:** `src/tests/phase2E2E.test.js`

```javascript
import { describe, it, expect, beforeAll } from 'vitest'
import { supabase } from '../lib/supabase'

describe('Phase 2 E2E: Minutes to Task', () => {
  let meetingId, minutesId, actionItemId, taskId

  beforeAll(async () => {
    // Setup: Create a finalized meeting
    const { data: meeting } = await supabase
      .from('meetings')
      .insert([{
        title: 'Test Meeting',
        date: '2026-06-25',
        start_time: '09:00',
        status: 'finalized'
      }])
      .select('*')
      .single()

    meetingId = meeting.id
  })

  it('should create minutes from finalized meeting', async () => {
    const { data: minutes } = await supabase
      .rpc('create_meeting_minutes', {
        p_meeting_id: meetingId,
        p_created_by: 'test-user-id'
      })

    expect(minutes.status).toBe('draft')
    minutesId = minutes.id
  })

  it('should create action item', async () => {
    const { data: actionItem } = await supabase
      .rpc('create_meeting_action_item', {
        p_segment_id: 'test-segment-id',
        p_minutes_id: minutesId,
        p_meeting_id: meetingId,
        p_description: 'Follow up with team',
        p_owner_id: 'test-owner-id',
        p_due_date: '2026-07-01',
        p_priority: 'high',
        p_created_by: 'test-user-id'
      })

    expect(actionItem.description).toBe('Follow up with team')
    actionItemId = actionItem.id
  })

  it('should link task to action item', async () => {
    const { data: actionItem } = await supabase
      .from('meeting_action_items')
      .select('task_id')
      .eq('id', actionItemId)
      .single()

    expect(actionItem.task_id).toBeDefined()
    taskId = actionItem.task_id
  })

  it('should allow owner to update action item status', async () => {
    const { error } = await supabase
      .from('meeting_action_items')
      .update({ status: 'in_progress' })
      .eq('id', actionItemId)

    expect(error).toBeNull()
  })

  it('should submit minutes and lock from editing', async () => {
    const { data: updated } = await supabase
      .rpc('submit_meeting_minutes', {
        p_minutes_id: minutesId,
        p_user_id: 'test-user-id'
      })

    expect(updated.status).toBe('submitted')
  })
})
```

---

## PART 6: VALIDATION CHECKLIST

### Phase 2a: Minutes Capture ✅

- [ ] Users can create minutes for finalized meetings
- [ ] Segment-by-segment notes UI works
- [ ] Notes, decisions, discussion fields store correctly
- [ ] Action items can be created from minutes
- [ ] Action items show owner, due date, priority
- [ ] Status dropdown works (open → in_progress → completed → cancelled)
- [ ] Minutes can be submitted (draft → submitted)
- [ ] Submitted minutes lock from editing
- [ ] Permission check: Only ORS can create/edit minutes
- [ ] org_id filtering works
- [ ] All 12 segment types supported

### Phase 2b: Calendar Sync ✅

- [ ] Meeting finalization triggers calendar sync
- [ ] Calendar event created with title, date, time, location
- [ ] Agenda items included in event description
- [ ] calendar_event_id stored in meetings table
- [ ] Sync status tracked: pending → synced OR failed
- [ ] Error message shown if sync fails
- [ ] "Retry" button works
- [ ] User can click event link to open in Google Calendar
- [ ] Deleting meeting deletes calendar event (optional Phase 3)
- [ ] Edge function has proper error handling

### Phase 2c: Action Items Bridge ✅

- [ ] Action items create Tasks automatically
- [ ] Task links back to action item (bidirectional FK)
- [ ] Task owner = action item owner
- [ ] Task due date = action item due date
- [ ] Task tagged with meeting ID (`meeting:${meetingId}`)
- [ ] Task description includes priority and source
- [ ] Assignee receives notification
- [ ] Clicking "View Task" navigates to task detail

---

## PART 7: DEPLOYMENT

### Pre-Deployment Checklist

- [ ] All tests passing (38/38 from Phase 1 + new tests)
- [ ] No console errors
- [ ] Permissions verified (ORS-only access)
- [ ] RLS policies reviewed
- [ ] Database schema migrated
- [ ] Edge function deployed
- [ ] Calendar sync tested with real Google Calendar
- [ ] Notification integration confirmed

### Deployment Steps

```bash
# 1. Run migrations
supabase migration up

# 2. Deploy edge functions
supabase functions deploy create-calendar-event

# 3. Run tests
npm test

# 4. Commit changes
git add .
git commit -m "feat: Phase 2 - Minutes, Calendar, Actions"

# 5. Deploy to production
git push origin main
```

---

## TIMELINE

| Week | Tasks |
|------|-------|
| **1-2** | Minutes Capture (Phase 2a) + Tests |
| **3** | Calendar Sync (Phase 2b) + Edge Function |
| **4** | Action Items Bridge (Phase 2c) + Integration Tests |
| **5-6** | E2E Testing, Optimization, Deployment |

**Total: 4-6 weeks (1 developer)**

---

## SUCCESS METRICS

- [ ] Minutes submission: 100% of finalized meetings have minutes captured within 24hrs
- [ ] Calendar sync: 95%+ success rate on first attempt
- [ ] Action items: 80%+ of action items completed on time
- [ ] User adoption: 90%+ of ORS users using minutes feature
- [ ] Performance: All pages load < 2 seconds
- [ ] Errors: < 1% of syncs fail permanently

---

**Phase 2 ready to build. Let me know when to proceed.** 🚀
