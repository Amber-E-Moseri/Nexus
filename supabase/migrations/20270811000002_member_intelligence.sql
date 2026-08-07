-- Reporting Dashboard (Member Intelligence) — Data schema for CMP sync.
-- read-only tables synced from LWCanada CMP API.

-- Org hierarchy
CREATE TABLE mi_subgroups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cmp_id text UNIQUE NOT NULL,
  name text NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE mi_fellowships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cmp_id text UNIQUE NOT NULL,
  name text NOT NULL,
  subgroup_id uuid REFERENCES mi_subgroups(id),
  created_at timestamptz DEFAULT now()
);

CREATE TABLE mi_cells (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cmp_id text UNIQUE NOT NULL,
  name text NOT NULL,
  fellowship_id uuid REFERENCES mi_fellowships(id),
  created_at timestamptz DEFAULT now()
);

-- Members (synced from CMP)
CREATE TABLE mi_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cmp_id text UNIQUE NOT NULL,
  name text NOT NULL,
  phone text,
  email text,
  cell_id uuid REFERENCES mi_cells(id),
  fellowship_id uuid REFERENCES mi_fellowships(id),
  subgroup_id uuid REFERENCES mi_subgroups(id),
  foundation_school_status text, -- 'completed' | 'not_recorded' | 'in_progress'
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Attendance events (service + cell meetings)
CREATE TABLE mi_attendance_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cmp_event_id text UNIQUE NOT NULL,
  event_date date NOT NULL,
  event_type text NOT NULL, -- 'service' | 'cell'
  cell_id uuid REFERENCES mi_cells(id),
  fellowship_id uuid REFERENCES mi_fellowships(id),
  title text,
  created_at timestamptz DEFAULT now()
);

-- Attendance records (per member per event)
CREATE TABLE mi_attendance_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid REFERENCES mi_attendance_events(id) ON DELETE CASCADE,
  member_id uuid REFERENCES mi_members(id) ON DELETE CASCADE,
  status text NOT NULL, -- 'attended' | 'absent' | 'excused'
  is_first_timer_at_service boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  UNIQUE(event_id, member_id)
);

-- First-timers (derived/cached)
CREATE TABLE mi_first_timers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid UNIQUE REFERENCES mi_members(id),
  first_service_date date,
  first_cell_date date,
  source text, -- 'service' | 'cell'
  created_at timestamptz DEFAULT now()
);

-- Sync audit log
CREATE TABLE mi_sync_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at timestamptz DEFAULT now(),
  finished_at timestamptz,
  status text, -- 'running' | 'success' | 'error'
  records_in jsonb, -- {hierarchy: N, members: N, events: N, records: N}
  error_detail text
);

-- Indexes for common queries
CREATE INDEX mi_members_cell_id        ON mi_members(cell_id);
CREATE INDEX mi_members_fellowship_id  ON mi_members(fellowship_id);
CREATE INDEX mi_members_subgroup_id    ON mi_members(subgroup_id);
CREATE INDEX mi_att_events_date        ON mi_attendance_events(event_date DESC);
CREATE INDEX mi_att_events_type        ON mi_attendance_events(event_type);
CREATE INDEX mi_att_records_member     ON mi_attendance_records(member_id);
CREATE INDEX mi_att_records_event      ON mi_attendance_records(event_id);

-- RLS (read-only for authenticated users; writes only via service-role sync)
ALTER TABLE mi_subgroups          ENABLE ROW LEVEL SECURITY;
ALTER TABLE mi_fellowships        ENABLE ROW LEVEL SECURITY;
ALTER TABLE mi_cells              ENABLE ROW LEVEL SECURITY;
ALTER TABLE mi_members            ENABLE ROW LEVEL SECURITY;
ALTER TABLE mi_attendance_events  ENABLE ROW LEVEL SECURITY;
ALTER TABLE mi_attendance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE mi_first_timers       ENABLE ROW LEVEL SECURITY;
ALTER TABLE mi_sync_log           ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read" ON mi_subgroups          FOR SELECT TO authenticated USING (true);
CREATE POLICY "read" ON mi_fellowships        FOR SELECT TO authenticated USING (true);
CREATE POLICY "read" ON mi_cells              FOR SELECT TO authenticated USING (true);
CREATE POLICY "read" ON mi_members            FOR SELECT TO authenticated USING (true);
CREATE POLICY "read" ON mi_attendance_events  FOR SELECT TO authenticated USING (true);
CREATE POLICY "read" ON mi_attendance_records FOR SELECT TO authenticated USING (true);
CREATE POLICY "read" ON mi_first_timers       FOR SELECT TO authenticated USING (true);
CREATE POLICY "read" ON mi_sync_log           FOR SELECT TO authenticated USING (true);
