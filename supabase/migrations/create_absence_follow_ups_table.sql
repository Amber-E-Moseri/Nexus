-- Create absence_follow_ups table
CREATE TABLE IF NOT EXISTS public.absence_follow_ups (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

  -- References
  meeting_id UUID NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  department_id UUID NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,

  -- Email details
  email_subject TEXT,
  email_body TEXT,
  email_status VARCHAR(50) DEFAULT 'draft',
  -- Status: 'draft' | 'scheduled' | 'sent' | 'failed'

  -- Scheduling
  scheduled_send_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,

  -- Follow-up metadata
  reason VARCHAR(50),
  -- Reason: 'absent' | 'late' | 'excused' | 'no_show'

  notes TEXT,

  -- Audit
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraints
  CONSTRAINT valid_email_status CHECK (email_status IN ('draft', 'scheduled', 'sent', 'failed')),
  CONSTRAINT valid_reason CHECK (reason IN ('absent', 'late', 'excused', 'no_show')),
  CONSTRAINT unique_follow_up UNIQUE (meeting_id, user_id)
)

-- Enable RLS
ALTER TABLE public.absence_follow_ups ENABLE ROW LEVEL SECURITY

-- Create indexes
CREATE INDEX idx_absence_follow_ups_meeting_id ON public.absence_follow_ups(meeting_id)
CREATE INDEX idx_absence_follow_ups_user_id ON public.absence_follow_ups(user_id)
CREATE INDEX idx_absence_follow_ups_department_id ON public.absence_follow_ups(department_id)
CREATE INDEX idx_absence_follow_ups_email_status ON public.absence_follow_ups(email_status)
CREATE INDEX idx_absence_follow_ups_created_at ON public.absence_follow_ups(created_at)

-- RLS Policy 1: Users can view follow-ups for meetings in their department
CREATE POLICY absence_follow_ups_select_policy
  ON public.absence_follow_ups
  FOR SELECT
  USING (
    department_id IN (
      SELECT department_id FROM public.users WHERE id = auth.uid()
    )
  )

-- RLS Policy 2: Users can insert follow-ups for meetings in their department
CREATE POLICY absence_follow_ups_insert_policy
  ON public.absence_follow_ups
  FOR INSERT
  WITH CHECK (
    department_id IN (
      SELECT department_id FROM public.users WHERE id = auth.uid()
    )
  )

-- RLS Policy 3: Users can update follow-ups in their department
CREATE POLICY absence_follow_ups_update_policy
  ON public.absence_follow_ups
  FOR UPDATE
  USING (
    department_id IN (
      SELECT department_id FROM public.users WHERE id = auth.uid()
    )
  )
  WITH CHECK (
    department_id IN (
      SELECT department_id FROM public.users WHERE id = auth.uid()
    )
  )

-- RLS Policy 4: Users can delete follow-ups in their department
CREATE POLICY absence_follow_ups_delete_policy
  ON public.absence_follow_ups
  FOR DELETE
  USING (
    department_id IN (
      SELECT department_id FROM public.users WHERE id = auth.uid()
    )
  )

-- Trigger: auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_absence_follow_ups_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW()
  RETURN NEW
END
$$ LANGUAGE plpgsql

CREATE TRIGGER absence_follow_ups_timestamp
BEFORE UPDATE ON public.absence_follow_ups
FOR EACH ROW
EXECUTE FUNCTION public.update_absence_follow_ups_timestamp()
