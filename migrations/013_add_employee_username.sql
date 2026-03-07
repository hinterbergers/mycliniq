ALTER TABLE employees
ADD COLUMN IF NOT EXISTS username text;

CREATE UNIQUE INDEX IF NOT EXISTS employees_username_ci_idx
  ON employees (lower(username))
  WHERE username IS NOT NULL;
