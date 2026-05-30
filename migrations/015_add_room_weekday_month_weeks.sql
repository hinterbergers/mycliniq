ALTER TYPE room_weekday_recurrence
ADD VALUE IF NOT EXISTS 'monthly_selected_weeks';

ALTER TABLE room_weekday_settings
ADD COLUMN IF NOT EXISTS month_weeks integer[] NOT NULL DEFAULT ARRAY[]::integer[];
