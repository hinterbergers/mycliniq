CREATE TABLE IF NOT EXISTS room_groups (
  id serial PRIMARY KEY,
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS room_groups_sort_order_idx
  ON room_groups (sort_order);

ALTER TABLE rooms
ADD COLUMN IF NOT EXISTS room_group_id integer;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'rooms_room_group_id_room_groups_id_fk'
  ) THEN
    ALTER TABLE rooms
    ADD CONSTRAINT rooms_room_group_id_room_groups_id_fk
    FOREIGN KEY (room_group_id)
    REFERENCES room_groups(id)
    ON DELETE SET NULL;
  END IF;
END $$;
