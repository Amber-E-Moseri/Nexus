import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

serve(async (req) => {
  // Only POST/GET allowed
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
    const url = new URL(req.url);
    const campaignId = url.searchParams.get("campaign");
    const recipientEmail = url.searchParams.get("email");
    const originalUrl = url.searchParams.get("url");

    if (!campaignId || !recipientEmail || !originalUrl) {
      return new Response(
        JSON.stringify({ error: "Missing required params: campaign, email, url" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Decode URL
    const decodedUrl = decodeURIComponent(originalUrl);

    // Log the click to Supabase
    const response = await fetch(`${SUPABASE_URL}/rest/v1/campaign_link_clicks`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        campaign_id: campaignId,
        recipient_email: recipientEmail,
        link_url: decodedUrl,
        clicked_at: new Date().toISOString(),
        click_count: 1,
      }),
    });

    if (!response.ok) {
      console.error("[track-click] Upsert failed:", await response.text());
    }

    // Redirect to original URL (302 = temporary, cacheable)
    return new Response(null, {
      status: 302,
      headers: {
        Location: decodedUrl,
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
