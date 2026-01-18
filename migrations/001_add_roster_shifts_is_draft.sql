ALTER TABLE roster_shifts
ADD COLUMN IF NOT EXISTS is_draft boolean NOT NULL DEFAULT false;
