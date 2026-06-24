-- Create milestone_reminders table for tracking reminder status
CREATE TABLE IF NOT EXISTS public.milestone_reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_milestone_id UUID NOT NULL REFERENCES public.task_milestones(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  reminder_date DATE NOT NULL,
  reminder_type TEXT NOT NULL CHECK (reminder_type IN ('3_days_before', '1_day_before', 'on_day')),
  is_sent BOOLEAN DEFAULT FALSE,
  sent_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_milestone_reminders_user_id ON public.milestone_reminders(user_id);
CREATE INDEX IF NOT EXISTS idx_milestone_reminders_task_milestone_id ON public.milestone_reminders(task_milestone_id);
CREATE INDEX IF NOT EXISTS idx_milestone_reminders_reminder_date ON public.milestone_reminders(reminder_date);
CREATE INDEX IF NOT EXISTS idx_milestone_reminders_is_sent ON public.milestone_reminders(is_sent);

-- RPC function to create reminders for a milestone
CREATE OR REPLACE FUNCTION create_milestone_reminders(
  p_task_milestone_id UUID,
  p_user_id UUID
)
RETURNS TABLE(
  reminder_id UUID,
  reminder_date DATE,
  reminder_type TEXT
) AS $$
DECLARE
  v_milestone_date DATE;
BEGIN
  -- Get the milestone date
  SELECT milestone_date INTO v_milestone_date
  FROM task_milestones
  WHERE id = p_task_milestone_id AND user_id = p_user_id;

  IF v_milestone_date IS NULL THEN
    RAISE EXCEPTION 'Milestone not found or does not belong to user';
  END IF;

  -- Delete existing reminders for this milestone
  DELETE FROM milestone_reminders
  WHERE task_milestone_id = p_task_milestone_id;

  -- Create 3 reminders: 3 days before, 1 day before, and on day
  RETURN QUERY
  INSERT INTO milestone_reminders (task_milestone_id, user_id, reminder_date, reminder_type)
  VALUES
    (p_task_milestone_id, p_user_id, (v_milestone_date - INTERVAL '3 days')::DATE, '3_days_before'),
    (p_task_milestone_id, p_user_id, (v_milestone_date - INTERVAL '1 day')::DATE, '1_day_before'),
    (p_task_milestone_id, p_user_id, v_milestone_date, 'on_day')
  RETURNING milestone_reminders.id, milestone_reminders.reminder_date, milestone_reminders.reminder_type;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Grant permissions
GRANT EXECUTE ON FUNCTION create_milestone_reminders(UUID, UUID) TO authenticated;
