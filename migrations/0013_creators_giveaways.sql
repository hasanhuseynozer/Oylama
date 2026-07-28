CREATE TABLE IF NOT EXISTS role_applications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  application_type TEXT NOT NULL CHECK(application_type IN ('owner','creator')),
  discord TEXT NOT NULL DEFAULT '',
  contact_email TEXT NOT NULL DEFAULT '',
  introduction TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
  admin_note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_role_application_open ON role_applications(user_id,application_type) WHERE status='pending';

CREATE TABLE IF NOT EXISTS creator_profiles (
  user_id INTEGER PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  headline TEXT NOT NULL DEFAULT '',
  biography TEXT NOT NULL DEFAULT '',
  avatar_url TEXT NOT NULL DEFAULT '',
  cover_url TEXT NOT NULL DEFAULT '',
  twitch_url TEXT NOT NULL DEFAULT '',
  kick_url TEXT NOT NULL DEFAULT '',
  youtube_url TEXT NOT NULL DEFAULT '',
  discord TEXT NOT NULL DEFAULT '',
  contact_email TEXT NOT NULL DEFAULT '',
  language TEXT NOT NULL DEFAULT 'TR',
  collaboration_status TEXT NOT NULL DEFAULT 'open',
  is_approved INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS creator_ratings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  creator_user_id INTEGER NOT NULL,
  owner_user_id INTEGER NOT NULL,
  communication INTEGER NOT NULL CHECK(communication BETWEEN 1 AND 5),
  professionalism INTEGER NOT NULL CHECK(professionalism BETWEEN 1 AND 5),
  engagement INTEGER NOT NULL CHECK(engagement BETWEEN 1 AND 5),
  promotion_quality INTEGER NOT NULL CHECK(promotion_quality BETWEEN 1 AND 5),
  comment TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(creator_user_id,owner_user_id),
  FOREIGN KEY(creator_user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(owner_user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS giveaways (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organizer_user_id INTEGER NOT NULL,
  organizer_type TEXT NOT NULL CHECK(organizer_type IN ('owner','creator')),
  server_id INTEGER,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  prize_text TEXT NOT NULL,
  cover_url TEXT NOT NULL DEFAULT '',
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  min_participants INTEGER NOT NULL DEFAULT 1,
  winner_count INTEGER NOT NULL DEFAULT 1,
  reserve_count INTEGER NOT NULL DEFAULT 0,
  min_rating INTEGER NOT NULL DEFAULT 0,
  require_review INTEGER NOT NULL DEFAULT 0,
  require_character INTEGER NOT NULL DEFAULT 1,
  min_account_days INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','active','completed','cancelled')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(organizer_user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(server_id) REFERENCES servers(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS giveaway_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  giveaway_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  character_name TEXT NOT NULL DEFAULT '',
  eligibility_snapshot TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(giveaway_id,user_id),
  FOREIGN KEY(giveaway_id) REFERENCES giveaways(id) ON DELETE CASCADE,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS giveaway_winners (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  giveaway_id INTEGER NOT NULL,
  entry_id INTEGER NOT NULL,
  position INTEGER NOT NULL,
  winner_type TEXT NOT NULL CHECK(winner_type IN ('winner','reserve')),
  selected_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(giveaway_id,position,winner_type),
  FOREIGN KEY(giveaway_id) REFERENCES giveaways(id) ON DELETE CASCADE,
  FOREIGN KEY(entry_id) REFERENCES giveaway_entries(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_giveaways_status_dates ON giveaways(status,starts_at,ends_at);
CREATE INDEX IF NOT EXISTS idx_giveaway_entries_giveaway ON giveaway_entries(giveaway_id,created_at);
