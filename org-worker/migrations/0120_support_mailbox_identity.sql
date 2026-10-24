-- Seed missing defaults using the organization identity in supportMailboxes.ts.
-- Existing administrator-edited FAQs are preserved.
INSERT OR IGNORE INTO support_faqs(id,organization_id,question,answer,source_url,reviewed_by,updated_at)
 SELECT 'lifetech-bylaws',id,'Where can I read the LifeTech bylaws?',
 'Read the LifeTech Constitution and Bylaws, including its current draft or ratification status, at https://lifetech.fyi/governance/documents/lifetech-constitution .',
 'https://lifetech.fyi/governance/documents/lifetech-constitution','system:canonical-resource',strftime('%Y-%m-%dT%H:%M:%fZ','now') FROM organizations WHERE id='ef646755-9443-4c7b-ba4b-a7a29754f666';
INSERT OR IGNORE INTO support_faqs(id,organization_id,question,answer,source_url,reviewed_by,updated_at)
 SELECT 'lifetech-availability',id,'Where can I set my meeting availability?',
 'Sign in to LifeTech and set your meeting availability at https://lifetech.fyi/availability .',
 'https://lifetech.fyi/availability','system:canonical-resource',strftime('%Y-%m-%dT%H:%M:%fZ','now') FROM organizations WHERE id='ef646755-9443-4c7b-ba4b-a7a29754f666';
