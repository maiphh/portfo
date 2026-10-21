-- portfo-api D1 schema. Timestamps are ISO-8601 text. Days are YYYY-MM-DD (Asia/Ho_Chi_Minh).

CREATE TABLE contact_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  body TEXT NOT NULL,
  role TEXT,
  visitor_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE page_views (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL,
  visitor_hash TEXT NOT NULL,
  referrer_host TEXT,
  day TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (visitor_hash, slug, day)
);

CREATE INDEX page_views_slug_created_at_idx ON page_views (slug, created_at);

CREATE TABLE github_repos (
  repo_id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  description TEXT,
  language TEXT,
  stars INTEGER NOT NULL DEFAULT 0,
  topics TEXT NOT NULL DEFAULT '[]',
  pushed_at TEXT
);

CREATE TABLE github_activity (
  date TEXT NOT NULL,
  repo_id INTEGER NOT NULL REFERENCES github_repos (repo_id) ON DELETE CASCADE,
  commits INTEGER NOT NULL DEFAULT 0,
  prs INTEGER NOT NULL DEFAULT 0,
  issues INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (date, repo_id)
);

-- Staging for sync: filled in chunks, then swapped into github_activity in one batch.
-- No FK so inserts do not depend on the live repo set mid-sync.
CREATE TABLE github_activity_next (
  date TEXT NOT NULL,
  repo_id INTEGER NOT NULL,
  commits INTEGER NOT NULL DEFAULT 0,
  prs INTEGER NOT NULL DEFAULT 0,
  issues INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (date, repo_id)
);

CREATE TABLE sync_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  status TEXT NOT NULL,
  error TEXT
);
