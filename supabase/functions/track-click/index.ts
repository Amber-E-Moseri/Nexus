import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const SUPABASE_URL          = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("OK", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }

  try {
    const url            = new URL(req.url);
    const campaignId     = url.searchParams.get("campaign");
    const recipientEmail = url.searchParams.get("email");
    const originalUrl    = url.searchParams.get("url");

    if (!campaignId || !recipientEmail || !originalUrl) {
      return new Response(
        JSON.stringify({ error: "Missing required params: campaign, email, url" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const decodedUrl = decodeURIComponent(originalUrl);

    // Use the record_campaign_click RPC so click_count increments correctly
    // on repeated clicks, and so the service role key bypasses RLS.
    const rpcRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/record_campaign_click`, {
      method: "POST",
      headers: {
        apikey:         SUPABASE_SERVICE_ROLE_KEY,
        Authorization:  `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        p_campaign_id:     campaignId,
        p_recipient_email: recipientEmail,
        p_link_url:        decodedUrl,
      }),
    });

    if (!rpcRes.ok) {
      console.error("[track-click] RPC failed:", await rpcRes.text());
    }

    return new Response(null, {
      status: 302,
      headers: {
        Location:        decodedUrl,
        "Cache-Control": "no-cache, no-store, must-revalidate",
      },
    });
  } catch (error) {
    console.error("[track-click] Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
