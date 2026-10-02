import { assertEquals, assertExists } from "jsr:@std/assert";

/**
 * Contract tests for assignee_id support on POST /tasks.
 *
 * Cases:
 *   A01 — omitted assignee / null assignee (backward compatibility)
 *   A02 — valid existing assignee → task created with assignee
 *   A03 — malformed UUID → 400
 *   A04 — nonexistent but valid UUID → 400 (not 500)
 *   A05 — same external_unique_key → same canonical task (idempotency)
 *   A05b — same key, different assignee → no reassign, no second task
 *   A07 — canonical response: task.id present
 *
 * Source-contract assertions (A02-SRC) run without a live DB.
 * Live-DB assertions are gated on TEST_ASSIGNEE_ID / TEST_API_KEY env vars
 * and reported IGNORED (never silently passing) when absent.
 */

// Local Supabase serves Edge Functions at http://127.0.0.1:54321/functions/v1 (see `supabase status`).
// Override with TASK_API_URL for non-default setups.
const API_URL = Deno.env.get("TASK_API_URL") ?? "http://127.0.0.1:54321/functions/v1/task-api";
const VALID_API_KEY = Deno.env.get("TEST_API_KEY") || "";

// Optional persistence checks against PostgREST to prove "persisted", not just HTTP 201.
// Only active when TEST_DB_REST_URL and TEST_DB_SERVICE_KEY are set (local stack).
const DB_REST_URL = Deno.env.get("TEST_DB_REST_URL") ?? "";
const DB_SERVICE_KEY = Deno.env.get("TEST_DB_SERVICE_KEY") ?? "";
const HAS_DB = DB_REST_URL !== "" && DB_SERVICE_KEY !== "";

async function dbTasks(filter: string): Promise<Array<Record<string, unknown>>> {
  const res = await fetch(
    `${DB_REST_URL}/rest/v1/tasks?select=id,assignee_id,external_unique_key,title&${filter}`,
    { headers: { apikey: DB_SERVICE_KEY, Authorization: `Bearer ${DB_SERVICE_KEY}` } },
  );
  if (!res.ok) throw new Error(`db check failed: ${res.status}`);
  return await res.json();
}

async function testRequest(
  method: string,
  path: string,
  body?: Record<string, unknown>,
  apiKey?: string,
) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (apiKey) headers["x-api-key"] = apiKey;

  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const contentType = res.headers.get("content-type");
  const text = await res.text();
  const data = contentType?.includes("application/json") ? JSON.parse(text) : text;
  return { status: res.status, data };
}

// ---------------------------------------------------------------------------
// A01 — backward compatibility: no assignee
// ---------------------------------------------------------------------------
Deno.test({
  name: "A01: omitted assignee_id creates unassigned task",
  ignore: !VALID_API_KEY,
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const { status, data } = await testRequest("POST", "/tasks", {
      title: "A01 test: no assignee",
      priority: "medium",
    }, VALID_API_KEY);
    assertEquals(status, 201);
    assertExists(data.task);
    assertEquals(data.task.assignee_id, null);
  },
});

Deno.test({
  name: "A01: null assignee_id creates unassigned task",
  ignore: !VALID_API_KEY,
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const { status, data } = await testRequest("POST", "/tasks", {
      title: "A01 test: null assignee",
      priority: "medium",
      assignee_id: null,
    }, VALID_API_KEY);
    assertEquals(status, 201);
    assertExists(data.task);
    assertEquals(data.task.assignee_id, null);
  },
});

// ---------------------------------------------------------------------------
// A03 — malformed UUID → 400
// ---------------------------------------------------------------------------
Deno.test({
  name: "A03: malformed UUID assignee_id → 400",
  ignore: !VALID_API_KEY,
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const { status, data } = await testRequest("POST", "/tasks", {
      title: "A03 test: bad UUID",
      priority: "medium",
      assignee_id: "not-a-uuid",
    }, VALID_API_KEY);
    assertEquals(status, 400);
    assertEquals(typeof data.error, "string");
  },
});

// ---------------------------------------------------------------------------
// A04 — nonexistent but well-formed UUID → 400 (not 500)
// ---------------------------------------------------------------------------
Deno.test({
  name: "A04: nonexistent valid UUID assignee_id → 400 not 500",
  ignore: !VALID_API_KEY,
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const { status, data } = await testRequest("POST", "/tasks", {
      title: "A04 test: nonexistent assignee",
      priority: "medium",
      assignee_id: "00000000-0000-0000-0000-000000000000",
    }, VALID_API_KEY);
    assertEquals(status, 400);
    assertEquals(data.error, "assignee not found");
  },
});

// ---------------------------------------------------------------------------
// A02 / A07 — valid assignment + canonical response
// Reported IGNORED (never silently passing) when TEST_ASSIGNEE_ID is absent.
// ---------------------------------------------------------------------------
Deno.test({
  name: "A02/A07: valid assignee_id → 201, task.id present, task.assignee_id matches",
  ignore: !Deno.env.get("TEST_ASSIGNEE_ID"),
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const assigneeId = Deno.env.get("TEST_ASSIGNEE_ID")!;
    const { status, data } = await testRequest("POST", "/tasks", {
      title: "A02 test: valid assignee assignment",
      priority: "medium",
      assignee_id: assigneeId,
    }, VALID_API_KEY);

    assertEquals(status, 201, `expected 201, got ${status}: ${JSON.stringify(data)}`);
    assertExists(data.task);
    assertExists(data.task.id);
    assertEquals(typeof data.task.id, "string");
    assertEquals(data.task.assignee_id, assigneeId);

    if (HAS_DB) {
      const rows = await dbTasks(`id=eq.${data.task.id}`);
      assertEquals(rows.length, 1);
      assertEquals(rows[0].assignee_id, assigneeId);
    }
  },
});

// ---------------------------------------------------------------------------
// A02-SRC — source contract: INSERT payload includes assignee_id (no live DB)
// ---------------------------------------------------------------------------
Deno.test({
  name: "A02-SRC: source includes assignee_id in INSERT payload",
  fn: () => {
    const src = new TextDecoder().decode(
      Deno.readFileSync(new URL("./index.ts", import.meta.url)),
    );
    const hasAssigneeInPayload = /assignee_id:\s*body\.assignee_id/.test(src);
    assertEquals(hasAssigneeInPayload, true, "taskData INSERT must include assignee_id");

    const hasSelectOnInsert = /\.insert\(taskData\)\.select\(\)\.single\(\)/.test(src)
      || /\.insert\([^)]+\)\s*\.select\(\)/.test(src);
    assertEquals(hasSelectOnInsert, true, "INSERT must .select() so response includes all fields");
  },
});

// ---------------------------------------------------------------------------
// A04-SRC-DB-ERR — DB error must not be collapsed into 400 (source contract)
// ---------------------------------------------------------------------------
Deno.test({
  name: "A04-SRC-DB-ERR: DB error is not conflated with not-found (source)",
  fn: () => {
    const src = new TextDecoder().decode(
      Deno.readFileSync(new URL("./index.ts", import.meta.url)),
    );
    // If collapsed: `if (assigneeError || !assignee)` → both cases return 400.
    // Correct: assigneeError must throw (propagate to outer catch → 500); only !assignee → 400.
    const hasCollapsed = /if\s*\(\s*assigneeError\s*\|\|\s*!assignee\s*\)/.test(src);
    assertEquals(hasCollapsed, false, "DB error and not-found must not share the same 400 branch");

    const throwsOnDbError = /if\s*\(\s*assigneeError\s*\)\s*throw/.test(src);
    assertEquals(throwsOnDbError, true, "assigneeError must throw so the outer catch returns 500");
  },
});

// ---------------------------------------------------------------------------
// Auth — missing/invalid API key still rejected
// ---------------------------------------------------------------------------
Deno.test({
  name: "AUTH: missing x-api-key → 401",
  ignore: !VALID_API_KEY,
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const { status, data } = await testRequest("POST", "/tasks", {
      title: "auth test",
      priority: "medium",
    });
    assertEquals(status, 401);
    assertEquals(data.error, "Missing x-api-key header");
  },
});

Deno.test({
  name: "AUTH: invalid x-api-key → 401",
  ignore: !VALID_API_KEY,
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const { status, data } = await testRequest("POST", "/tasks", {
      title: "auth test",
      priority: "medium",
    }, "invalid-key-xyz");
    assertEquals(status, 401);
    assertEquals(data.error, "Invalid API key");
  },
});

// ---------------------------------------------------------------------------
// A05 — idempotency: same external_unique_key → same canonical task, no duplicate row
// ---------------------------------------------------------------------------
Deno.test({
  name: "A05: same external_unique_key → duplicate:true, same task.id",
  ignore: !VALID_API_KEY,
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const key = `a05-${crypto.randomUUID()}`;
    const first = await testRequest("POST", "/tasks", {
      title: "A05 idempotency",
      priority: "medium",
      external_unique_key: key,
    }, VALID_API_KEY);
    assertEquals(first.status, 201, JSON.stringify(first.data));
    assertExists(first.data.task.id);
    assertEquals(first.data.duplicate, undefined);

    const second = await testRequest("POST", "/tasks", {
      title: "A05 idempotency (retry)",
      priority: "medium",
      external_unique_key: key,
    }, VALID_API_KEY);
    assertEquals(second.status, 200, JSON.stringify(second.data));
    assertEquals(second.data.duplicate, true);
    assertEquals(second.data.task.id, first.data.task.id, "must return same canonical task id");

    if (HAS_DB) {
      const rows = await dbTasks(`external_unique_key=eq.${key}`);
      assertEquals(rows.length, 1, "exactly one task row for idempotency key");
    }
  },
});

// ---------------------------------------------------------------------------
// A05b — duplicate with different assignee must not reassign or create second task
// ---------------------------------------------------------------------------
Deno.test({
  name: "A05b: same key, different assignee → no reassign, no second task",
  ignore: !VALID_API_KEY || !Deno.env.get("TEST_ASSIGNEE_ID") || !Deno.env.get("TEST_ASSIGNEE_ID_2"),
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const userA = Deno.env.get("TEST_ASSIGNEE_ID")!;
    const userB = Deno.env.get("TEST_ASSIGNEE_ID_2")!;
    assertEquals(userA !== userB, true, "fixtures must be two distinct users");

    const key = `a05b-${crypto.randomUUID()}`;
    const first = await testRequest("POST", "/tasks", {
      title: "A05b idempotency",
      priority: "medium",
      external_unique_key: key,
      assignee_id: userA,
    }, VALID_API_KEY);
    assertEquals(first.status, 201, JSON.stringify(first.data));
    assertEquals(first.data.task.assignee_id, userA);

    const second = await testRequest("POST", "/tasks", {
      title: "A05b idempotency (retry, other assignee)",
      priority: "medium",
      external_unique_key: key,
      assignee_id: userB,
    }, VALID_API_KEY);
    assertEquals(second.status, 200, JSON.stringify(second.data));
    assertEquals(second.data.duplicate, true);
    assertEquals(second.data.task.id, first.data.task.id, "same canonical task id");

    if (HAS_DB) {
      const rows = await dbTasks(`external_unique_key=eq.${key}`);
      assertEquals(rows.length, 1, "no second task created");
      assertEquals(rows[0].assignee_id, userA, "original assignment preserved; duplicate must not reassign");
    }
  },
});
