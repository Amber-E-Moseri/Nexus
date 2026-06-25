#!/bin/bash
# Apply meeting_documents migration directly

SUPABASE_PROJECT_ID="kraurtuhflouyorgtpun"
MIGRATION_SQL=$(cat supabase/migrations/20260910000000_add_meeting_documents.sql)

# Use Supabase CLI to execute the SQL
cat supabase/migrations/20260910000000_add_meeting_documents.sql | supabase db query --file - 2>&1
