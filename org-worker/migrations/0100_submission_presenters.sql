-- Reviewed: presenter selection is independent of management permissions.
-- Existing proposals do not implicitly identify anyone as a presenter.
ALTER TABLE event_submissions ADD COLUMN presenters_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(presenters_json) AND json_type(presenters_json)='array');
-- Resolve an accepted invitation to the authenticated recipient before expiring
-- invitation records are removed. No identity is inferred from an email address.
CREATE TRIGGER submission_presenter_invitation_accepted AFTER UPDATE OF status ON organization_invitations
WHEN NEW.status='accepted' AND NEW.accepted_user_id IS NOT NULL BEGIN
 UPDATE event_submissions SET presenters_json=(
  SELECT json_group_array(json(CASE WHEN json_extract(value,'$.invitationId')=NEW.id
   THEN json_object('userId',NEW.accepted_user_id) ELSE value END)) FROM json_each(presenters_json)
 ) WHERE organization_id=NEW.organization_id AND EXISTS(
  SELECT 1 FROM json_each(presenters_json) WHERE json_extract(value,'$.invitationId')=NEW.id
 );
END;

-- Keep the previous Worker compatible during rollout after adding a column.
DROP TRIGGER legacy_submission_insert;
CREATE TRIGGER legacy_submission_insert AFTER INSERT ON event_presentation_submissions BEGIN
 INSERT INTO event_submissions(event_id,submission_id,organization_id,submitted_by,title,summary,status,updated_at,expires_at)
 VALUES(NEW.event_id,NEW.organization_id,NEW.organization_id,NEW.submitted_by,NEW.title,NEW.summary,NEW.status,NEW.updated_at,NEW.expires_at);
END;
