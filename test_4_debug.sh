#!/bin/bash
# TEST 4 isolated debug script with trace mode
set -x

SUPABASE_URL="${SUPABASE_URL:-https://kraurtuhflouyorgtpun.supabase.co}"
SUPABASE_ANON_KEY="${SUPABASE_ANON_KEY:-eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtyYXVydHVoZmxvdXlvcmd0cHVuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA5NjY5NzksImV4cCI6MjA5NjU0Mjk3OX0.lNz83MMPMM01Kw3FnTu_xmnZhiS7syXlnF6RFPnX6-0}"
TEST_USER="ce0be5bb-f235-4106-a5f3-e602c0d663ae"
VALID_TOKEN="test_all_1783389077" # from earlier successful test

echo "========== TEST 4 DEBUG START =========="
echo "Getting first space..."

SPACE_RESPONSE=$(curl -s -X GET \
  "${SUPABASE_URL}/rest/v1/departments?limit=1&select=id" \
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Content-Type: application/json" 2>&1)

echo "SPACE_RESPONSE: $SPACE_RESPONSE"

SPACE_ID=$(echo "$SPACE_RESPONSE" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d[0]['id'] if d else '')" 2>/dev/null)

echo "SPACE_ID: $SPACE_ID"

if [ -z "$SPACE_ID" ]; then
  echo "ERROR: Could not get space"
  exit 1
fi

echo "Creating calendar event..."

EVENT_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
  "${SUPABASE_URL}/rest/v1/calendar_events" \
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  -d "{\"space_id\":\"${SPACE_ID}\",\"created_by\":\"${TEST_USER}\",\"title\":\"Delete Test\",\"start_date\":\"2026-07-10T10:00:00Z\",\"end_date\":\"2026-07-10T11:00:00Z\",\"status\":\"approved\"}" 2>&1)

echo "EVENT_RESPONSE:"
echo "$EVENT_RESPONSE"
echo "---"

EVENT_HTTP_STATUS=$(echo "$EVENT_RESPONSE" | tail -1)
EVENT_BODY=$(echo "$EVENT_RESPONSE" | sed '$d')

echo "HTTP_STATUS: $EVENT_HTTP_STATUS"
echo "BODY: $EVENT_BODY"

if [ "$EVENT_HTTP_STATUS" = "201" ]; then
  echo "SUCCESS: Event created (201)"
  EVENT_ID=$(echo "$EVENT_BODY" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d[0].get('id','') if d else '')" 2>/dev/null)
  echo "EVENT_ID: $EVENT_ID"

  if [ -n "$EVENT_ID" ]; then
    echo "Soft-deleting event..."
    curl -s -X PATCH \
      "${SUPABASE_URL}/rest/v1/calendar_events?id=eq.${EVENT_ID}" \
      -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
      -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
      -H "Content-Type: application/json" \
      -d '{"deleted_at":"2026-07-10T10:00:00Z"}' 2>&1

    echo "Checking iCal feed for soft-deleted event..."
    ICAL_AFTER=$(curl -s -X GET \
      "${SUPABASE_URL}/functions/v1/calendar-ical?token=${VALID_TOKEN}" \
      -H "apikey: ${SUPABASE_ANON_KEY}" \
      -H "Authorization: Bearer ${SUPABASE_ANON_KEY}" 2>&1)

    if ! echo "$ICAL_AFTER" | grep -q "Delete Test"; then
      echo "SUCCESS: Soft-deleted event excluded from iCal"
    else
      echo "FAIL: Soft-deleted event still in iCal"
    fi
  fi
else
  echo "FAIL: Event creation returned HTTP $EVENT_HTTP_STATUS (expected 201)"
fi

echo "========== TEST 4 DEBUG END =========="
