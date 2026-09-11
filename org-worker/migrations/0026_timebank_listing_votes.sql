CREATE TABLE timebank_listing_votes (
  listing_id TEXT NOT NULL REFERENCES timebank_listings(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES timebank_members(user_id),
  community_id TEXT NOT NULL REFERENCES timebank_communities(id),
  direction TEXT NOT NULL CHECK (direction IN ('up', 'down')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (listing_id, user_id)
);
CREATE INDEX idx_timebank_listing_votes_community ON timebank_listing_votes(community_id, listing_id);
CREATE TRIGGER timebank_listing_vote_community_insert BEFORE INSERT ON timebank_listing_votes
WHEN NOT EXISTS (SELECT 1 FROM timebank_listings WHERE id = NEW.listing_id AND community_id = NEW.community_id)
BEGIN SELECT RAISE(ABORT, 'Listing belongs to another community'); END;
