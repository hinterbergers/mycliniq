-- Add training tables and employee flag

ALTER TABLE employees
  ADD COLUMN training_enabled boolean NOT NULL DEFAULT false;

CREATE TABLE training_videos (
  id serial PRIMARY KEY,
  title text NOT NULL,
  keywords text[] NOT NULL DEFAULT ARRAY[]::text[],
  platform text NOT NULL,
  video_id text,
  url text,
  embed_url text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp without time zone NOT NULL DEFAULT now(),
  updated_at timestamp without time zone NOT NULL DEFAULT now()
);

CREATE TABLE training_presentations (
  id serial PRIMARY KEY,
  title text NOT NULL,
  keywords text[] NOT NULL DEFAULT ARRAY[]::text[],
  file_url text NOT NULL,
  mime_type text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp without time zone NOT NULL DEFAULT now(),
  updated_at timestamp without time zone NOT NULL DEFAULT now()
);

