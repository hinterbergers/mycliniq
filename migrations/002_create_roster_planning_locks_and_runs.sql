CREATE TABLE IF NOT EXISTS roster_planning_locks (
  id SERIAL PRIMARY KEY,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL,
  slot_id TEXT NOT NULL,
  employee_id INTEGER REFERENCES employees(id),
  created_by INTEGER NOT NULL REFERENCES employees(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (year, month, slot_id)
);

CREATE INDEX IF NOT EXISTS roster_planning_locks_year_month_idx
  ON roster_planning_locks (year, month);

CREATE TABLE IF NOT EXISTS roster_planning_runs (
  id SERIAL PRIMARY KEY,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL,
  input_hash TEXT NOT NULL,
  input_json JSONB NOT NULL,
  output_json JSONB NOT NULL,
  engine TEXT NOT NULL,
  seed INTEGER,
  created_by INTEGER NOT NULL REFERENCES employees(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS roster_planning_runs_year_month_idx
  ON roster_planning_runs (year, month);
