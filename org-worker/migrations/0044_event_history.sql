ALTER TABLE events ADD COLUMN attendance_count INTEGER CHECK (attendance_count IS NULL OR attendance_count >= 0);
ALTER TABLE events ADD COLUMN attendance_source_url TEXT;

CREATE TABLE event_organizations (
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  PRIMARY KEY (event_id, organization_id)
);
CREATE INDEX event_organizations_by_org ON event_organizations(organization_id, event_id);

INSERT INTO event_organizations (event_id, organization_id)
SELECT e.id, o.id FROM events e, organizations o
WHERE e.slug = 'medtech-in-the-hut' AND o.slug = 'lifetech';

UPDATE events SET attendance_count = 76, attendance_source_url = 'https://luma.com/csd7fvgm'
WHERE slug = 'medtech-in-the-hut';
