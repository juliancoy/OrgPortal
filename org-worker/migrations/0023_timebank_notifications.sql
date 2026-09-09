-- Reuse the portal inbox. Events are committed atomically with timebank actions.
ALTER TABLE user_notifications ADD COLUMN community_id TEXT REFERENCES timebank_communities(id);
ALTER TABLE user_notifications ADD COLUMN deep_link TEXT;
ALTER TABLE user_notifications ADD COLUMN push_enqueued_at TEXT;
CREATE INDEX idx_notifications_community_user ON user_notifications(community_id, user_id, status, created_at);
CREATE INDEX idx_notifications_outbox ON user_notifications(push_enqueued_at, created_at) WHERE community_id IS NOT NULL;

CREATE TRIGGER timebank_uptake_notify AFTER INSERT ON timebank_uptakes
BEGIN
  INSERT OR IGNORE INTO user_notifications
    (id, user_id, type, actor_user_id, actor_user_name, entity_id, title, body, created_at, community_id, deep_link)
  SELECT 'timebank:uptake:' || NEW.listing_id || ':' || NEW.user_id,
    l.user_id, 'timebank_request_taken_up', NEW.user_id, m.name, l.id,
    'Someone took up your request', m.name || ' offered to help with “' || l.title || '”.',
    NEW.created_at, NEW.community_id, '/timebanking?listing=' || l.id
  FROM timebank_listings l JOIN timebank_members m ON m.user_id = NEW.user_id WHERE l.id = NEW.listing_id;
END;

CREATE TRIGGER timebank_exchange_notify AFTER INSERT ON timebank_exchanges
BEGIN
  INSERT INTO user_notifications
    (id, user_id, type, actor_user_id, actor_user_name, entity_id, title, body, created_at, community_id, deep_link)
  SELECT 'timebank:exchange:' || NEW.id || ':pending',
    CASE WHEN NEW.provider_user_id = NEW.proposed_by_user_id THEN NEW.recipient_user_id ELSE NEW.provider_user_id END,
    'timebank_hours_pending', NEW.proposed_by_user_id, m.name, NEW.id,
    'Hours need your confirmation', m.name || ' recorded ' || printf('%g', NEW.minutes / 60.0) || ' hours for “' || l.title || '”.',
    NEW.created_at, NEW.community_id, '/timebanking?tab=activity&exchange=' || NEW.id
  FROM timebank_listings l JOIN timebank_members m ON m.user_id = NEW.proposed_by_user_id WHERE l.id = NEW.listing_id;
END;

CREATE TRIGGER timebank_exchange_resolved_notify AFTER UPDATE OF status ON timebank_exchanges
WHEN OLD.status = 'pending' AND NEW.status <> OLD.status
BEGIN
  UPDATE user_notifications SET status = 'read', read_at = NEW.resolved_at
    WHERE id = 'timebank:exchange:' || NEW.id || ':pending';
  INSERT INTO user_notifications
    (id, user_id, type, actor_user_id, actor_user_name, entity_id, title, body, created_at, community_id, deep_link)
  SELECT 'timebank:exchange:' || NEW.id || ':' || NEW.status,
    CASE WHEN NEW.status <> 'canceled' THEN NEW.proposed_by_user_id
      WHEN NEW.provider_user_id = NEW.proposed_by_user_id THEN NEW.recipient_user_id ELSE NEW.provider_user_id END,
    'timebank_hours_' || NEW.status, m.user_id, m.name, NEW.id,
    CASE NEW.status WHEN 'confirmed' THEN 'Hours confirmed' WHEN 'declined' THEN 'Hours declined' ELSE 'Exchange canceled' END,
    m.name || ' ' || NEW.status || ' ' || printf('%g', NEW.minutes / 60.0) || ' hours for “' || l.title || '”.',
    NEW.resolved_at, NEW.community_id, '/timebanking?tab=activity&exchange=' || NEW.id
  FROM timebank_listings l JOIN timebank_members m ON m.user_id =
    CASE WHEN NEW.status = 'canceled' THEN NEW.proposed_by_user_id
      WHEN NEW.provider_user_id = NEW.proposed_by_user_id THEN NEW.recipient_user_id ELSE NEW.provider_user_id END
  WHERE l.id = NEW.listing_id;
END;

-- Existing timebank members must also be addressable by the native messenger.
-- Existing profile settings remain authoritative; new profiles are private.
INSERT OR IGNORE INTO user_contact_pages (id, user_id, user_name, slug, enabled)
SELECT 'timebank-contact:' || user_id, user_id, name, 'member-' || lower(hex(randomblob(16))), 0
FROM timebank_members;
