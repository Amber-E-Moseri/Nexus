import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@2.0.0";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const resendKey = Deno.env.get("RESEND_API_KEY")!;

const supabase = createClient(supabaseUrl, supabaseKey);
const resend = new Resend(resendKey);

serve(async (req: Request) => {
  try {
    const { reminderType } = await req.json(); // '3d' or '1d'

    // Get campaigns needing reminders
    const { data: reminders } = await supabase.rpc(
      "queue_invitation_reminders",
      { p_reminder_type: reminderType }
    );

    if (!reminders || reminders.length === 0) {
      return new Response(
        JSON.stringify({ message: "No reminders to send", count: 0 }),
        { status: 200 }
      );
    }

    let sentCount = 0;

    for (const reminder of reminders) {
      const { campaign_id, reminder_count } = reminder;

      // Get campaign & recipients needing reminder
      const { data: campaign } = await supabase
        .from("invitation_campaigns")
        .select("*")
        .eq("id", campaign_id)
        .single();

      const { data: recipients } = await supabase
        .from("invitation_recipients")
        .select("*")
        .eq("campaign_id", campaign_id)
        .eq("rsvp_response", "pending"); // Only remind those who haven't RSVP'd

      if (!recipients) continue;

      // Send reminder to each pending recipient
      for (const recipient of recipients) {
        try {
          const rsvpLink = `https://nexus.blw.local/rsvp?token=${recipient.rsvp_token}`;

          await resend.emails.send({
            from: "reminders@nexus.blw.local",
            to: recipient.recipient_email,
            subject: `Reminder: ${campaign.title} is ${reminderType === "3d" ? "in 3 days" : "tomorrow"}`,
            html: `
              <h2>Gentle Reminder! 📬</h2>
              <p>Hi ${recipient.recipient_name || "there"},</p>
              <p>This is a friendly reminder that <strong>${campaign.title}</strong>
              is happening ${reminderType === "3d" ? "in 3 days" : "tomorrow"}!</p>
              <p>
                <strong>📅 ${new Date(campaign.event_date).toLocaleDateString()}</strong><br/>
                <strong>🕐 ${campaign.event_time}</strong><br/>
                ${campaign.event_location ? `<strong>📍 ${campaign.event_location}</strong>` : ""}
              </p>
              <p><a href="${rsvpLink}" style="background-color: #7C3AED; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
                Respond to Invitation
              </a></p>
              <p>See you there!</p>
            `,
          });
          sentCount++;
        } catch (emailErr) {
          console.error(
            `Error sending reminder to ${recipient.recipient_email}:`,
            emailErr
          );
        }
      }
    }

    return new Response(
      JSON.stringify({ success: true, remindersSent: sentCount }),
      { status: 200 }
    );
  } catch (error) {
    console.error("Reminder function error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
    });
  }
});
