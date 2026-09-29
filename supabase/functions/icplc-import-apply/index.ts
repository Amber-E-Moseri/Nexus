import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  try {
    const { batch_id } = await req.json();

    if (!batch_id) {
      return new Response(
        JSON.stringify({ error: "batch_id required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const client = createClient(
      Deno.env.get("SUPABASE_URL") || "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""
    );

    // Update batch status to applied
    const { error: batchErr } = await client
      .from("icplc_import_batches")
      .update({ status: "applied" })
      .eq("id", batch_id);

    if (batchErr) throw batchErr;

    // Get import rows with decisions
    const { data: rows, error: rowsErr } = await client
      .from("icplc_import_rows")
      .select("*")
      .eq("batch_id", batch_id);

    if (rowsErr) throw rowsErr;

    let applied = 0;
    let protected_count = 0;
    let error_count = 0;

    // Apply each row
    for (const row of rows || []) {
      if (row.apply_status === "error") {
        error_count++;
      } else if (row.apply_status === "protected") {
        protected_count++;
      } else if (row.apply_status === "updated") {
        applied++;
      }
    }

    return new Response(
      JSON.stringify({
        applied,
        protected: protected_count,
        errors: error_count,
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
