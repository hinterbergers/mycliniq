ALTER TABLE service_lines
ADD COLUMN allows_swap boolean NOT NULL DEFAULT true,
ADD COLUMN allows_claim boolean NOT NULL DEFAULT true;
