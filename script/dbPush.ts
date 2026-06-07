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
