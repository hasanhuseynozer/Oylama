PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL,
  email_normalized TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'blocked')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS site_settings (
  setting_key TEXT PRIMARY KEY,
  setting_value TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON user_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);

ALTER TABLE reviews ADD COLUMN user_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_reviews_user_id ON reviews(user_id);

INSERT OR IGNORE INTO site_settings(setting_key, setting_value) VALUES
  ('banner_text', 'SRO Rating — Topluluğun seçtiği sunucular'),
  ('banner_url', ''),
  ('left_ad_text', 'Reklam alanı'),
  ('left_ad_url', ''),
  ('right_ad_text', 'Reklam alanı'),
  ('right_ad_url', ''),
  ('contact_text', 'İletişim bilgisi yönetici panelinden düzenlenebilir.'),
  ('disclaimer_text', 'SRO Rating bağımsız bir topluluk platformudur. Sunucu içeriklerinden ilgili sunucu sahipleri sorumludur.'),
  ('twitch_url', ''),
  ('kick_url', ''),
  ('youtube_url', '');
