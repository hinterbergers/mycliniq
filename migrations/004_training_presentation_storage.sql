ALTER TABLE training_presentations
  ADD COLUMN storage_name text,
  ADD COLUMN original_storage_name text,
  ADD COLUMN original_mime_type text;

