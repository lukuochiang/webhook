-- 0001_initial.sql
-- Core tables for Webhook.

CREATE TABLE IF NOT EXISTS webhook_endpoints (
  id              TEXT PRIMARY KEY,
  token_hash      TEXT NOT NULL,
  name            TEXT NOT NULL,
  description     TEXT,
  enabled         INTEGER NOT NULL DEFAULT 1,
  auth_mode       TEXT NOT NULL DEFAULT 'url',
  retention_days  INTEGER,
  response_status INTEGER DEFAULT 200,
  request_count   INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL,
  last_received_at TEXT
);

CREATE TABLE IF NOT EXISTS webhook_events (
  id             TEXT PRIMARY KEY,
  endpoint_id    TEXT NOT NULL,
  method         TEXT NOT NULL,
  path           TEXT NOT NULL,
  query_string   TEXT NOT NULL DEFAULT '',
  headers_json   TEXT NOT NULL DEFAULT '{}',
  content_type   TEXT,
  body_data      TEXT,
  body_encoding  TEXT NOT NULL DEFAULT 'empty',
  body_json      TEXT,
  body_size      INTEGER NOT NULL DEFAULT 0,
  source_ip      TEXT,
  user_agent     TEXT,
  received_at    TEXT NOT NULL
);
