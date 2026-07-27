ALTER TABLE servers ADD COLUMN beta_at TEXT NOT NULL DEFAULT '';
ALTER TABLE servers ADD COLUMN launch_at TEXT NOT NULL DEFAULT '';
ALTER TABLE servers ADD COLUMN operational_status TEXT NOT NULL DEFAULT 'offline';
ALTER TABLE servers ADD COLUMN status_note TEXT NOT NULL DEFAULT '';

ALTER TABLE server_change_requests ADD COLUMN beta_at TEXT NOT NULL DEFAULT '';
ALTER TABLE server_change_requests ADD COLUMN launch_at TEXT NOT NULL DEFAULT '';
ALTER TABLE server_change_requests ADD COLUMN operational_status TEXT NOT NULL DEFAULT 'offline';
ALTER TABLE server_change_requests ADD COLUMN status_note TEXT NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS review_reactions (
  review_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  reaction TEXT NOT NULL CHECK(reaction IN ('like','dislike')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(review_id,user_id),
  FOREIGN KEY(review_id) REFERENCES reviews(id) ON DELETE CASCADE,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_servers_calendar ON servers(is_active, beta_at, launch_at);
CREATE INDEX IF NOT EXISTS idx_review_reactions_review ON review_reactions(review_id,reaction);
