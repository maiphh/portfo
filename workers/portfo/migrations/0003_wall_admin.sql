CREATE TABLE admin_credentials (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  password_hash TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  rotation_id TEXT
);

CREATE TABLE admin_sessions (
  token_digest TEXT PRIMARY KEY NOT NULL,
  credential_version INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX admin_sessions_expiry ON admin_sessions (expires_at);

CREATE TABLE wall_admin_limits (
  action TEXT NOT NULL,
  client_key TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL,
  last_attempt TEXT NOT NULL,
  PRIMARY KEY (action, client_key, expires_at)
);
CREATE INDEX wall_admin_limits_expiry ON wall_admin_limits (expires_at);

CREATE TABLE wall_draft (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  version INTEGER NOT NULL,
  base_revision TEXT,
  items_json TEXT NOT NULL CHECK (json_valid(items_json) AND json_type(items_json) = 'array'),
  dirty INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  operation_id TEXT
);

CREATE TABLE wall_uploads (
  media_id TEXT PRIMARY KEY NOT NULL,
  owner_uploaded INTEGER NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE wall_submissions (
  id TEXT PRIMARY KEY NOT NULL,
  fingerprint TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  alt TEXT,
  media_id TEXT REFERENCES wall_uploads (media_id),
  width INTEGER,
  height INTEGER,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
  created_at INTEGER NOT NULL,
  decided_at INTEGER,
  accepted_item_id TEXT
);
CREATE INDEX wall_submissions_queue ON wall_submissions (status, created_at DESC);
CREATE INDEX wall_submissions_media ON wall_submissions (media_id, status);

CREATE TABLE wall_publish_receipts (
  version INTEGER PRIMARY KEY,
  base_revision TEXT,
  revision TEXT NOT NULL,
  result_version INTEGER NOT NULL
);

CREATE INDEX wall_revision_media_by_asset ON wall_revision_media (media_id);
