import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, content-type, apikey, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface GradeRequest {
  pageId: string;
  metricsId: string;
  metrics: {
    followers: number;
    followerGrowth: number;
    avgLikes: number;
    avgComments: number;
    avgShares: number;
    engagementRate: number;
    postsThisPeriod: number;
    storiesThisPeriod: number;
    avgPostQuality: number;
  };
}

interface CategoryGrade {
  grade: "A" | "B" | "C" | "D" | "F";
  score: number;
}

interface GradeResponse {
  success: boolean;
  overallGrade?: "A" | "B" | "C" | "D" | "F";
  overallScore?: number;
  categoryGrades?: {
    growth: CategoryGrade;
    engagement: CategoryGrade;
    contentQuality: CategoryGrade;
    consistency: CategoryGrade;
  };
  strengths?: string;
  weaknesses?: string;
  recommendations?: string;
  error?: string;
}

// Initialize Supabase
const supabase = createClient(
  Deno.env.get("SUPABASE_URL") || "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""
);

// Helper: Score to letter grade
function scoreToGrade(score: number): "A" | "B" | "C" | "D" | "F" {
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  if (score >= 60) return "D";
  return "F";
}

// Helper: Grade with Claude
async function gradeWithClaude(
  metrics: GradeRequest["metrics"]
): Promise<{
  overallScore: number;
  growth: number;
  engagement: number;
  contentQuality: number;
  consistency: number;
  strengths: string;
  weaknesses: string;
  recommendations: string;
}> {
  const prompt = `You are an Instagram engagement expert. Grade this page's performance based on the metrics provided.

METRICS:
- Followers: ${metrics.followers}
- Follower Growth: ${metrics.followerGrowth}%
- Avg Likes per Post: ${metrics.avgLikes}
- Avg Comments per Post: ${metrics.avgComments}
- Avg Shares per Post: ${metrics.avgShares}
- Engagement Rate: ${metrics.engagementRate}%
- Posts This Period: ${metrics.postsThisPeriod}
- Stories This Period: ${metrics.storiesThisPeriod}
- Avg Post Quality (1-10): ${metrics.avgPostQuality}

Return ONLY valid JSON with these exact keys (numbers 0-100, strings):
{
  "overallScore": <number 0-100>,
  "growth": <score 0-100>,
  "engagement": <score 0-100>,
  "contentQuality": <score 0-100>,
  "consistency": <score 0-100>,
  "strengths": "<1-2 sentence summary of what's working>",
  "weaknesses": "<1-2 sentence summary of what needs improvement>",
  "recommendations": "<2-3 actionable recommendations separated by | symbol>"
}

Guidelines:
- Growth: Judge based on follower count and growth percentage. Ministry pages 1-10K: Good growth if 5%+. 10K+: Good if 2%+.
- Engagement: Avg likes/comments/shares relative to followers. Engagement rate >3% is excellent.
- ContentQuality: Judge based on average post quality score.
- Consistency: Judge based on posts/stories per period. Ministry content should be 3-5 posts + 5+ stories per week.
- Overall: Weighted average of all categories.`;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": Deno.env.get("ANTHROPIC_API_KEY") || "",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 300,
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error?.message || "Claude API failed");
    }

    const content = data.content[0]?.text || "";
    const jsonMatch = content.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
      throw new Error("Could not parse Claude response");
    }

    const parsed = JSON.parse(jsonMatch[0]);

    return {
      overallScore: Math.min(100, Math.max(0, parsed.overallScore || 0)),
      growth: Math.min(100, Math.max(0, parsed.growth || 0)),
      engagement: Math.min(100, Math.max(0, parsed.engagement || 0)),
      contentQuality: Math.min(100, Math.max(0, parsed.contentQuality || 0)),
      consistency: Math.min(100, Math.max(0, parsed.consistency || 0)),
      strengths: parsed.strengths || "See recommendations below",
      weaknesses: parsed.weaknesses || "Room for improvement across all metrics",
      recommendations: parsed.recommendations || "Continue building consistent content",
    };
  } catch (error) {
    console.error("Claude grading error:", error);
    throw error;
  }
}

// Main handler
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = (await req.json()) as GradeRequest;
    const { pageId, metricsId, metrics } = body;

    if (!pageId || !metricsId || !metrics) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "pageId, metricsId, and metrics required",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get grades from Claude
    const grades = await gradeWithClaude(metrics);

    const overallGrade = scoreToGrade(grades.overallScore);
    const growthGrade = scoreToGrade(grades.growth);
    const engagementGrade = scoreToGrade(grades.engagement);
    const contentQualityGrade = scoreToGrade(grades.contentQuality);
    const consistencyGrade = scoreToGrade(grades.consistency);

    // Save insights to database
    const { error: insertError } = await supabase
      .from("instagram_insights")
      .insert({
        page_id: pageId,
        metrics_id: metricsId,
        overall_grade: overallGrade,
        overall_score: grades.overallScore,
        growth_grade: growthGrade,
        engagement_grade: engagementGrade,
        content_quality_grade: contentQualityGrade,
        consistency_grade: consistencyGrade,
        strengths: grades.strengths,
        weaknesses: grades.weaknesses,
        recommendations: grades.recommendations,
        graded_by: "claude-ai",
        model_version: "claude-3-5-sonnet-20241022",
      });

    if (insertError) {
      throw new Error(`Failed to save insights: ${insertError.message}`);
    }

    const response: GradeResponse = {
      success: true,
      overallGrade,
      overallScore: grades.overallScore,
      categoryGrades: {
        growth: { grade: growthGrade, score: grades.growth },
        engagement: { grade: engagementGrade, score: grades.engagement },
        contentQuality: { grade: contentQualityGrade, score: grades.contentQuality },
        consistency: { grade: consistencyGrade, score: grades.consistency },
      },
      strengths: grades.strengths,
      weaknesses: grades.weaknesses,
      recommendations: grades.recommendations,
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({
        success: false,
        error: String(error),
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
