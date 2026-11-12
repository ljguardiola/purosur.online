ALTER TABLE remembered_users ADD COLUMN last_active INTEGER NOT NULL DEFAULT 0 CHECK (last_active IN (0, 1));

CREATE UNIQUE INDEX remembered_users_one_last_active ON remembered_users (last_active) WHERE last_active = 1;
