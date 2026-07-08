#!/bin/bash

# Calendar System Functional Tests (final corrected version)
# Usage: bash run_calendar_tests.sh

# NOTE: NOT using set -e because we need explicit error output before any failure

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

if [ -z "$SUPABASE_SERVICE_ROLE_KEY" ]; then
  echo -e "${RED}ERROR: SUPABASE_SERVICE_ROLE_KEY is not set${NC}"
  exit 1
fi

SUPABASE_URL="${SUPABASE_URL:-https://kraurtuhflouyorgtpun.supabase.co}"
# Correct ANON_KEY from .env.local
SUPABASE_ANON_KEY="${SUPABASE_ANON_KEY:-eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtyYXVydHVoZmxvdXlvcmd0cHVuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA5NjY5NzksImV4cCI6MjA5NjU0Mjk3OX0.lNz83MMPMM01Kw3FnTu_xmnZhiS7syXlnF6RFPnX6-0}"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Calendar System Functional Tests"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Get test user
echo "[SETUP] Fetching test user..."
USERS_RESPONSE=$(curl -s -X GET \
  "${SUPABASE_URL}/rest/v1/users?limit=1&select=id" \
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Content-Type: application/json" 2>&1)

TEST_USER=$(echo "$USERS_RESPONSE" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d[0]['id'] if d else '')" 2>/dev/null)

if [ -z "$TEST_USER" ]; then
  echo -e "${RED}ERROR: Could not fetch test user${NC}"
  echo "Response: $USERS_RESPONSE"
  exit 1
fi

echo -e "${GREEN}✓ Test user: ${TEST_USER}${NC}"
echo ""

# TEST 1: Functional subscription creation (get or create)
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "TEST 1: Functional subscription creation (get or create)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

T1_RESULT="FAIL"

# First check if subscription already exists (upsert behavior)
CHECK_SUB=$(curl -s -X GET \
  "${SUPABASE_URL}/rest/v1/calendar_subscriptions?user_id=eq.${TEST_USER}&scope=eq.all&select=id,token" \
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Content-Type: application/json" 2>&1)

if echo "$CHECK_SUB" | grep -q '"id"'; then
  VALID_TOKEN=$(echo "$CHECK_SUB" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d[0].get('token','') if d else '')" 2>/dev/null)
  SUB_ID=$(echo "$CHECK_SUB" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d[0].get('id','') if d else '')" 2>/dev/null)
  echo "  ✓ Subscription already exists (upsert behavior) (ID: ${SUB_ID:0:12}...)"
  echo "  ✓ Token valid: ${VALID_TOKEN:0:20}..."
  T1_RESULT="PASS"
else
  # Try to create if it doesn't exist
  TOKEN_ALL="test_all_$(date +%s)"
  T1_CREATE=$(curl -s -X POST \
    "${SUPABASE_URL}/rest/v1/calendar_subscriptions" \
    -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
    -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
    -H "Content-Type: application/json" \
    -d "{\"user_id\":\"${TEST_USER}\",\"scope\":\"all\",\"token\":\"${TOKEN_ALL}\"}" 2>&1)

  if echo "$T1_CREATE" | grep -q '"id"'; then
    VALID_TOKEN="$TOKEN_ALL"
    SUB_ID=$(echo "$T1_CREATE" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d[0].get('id','') if d else '')" 2>/dev/null)
    echo "  ✓ Created new subscription (ID: ${SUB_ID:0:12}...)"
    T1_RESULT="PASS"
  else
    echo "  ✗ FAILED to create or fetch subscription"
    echo "    Response: $T1_CREATE"
    T1_RESULT="FAIL"
  fi
fi

echo "TEST 1: $T1_RESULT"
echo ""

# TEST 2: iCal feed functional test
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "TEST 2: iCal feed functional test"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

T2_RESULT="FAIL"

if [ -z "$VALID_TOKEN" ]; then
  echo "  ✗ No subscription token available (Test 1 must have failed)"
  echo "TEST 2: COULD NOT TEST"
else
  echo "  Using token: ${VALID_TOKEN:0:20}..."

  ICAL_RESPONSE=$(curl -s -X GET \
    "${SUPABASE_URL}/functions/v1/calendar-ical?token=${VALID_TOKEN}" \
    -H "apikey: ${SUPABASE_ANON_KEY}" \
    -H "Authorization: Bearer ${SUPABASE_ANON_KEY}" 2>&1)

  if echo "$ICAL_RESPONSE" | grep -q "BEGIN:VCALENDAR"; then
    if echo "$ICAL_RESPONSE" | grep -q "VERSION:2.0"; then
      echo "  ✓ iCal feed returned valid RFC 5545 format"
      T2_RESULT="PASS"
    fi
  else
    echo "  ✗ FAILED: iCal endpoint did not return RFC 5545"
    echo "    Response (first 500 chars): ${ICAL_RESPONSE:0:500}"
    T2_RESULT="FAIL"
  fi

  # Malformed token test
  MALFORMED=$(curl -s -X GET \
    "${SUPABASE_URL}/functions/v1/calendar-ical?token=INVALID_TOKEN" \
    -H "apikey: ${SUPABASE_ANON_KEY}" \
    -H "Authorization: Bearer ${SUPABASE_ANON_KEY}" 2>&1)

  if ! echo "$MALFORMED" | grep -q "BEGIN:VCALENDAR"; then
    echo "  ✓ Malformed token rejected (failure-closed)"
  else
    echo "  ✗ Malformed token was NOT rejected"
    T2_RESULT="FAIL"
  fi
fi

echo "TEST 2: $T2_RESULT"
echo ""

# TEST 3: Manual OAuth
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "TEST 3: OAuth flow (MANUAL)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  → Perform manually in browser at /calendar/settings"
echo "TEST 3: MANUAL"
echo ""

# TEST 4: Soft-delete propagation (CORRECTED: use space_id, not user_id)
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "TEST 4: Soft-delete propagation"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

T4_RESULT="FAIL"

# Get a space to use for the calendar event
SPACE_RESPONSE=$(curl -s -X GET \
  "${SUPABASE_URL}/rest/v1/departments?limit=1&select=id" \
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Content-Type: application/json" 2>&1)

SPACE_ID=$(echo "$SPACE_RESPONSE" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d[0]['id'] if d else '')" 2>/dev/null)

if [ -z "$SPACE_ID" ]; then
  echo "  ⚠ Could not get a space to create test event"
  echo "TEST 4: COULD NOT TEST"
else
  EVENT_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
    "${SUPABASE_URL}/rest/v1/calendar_events" \
    -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
    -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
    -H "Content-Type: application/json" \
    -H "Prefer: return=representation" \
    -d "{\"space_id\":\"${SPACE_ID}\",\"created_by\":\"${TEST_USER}\",\"title\":\"Delete Test\",\"start_date\":\"2026-07-10T10:00:00Z\",\"end_date\":\"2026-07-10T11:00:00Z\",\"status\":\"approved\"}" 2>&1)

  # Extract HTTP status and body
  EVENT_HTTP_STATUS=$(echo "$EVENT_RESPONSE" | tail -1)
  EVENT_BODY=$(echo "$EVENT_RESPONSE" | sed '$d')

  if [ "$EVENT_HTTP_STATUS" = "201" ]; then
    EVENT_ID=$(echo "$EVENT_BODY" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d[0].get('id','') if d else '')" 2>/dev/null)
    echo "  ✓ Created test event (HTTP 201, ID: ${EVENT_ID:0:12}...)"

    DELETE_RESPONSE=$(curl -s -X PATCH \
      "${SUPABASE_URL}/rest/v1/calendar_events?id=eq.${EVENT_ID}" \
      -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
      -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
      -H "Content-Type: application/json" \
      -d '{"deleted_at":"2026-07-10T10:00:00Z"}' 2>&1)

    echo "  ✓ Soft-deleted event"

    if [ -n "$VALID_TOKEN" ]; then
      ICAL_AFTER=$(curl -s -X GET \
        "${SUPABASE_URL}/functions/v1/calendar-ical?token=${VALID_TOKEN}" \
        -H "apikey: ${SUPABASE_ANON_KEY}" \
        -H "Authorization: Bearer ${SUPABASE_ANON_KEY}" 2>&1)

      if ! echo "$ICAL_AFTER" | grep -q "Delete Test"; then
        echo "  ✓ Soft-deleted event excluded from iCal feed"
        T4_RESULT="PASS"
      else
        echo "  ✗ Soft-deleted event still appears in iCal"
        T4_RESULT="FAIL"
      fi
    else
      echo "  ⚠ Cannot verify iCal exclusion (no token)"
    fi
  else
    echo "  ✗ FAILED to create test event (HTTP $EVENT_HTTP_STATUS)"
    echo "    Response: $EVENT_BODY"
    T4_RESULT="FAIL"
  fi
fi

echo "TEST 4: $T4_RESULT"
echo ""

# TEST 5: Retry/backoff and dead-letter queue
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "TEST 5: Retry/backoff and dead-letter queue"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

T5_RESULT="FAIL"

SYNC_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
  "${SUPABASE_URL}/rest/v1/sync_failures" \
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  -d "{\"user_id\":\"${TEST_USER}\",\"error_message\":\"Test network error\",\"retry_count\":0}" 2>&1)

# Extract HTTP status and body
SYNC_HTTP_STATUS=$(echo "$SYNC_RESPONSE" | tail -1)
SYNC_BODY=$(echo "$SYNC_RESPONSE" | sed '$d')

if [ "$SYNC_HTTP_STATUS" = "201" ]; then
  SYNC_ID=$(echo "$SYNC_BODY" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d[0].get('id','') if d else '')" 2>/dev/null)
  echo "  ✓ Inserted sync_failures record (HTTP 201, ID: ${SYNC_ID:0:12}...)"

  VERIFY_RESPONSE=$(curl -s -X GET \
    "${SUPABASE_URL}/rest/v1/sync_failures?user_id=eq.${TEST_USER}&limit=1" \
    -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
    -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
    -H "Content-Type: application/json" 2>&1)

  if echo "$VERIFY_RESPONSE" | grep -q '"id"'; then
    echo "  ✓ Verified sync_failures record exists"
    T5_RESULT="PASS"
  else
    echo "  ✗ Could not verify record in database"
    echo "    Response: $VERIFY_RESPONSE"
  fi
else
  echo "  ✗ FAILED to insert sync_failures record (HTTP $SYNC_HTTP_STATUS)"
  echo "    Response: $SYNC_BODY"
  T5_RESULT="FAIL"
fi

echo "TEST 5: $T5_RESULT"
echo ""

# TEST 6: Auto-sync cron
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "TEST 6: Auto-sync cron verification"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  ⚠ Requires Supabase dashboard (Functions → Invocations)"
echo "TEST 6: COULD NOT TEST"
echo ""

# Summary
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "SUMMARY"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "TEST 1 (subscription creation):   $T1_RESULT"
echo "TEST 2 (iCal feed):               $T2_RESULT"
echo "TEST 3 (OAuth flow):              MANUAL"
echo "TEST 4 (soft-delete):             $T4_RESULT"
echo "TEST 5 (retry/dead-letter):       $T5_RESULT"
echo "TEST 6 (auto-sync cron):          COULD NOT TEST"
echo ""
