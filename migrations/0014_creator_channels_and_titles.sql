ALTER TABLE role_applications ADD COLUMN twitch_url TEXT NOT NULL DEFAULT '';
ALTER TABLE role_applications ADD COLUMN kick_url TEXT NOT NULL DEFAULT '';
ALTER TABLE role_applications ADD COLUMN youtube_url TEXT NOT NULL DEFAULT '';
ALTER TABLE role_applications ADD COLUMN tiktok_url TEXT NOT NULL DEFAULT '';
ALTER TABLE creator_profiles ADD COLUMN tiktok_url TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN selected_title TEXT NOT NULL DEFAULT 'SRO Rating User';
