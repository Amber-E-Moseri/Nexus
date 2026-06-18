-- Automation run log table
create table if not exists public.automation_run_log (
  id uuid primary key default gen_random_uuid(),
  automation_id uuid not null references public.automations(id) on delete cascade,
  trigger_type text not null,
  trigger_payload jsonb,
  actions_executed jsonb,  -- array of {action_type, result, error}
  success boolean not null,
  error_message text,
  ran_at timestamptz default now()
);

alter table public.automation_run_log enable row level security;

create policy "super_admin_reads_automation_run_log"
  on public.automation_run_log for select
  using (
    exists (select 1 from public.users where public.users.id = auth.uid() and role = 'super_admin')
  );

create index idx_automation_run_log_automation_id on public.automation_run_log(automation_id);
create index idx_automation_run_log_ran_at on public.automation_run_log(ran_at desc);
create index idx_automation_run_log_trigger_type on public.automation_run_log(trigger_type);

/*
DATABASE WEBHOOK SETUP INSTRUCTIONS
====================================

Create these webhooks in Supabase Dashboard → Database → Webhooks:

1. Name: automation-task-status-change
   Table: tasks
   Events: UPDATE
   URL: [SUPABASE_PROJECT_URL]/functions/v1/automation-engine
   Headers: { "Authorization": "Bearer [SERVICE_ROLE_KEY]" }

   Payload template (in Webhooks UI, use Custom):
   {
     "trigger_type": "task_status_change",
     "new_record": {{new}},
     "old_record": {{old}}
   }

2. Name: automation-task-assigned
   Table: tasks
   Events: UPDATE
   URL: [same as above]

   Payload template:
   {
     "trigger_type": "task_assigned",
     "new_record": {{new}},
     "old_record": {{old}}
   }

3. Name: automation-meeting-created
   Table: meetings
   Events: INSERT
   URL: [same as above]

   Payload template:
   {
     "trigger_type": "meeting_created",
     "record": {{new}}
   }

Note: Replace [SUPABASE_PROJECT_URL] with your project URL (e.g., https://abc123def.supabase.co)
and [SERVICE_ROLE_KEY] with your service role key from Settings → API.
*/
