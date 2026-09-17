ALTER TABLE timebank_listings ADD COLUMN tags TEXT NOT NULL DEFAULT '[]';

CREATE INDEX idx_timebank_listings_kind_status_community ON timebank_listings(community_id, kind, status, created_at);
