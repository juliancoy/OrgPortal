-- Separate final ballots from preliminary favorites. Shortlists lock on opening.
CREATE TABLE event_presentation_final_rounds (
 event_id TEXT PRIMARY KEY REFERENCES events(id) ON DELETE CASCADE,
 phase TEXT NOT NULL CHECK(phase IN ('shortlist','open','closed')),
 finalist_ids_json TEXT NOT NULL CHECK(json_valid(finalist_ids_json)),
 expires_at TEXT NOT NULL
);
CREATE INDEX presentation_final_rounds_expiry ON event_presentation_final_rounds(expires_at);
CREATE TABLE event_presentation_final_ballots (
 event_id TEXT NOT NULL REFERENCES event_presentation_final_rounds(event_id) ON DELETE CASCADE,
 user_id TEXT NOT NULL,
 submission_id TEXT NOT NULL,
 expires_at TEXT NOT NULL,
 PRIMARY KEY(event_id,user_id),
 FOREIGN KEY(event_id,submission_id) REFERENCES event_submissions(event_id,submission_id) ON DELETE CASCADE
);
CREATE INDEX presentation_final_ballots_results ON event_presentation_final_ballots(event_id,submission_id);
CREATE INDEX presentation_final_ballots_expiry ON event_presentation_final_ballots(expires_at);
INSERT INTO change_journal_exclusions(table_name,reason) VALUES
 ('event_presentation_final_rounds','Expiring event shortlist and voting state; no immutable journal or replicas'),
 ('event_presentation_final_ballots','Private single-choice event ballots; expire with submissions, deletable without immutable copies');
