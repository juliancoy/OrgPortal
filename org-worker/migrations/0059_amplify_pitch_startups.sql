-- Amplify MedTech Startup Pitch Event, October 8, 2026.

-- Roster, for-profit classification and startup designation supplied by the user.

-- Event corroboration: https://www.amplifymedtech.com/

-- Scheduled collaboration, not delivered support, investment or corporate ownership.

-- No accounts, memberships, permissions, balances or authentication changes.

INSERT OR IGNORE INTO organizations (id, name, slug, description, source_url, tags)
VALUES ('org-bluehealer', 'BlueHealer', 'bluehealer', 'For-profit startup pitching at Amplify MedTech’s October 8 Startup Pitch Event.', 'https://www.linkedin.com/in/tailor-jay/', '["company","for-profit","startup"]');

INSERT OR IGNORE INTO organization_source_identities (source, external_id, organization_id)
SELECT 'bmoremedtech', 'org-bluehealer', id FROM organizations WHERE slug = 'bluehealer';

UPDATE organizations SET tags = (
 SELECT json_group_array(value) FROM (
 SELECT value FROM json_each(organizations.tags)
 UNION SELECT 'company' UNION SELECT 'for-profit' UNION SELECT 'startup'
 )), updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE id = (SELECT organization_id FROM organization_source_identities WHERE source = 'bmoremedtech' AND external_id = 'org-bluehealer');

INSERT OR IGNORE INTO organization_support_records
(id, from_organization_id, to_organization_id, from_label, to_label, support_kind, description, occurred_at, source_url, evidence, notes, provenance_json, status, created_at)
SELECT 'amplify-pitch-2026-10-08:org-bluehealer', parent.id, child.id, parent.name, child.name, 'collaboration',
'Startup pitching opportunity at Amplify MedTech’s Startup Pitch Event', '2026-10-08', 'https://www.amplifymedtech.com/',
'User-supplied pitch roster: Jay Tailor, BlueHealer. Amplify MedTech advertises five startups pitching on October 8.', 'Scheduled event participation; no monetary support or corporate ownership implied.', '[{"source": "User-supplied Amplify MedTech pitch roster", "sourceUrl": "https://www.linkedin.com/in/tailor-jay/", "eventUrl": "https://www.amplifymedtech.com/", "classificationSource": "User instruction"}]', 'reported', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM organizations parent, organizations child
WHERE parent.id = (SELECT organization_id FROM organization_source_identities WHERE source = 'bmoremedtech' AND external_id = 'org-amplify-medtech')
AND child.id = (SELECT organization_id FROM organization_source_identities WHERE source = 'bmoremedtech' AND external_id = 'org-bluehealer');

INSERT OR IGNORE INTO organizations (id, name, slug, description, source_url, tags)
VALUES ('org-salynt', 'Salynt Inc.', 'salynt', 'For-profit startup pitching at Amplify MedTech’s October 8 Startup Pitch Event.', 'https://www.linkedin.com/company/salynt-inc/', '["company","for-profit","startup"]');

INSERT OR IGNORE INTO organization_source_identities (source, external_id, organization_id)
SELECT 'bmoremedtech', 'org-salynt', id FROM organizations WHERE slug = 'salynt';

UPDATE organizations SET tags = (
 SELECT json_group_array(value) FROM (
 SELECT value FROM json_each(organizations.tags)
 UNION SELECT 'company' UNION SELECT 'for-profit' UNION SELECT 'startup'
 )), updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE id = (SELECT organization_id FROM organization_source_identities WHERE source = 'bmoremedtech' AND external_id = 'org-salynt');

INSERT OR IGNORE INTO organization_support_records
(id, from_organization_id, to_organization_id, from_label, to_label, support_kind, description, occurred_at, source_url, evidence, notes, provenance_json, status, created_at)
SELECT 'amplify-pitch-2026-10-08:org-salynt', parent.id, child.id, parent.name, child.name, 'collaboration',
'Startup pitching opportunity at Amplify MedTech’s Startup Pitch Event', '2026-10-08', 'https://www.amplifymedtech.com/',
'User-supplied pitch roster: Jeremy L., Salynt Inc.. Amplify MedTech advertises five startups pitching on October 8.', 'Scheduled event participation; no monetary support or corporate ownership implied.', '[{"source": "User-supplied Amplify MedTech pitch roster", "sourceUrl": "https://www.linkedin.com/company/salynt-inc/", "eventUrl": "https://www.amplifymedtech.com/", "classificationSource": "User instruction"}]', 'reported', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM organizations parent, organizations child
WHERE parent.id = (SELECT organization_id FROM organization_source_identities WHERE source = 'bmoremedtech' AND external_id = 'org-amplify-medtech')
AND child.id = (SELECT organization_id FROM organization_source_identities WHERE source = 'bmoremedtech' AND external_id = 'org-salynt');

INSERT OR IGNORE INTO organizations (id, name, slug, description, source_url, tags)
VALUES ('org-liquet-medical', 'Liquet Medical Inc.', 'liquet-medical', 'For-profit startup pitching at Amplify MedTech’s October 8 Startup Pitch Event.', 'https://www.linkedin.com/company/liquet-medical-inc/', '["company","for-profit","startup"]');

INSERT OR IGNORE INTO organization_source_identities (source, external_id, organization_id)
SELECT 'bmoremedtech', 'org-liquet-medical', id FROM organizations WHERE slug = 'liquet-medical';

UPDATE organizations SET tags = (
 SELECT json_group_array(value) FROM (
 SELECT value FROM json_each(organizations.tags)
 UNION SELECT 'company' UNION SELECT 'for-profit' UNION SELECT 'startup'
 )), updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE id = (SELECT organization_id FROM organization_source_identities WHERE source = 'bmoremedtech' AND external_id = 'org-liquet-medical');

INSERT OR IGNORE INTO organization_support_records
(id, from_organization_id, to_organization_id, from_label, to_label, support_kind, description, occurred_at, source_url, evidence, notes, provenance_json, status, created_at)
SELECT 'amplify-pitch-2026-10-08:org-liquet-medical', parent.id, child.id, parent.name, child.name, 'collaboration',
'Startup pitching opportunity at Amplify MedTech’s Startup Pitch Event', '2026-10-08', 'https://www.amplifymedtech.com/',
'User-supplied pitch roster: John Schindler, Liquet Medical Inc.. Amplify MedTech advertises five startups pitching on October 8.', 'Scheduled event participation; no monetary support or corporate ownership implied.', '[{"source": "User-supplied Amplify MedTech pitch roster", "sourceUrl": "https://www.linkedin.com/company/liquet-medical-inc/", "eventUrl": "https://www.amplifymedtech.com/", "classificationSource": "User instruction"}]', 'reported', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM organizations parent, organizations child
WHERE parent.id = (SELECT organization_id FROM organization_source_identities WHERE source = 'bmoremedtech' AND external_id = 'org-amplify-medtech')
AND child.id = (SELECT organization_id FROM organization_source_identities WHERE source = 'bmoremedtech' AND external_id = 'org-liquet-medical');

INSERT OR IGNORE INTO organizations (id, name, slug, description, source_url, tags)
VALUES ('org-rubitection', 'Rubitection Inc.', 'rubitection', 'For-profit startup pitching at Amplify MedTech’s October 8 Startup Pitch Event.', 'https://www.linkedin.com/company/rubitection-inc/', '["company","for-profit","startup"]');

INSERT OR IGNORE INTO organization_source_identities (source, external_id, organization_id)
SELECT 'bmoremedtech', 'org-rubitection', id FROM organizations WHERE slug = 'rubitection';

UPDATE organizations SET tags = (
 SELECT json_group_array(value) FROM (
 SELECT value FROM json_each(organizations.tags)
 UNION SELECT 'company' UNION SELECT 'for-profit' UNION SELECT 'startup'
 )), updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE id = (SELECT organization_id FROM organization_source_identities WHERE source = 'bmoremedtech' AND external_id = 'org-rubitection');

INSERT OR IGNORE INTO organization_support_records
(id, from_organization_id, to_organization_id, from_label, to_label, support_kind, description, occurred_at, source_url, evidence, notes, provenance_json, status, created_at)
SELECT 'amplify-pitch-2026-10-08:org-rubitection', parent.id, child.id, parent.name, child.name, 'collaboration',
'Startup pitching opportunity at Amplify MedTech’s Startup Pitch Event', '2026-10-08', 'https://www.amplifymedtech.com/',
'User-supplied pitch roster: Sanna Gaspard, PhD, Rubitection Inc.. Amplify MedTech advertises five startups pitching on October 8.', 'Scheduled event participation; no monetary support or corporate ownership implied.', '[{"source": "User-supplied Amplify MedTech pitch roster", "sourceUrl": "https://www.linkedin.com/company/rubitection-inc/", "eventUrl": "https://www.amplifymedtech.com/", "classificationSource": "User instruction"}]', 'reported', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM organizations parent, organizations child
WHERE parent.id = (SELECT organization_id FROM organization_source_identities WHERE source = 'bmoremedtech' AND external_id = 'org-amplify-medtech')
AND child.id = (SELECT organization_id FROM organization_source_identities WHERE source = 'bmoremedtech' AND external_id = 'org-rubitection');

INSERT OR IGNORE INTO organizations (id, name, slug, description, source_url, tags)
VALUES ('org-wearabledose', 'WearableDose', 'wearabledose', 'For-profit startup pitching at Amplify MedTech’s October 8 Startup Pitch Event.', 'https://www.linkedin.com/company/wearabledose/', '["company","for-profit","startup"]');

INSERT OR IGNORE INTO organization_source_identities (source, external_id, organization_id)
SELECT 'bmoremedtech', 'org-wearabledose', id FROM organizations WHERE slug = 'wearabledose';

UPDATE organizations SET tags = (
 SELECT json_group_array(value) FROM (
 SELECT value FROM json_each(organizations.tags)
 UNION SELECT 'company' UNION SELECT 'for-profit' UNION SELECT 'startup'
 )), updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE id = (SELECT organization_id FROM organization_source_identities WHERE source = 'bmoremedtech' AND external_id = 'org-wearabledose');

INSERT OR IGNORE INTO organization_support_records
(id, from_organization_id, to_organization_id, from_label, to_label, support_kind, description, occurred_at, source_url, evidence, notes, provenance_json, status, created_at)
SELECT 'amplify-pitch-2026-10-08:org-wearabledose', parent.id, child.id, parent.name, child.name, 'collaboration',
'Startup pitching opportunity at Amplify MedTech’s Startup Pitch Event', '2026-10-08', 'https://www.amplifymedtech.com/',
'User-supplied pitch roster: John B. Sanwo, WearableDose. Amplify MedTech advertises five startups pitching on October 8.', 'Scheduled event participation; no monetary support or corporate ownership implied.', '[{"source": "User-supplied Amplify MedTech pitch roster", "sourceUrl": "https://www.linkedin.com/company/wearabledose/", "eventUrl": "https://www.amplifymedtech.com/", "classificationSource": "User instruction"}]', 'reported', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM organizations parent, organizations child
WHERE parent.id = (SELECT organization_id FROM organization_source_identities WHERE source = 'bmoremedtech' AND external_id = 'org-amplify-medtech')
AND child.id = (SELECT organization_id FROM organization_source_identities WHERE source = 'bmoremedtech' AND external_id = 'org-wearabledose');
