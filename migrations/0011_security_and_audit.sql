PRAGMA foreign_keys = ON;

ALTER TABLE users ADD COLUMN password_iterations INTEGER NOT NULL DEFAULT 50000;

CREATE TABLE IF NOT EXISTS audit_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_type TEXT NOT NULL CHECK(actor_type IN ('user','owner','admin','system')),
  actor_id INTEGER,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL DEFAULT '',
  entity_id INTEGER,
  metadata TEXT NOT NULL DEFAULT '{}',
  ip_hash TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_events_created
  ON audit_events(created_at);

CREATE INDEX IF NOT EXISTS idx_audit_events_entity
  ON audit_events(entity_type, entity_id, created_at);

CREATE INDEX IF NOT EXISTS idx_audit_events_actor
  ON audit_events(actor_type, actor_id, created_at);
