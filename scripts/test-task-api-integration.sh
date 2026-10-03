#!/usr/bin/env bash
# Runs the task-api real-DB integration tests. Needs psql, deno, and a migrated Postgres + PostgREST:
#   TEST_DB_URL=postgresql://postgres:postgres@127.0.0.1:54326/postgres \
#   TEST_POSTGREST_URL=http://127.0.0.1:3002 TEST_JWT_SECRET=... scripts/test-task-api-integration.sh
set -euo pipefail
cd "$(dirname "$0")/.."
exec deno test --allow-all ${DENO_IMPORT_MAP:+--import-map="$DENO_IMPORT_MAP"} ${DENO_FLAGS:-} supabase/tests/task-api/task-api.integration.test.ts
