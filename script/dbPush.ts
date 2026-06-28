import "dotenv/config";
import { Pool } from "pg";

function getDatabaseUrl(): string {
  let dbUrl = process.env.DATABASE_URL || "";

  if (dbUrl.startsWith("psql ")) {
    dbUrl = dbUrl.replace(/^psql\s+['"]?/, "").replace(/['"]$/, "");
  }

  if (!dbUrl.startsWith("postgresql://") && !dbUrl.startsWith("postgres://")) {
    const host = process.env.PGHOST;
    const port = process.env.PGPORT || "5432";
    const user = process.env.PGUSER;
    const password = process.env.PGPASSWORD;
    const database = process.env.PGDATABASE;

    if (host && user && password && database) {
      dbUrl = `postgresql://${user}:${password}@${host}:${port}/${database}?sslmode=require`;
    }
  }

  if (!dbUrl) {
    throw new Error("DATABASE_URL is not set");
  }

  return dbUrl;
}

const migrationSql = `
ALTER TYPE app_role
ADD VALUE IF NOT EXISTS 'Ausbilder';

ALTER TYPE user_app_role
ADD VALUE IF NOT EXISTS 'Ausbilder';

ALTER TABLE rooms
ADD COLUMN IF NOT EXISTS row_color text;

ALTER TABLE roster_settings
ADD COLUMN IF NOT EXISTS weekly_rule_profile jsonb;

CREATE TABLE IF NOT EXISTS roster_shift_change_logs (
  id serial PRIMARY KEY,
  roster_shift_id integer,
  action text NOT NULL,
  context text,
  date date NOT NULL,
  service_type text NOT NULL,
  is_draft boolean NOT NULL DEFAULT false,
  before_employee_id integer,
  after_employee_id integer,
  before_assignee_free_text text,
  after_assignee_free_text text,
  actor_employee_id integer REFERENCES employees(id),
  actor_name text,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS roster_shift_change_logs_created_at_idx
  ON roster_shift_change_logs (created_at);
CREATE INDEX IF NOT EXISTS roster_shift_change_logs_date_idx
  ON roster_shift_change_logs (date);
CREATE INDEX IF NOT EXISTS roster_shift_change_logs_shift_id_idx
  ON roster_shift_change_logs (roster_shift_id);

ALTER TABLE employees
ADD COLUMN IF NOT EXISTS username text;

ALTER TABLE employees
ADD COLUMN IF NOT EXISTS employment_percentage integer;

ALTER TABLE sessions
ADD COLUMN IF NOT EXISTS ip_address text;

ALTER TABLE sessions
ADD COLUMN IF NOT EXISTS forwarded_for text;

CREATE UNIQUE INDEX IF NOT EXISTS employees_username_ci_idx
  ON employees (lower(username))
  WHERE username IS NOT NULL;

CREATE TABLE IF NOT EXISTS room_groups (
  id serial PRIMARY KEY,
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS room_groups_sort_order_idx
  ON room_groups (sort_order);

ALTER TABLE rooms
ADD COLUMN IF NOT EXISTS room_group_id integer;

ALTER TYPE room_weekday_recurrence
ADD VALUE IF NOT EXISTS 'monthly_selected_weeks';

ALTER TABLE room_weekday_settings
ADD COLUMN IF NOT EXISTS month_weeks integer[] NOT NULL DEFAULT ARRAY[]::integer[];

ALTER TABLE tool_visibility
ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS dashboard_seen_items (
  id serial PRIMARY KEY,
  employee_id integer NOT NULL REFERENCES employees(id),
  item_type text NOT NULL,
  item_id text NOT NULL,
  seen_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS dashboard_seen_items_employee_type_idx
  ON dashboard_seen_items (employee_id, item_type);

CREATE UNIQUE INDEX IF NOT EXISTS dashboard_seen_items_employee_type_item_uidx
  ON dashboard_seen_items (employee_id, item_type, item_id);

ALTER TABLE weekly_plan_assignments
ADD COLUMN IF NOT EXISTS created_by_id integer REFERENCES employees(id);

ALTER TABLE weekly_plan_assignments
ADD COLUMN IF NOT EXISTS updated_by_id integer REFERENCES employees(id);

DO $$
BEGIN
  CREATE TYPE education_import_status AS ENUM ('draft', 'uploaded', 'mapped', 'reviewed');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TYPE education_import_status ADD VALUE IF NOT EXISTS 'draft';
  ALTER TYPE education_import_status ADD VALUE IF NOT EXISTS 'uploaded';
  ALTER TYPE education_import_status ADD VALUE IF NOT EXISTS 'mapped';
  ALTER TYPE education_import_status ADD VALUE IF NOT EXISTS 'reviewed';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS education_programs (
  id serial PRIMARY KEY,
  department_id integer NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  title text NOT NULL,
  slug text NOT NULL,
  description text,
  target_role text,
  is_active boolean NOT NULL DEFAULT true,
  created_by_id integer REFERENCES employees(id),
  updated_by_id integer REFERENCES employees(id),
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS education_programs_department_id_idx
  ON education_programs (department_id);

CREATE UNIQUE INDEX IF NOT EXISTS education_programs_department_slug_idx
  ON education_programs (department_id, slug);

CREATE TABLE IF NOT EXISTS education_modules (
  id serial PRIMARY KEY,
  program_id integer NOT NULL REFERENCES education_programs(id) ON DELETE CASCADE,
  title text NOT NULL,
  slug text NOT NULL,
  description text,
  target_role text,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS education_modules_program_id_idx
  ON education_modules (program_id);

CREATE UNIQUE INDEX IF NOT EXISTS education_modules_program_slug_idx
  ON education_modules (program_id, slug);

ALTER TABLE education_modules
ADD COLUMN IF NOT EXISTS target_role text;

CREATE TABLE IF NOT EXISTS education_requirements (
  id serial PRIMARY KEY,
  module_id integer NOT NULL REFERENCES education_modules(id) ON DELETE CASCADE,
  title text NOT NULL,
  code text,
  description text,
  category text,
  required_count integer NOT NULL DEFAULT 0,
  unit_label text NOT NULL DEFAULT 'Anzahl',
  matching_hints text[] NOT NULL DEFAULT ARRAY[]::text[],
  source_reference text,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS education_requirements_module_id_idx
  ON education_requirements (module_id);

CREATE INDEX IF NOT EXISTS education_requirements_category_idx
  ON education_requirements (category);

ALTER TABLE education_requirements
ADD COLUMN IF NOT EXISTS evaluation_type text NOT NULL DEFAULT 'count';

ALTER TABLE education_requirements
ADD COLUMN IF NOT EXISTS target_level integer;

ALTER TABLE education_requirements
ADD COLUMN IF NOT EXISTS time_scope text;

ALTER TABLE education_requirements
ADD COLUMN IF NOT EXISTS requires_upload boolean NOT NULL DEFAULT false;

ALTER TABLE education_requirements
ADD COLUMN IF NOT EXISTS requires_trainer_signoff boolean NOT NULL DEFAULT true;

ALTER TABLE education_requirements
ADD COLUMN IF NOT EXISTS role_tracking_enabled boolean NOT NULL DEFAULT false;

ALTER TABLE education_requirements
ADD COLUMN IF NOT EXISTS role_options jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE education_requirements
ADD COLUMN IF NOT EXISTS counting_rule text;

ALTER TABLE education_requirements
ADD COLUMN IF NOT EXISTS field_config jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS education_mentor_assignments (
  id serial PRIMARY KEY,
  trainer_employee_id integer NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  trainee_employee_id integer NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  assigned_by_id integer REFERENCES employees(id),
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS education_mentor_assignments_trainer_idx
  ON education_mentor_assignments (trainer_employee_id);

CREATE INDEX IF NOT EXISTS education_mentor_assignments_trainee_idx
  ON education_mentor_assignments (trainee_employee_id);

CREATE UNIQUE INDEX IF NOT EXISTS education_mentor_assignments_unique_active_idx
  ON education_mentor_assignments (trainer_employee_id, trainee_employee_id);

CREATE TABLE IF NOT EXISTS education_progress (
  id serial PRIMARY KEY,
  employee_id integer NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  requirement_id integer NOT NULL REFERENCES education_requirements(id) ON DELETE CASCADE,
  completed_count integer NOT NULL DEFAULT 0,
  verified_count integer NOT NULL DEFAULT 0,
  last_activity_at timestamp,
  last_entry_label text,
  notes text,
  updated_by_id integer REFERENCES employees(id),
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS education_progress_employee_id_idx
  ON education_progress (employee_id);

CREATE INDEX IF NOT EXISTS education_progress_requirement_id_idx
  ON education_progress (requirement_id);

CREATE UNIQUE INDEX IF NOT EXISTS education_progress_employee_requirement_idx
  ON education_progress (employee_id, requirement_id);

ALTER TABLE education_progress
ADD COLUMN IF NOT EXISTS current_level integer;

ALTER TABLE education_progress
ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'offen';

ALTER TABLE education_progress
ADD COLUMN IF NOT EXISTS last_entry_role text;

ALTER TABLE education_progress
ADD COLUMN IF NOT EXISTS last_entry_date date;

ALTER TABLE education_progress
ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS education_profiles (
  id serial PRIMARY KEY,
  employee_id integer NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  active_program_id integer REFERENCES education_programs(id) ON DELETE SET NULL,
  active_module_ids integer[] NOT NULL DEFAULT ARRAY[]::integer[],
  training_start_date date,
  basic_training_completed boolean NOT NULL DEFAULT false,
  expected_training_end_date date,
  exam_date date,
  exam_passed boolean NOT NULL DEFAULT false,
  notes text,
  updated_by_id integer REFERENCES employees(id),
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

ALTER TABLE education_profiles
ADD COLUMN IF NOT EXISTS active_program_id integer;

ALTER TABLE education_profiles
ADD COLUMN IF NOT EXISTS active_module_ids integer[] NOT NULL DEFAULT ARRAY[]::integer[];

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'education_profiles_active_program_id_education_programs_id_fk'
  ) THEN
    ALTER TABLE education_profiles
    ADD CONSTRAINT education_profiles_active_program_id_education_programs_id_fk
    FOREIGN KEY (active_program_id)
    REFERENCES education_programs(id)
    ON DELETE SET NULL;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS education_profiles_employee_id_idx
  ON education_profiles (employee_id);

CREATE INDEX IF NOT EXISTS education_profiles_active_program_id_idx
  ON education_profiles (active_program_id);

CREATE INDEX IF NOT EXISTS education_profiles_exam_date_idx
  ON education_profiles (exam_date);

CREATE TABLE IF NOT EXISTS education_import_uploads (
  id serial PRIMARY KEY,
  employee_id integer NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  uploaded_by_id integer REFERENCES employees(id) ON DELETE SET NULL,
  file_name text NOT NULL,
  mime_type text,
  status education_import_status NOT NULL DEFAULT 'draft',
  row_count integer NOT NULL DEFAULT 0,
  matched_count integer NOT NULL DEFAULT 0,
  unmatched_count integer NOT NULL DEFAULT 0,
  raw_rows jsonb NOT NULL DEFAULT '[]'::jsonb,
  notes text,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS education_import_uploads_employee_id_idx
  ON education_import_uploads (employee_id);

CREATE INDEX IF NOT EXISTS education_import_uploads_status_idx
  ON education_import_uploads (status);

DO $$
BEGIN
  CREATE TYPE education_event_status AS ENUM ('draft', 'published', 'archived');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE education_event_request_status AS ENUM ('interested', 'approved', 'rejected');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS education_events (
  id serial PRIMARY KEY,
  department_id integer NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  title text NOT NULL,
  event_type text NOT NULL DEFAULT 'Fortbildung',
  location text,
  external_url text,
  description text,
  target_role text,
  starts_at date NOT NULL,
  ends_at date NOT NULL,
  max_approvals integer,
  status education_event_status NOT NULL DEFAULT 'draft',
  created_by_id integer REFERENCES employees(id),
  updated_by_id integer REFERENCES employees(id),
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS education_events_department_id_idx
  ON education_events (department_id);

CREATE INDEX IF NOT EXISTS education_events_status_idx
  ON education_events (status);

CREATE INDEX IF NOT EXISTS education_events_starts_at_idx
  ON education_events (starts_at);

CREATE TABLE IF NOT EXISTS education_event_requests (
  id serial PRIMARY KEY,
  event_id integer NOT NULL REFERENCES education_events(id) ON DELETE CASCADE,
  employee_id integer NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  requested_by_id integer REFERENCES employees(id) ON DELETE SET NULL,
  status education_event_request_status NOT NULL DEFAULT 'interested',
  interest_note text,
  decision_note text,
  cost_covered_by_department boolean NOT NULL DEFAULT false,
  decided_by_id integer REFERENCES employees(id),
  decided_at timestamp,
  linked_planned_absence_id integer,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS education_event_requests_event_id_idx
  ON education_event_requests (event_id);

CREATE INDEX IF NOT EXISTS education_event_requests_employee_id_idx
  ON education_event_requests (employee_id);

CREATE INDEX IF NOT EXISTS education_event_requests_status_idx
  ON education_event_requests (status);

CREATE UNIQUE INDEX IF NOT EXISTS education_event_requests_event_employee_idx
  ON education_event_requests (event_id, employee_id);

UPDATE tool_visibility
SET sort_order = CASE tool_key
  WHEN 'pregnancy_weeks' THEN 0
  WHEN 'pul_calculator' THEN 1
  WHEN 'body_surface_area' THEN 2
  WHEN 'bishop_score' THEN 3
  ELSE sort_order
END
WHERE sort_order = 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'rooms_room_group_id_room_groups_id_fk'
  ) THEN
    ALTER TABLE rooms
    ADD CONSTRAINT rooms_room_group_id_room_groups_id_fk
    FOREIGN KEY (room_group_id)
    REFERENCES room_groups(id)
    ON DELETE SET NULL;
  END IF;
END $$;
`;

async function main() {
  const connectionString = getDatabaseUrl();
  const pool = new Pool({ connectionString });
  const client = await pool.connect();

  try {
    await client.query("begin");
    await client.query(migrationSql);
    await client.query("commit");
    console.log("db:push completed");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error("db:push failed");
  console.error(error);
  process.exit(1);
});
