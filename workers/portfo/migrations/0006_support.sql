CREATE TABLE IF NOT EXISTS support_donations (
  id TEXT NOT NULL PRIMARY KEY,
  receipt_key_hash TEXT NOT NULL,
  request_fingerprint TEXT NOT NULL,
  rail TEXT NOT NULL CHECK (rail IN ('payos', 'polar')),
  currency TEXT NOT NULL CHECK ((rail = 'payos' AND currency = 'VND') OR (rail = 'polar' AND currency = 'USD')),
  amount_minor INTEGER NOT NULL CHECK (typeof(amount_minor) = 'integer' AND amount_minor > 0),
  preset_count INTEGER CHECK (preset_count IS NULL OR preset_count IN (1, 3, 5)),
  display_name TEXT, private_message TEXT, supporter_hidden_at TEXT,
  status TEXT NOT NULL CHECK (status IN ('creating', 'pending', 'creation_unknown', 'failed', 'expired', 'paid')),
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, expires_at TEXT, paid_at TEXT,
  payos_order_code INTEGER UNIQUE, payos_link_id TEXT UNIQUE, polar_checkout_id TEXT UNIQUE,
  provider_payment_ref TEXT, checkout_url TEXT, qr_code TEXT,
  UNIQUE (rail, provider_payment_ref)
);
CREATE INDEX IF NOT EXISTS support_donations_paid ON support_donations(status, paid_at DESC, id DESC);
CREATE TABLE IF NOT EXISTS support_webhook_events (
  rail TEXT NOT NULL CHECK (rail IN ('payos', 'polar')), event_id TEXT NOT NULL,
  donation_id TEXT REFERENCES support_donations(id), received_at TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('applied', 'ignored', 'mismatch')),
  PRIMARY KEY (rail, event_id)
);
CREATE TABLE IF NOT EXISTS support_review_tokens (
  id TEXT NOT NULL PRIMARY KEY, donation_id TEXT NOT NULL UNIQUE REFERENCES support_donations(id),
  issued_at TEXT NOT NULL, expires_at TEXT NOT NULL, used_at TEXT
);
CREATE TABLE IF NOT EXISTS support_reviews (
  id TEXT NOT NULL PRIMARY KEY, submission_key_hash TEXT NOT NULL, request_fingerprint TEXT NOT NULL,
  token_id TEXT UNIQUE REFERENCES support_review_tokens(id), display_name TEXT, body TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected', 'hidden')),
  created_at TEXT NOT NULL, moderated_at TEXT, ip_digest TEXT
);
CREATE INDEX IF NOT EXISTS support_reviews_moderation ON support_reviews(status, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS support_reviews_wall ON support_reviews(status, moderated_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS support_reviews_ip ON support_reviews(status, ip_digest);
CREATE TABLE IF NOT EXISTS support_rate_limits (
  scope TEXT NOT NULL, key_digest TEXT NOT NULL, window_start TEXT NOT NULL,
  counter INTEGER NOT NULL CHECK (typeof(counter) = 'integer' AND counter > 0), PRIMARY KEY (scope, key_digest, window_start)
);
CREATE INDEX IF NOT EXISTS support_rate_limits_age ON support_rate_limits(window_start);
