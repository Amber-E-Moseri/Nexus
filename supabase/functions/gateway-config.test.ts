import { assertEquals } from "jsr:@std/assert";

// task-api and users both implement application-level auth (x-api-key and Bearer
// respectively). The Supabase gateway JWT check must be disabled so requests
// reach the function handlers rather than being rejected with 401 first.

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
