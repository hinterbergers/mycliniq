ALTER TABLE roster_settings
ADD COLUMN IF NOT EXISTS weekly_rule_profile jsonb;
