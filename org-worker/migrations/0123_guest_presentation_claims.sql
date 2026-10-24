-- Existing applications are not emailed retroactively. Claiming grants no org access.
ALTER TABLE event_guest_presentations ADD COLUMN acknowledgement_status TEXT NOT NULL DEFAULT 'not_requested'
 CHECK(acknowledgement_status IN ('not_requested','sending','accepted','uncertain','unavailable'));
ALTER TABLE event_guest_presentations ADD COLUMN claimed_by_user_id TEXT;
ALTER TABLE event_guest_presentations ADD COLUMN claimed_at TEXT;
CREATE INDEX guest_presentations_claimant ON event_guest_presentations(claimed_by_user_id,expires_at);
CREATE INDEX guest_presentations_email ON event_guest_presentations(email,created_at);
