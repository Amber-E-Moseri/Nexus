import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, content-type, apikey, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface ExtractRequest {
  imageUrl?: string;
  imageBase64?: string;
  pageId: string;
  fallbackToVision?: boolean;
}

interface ExtractedMetrics {
  followers: number;
  avgLikes: number;
  avgComments: number;
  avgShares: number;
  engagementRate: number;
  postsThisPeriod: number;
  storiesThisPeriod: number;
}

interface ExtractResponse {
  success: boolean;
  metrics?: ExtractedMetrics;
  method: "tesseract" | "vision" | "error";
  error?: string;
  costGuardTriggered?: boolean;
  visionTokensUsed?: number;
}

// Initialize Supabase
const supabase = createClient(
  Deno.env.get("SUPABASE_URL") || "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""
);

// Cost Guard Config
const VISION_COST_PER_TOKEN = 0.01 / 1000; // Rough estimate
const DAILY_VISION_LIMIT = 10; // USD
const TOKENS_PER_IMAGE = 500; // Estimate for screenshot analysis

// Helper: Fetch image as data URL
async function getImageDataUrl(imageUrl: string): Promise<string> {
  const response = await fetch(imageUrl);
  const blob = await response.blob();
  const buffer = await blob.arrayBuffer();
  const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
  return `data:${blob.type};base64,${base64}`;
}

// Helper: Check cost guard
async function checkCostGuard(): Promise<{
  allowed: boolean;
  todayCost: number;
  dailyLimit: number;
}> {
  const today = new Date().toISOString().split("T")[0];

  const { data: costData } = await supabase
    .from("vision_cost_guard")
    .select("cost_today_usd, daily_limit_usd, is_limit_exceeded")
    .eq("tracking_date", today)
    .single();

  const todayCost = costData?.cost_today_usd || 0;
  const dailyLimit = costData?.daily_limit_usd || DAILY_VISION_LIMIT;
  const estimatedNewCost = todayCost + TOKENS_PER_IMAGE * VISION_COST_PER_TOKEN;

  return {
    allowed: estimatedNewCost < dailyLimit,
    todayCost,
    dailyLimit,
  };
}

// Helper: Log Vision API call
async function logVisionCall(
  pageId: string,
  tokensUsed: number,
  status: "success" | "failed",
  imageUrl: string,
  errorMsg?: string
) {
  const costUsd = tokensUsed * VISION_COST_PER_TOKEN;

  await supabase.from("vision_api_calls").insert({
    page_id: pageId,
    request_type: "metrics_extraction",
    image_url: imageUrl,
    tokens_used: tokensUsed,
    cost_usd: costUsd,
    status,
    error_message: errorMsg,
  });

  // Update daily cost guard
  const today = new Date().toISOString().split("T")[0];
  const { data: existing } = await supabase
    .from("vision_cost_guard")
    .select("*")
    .eq("tracking_date", today)
    .single();

  if (existing) {
    const newCost = existing.cost_today_usd + costUsd;
    const isLimitExceeded = newCost >= (existing.daily_limit_usd || DAILY_VISION_LIMIT);

    await supabase
      .from("vision_cost_guard")
      .update({
        cost_today_usd: newCost,
        calls_today: existing.calls_today + 1,
        tokens_today: existing.tokens_today + tokensUsed,
        is_limit_exceeded: isLimitExceeded,
        updated_at: new Date().toISOString(),
      })
      .eq("tracking_date", today);
  } else {
    const newCost = costUsd;
    const isLimitExceeded = newCost >= DAILY_VISION_LIMIT;

    await supabase.from("vision_cost_guard").insert({
      tracking_date: today,
      calls_today: 1,
      tokens_today: tokensUsed,
      cost_today_usd: newCost,
      is_limit_exceeded: isLimitExceeded,
    });
  }
}

// Helper: Call Claude Vision API
async function extractWithVision(
  imageUrl: string,
  pageId: string
): Promise<{
  metrics: ExtractedMetrics | null;
  tokensUsed: number;
  error?: string;
}> {
  const prompt = `Extract Instagram metrics from this screenshot. Return ONLY valid JSON with these exact keys (numbers only):
{
  "followers": <number>,
  "avgLikes": <number>,
  "avgComments": <number>,
  "avgShares": <number>,
  "engagementRate": <number between 0-100>,
  "postsThisPeriod": <number>,
  "storiesThisPeriod": <number>
}

If you cannot extract a metric, use 0. Be as accurate as possible from what you can see.`;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": Deno.env.get("ANTHROPIC_API_KEY") || "",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 200,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "url",
                  url: imageUrl,
                },
              },
              {
                type: "text",
                text: prompt,
              },
            ],
          },
        ],
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error?.message || "Vision API failed");
    }

    const content = data.content[0]?.text || "";
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    const metrics = jsonMatch ? JSON.parse(jsonMatch[0]) : null;

    // Estimate tokens used (Claude charges per 1k tokens)
    const tokensUsed = TOKENS_PER_IMAGE;

    return { metrics, tokensUsed };
  } catch (error) {
    return {
      metrics: null,
      tokensUsed: TOKENS_PER_IMAGE,
      error: String(error),
    };
  }
}

// Main handler
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = (await req.json()) as ExtractRequest;
    const { imageUrl, imageBase64, pageId, fallbackToVision = true } = body;

    if (!imageUrl && !imageBase64) {
      return new Response(
        JSON.stringify({
          success: false,
          method: "error",
          error: "imageUrl or imageBase64 required",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check cost guard before using Vision
    const costGuardCheck = await checkCostGuard();

    let response: ExtractResponse = {
      success: false,
      method: "error",
    };

    // Try Vision API if cost guard allows and we want fallback
    if (fallbackToVision && costGuardCheck.allowed && imageUrl) {
      const visionResult = await extractWithVision(imageUrl, pageId);

      if (visionResult.metrics) {
        await logVisionCall(pageId, visionResult.tokensUsed, "success", imageUrl);

        response = {
          success: true,
          method: "vision",
          metrics: visionResult.metrics,
          visionTokensUsed: visionResult.tokensUsed,
        };
      } else {
        await logVisionCall(
          pageId,
          visionResult.tokensUsed,
          "failed",
          imageUrl,
          visionResult.error
        );

        response = {
          success: false,
          method: "error",
          error: `Vision API failed: ${visionResult.error}`,
        };
      }
    } else if (!costGuardCheck.allowed) {
      // Cost guard triggered
      response = {
        success: false,
        method: "error",
        error: `Daily Vision API limit ($${DAILY_VISION_LIMIT}) exceeded. Current: $${costGuardCheck.todayCost.toFixed(2)}`,
        costGuardTriggered: true,
      };
    } else {
      response = {
        success: false,
        method: "error",
        error: "Fallback to Vision disabled or no image URL provided",
      };
    }

    return new Response(JSON.stringify(response), {
      status: response.success ? 200 : 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({
        success: false,
        method: "error",
        error: String(error),
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
