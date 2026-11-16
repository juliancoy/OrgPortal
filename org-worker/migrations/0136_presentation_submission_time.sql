-- Reviewed additive rollout: preserve original receipt time across edits/reviews.
ALTER TABLE event_submissions ADD COLUMN submitted_at TEXT;
ALTER TABLE event_submissions ADD COLUMN submission_time_source TEXT NOT NULL DEFAULT 'submission'
 CHECK(submission_time_source IN ('submission','first_recorded'));
-- The host outbox is created only on initial submission. Older support records
-- or update timestamps are earliest surviving evidence, not proven receipt times.
UPDATE event_submissions SET submitted_at=COALESCE(
 (SELECT MIN(n.created_at) FROM presentation_host_notifications n WHERE n.event_id=event_submissions.event_id AND n.submission_id=event_submissions.submission_id AND n.source='team'),
 (SELECT r.created_at FROM organization_support_records r WHERE r.id='presentation:'||event_submissions.event_id||':'||event_submissions.submission_id),
 updated_at),
 submission_time_source=CASE WHEN EXISTS(SELECT 1 FROM presentation_host_notifications n
  WHERE n.event_id=event_submissions.event_id AND n.submission_id=event_submissions.submission_id AND n.source='team')
 THEN 'submission' ELSE 'first_recorded' END;
-- The current and previous API both provide a server-generated initial updated_at.
CREATE TRIGGER presentation_set_submission_time AFTER INSERT ON event_submissions
 WHEN NEW.submitted_at IS NULL BEGIN
 UPDATE event_submissions SET submitted_at=NEW.updated_at WHERE event_id=NEW.event_id AND submission_id=NEW.submission_id;
END;
CREATE TRIGGER presentation_preserve_submission_time BEFORE UPDATE OF submitted_at,submission_time_source ON event_submissions
 WHEN OLD.submitted_at IS NOT NULL AND (NEW.submitted_at IS NOT OLD.submitted_at OR NEW.submission_time_source IS NOT OLD.submission_time_source)
 BEGIN SELECT RAISE(ABORT,'Original submission time cannot be changed'); END;
