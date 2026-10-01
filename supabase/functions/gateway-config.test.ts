import { assertEquals } from "https://deno.land/std@0.208.0/testing/asserts.ts";

// These two functions implement their own application-level authentication
// (x-api-key and Bearer respectively). The Supabase gateway must not perform
// JWT verification before the function code runs, otherwise all requests are
// rejected before reaching the auth handler.

const toml = new TextDecoder().decode(
  Deno.readFileSync(new URL("../config.toml", import.meta.url)),
);

Deno.test({
  name: "gateway: task-api has verify_jwt = false",
  fn: () => {
    const match = toml.match(/\[functions\."task-api"\][^\[]*verify_jwt\s*=\s*(\S+)/s);
    assertEquals(match?.[1], "false", 'config.toml must have [functions."task-api"] verify_jwt = false');
  },
});

Deno.test({
  name: "gateway: users has verify_jwt = false",
  fn: () => {
    const match = toml.match(/\[functions\."users"\][^\[]*verify_jwt\s*=\s*(\S+)/s);
    assertEquals(match?.[1], "false", 'config.toml must have [functions."users"] verify_jwt = false');
  },
});
