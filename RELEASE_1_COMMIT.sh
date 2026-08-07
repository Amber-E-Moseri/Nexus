#!/bin/bash
# Release 1: Commit adoption system foundation
# Run this after completing RELEASE_1_CHECKLIST.md

set -e

echo "📋 Release 1 Commit Script"
echo "========================="
echo ""
echo "This script will:"
echo "  1. Check git status"
echo "  2. Stage all Release 1 files"
echo "  3. Create a signed commit"
echo ""

# Show what will be committed
echo "📊 Git Status:"
git status --short

echo ""
echo "📝 Files to be committed:"
echo "  Database migrations:"
echo "    - supabase/migrations/20270813000001_analytics_foundation.sql"
echo "    - supabase/migrations/20270813000002_onboarding_tables.sql"
echo ""
echo "  Configuration:"
echo "    - src/lib/adoption-config.ts"
echo ""
echo "  Frontend:"
echo "    - src/features/dashboard/components/OnboardingChecklist.jsx"
echo "    - src/pages/Dashboard.jsx"
echo ""
echo "  Nova:"
echo "    - src/features/nova/lib/novaTools.ts"
echo "    - supabase/functions/nova-chat/index.ts"
echo ""
echo "  Testing:"
echo "    - ADOPTION_TESTING.md"
echo "    - supabase/test_adoption_migrations.sql"
echo "    - src/tests/adoption.test.ts"
echo "    - RELEASE_1_SUMMARY.md"
echo "    - RELEASE_1_CHECKLIST.md"
echo ""

read -p "Continue? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo "❌ Aborted."
  exit 1
fi

echo ""
echo "🚀 Staging files..."

# Stage all Release 1 files
git add \
  supabase/migrations/20270813000001_analytics_foundation.sql \
  supabase/migrations/20270813000002_onboarding_tables.sql \
  src/lib/adoption-config.ts \
  src/features/dashboard/components/OnboardingChecklist.jsx \
  src/pages/Dashboard.jsx \
  src/features/nova/lib/novaTools.ts \
  supabase/functions/nova-chat/index.ts \
  ADOPTION_TESTING.md \
  supabase/test_adoption_migrations.sql \
  src/tests/adoption.test.ts \
  RELEASE_1_SUMMARY.md \
  RELEASE_1_CHECKLIST.md

echo "✅ Files staged."
echo ""

echo "📝 Commit message:"
echo "=================="

git commit -m "$(cat <<'EOF'
feat(adoption): Release 1 — analytics foundation, onboarding, Nova tools

Database:
- Add analytics_events table with trigger on activity_log for event bus (Layer 2)
- Add backfill_analytics_events() for one-time historical data import
- Add user_onboarding_state, user_onboarding_progress, user_achievements tables (Layer 4)
- Add RPCs: mark_onboarding_step_complete, dismiss_onboarding, get_onboarding_status
- All tables have RLS enabled with permission-scoped access policies
- All tables indexed on join/filter columns

Frontend:
- Add OnboardingChecklist.jsx dashboard widget with role-aware steps and progress tracking
- Integrate OnboardingChecklist into Dashboard.jsx (positioned above stat cards)
- Add adoption-config.ts: role-aware onboarding steps, 8-stage adoption funnel, feature thresholds
- Support role-based step definitions (member, dept_lead, super_admin)
- Support dismissal and resumption of onboarding

Nova:
- Add 3 new tools to tool registry:
  * get_my_work_summary: tasks + meetings + onboarding status
  * get_onboarding_status: current user's onboarding progress
  * get_department_health: permission-scoped health score + breakdown
- Update nova-chat edge function with tool implementations
- All tools respect RLS and permission boundaries (no admin-only queries)

Testing:
- Add ADOPTION_TESTING.md: comprehensive manual testing guide (10 steps)
- Add supabase/test_adoption_migrations.sql: automated DB verification
- Add src/tests/adoption.test.ts: TypeScript unit tests (20+ test cases)
- Add RELEASE_1_SUMMARY.md: architecture, files, testing instructions
- Add RELEASE_1_CHECKLIST.md: quick reference for local setup

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"

echo ""
echo "✅ Commit created."
echo ""
echo "📊 Final Status:"
git status --short

echo ""
echo "🎉 Release 1 committed successfully!"
echo ""
echo "Next steps:"
echo "  1. Test locally using RELEASE_1_CHECKLIST.md"
echo "  2. Verify all 10 steps pass"
echo "  3. Create PR: git push origin feature/adoption-system"
echo "  4. Start Release 2: Adoption analytics, nudges, health scoring"
