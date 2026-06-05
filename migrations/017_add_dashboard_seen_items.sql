CREATE TABLE IF NOT EXISTS dashboard_seen_items (
  id serial PRIMARY KEY,
  employee_id integer NOT NULL REFERENCES employees(id),
  item_type text NOT NULL,
  item_id text NOT NULL,
  seen_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS dashboard_seen_items_employee_type_idx
  ON dashboard_seen_items(employee_id, item_type);

CREATE UNIQUE INDEX IF NOT EXISTS dashboard_seen_items_employee_type_item_uidx
  ON dashboard_seen_items(employee_id, item_type, item_id);
