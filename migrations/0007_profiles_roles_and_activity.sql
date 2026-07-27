ALTER TABLE users ADD COLUMN account_role TEXT NOT NULL DEFAULT 'user';
ALTER TABLE users ADD COLUMN game_alias TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN bio TEXT NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS user_playing_servers (
  user_id INTEGER NOT NULL,
  server_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(user_id,server_id),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(server_id) REFERENCES servers(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_user_playing_server ON user_playing_servers(server_id);
