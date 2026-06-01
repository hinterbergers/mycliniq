ALTER TABLE weekly_plan_assignments
  ADD COLUMN IF NOT EXISTS created_by_id integer REFERENCES employees(id),
  ADD COLUMN IF NOT EXISTS updated_by_id integer REFERENCES employees(id);

CREATE INDEX IF NOT EXISTS weekly_plan_assignments_created_by_id_idx
  ON weekly_plan_assignments(created_by_id);

CREATE INDEX IF NOT EXISTS weekly_plan_assignments_updated_by_id_idx
  ON weekly_plan_assignments(updated_by_id);
