ALTER TABLE portal_tenants ADD COLUMN public_base_url TEXT;
ALTER TABLE portal_tenants ADD COLUMN canonical_path_prefix TEXT NOT NULL DEFAULT '';
ALTER TABLE portal_tenants ADD COLUMN feature_config TEXT NOT NULL DEFAULT '{}';

UPDATE portal_tenants
SET
  public_base_url = 'https://codecollective.us/p',
  canonical_path_prefix = '/p',
  feature_config = '{}'
WHERE id = 'code-collective';

UPDATE portal_tenants
SET
  public_base_url = 'https://medtech.social',
  canonical_path_prefix = '',
  home_secondary_href = '/org-events',
  feature_config = '{"community":{"enabled":true},"orgEvents":{"enabled":true},"externalCalendarUrl":"https://medtech.social/calendar.html","externalMapUrl":"https://medtech.social/map.html"}'
WHERE id = 'baltimore-medtech';

UPDATE portal_tenants
SET
  public_base_url = 'https://' || hostname,
  canonical_path_prefix = '',
  feature_config = '{}'
WHERE id <> 'code-collective' AND public_base_url IS NULL;
