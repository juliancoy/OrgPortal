INSERT OR IGNORE INTO user_connections (
  id,
  pair_key,
  requester_user_id,
  requester_user_name,
  recipient_user_id,
  recipient_user_name,
  status,
  requested_at,
  responded_at,
  updated_at
)
SELECT
  'conn-admin-' || substr(hex(randomblob(16)), 1, 32),
  CASE
    WHEN admin.user_id < person.user_id THEN admin.user_id || ':' || person.user_id
    ELSE person.user_id || ':' || admin.user_id
  END,
  admin.user_id,
  COALESCE(admin.user_name, 'Julian Coy II'),
  person.user_id,
  COALESCE(person.user_name, 'User'),
  'accepted',
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM user_contact_pages admin
JOIN user_contact_pages person ON person.user_id <> admin.user_id
WHERE lower(admin.user_email) = 'julian@codecollective.us';
