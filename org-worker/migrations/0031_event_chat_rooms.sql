ALTER TABLE events ADD COLUMN event_chat_room_id TEXT;
ALTER TABLE events ADD COLUMN event_chat_room_alias TEXT;
ALTER TABLE events ADD COLUMN event_chat_room_name TEXT;

CREATE INDEX IF NOT EXISTS idx_events_chat_room_id
  ON events(event_chat_room_id)
  WHERE event_chat_room_id IS NOT NULL;
