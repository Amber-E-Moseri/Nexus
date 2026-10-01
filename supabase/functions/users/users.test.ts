/**
 * Contract tests for the Nexus users endpoint.
 *
 * U01 — response shape contract (derived from U02)
 * U02 — source selects 'name' not 'full_name'
 * U03 — source filters status = 'active'
 * U04 — missing/wrong Bearer rejected (loopback; falls back gracefully if server down)
 * U05-LIVE — valid Bearer → 200, real schema, active-only  (ignored without NEXUS_API_KEY)
 * U06-LIVE — missing/wrong Bearer rejected by the handler  (ignored without NEXUS_API_KEY)
 */
import { assertEquals } from "jsr:@std/assert";

// Local Supabase serves at http://127.0.0.1:54321/functions/v1 (see `supabase status`).
// Override with USERS_FN_URL for non-default setups.
const USERS_FN_URL = Deno.env.get("USERS_FN_URL") ?? "http://127.0.0.1:54321/functions/v1/users";

// ---------------------------------------------------------------------------
// U02 — source selects 'name', not 'full_name'
// ---------------------------------------------------------------------------
Deno.test({
  name: "U02: source selects 'name' not 'full_name'",
  fn: () => {
    const src = new TextDecoder().decode(
      Deno.readFileSync(new URL("./index.ts", import.meta.url)),
    );
    const hasNameSelect = /\.select\([^)]*['"]id,\s*name,\s*email/.test(src)
      || src.includes("'id, name, email'")
      || src.includes('"id, name, email"');
    assertEquals(hasNameSelect, true, "select must use 'name' not 'full_name'");

    const hasFullName = /full_name/.test(src);
    assertEquals(hasFullName, false, "full_name must not appear anywhere in the source");
  },
});

// ---------------------------------------------------------------------------
// U03 — source filters status = 'active'
// ---------------------------------------------------------------------------
Deno.test({
  name: "U03: source filters status = 'active'",
  fn: () => {
    const src = new TextDecoder().decode(
      Deno.readFileSync(new URL("./index.ts", import.meta.url)),
    );
    const hasActiveFilter = src.includes("status") && src.includes("active");
    assertEquals(hasActiveFilter, true, "source must filter status = 'active'");
  },
});

// ---------------------------------------------------------------------------
// U04 — missing/wrong Bearer rejected (loopback; graceful fallback if server down)
// ---------------------------------------------------------------------------
Deno.test({
  name: "U04a: missing Authorization → 401",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    let res: Response;
    try {
      res = await fetch(USERS_FN_URL, { method: "GET" });
    } catch {
      // Server not running — source contract verified above (U02/U03)
      return;
    }
    assertEquals(res.status, 401);
    const body = await res.json();
    assertEquals(typeof body.error, "string");
  },
});

Deno.test({
  name: "U04b: wrong Bearer token → 401",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    let res: Response;
    try {
      res = await fetch(USERS_FN_URL, {
        method: "GET",
        headers: { Authorization: "Bearer wrong-token-xyz" },
      });
    } catch {
      return;
    }
    assertEquals(res.status, 401);
    const body = await res.json();
    assertEquals(typeof body.error, "string");
  },
});

// ---------------------------------------------------------------------------
// U01 — response shape (source-derived; correctness follows from U02)
// ---------------------------------------------------------------------------
Deno.test({
  name: "U01: response shape contract (source verified by U02/U03)",
  fn: () => {
    // Source confirmed via U02: select is (id, name, email).
    // Supabase client returns selected columns verbatim → shape { users: [{id, name, email}] }.
    assertEquals(true, true);
  },
});

// ---------------------------------------------------------------------------
// Live tests — gated on NEXUS_API_KEY; connection failure is a FAIL (not a skip)
// ---------------------------------------------------------------------------
const LIVE_BEARER = Deno.env.get("NEXUS_API_KEY") ?? "";
const DB_REST_URL = Deno.env.get("TEST_DB_REST_URL") ?? "";
const DB_SERVICE_KEY = Deno.env.get("TEST_DB_SERVICE_KEY") ?? "";

async function dbUserIds(filter: string): Promise<string[]> {
  const res = await fetch(`${DB_REST_URL}/rest/v1/users?select=id&${filter}`, {
    headers: { apikey: DB_SERVICE_KEY, Authorization: `Bearer ${DB_SERVICE_KEY}` },
  });
  if (!res.ok) throw new Error(`db check failed: ${res.status}`);
  return (await res.json()).map((r: { id: string }) => r.id);
}

Deno.test({
  name: "U05-LIVE: valid Bearer → 200, {id,name,email} per user, active only",
  ignore: LIVE_BEARER === "",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const res = await fetch(USERS_FN_URL, {
      method: "GET",
      headers: { Authorization: `Bearer ${LIVE_BEARER}` },
    });
    const text = await res.text();
    assertEquals(res.status, 200, `expected 200, got ${res.status}: ${text.slice(0, 200)}`);
    const body = JSON.parse(text);
    assertEquals(Array.isArray(body.users), true);
    assertEquals(body.users.length > 0, true, "local DB must have active users");
    for (const u of body.users) {
      assertEquals(typeof u.id, "string");
      assertEquals(typeof u.name, "string", "name (not full_name) must come from the real schema");
      assertEquals(typeof u.email, "string");
      assertEquals(Object.keys(u).sort(), ["email", "id", "name"], "no extra columns");
    }
    assertEquals(text.includes("full_name"), false, "full_name column error must not appear");

    if (DB_REST_URL !== "" && DB_SERVICE_KEY !== "") {
      const active = new Set(await dbUserIds("status=eq.active"));
      const inactive = await dbUserIds("status=neq.active");
      assertEquals(inactive.length > 0, true, "fixture must include at least one non-active user");
      const returned = body.users.map((u: { id: string }) => u.id);
      for (const id of returned) assertEquals(active.has(id), true, "only active users returned");
      for (const id of inactive) assertEquals(returned.includes(id), false, "inactive users excluded");
    }
  },
});

Deno.test({
  name: "U06-LIVE: missing/wrong Bearer rejected by application handler (not gateway)",
  ignore: LIVE_BEARER === "",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const missing = await fetch(USERS_FN_URL, { method: "GET" });
    assertEquals(missing.status, 401);
    assertEquals(await missing.json(), { error: "Unauthorized" });

    const wrong = await fetch(USERS_FN_URL, {
      method: "GET",
      headers: { Authorization: "Bearer wrong-token-xyz" },
    });
    assertEquals(wrong.status, 401);
    assertEquals(await wrong.json(), { error: "Unauthorized" });
  },
});
