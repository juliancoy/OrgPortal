-- OrgPortal is a platform entry point, not a Code Collective domain alias.
-- Keep all community IDs, memberships, accounts, and ledgers unchanged.
UPDATE portal_tenants
SET custom_domain_hostname = NULL, custom_domain_status = 'none',
    custom_domain_attached_at = NULL, updated_at = CURRENT_TIMESTAMP
WHERE id = 'code-collective' AND custom_domain_hostname = 'orgportal.cc';

INSERT INTO portal_tenants
  (id, hostname, name, tagline, accent_color, profile, features,
   brand_image_path, home_url, member_home_path, manifest_path, theme_color,
   home_kind, public_base_url, canonical_path_prefix, feature_config)
VALUES
  ('orgportal', 'orgportal.cc', 'OrgPortal', 'A place for every community.',
   '#155e59', 'orgportal', '["directory","events","calendar","chat"]',
   '/orgportal.svg', '/', '/communities', '/orgportal.webmanifest', '#155e59',
   'main', 'https://orgportal.cc', '', '{}')
ON CONFLICT(id) DO NOTHING;
