CREATE TABLE timebank_communities (
  id TEXT PRIMARY KEY,
  hostname TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  tagline TEXT NOT NULL,
  accent_color TEXT NOT NULL DEFAULT '#155e59'
);
INSERT INTO timebank_communities (id, hostname, name, tagline, accent_color) VALUES
  ('code-collective', 'codecollective.us', 'Code Collective Timebank', 'Good neighbors. Useful skills. Time well shared.', '#155e59'),
  ('bmoretimebank', 'bmoretimebank.codecollective.us', 'Bmore Timebank', 'Baltimore neighbors helping Baltimore neighbors.', '#155e59');

ALTER TABLE timebank_listings ADD COLUMN community_id TEXT NOT NULL DEFAULT 'code-collective' REFERENCES timebank_communities(id);
ALTER TABLE timebank_listings ADD COLUMN image_key TEXT;
ALTER TABLE timebank_listings ADD COLUMN category TEXT NOT NULL DEFAULT 'Other';
ALTER TABLE timebank_listings ADD COLUMN contact TEXT NOT NULL DEFAULT '';
ALTER TABLE timebank_exchanges ADD COLUMN community_id TEXT NOT NULL DEFAULT 'code-collective' REFERENCES timebank_communities(id);
CREATE INDEX idx_timebank_community_board ON timebank_listings(community_id, status, created_at);
CREATE INDEX idx_timebank_community_provider ON timebank_exchanges(community_id, provider_user_id, status);
CREATE INDEX idx_timebank_community_recipient ON timebank_exchanges(community_id, recipient_user_id, status);

-- Prevent exchanges from referring to a listing in another community, even if
-- an application writer fails to apply the same scope to both rows.
CREATE TRIGGER timebank_exchange_community_insert BEFORE INSERT ON timebank_exchanges
WHEN NOT EXISTS (SELECT 1 FROM timebank_listings WHERE id = NEW.listing_id AND community_id = NEW.community_id)
BEGIN SELECT RAISE(ABORT, 'Listing belongs to another community'); END;
