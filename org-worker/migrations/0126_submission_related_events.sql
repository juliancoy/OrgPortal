-- A submission establishes a related event, not attendance, acceptance or hosting.
-- Browser, MCP and guest-team creation share this database rule.
CREATE TRIGGER submission_related_event_insert AFTER INSERT ON event_submissions BEGIN
 INSERT OR IGNORE INTO event_organizations(event_id,organization_id) VALUES(NEW.event_id,NEW.organization_id);
END;
CREATE TRIGGER submission_related_event_update AFTER UPDATE OF event_id,organization_id ON event_submissions BEGIN
 INSERT OR IGNORE INTO event_organizations(event_id,organization_id) VALUES(NEW.event_id,NEW.organization_id);
END;
-- Private guest intake has no verified organization until the guest claims it.
CREATE TRIGGER guest_submission_related_event_insert AFTER INSERT ON event_guest_presentations
WHEN NEW.organization_id IS NOT NULL BEGIN
 INSERT OR IGNORE INTO event_organizations(event_id,organization_id) VALUES(NEW.event_id,NEW.organization_id);
END;
CREATE TRIGGER guest_submission_related_event_update AFTER UPDATE OF event_id,organization_id ON event_guest_presentations
WHEN NEW.organization_id IS NOT NULL BEGIN
 INSERT OR IGNORE INTO event_organizations(event_id,organization_id) VALUES(NEW.event_id,NEW.organization_id);
END;
-- Include past submissions regardless of review status or expiry. Preserve
-- this event history if the application is later withdrawn.
INSERT OR IGNORE INTO event_organizations(event_id,organization_id)
 SELECT event_id,organization_id FROM event_submissions;
INSERT OR IGNORE INTO event_organizations(event_id,organization_id)
 SELECT event_id,organization_id FROM event_guest_presentations WHERE organization_id IS NOT NULL;
