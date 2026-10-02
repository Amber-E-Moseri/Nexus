-- Add Jason Ikeokwu to PFCC (primary department) and Pastors (via space_members).
-- department_id can only hold one value; PFCC is primary, Pastors is cross-dept.
-- getSpaceMembers was updated to union users.department_id + space_members for dept spaces.

DO $$
DECLARE
  v_jason_id  uuid;
  v_pastors   uuid;
  v_pfcc      uuid;
BEGIN
  SELECT id INTO v_jason_id
  FROM users
  WHERE name ILIKE '%jason%ikeokwu%'
  LIMIT 1;

  IF v_jason_id IS NULL THEN
    RAISE NOTICE 'User matching "Jason Ikeokwu" not found in users table; skipping PFCC/Pastors assignment';
    RETURN;
  END IF;

  SELECT id INTO v_pastors
  FROM spaces
  WHERE space_type = 'department' AND name ILIKE '%pastor%'
  LIMIT 1;

  IF v_pastors IS NULL THEN
    RAISE EXCEPTION 'Pastors department space not found';
  END IF;

  SELECT id INTO v_pfcc
  FROM spaces
  WHERE space_type = 'department' AND UPPER(name) = 'PFCC'
  LIMIT 1;

  IF v_pfcc IS NULL THEN
    RAISE EXCEPTION 'PFCC department space not found';
  END IF;

  -- Set PFCC as primary department
  UPDATE users
  SET department_id = v_pfcc
  WHERE id = v_jason_id;

  -- Add to Pastors via space_members (cross-dept visibility)
  INSERT INTO space_members (space_id, user_id, role)
  VALUES (v_pastors, v_jason_id, 'member')
  ON CONFLICT (space_id, user_id) DO NOTHING;

  RAISE NOTICE 'Done: Jason Ikeokwu (%) → dept=PFCC (%), space_member of Pastors (%)',
    v_jason_id, v_pfcc, v_pastors;
END $$;
