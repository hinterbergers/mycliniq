CREATE TABLE calendar_tokens (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id integer NOT NULL REFERENCES employees(id),
  token text NOT NULL UNIQUE,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  last_used_at timestamp NOT NULL DEFAULT now(),
  UNIQUE (employee_id)
);

CREATE UNIQUE INDEX calendar_tokens_token_idx ON calendar_tokens (token);
CREATE UNIQUE INDEX calendar_tokens_employee_id_idx ON calendar_tokens (employee_id);
