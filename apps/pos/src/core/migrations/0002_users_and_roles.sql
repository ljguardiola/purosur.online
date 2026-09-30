CREATE TABLE users (
  id TEXT PRIMARY KEY,
  first_name TEXT NOT NULL,
  role_id TEXT NOT NULL,
  salt TEXT,
  active INTEGER NOT NULL CHECK (active IN (0, 1)),
  version INTEGER NOT NULL,
  removed INTEGER NOT NULL DEFAULT 0 CHECK (removed IN (0, 1))
);

CREATE TABLE pin_verifiers (
  user_id TEXT PRIMARY KEY REFERENCES users (id),
  verifier TEXT NOT NULL
);

CREATE TABLE roles (
  id TEXT PRIMARY KEY,
  name TEXT,
  is_administrator INTEGER NOT NULL CHECK (is_administrator IN (0, 1)),
  version INTEGER NOT NULL,
  removed INTEGER NOT NULL DEFAULT 0 CHECK (removed IN (0, 1))
);

CREATE TABLE role_permissions (
  role_id TEXT NOT NULL REFERENCES roles (id),
  permission_key TEXT NOT NULL,
  active INTEGER NOT NULL CHECK (active IN (0, 1)),
  PRIMARY KEY (role_id, permission_key)
);
