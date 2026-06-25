-- Create milestone_templates table
CREATE TABLE IF NOT EXISTS public.milestone_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  department_id UUID REFERENCES public.departments(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  offset_days INTEGER NOT NULL CHECK (offset_days >= -30 AND offset_days <= 365),
  is_default BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, name)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_milestone_templates_user_id ON public.milestone_templates(user_id);
CREATE INDEX IF NOT EXISTS idx_milestone_templates_department_id ON public.milestone_templates(department_id);
CREATE INDEX IF NOT EXISTS idx_milestone_templates_is_default ON public.milestone_templates(is_default);

-- Insert default templates for all users
-- Note: These are pre-defined templates, not user-specific
INSERT INTO public.milestone_templates (user_id, name, description, offset_days, is_default)
SELECT
  id as user_id,
  'Due date' as name,
  'Milestone on the same day as task due date' as description,
  0 as offset_days,
  TRUE as is_default
FROM public.users
ON CONFLICT (user_id, name) DO NOTHING;

INSERT INTO public.milestone_templates (user_id, name, description, offset_days, is_default)
SELECT
  id as user_id,
  '1 day before' as name,
  'Milestone 1 day before task due date' as description,
  -1 as offset_days,
  TRUE as is_default
FROM public.users
ON CONFLICT (user_id, name) DO NOTHING;

INSERT INTO public.milestone_templates (user_id, name, description, offset_days, is_default)
SELECT
  id as user_id,
  '3 days before' as name,
  'Milestone 3 days before task due date' as description,
  -3 as offset_days,
  TRUE as is_default
FROM public.users
ON CONFLICT (user_id, name) DO NOTHING;

INSERT INTO public.milestone_templates (user_id, name, description, offset_days, is_default)
SELECT
  id as user_id,
  '1 week before' as name,
  'Milestone 1 week before task due date' as description,
  -7 as offset_days,
  TRUE as is_default
FROM public.users
ON CONFLICT (user_id, name) DO NOTHING;

-- RPC function to apply a template to a task
CREATE OR REPLACE FUNCTION apply_milestone_template(
  p_task_id UUID,
  p_user_id UUID,
  p_template_id UUID
)
RETURNS TABLE(
  milestone_id UUID,
  milestone_date DATE,
  label TEXT
) AS $$
DECLARE
  v_task_due_date DATE;
  v_template_offset INTEGER;
  v_template_name TEXT;
  v_milestone_date DATE;
  v_milestone RECORD;
BEGIN
  -- Get task due date
  SELECT due_date INTO v_task_due_date
  FROM tasks
  WHERE id = p_task_id;

  IF v_task_due_date IS NULL THEN
    RAISE EXCEPTION 'Task not found or has no due date';
  END IF;

  -- Get template offset and name
  SELECT offset_days, name INTO v_template_offset, v_template_name
  FROM milestone_templates
  WHERE id = p_template_id AND user_id = p_user_id;

  IF v_template_offset IS NULL THEN
    RAISE EXCEPTION 'Template not found or does not belong to user';
  END IF;

  -- Calculate milestone date
  v_milestone_date := (v_task_due_date + v_template_offset * INTERVAL '1 day')::DATE;

  -- Create or update milestone
  INSERT INTO task_milestones (task_id, user_id, milestone_date, label)
  VALUES (p_task_id, p_user_id, v_milestone_date, v_template_name)
  ON CONFLICT (task_id, user_id) DO UPDATE SET
    milestone_date = v_milestone_date,
    label = v_template_name,
    updated_at = CURRENT_TIMESTAMP
  RETURNING id, milestone_date, label INTO v_milestone;

  -- Create reminders for the milestone
  PERFORM create_milestone_reminders(v_milestone.id, p_user_id);

  RETURN QUERY SELECT v_milestone.id, v_milestone.milestone_date, v_milestone.label;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Grant permissions
GRANT EXECUTE ON FUNCTION apply_milestone_template(UUID, UUID, UUID) TO authenticated;
