import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const nexusApiKey = Deno.env.get("NEXUS_API_KEY") || "dev-key";
const nexusSpaceId = Deno.env.get("NEXUS_SPACE_ID")!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

interface RockSolidPayload {
  type: "missed_class" | "escalation";
  payload: {
    student_id: string;
    student_name: string;
    email: string;
    group_id: string;
    subgroup_id: string;
    class_option_id?: string;
    reason: string;
    source: string;
    error_code?: string;
    error_message?: string;
  };
}

interface TaskInput {
  title: string;
  description: string;
  priority: "urgent" | "high" | "medium" | "low";
  due_date?: string;
  assignee_id: string;
  space_id: string;
}

serve(async (req: Request) => {
  // Handle CORS
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "authorization, content-type",
      },
    });
  }

  // Authenticate
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.replace("Bearer ", "");

  if (token !== nexusApiKey) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const body = (await req.json()) as RockSolidPayload;
    const { type, payload } = body;

    // Look up Nexus user by group_id/subgroup_id
    const { data: mapping, error: mapError } = await supabase
      .from("rocksolid_admin_mappings")
      .select("nexus_user_id")
      .eq("group_id", payload.group_id)
      .eq("subgroup_id", payload.subgroup_id)
      .single();

    if (mapError || !mapping) {
      return new Response(
        JSON.stringify({
          error: "Admin mapping not found",
          group_id: payload.group_id,
          subgroup_id: payload.subgroup_id,
        }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    // Build task
    const taskTitle =
      type === "missed_class"
        ? `Missed Class Follow-up: ${payload.student_name}`
        : `Escalation: ${payload.student_name}`;

    const description = buildDescription(type, payload);
    const priority = type === "escalation" ? "urgent" : "high";

    const taskInput: TaskInput = {
      title: taskTitle,
      description,
      priority,
      due_date: new Date(Date.now() + 24 * 60 * 60 * 1000)
        .toISOString()
        .split("T")[0], // Due tomorrow
      assignee_id: mapping.nexus_user_id,
      space_id: nexusSpaceId,
    };

    // Create task in Nexus
    const { data: task, error: taskError } = await supabase
      .from("tasks")
      .insert([
        {
          title: taskInput.title,
          description: taskInput.description,
          priority: taskInput.priority,
          due_date: taskInput.due_date,
          assignee_id: taskInput.assignee_id,
          space_id: taskInput.space_id,
          source: "rocksolid_sync",
          created_by: mapping.nexus_user_id,
        },
      ])
      .select()
      .single();

    if (taskError || !task) {
      return new Response(
        JSON.stringify({ error: "Failed to create task", details: taskError }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    // Write audit log
    await supabase.from("rocksolid_task_links").insert([
      {
        rocksolid_type: type,
        rocksolid_payload: payload,
        nexus_task_id: task.id,
        nexus_user_id: mapping.nexus_user_id,
      },
    ]);

    return new Response(
      JSON.stringify({
        ok: true,
        nexus_task_id: task.id,
        title: task.title,
        assignee_id: mapping.nexus_user_id,
      }),
      { status: 201, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});

function buildDescription(type: string, payload: any): string {
  const lines = [
    `**Type:** ${type === "missed_class" ? "Missed Class" : "Escalation"}`,
    `**Student:** ${payload.student_name} (${payload.email})`,
    `**Student ID:** ${payload.student_id}`,
    `**Reason:** ${payload.reason}`,
  ];

  if (type === "missed_class" && payload.class_option_id) {
    lines.push(`**Class Option ID:** ${payload.class_option_id}`);
  }

  if (type === "escalation") {
    lines.push(`**Error Code:** ${payload.error_code}`);
    lines.push(`**Error Message:** ${payload.error_message}`);
  }

  lines.push(`**Source:** ${payload.source}`);
  lines.push(`**Group:** ${payload.group_id} / ${payload.subgroup_id}`);

  return lines.join("\n");
}
