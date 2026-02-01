CREATE UNIQUE INDEX IF NOT EXISTS unique_roster_shifts_date_service_draft
ON roster_shifts (date, service_type, is_draft);
