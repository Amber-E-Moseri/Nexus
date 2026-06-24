import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface MilestoneReminder {
  id: string
  task_milestone_id: string
  user_id: string
  reminder_date: string
  reminder_type: string
  task?: {
    id: string
    title: string
    due_date: string
  }
  milestone?: {
    id: string
    milestone_date: string
    label: string
  }
  user?: {
    id: string
    name: string
    email: string
  }
}

export async function handler(req: Request) {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') || '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    )

    const today = new Date().toISOString().split('T')[0]

    // Get all reminders due today that haven't been sent
    const { data: reminders, error: remindersError } = await supabase
      .from('milestone_reminders')
      .select(`
        id,
        task_milestone_id,
        user_id,
        reminder_date,
        reminder_type,
        task_milestones!inner (
          id,
          milestone_date,
          label,
          task_id,
          tasks!inner (
            id,
            title,
            due_date
          )
        ),
        users (
          id,
          name,
          email
        )
      `)
      .eq('reminder_date', today)
      .eq('is_sent', false)

    if (remindersError) {
      throw new Error(`Failed to fetch reminders: ${remindersError.message}`)
    }

    if (!reminders || reminders.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: 'No reminders to send today' }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        }
      )
    }

    let sentCount = 0
    const errors: string[] = []

    for (const reminder of reminders) {
      try {
        // Extract nested data
        const milestone = (reminder as any).task_milestones
        const user = (reminder as any).users
        const task = milestone?.tasks

        if (!user?.email || !task || !milestone) {
          console.log(`Skipping reminder ${reminder.id}: missing required data`)
          continue
        }

        // Send email via Resend (or your email service)
        const emailContent = buildEmailContent(
          task.title,
          milestone.milestone_date,
          reminder.reminder_type,
          user.name
        )

        // Send via Resend if configured, otherwise log
        if (Deno.env.get('RESEND_API_KEY')) {
          const resendResponse = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${Deno.env.get('RESEND_API_KEY')}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              from: 'noreply@clickup.local',
              to: user.email,
              subject: getEmailSubject(task.title, reminder.reminder_type),
              html: emailContent,
            }),
          })

          if (!resendResponse.ok) {
            throw new Error(`Resend API error: ${resendResponse.statusText}`)
          }
        }

        // Mark reminder as sent
        const { error: updateError } = await supabase
          .from('milestone_reminders')
          .update({
            is_sent: true,
            sent_at: new Date().toISOString(),
          })
          .eq('id', reminder.id)

        if (updateError) {
          throw updateError
        }

        sentCount++
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err)
        errors.push(`Reminder ${reminder.id}: ${errorMessage}`)
        console.error(`Error sending reminder ${reminder.id}:`, err)
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Sent ${sentCount} milestone reminders`,
        errors: errors.length > 0 ? errors : undefined,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err)
    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    )
  }
}

function getEmailSubject(taskTitle: string, reminderType: string): string {
  const typeMap: Record<string, string> = {
    '3_days_before': '3 days until milestone',
    '1_day_before': '1 day until milestone',
    'on_day': 'Milestone due today',
  }
  return `${typeMap[reminderType] || 'Milestone reminder'}: ${taskTitle}`
}

function buildEmailContent(
  taskTitle: string,
  milestoneDate: string,
  reminderType: string,
  userName: string
): string {
  const typeMessages: Record<string, string> = {
    '3_days_before': '3 days from now',
    '1_day_before': 'tomorrow',
    'on_day': 'today',
  }

  const message = typeMessages[reminderType] || 'soon'

  return `
    <h2>Milestone Reminder</h2>
    <p>Hi ${userName},</p>
    <p>Your milestone for <strong>${taskTitle}</strong> is due <strong>${message}</strong> (${milestoneDate}).</p>
    <p>Please review and prepare accordingly.</p>
    <hr />
    <p><small>This is an automated reminder from ClickUp. You can adjust reminder settings in your account.</small></p>
  `
}

Deno.serve(handler)
