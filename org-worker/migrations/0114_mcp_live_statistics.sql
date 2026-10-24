-- Aggregate request counters only: no identity, arguments, URLs or credentials.
CREATE TABLE mcp_live_statistics (
 day TEXT NOT NULL, stage TEXT NOT NULL, outcome TEXT NOT NULL,
 requests INTEGER NOT NULL, total_ms INTEGER NOT NULL, max_ms INTEGER NOT NULL,
 PRIMARY KEY(day,stage,outcome)
);
INSERT INTO change_journal_exclusions(table_name,reason) VALUES('mcp_live_statistics','Anonymous daily operational counters; retained for 30 days and excluded from immutable history and public replication');
