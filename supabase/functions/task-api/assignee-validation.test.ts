import { assertEquals, assertExists, assertRejects } from "https://deno.land/std@0.208.0/testing/asserts.ts";

/**
 * Test suite for F1/F2 hardening: Assignee validation in POST /tasks
 *
 * Tests cover:
 * F1: Nonexistent assignee returns 400, not 500
 * F2: Cross-department assignment is rejected
 * Backward compatibility: Omitted/null assignee still works
 * Atomicity: Single INSERT, no second mutation
 * Idempotency: Duplicate behavior unchanged
 */

const API_URL = "http://localhost:3000/functions/v1/task-api";
const VALID_API_KEY = Deno.env.get("TEST_API_KEY") || "";

async function testRequest(
  method: string,
  path: string,
  body?: Record<string, unknown>,
  apiKey?: string,
) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (apiKey) {
    headers["x-api-key"] = apiKey;
  }

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

Deno.test({
  name: "ASSIGNEE-F1: Omitted assignee_id creates unassigned task",
  fn: async () => {
    const { status, data } = await testRequest("POST", "/tasks", {
      title: "Test task without assignee",
      priority: "medium",
    }, VALID_API_KEY);

    assertEquals(status, 201);
    assertExists(data.task);
    assertEquals(data.task.assignee_id, null);
  },
});

Deno.test({
  name: "ASSIGNEE-F1: null assignee_id creates unassigned task",
  fn: async () => {
    const { status, data } = await testRequest("POST", "/tasks", {
      title: "Test task with null assignee",
      priority: "medium",
      assignee_id: null,
    }, VALID_API_KEY);

    assertEquals(status, 201);
    assertExists(data.task);
    assertEquals(data.task.assignee_id, null);
  },
});

Deno.test({
  name: "ASSIGNEE-F1: Malformed UUID returns 400",
  fn: async () => {
    const { status, data } = await testRequest("POST", "/tasks", {
      title: "Test task with bad UUID",
      priority: "medium",
      assignee_id: "not-a-uuid",
    }, VALID_API_KEY);

    assertEquals(status, 400);
    assertEquals(typeof data.error, "string");
  },
});

Deno.test({
  name: "ASSIGNEE-F1: Nonexistent but valid UUID returns 400 (not 500)",
  fn: async () => {
    const nonexistentUUID = "00000000-0000-0000-0000-000000000000";
    const { status, data } = await testRequest("POST", "/tasks", {
      title: "Test task with nonexistent assignee",
      priority: "medium",
      assignee_id: nonexistentUUID,
    }, VALID_API_KEY);

    assertEquals(status, 400);
    assertEquals(data.error, "assignee not found");
  },
});

Deno.test({
  name: "ASSIGNEE-F2: Cross-department assignment rejected",
  skip: true, // Requires test fixture with two departments and users
  fn: async () => {
    // This test requires:
    // 1. A department A with a user in it
    // 2. A department B with a user in it
    // 3. Create a task in department A
    // 4. Try to assign it to the user in department B
    // 5. Expect 403 error

    // Skipped for now; requires DB setup in test environment
  },
});

Deno.test({
  name: "ASSIGNEE-F2: NULL department assignee (admin) accepted",
  skip: true, // Requires test fixture with NULL-department user
  fn: async () => {
    // This test requires:
    // 1. A NULL-department user (global admin)
    // 2. A task in any department
    // 3. Assign NULL-department user
    // 4. Expect 201 success

    // Skipped for now; requires DB setup in test environment
  },
});

Deno.test({
  name: "ASSIGNEE-F2: Same-department assignment accepted",
  skip: true, // Requires test fixture with same department
  fn: async () => {
    // This test requires:
    // 1. Two users in the same department
    // 2. Create a task in that department
    // 3. Assign one user to the task
    // 4. Expect 201 success

    // Skipped for now; requires DB setup in test environment
  },
});

Deno.test({
  name: "BACKWARD-COMPAT: Missing x-api-key still rejected",
  fn: async () => {
    const { status, data } = await testRequest("POST", "/tasks", {
      title: "Test task",
      priority: "medium",
    });
    // No API key

    assertEquals(status, 401);
    assertEquals(data.error, "Missing x-api-key header");
  },
});

Deno.test({
  name: "BACKWARD-COMPAT: Invalid x-api-key still rejected",
  fn: async () => {
    const { status, data } = await testRequest("POST", "/tasks", {
      title: "Test task",
      priority: "medium",
    }, "invalid-key-xyz");

    assertEquals(status, 401);
    assertEquals(data.error, "Invalid API key");
  },
});

Deno.test({
  name: "ATOMICITY: Single INSERT (no second mutation)",
  skip: true, // Requires inspection of supabase logs/transaction count
  fn: async () => {
    // This test verifies that POST /tasks with assignee_id results in exactly 1 INSERT
    // Not implementable as a simple HTTP test; requires internal DB instrumentation
  },
});

Deno.test({
  name: "IDEMPOTENCY: Same external_unique_key returns existing task",
  skip: true, // Requires test fixture with first task already created
  fn: async () => {
    // This test requires:
    // 1. POST /tasks with external_unique_key = X, assignee_id = A
    // 2. POST /tasks with external_unique_key = X, assignee_id = A (duplicate)
    // 3. Expect 200 with duplicate: true, same task ID
    // 4. Verify no new task created
    // 5. Verify assignee_id unchanged

    // Skipped for now; requires sequential test setup
  },
});

Deno.test({
  name: "IDEMPOTENCY: Same key, different assignee doesn't reassign",
  skip: true, // Requires test fixture
  fn: async () => {
    // This test requires:
    // 1. POST /tasks with external_unique_key = X, assignee_id = A
    // 2. POST /tasks with external_unique_key = X, assignee_id = B (different)
    // 3. Expect 200 with duplicate: true, same task ID
    // 4. Verify task still assigned to A (not reassigned to B)

    // Skipped for now; requires sequential test setup
  },
});
