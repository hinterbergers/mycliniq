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
