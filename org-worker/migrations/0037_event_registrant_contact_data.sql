INSERT OR IGNORE INTO user_contact_pages (id, user_id, user_name, slug, enabled, links)
SELECT
  'event-registrant-' || r.user_id,
  r.user_id,
  'User',
  'event-registrant-' || lower(
    replace(
      replace(
        replace(
          replace(trim(r.user_id), '@', '-'),
          '.', '-'
        ),
        '_', '-'
      ),
      ':', '-'
    )
  ) || '-' || r.rowid,
  0,
  '[]'
FROM event_registrations r
WHERE NOT EXISTS (
  SELECT 1 FROM user_contact_pages p WHERE p.user_id = r.user_id
);

UPDATE user_contact_pages
SET user_name = 'User',
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE user_id IN (SELECT user_id FROM event_registrations)
  AND (user_name IS NULL OR trim(user_name) = '' OR instr(user_name, '@') > 0);

UPDATE OR IGNORE user_contact_pages
SET slug = 'event-registrant-' || lower(
      replace(
        replace(
          replace(
            replace(trim(user_id), '@', '-'),
            '.', '-'
          ),
          '_', '-'
        ),
        ':', '-'
      )
    ) || '-' || rowid,
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE user_id IN (SELECT user_id FROM event_registrations)
  AND trim(slug) = '';

UPDATE user_contact_pages
SET photo_url = NULL,
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE user_id IN (SELECT user_id FROM event_registrations)
  AND photo_url IS NOT NULL
  AND photo_url NOT LIKE 'http://%'
  AND photo_url NOT LIKE 'https://%';
