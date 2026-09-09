CREATE TABLE timebank_uptakes (
  listing_id TEXT NOT NULL REFERENCES timebank_listings(id),
  user_id TEXT NOT NULL REFERENCES timebank_members(user_id),
  community_id TEXT NOT NULL REFERENCES timebank_communities(id),
  created_at TEXT NOT NULL,
  PRIMARY KEY (listing_id, user_id)
);
CREATE INDEX idx_timebank_uptakes_community ON timebank_uptakes(community_id, listing_id);
CREATE TRIGGER timebank_uptake_request_insert BEFORE INSERT ON timebank_uptakes
WHEN NOT EXISTS (
  SELECT 1 FROM timebank_listings WHERE id = NEW.listing_id
  AND community_id = NEW.community_id AND kind = 'request' AND user_id <> NEW.user_id
)
BEGIN SELECT RAISE(ABORT, 'Choose a request from another member in this community'); END;
