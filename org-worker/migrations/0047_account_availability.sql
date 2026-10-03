-- Explicit positive and negative observations belong to the account, not a poll.
CREATE TABLE account_availability (
 user_id TEXT NOT NULL,
 slot TEXT NOT NULL,
 available INTEGER NOT NULL CHECK (available IN (0,1)),
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY (user_id,slot)
);
-- Preserve existing responses; the most recently saved response wins conflicts.
INSERT INTO account_availability (user_id,slot,available,updated_at)
SELECT user_id,slot,available,updated_at FROM (
 SELECT r.user_id,s.value AS slot,
 EXISTS (SELECT 1 FROM json_each(r.slots_json) chosen WHERE chosen.value = s.value) AS available,
 r.updated_at,
 row_number() OVER (PARTITION BY r.user_id,s.value ORDER BY r.updated_at DESC,r.poll_id DESC) AS priority
 FROM availability_responses r JOIN availability_polls p ON p.id = r.poll_id
 JOIN json_each(p.slots_json) s
) WHERE priority = 1;
