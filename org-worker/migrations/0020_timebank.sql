CREATE TABLE timebank_members (
  user_id TEXT PRIMARY KEY,
  name TEXT NOT NULL
);

CREATE TABLE timebank_listings (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES timebank_members(user_id),
  kind TEXT NOT NULL CHECK (kind IN ('offer', 'request')),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  location TEXT NOT NULL DEFAULT '',
  minutes INTEGER NOT NULL CHECK (minutes BETWEEN 15 AND 1440 AND minutes % 15 = 0),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  created_at TEXT NOT NULL
);
CREATE INDEX idx_timebank_listings_board ON timebank_listings(status, created_at);
CREATE INDEX idx_timebank_listings_owner ON timebank_listings(user_id, created_at);

-- Confirmed exchanges are the hours ledger. Balances are calculated from this
-- ledger, never from Dena accounts or a separately updated balance cache.
CREATE TABLE timebank_exchanges (
  id TEXT PRIMARY KEY,
  listing_id TEXT NOT NULL REFERENCES timebank_listings(id),
  provider_user_id TEXT NOT NULL REFERENCES timebank_members(user_id),
  recipient_user_id TEXT NOT NULL REFERENCES timebank_members(user_id),
  proposed_by_user_id TEXT NOT NULL REFERENCES timebank_members(user_id),
  minutes INTEGER NOT NULL CHECK (minutes BETWEEN 15 AND 1440 AND minutes % 15 = 0),
  note TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'declined', 'canceled')),
  created_at TEXT NOT NULL,
  resolved_at TEXT,
  CHECK (provider_user_id <> recipient_user_id),
  CHECK (proposed_by_user_id IN (provider_user_id, recipient_user_id)),
  CHECK ((status = 'pending' AND resolved_at IS NULL) OR (status <> 'pending' AND resolved_at IS NOT NULL))
);
CREATE INDEX idx_timebank_exchanges_provider ON timebank_exchanges(provider_user_id, status, created_at);
CREATE INDEX idx_timebank_exchanges_recipient ON timebank_exchanges(recipient_user_id, status, created_at);
