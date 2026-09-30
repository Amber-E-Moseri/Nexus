-- READ-ONLY. Classifies every ICPLC participant into the three registration states using the same evidence rules as
-- registrationState() in src/features/icplc/lib/documentationRules.js, and breaks Registration Missing down by reason.
-- Nothing is written. flight_not_required is left out because that column only exists after migration
-- 20271001000001 is applied (so it is zero in production today).

-- Run each numbered query on its own.

-- 1) the distribution, with the reasons behind Registration Missing (a person can have several, so they overlap)
WITH ev AS (
  SELECT id FROM event_configs WHERE event_name ILIKE '%ICPLC%'
),
linked AS (  -- a completed registration is linked (same rule as registrationLinkedParticipantIds)
  SELECT DISTINCT m.participant_id
  FROM icplc_identity_maps m
  WHERE m.event_id IN (SELECT id FROM ev)
    AND m.participant_id IS NOT NULL
    AND (
      m.source_type = 'registration_csv'
      OR (m.source_type = 'registration' AND EXISTS (
            SELECT 1 FROM registrations r WHERE r.id::text = m.source_key AND r.submitted_at IS NOT NULL))
    )
),
sig AS (
  SELECT p.id,
    (p.id IN (SELECT participant_id FROM linked)) AS registered,
    (nullif(btrim(coalesce(p.arrival_flight, '')), '') IS NOT NULL
       OR nullif(btrim(coalesce(p.departure_flight, '')), '') IS NOT NULL
       OR p.arrival_date IS NOT NULL OR p.departure_date IS NOT NULL
       OR (jsonb_typeof(p.source_values -> 'cmp_flights') = 'object' AND p.source_values -> 'cmp_flights' <> '{}'::jsonb)) AS flight,
    (nullif(p.source_values -> 'cmp_documentation' ->> 'submission_id', '') IS NOT NULL) AS doc_form,
    (nullif(btrim(coalesce(p.source_values -> 'registered_raw' ->> 'value', '')), '') IS NOT NULL
       AND lower(btrim(p.source_values -> 'registered_raw' ->> 'value')) <> 'yes') AS reg_csv,
    (p.registration_status = 'issue') AS reg_issue,
    (p.visa_process_status IN ('in_progress', 'submitted', 'processing', 'approved', 'issue')) AS visa
  FROM icplc_participants p
  WHERE p.event_id IN (SELECT id FROM ev)
),
classified AS (
  SELECT *,
    CASE WHEN registered THEN 'Registered'
         WHEN flight OR doc_form OR reg_csv OR reg_issue OR visa THEN 'Registration Missing'
         ELSE 'Not Registered' END AS state
  FROM sig
)
SELECT state,
       count(*) AS people,
       count(*) FILTER (WHERE flight)     AS with_flight_evidence,
       count(*) FILTER (WHERE doc_form)   AS with_documentation_form,
       count(*) FILTER (WHERE reg_csv)    AS with_registration_csv,
       count(*) FILTER (WHERE reg_issue)  AS with_registration_issue,
       count(*) FILTER (WHERE visa)       AS with_visa_progress
FROM classified
GROUP BY state
ORDER BY CASE state WHEN 'Registered' THEN 1 WHEN 'Registration Missing' THEN 2 ELSE 3 END;


-- 2) the non-overlapping view of Registration Missing: each person appears once, under the combination of reasons they have
WITH ev AS (
  SELECT id FROM event_configs WHERE event_name ILIKE '%ICPLC%'
),
linked AS (  -- a completed registration is linked (same rule as registrationLinkedParticipantIds)
  SELECT DISTINCT m.participant_id
  FROM icplc_identity_maps m
  WHERE m.event_id IN (SELECT id FROM ev)
    AND m.participant_id IS NOT NULL
    AND (
      m.source_type = 'registration_csv'
      OR (m.source_type = 'registration' AND EXISTS (
            SELECT 1 FROM registrations r WHERE r.id::text = m.source_key AND r.submitted_at IS NOT NULL))
    )
),
sig AS (
  SELECT p.id,
    (p.id IN (SELECT participant_id FROM linked)) AS registered,
    (nullif(btrim(coalesce(p.arrival_flight, '')), '') IS NOT NULL
       OR nullif(btrim(coalesce(p.departure_flight, '')), '') IS NOT NULL
       OR p.arrival_date IS NOT NULL OR p.departure_date IS NOT NULL
       OR (jsonb_typeof(p.source_values -> 'cmp_flights') = 'object' AND p.source_values -> 'cmp_flights' <> '{}'::jsonb)) AS flight,
    (nullif(p.source_values -> 'cmp_documentation' ->> 'submission_id', '') IS NOT NULL) AS doc_form,
    (nullif(btrim(coalesce(p.source_values -> 'registered_raw' ->> 'value', '')), '') IS NOT NULL
       AND lower(btrim(p.source_values -> 'registered_raw' ->> 'value')) <> 'yes') AS reg_csv,
    (p.registration_status = 'issue') AS reg_issue,
    (p.visa_process_status IN ('in_progress', 'submitted', 'processing', 'approved', 'issue')) AS visa
  FROM icplc_participants p
  WHERE p.event_id IN (SELECT id FROM ev)
),
classified AS (
  SELECT *,
    CASE WHEN registered THEN 'Registered'
         WHEN flight OR doc_form OR reg_csv OR reg_issue OR visa THEN 'Registration Missing'
         ELSE 'Not Registered' END AS state
  FROM sig
)
SELECT concat_ws(' + ',
         CASE WHEN flight THEN 'flight' END,
         CASE WHEN doc_form THEN 'documentation form' END,
         CASE WHEN reg_csv THEN 'registration CSV' END,
         CASE WHEN reg_issue THEN 'registration issue' END,
         CASE WHEN visa THEN 'visa progress' END) AS reasons,
       count(*) AS people
FROM classified
WHERE state = 'Registration Missing'
GROUP BY 1
ORDER BY people DESC;
