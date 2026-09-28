-- GROWTH TRACKING SYNC TEST
-- Run these queries after deploying to verify everything works

-- ═══════════════════════════════════════════════════════════════════════════════
-- PRE-SYNC: Snapshot state
-- ═══════════════════════════════════════════════════════════════════════════════

-- 1. Verify host_name_history exists and is populated
SELECT
  'host_name_history exists' as test,
  COUNT(*) as mapping_count
FROM public.host_name_history;

-- Expected: 11 rows (one for each center)

-- 2. Verify service_center_schedule has new names
SELECT
  'New center names loaded' as test,
  COUNT(*) as new_name_count
FROM public.service_center_schedule
WHERE church_name LIKE 'BLW %'
  OR church_name LIKE 'CESGB%'
  OR church_name LIKE 'Central%'
  OR church_name LIKE 'Lethbridge%';

-- Expected: 11 rows

-- 3. Check current service_reports data
SELECT
  'Current service_reports' as test,
  COUNT(*) as total_reports,
  COUNT(DISTINCT service_kind) as kinds,
  COUNT(DISTINCT church_unit_id) as centers
FROM public.service_reports;

-- Expected: Should have existing SundayService data

-- 4. List all church names and their unit IDs for reference
SELECT
  church_name,
  church_unit_id,
  active,
  created_at
FROM public.service_center_schedule
ORDER BY church_name;

-- ═══════════════════════════════════════════════════════════════════════════════
-- POST-SYNC: After running growth-reports-sync edge function
-- ═══════════════════════════════════════════════════════════════════════════════

-- 5. Verify sync stored data with current church names (not old ones)
SELECT
  'Sync used current names' as test,
  service_kind,
  COUNT(*) as report_count,
  COUNT(DISTINCT church_name) as unique_names
FROM public.service_reports
WHERE service_kind IN ('SundayService', 'SundayGathering')
GROUP BY service_kind
ORDER BY service_kind DESC;

-- Expected after sync: SundayGathering reports should have BLW branded names

-- 6. Detailed view of latest synced data
SELECT
  church_name,
  service_kind,
  service_date,
  total_attendance,
  first_timers,
  synced_at
FROM public.service_reports
WHERE service_kind IN ('SundayService', 'SundayGathering')
  AND service_date >= CURRENT_DATE - INTERVAL '14 days'
ORDER BY service_date DESC, church_name;

-- Expected: Recent data with SundayGathering kind and current church names

-- 7. Verify name resolution worked (check that old names map correctly)
SELECT
  sr.church_unit_id,
  sr.church_name as synced_name,
  scs.church_name as current_name,
  hnh.old_host_name,
  hnh.new_host_name,
  COUNT(*) as reports_synced
FROM public.service_reports sr
JOIN public.service_center_schedule scs ON sr.church_unit_id = scs.church_unit_id
LEFT JOIN public.host_name_history hnh ON sr.church_unit_id = hnh.church_unit_id
WHERE sr.service_kind IN ('SundayService', 'SundayGathering')
GROUP BY sr.church_unit_id, sr.church_name, scs.church_name, hnh.old_host_name, hnh.new_host_name
ORDER BY synced_name;

-- Expected: synced_name should match current_name for all rows

-- ═══════════════════════════════════════════════════════════════════════════════
-- CLEANUP & VERIFICATION SUMMARY
-- ═══════════════════════════════════════════════════════════════════════════════

-- 8. Final check: All centers have active status and current names
SELECT
  'Deployment verification' as status,
  CASE
    WHEN COUNT(*) = 11 AND COUNT(CASE WHEN active = true THEN 1 END) = 11 THEN '✅ PASS'
    ELSE '❌ FAIL'
  END as result,
  COUNT(*) as total_centers,
  COUNT(CASE WHEN active = true THEN 1 END) as active_centers
FROM public.service_center_schedule;

-- Expected: ✅ PASS with 11 active centers

-- ═══════════════════════════════════════════════════════════════════════════════
-- SUCCESS CRITERIA
-- ═══════════════════════════════════════════════════════════════════════════════
-- ✅ host_name_history: 11 mappings
-- ✅ service_center_schedule: 11 centers with new names (BLW branded)
-- ✅ service_reports: Contains SundayGathering records with current names
-- ✅ Name resolution: Old names (e.g., "Brock Service Center") → Current names (e.g., "BLW Niagara Church")
-- ✅ Growth Tracking Dashboard: Shows correct center names in reports
