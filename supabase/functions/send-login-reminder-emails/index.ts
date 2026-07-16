// Onboarding campaign: nudges users who haven't logged into Nexus in 4+ days.
// Triggered daily by pg_cron (see 20261231000003_onboarding_login_reminders.sql).
// The 4-day pacing per user and the 2026-08-14 campaign cutoff are both
// enforced in get_users_needing_login_reminder() — this function just sends.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@2.0.0";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const resendKey = Deno.env.get("RESEND_API_KEY")!;
const FRONTEND_URL = Deno.env.get("FRONTEND_URL") || "https://app.blwcannexus.ca";

const supabase = createClient(supabaseUrl, supabaseKey);
const resend = new Resend(resendKey);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function verifyServiceRole(req: Request): Promise<boolean> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return false;
  const token = authHeader.replace("Bearer ", "");
  return token === Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse(405, { error: "Method not allowed" });
  if (!(await verifyServiceRole(req))) return jsonResponse(401, { error: "Unauthorized" });

  try {
    const { data: users, error: rpcError } = await supabase.rpc(
      "get_users_needing_login_reminder",
    );

    if (rpcError) throw rpcError;
    if (!users || users.length === 0) {
      return jsonResponse(200, { message: "No reminders due", count: 0 });
    }

    let sentCount = 0;
    const errors: Array<{ userId: string; error: string }> = [];

    for (const user of users) {
      try {
        const firstName = user.first_name || user.name?.split(" ")[0] || "there";

        await resend.emails.send({
          from: "BLW CAN NEXUS <noreply@blwcannexus.ca>",
          to: user.email,
          subject: "We miss you on Nexus 👋",
          html: `
            <h2>Hi ${firstName},</h2>
            <p>It's been a few days since you last logged into <strong>BLW CAN NEXUS</strong> —
            our new home for tasks, meetings, and team updates.</p>
            <p>If you haven't had a chance to explore it yet, now's a great time to jump back in.</p>
            <p>
              <a href="${FRONTEND_URL}/login" style="background-color: #4C2A92; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
                Log in to Nexus
              </a>
            </p>
            <p style="color: #7A6F5E; font-size: 13px; margin-top: 24px;">
              You're receiving this because your team is onboarding onto Nexus. These reminders stop automatically.
            </p>
          `,
        });

        await supabase.rpc("record_login_reminder_sent", { p_user_id: user.id });
        sentCount++;
      } catch (err) {
        errors.push({ userId: user.id, error: (err as Error).message });
        console.error(`Failed to send login reminder to ${user.email}:`, err);
      }
    }

    return jsonResponse(200, { message: "Reminders processed", sentCount, errors });
  } catch (error) {
    console.error("send-login-reminder-emails error:", error);
    return jsonResponse(500, { error: (error as Error).message || "Failed to send reminders" });
  }
});
