-- Publish the shared slug portal before attaching the provisioned custom domain.
-- Public metadata creates no identity mappings or memberships.
INSERT INTO organizations (id, name, slug, description, source_url, image_url, tags)
VALUES ('deism', 'Church of God (Deist)', 'deism',
  'The Deist community: reason, nature, ethics, and education.',
  'https://deism.church/', 'https://deism.church/images/android-chrome-512x512.png',
  '["deism","religion","community","education"]')
ON CONFLICT(slug) DO NOTHING;

INSERT INTO portal_tenants (
  id, organization_id, slug, hostname, name, tagline, accent_color, profile, features,
  brand_image_path, home_url, member_home_path, manifest_path, theme_color,
  home_kind, home_org_slug, home_heading, home_description,
  home_primary_label, home_primary_href, home_secondary_label, home_secondary_href,
  home_image_url, public_base_url, canonical_path_prefix, feature_config,
  custom_domain_hostname, custom_domain_status, custom_domain_requested_at
)
SELECT 'deism', id, 'deism', 'deism.slug.portal.local', 'Deism',
  'Reason, nature, and community', '#14532d', 'deism',
  '["directory","events","calendar","chat"]',
  '/images/deism/icon-512.png', 'https://deism.church/', '/chat',
  '/deism.webmanifest', '#14532d', 'default', slug, 'Deism',
  'Connect with the Deist community, explore doctrine and education, and take part in conversations and events.',
  'Join Deism', '/users/login', 'Community Events', '/org-events',
  '/images/deism/icon-512.png', 'https://codecollective.us/p/portals/deism', '/p',
  '{"slugPortal":{"enabled":true,"path":"/portals/deism"},"community":{"enabled":true},"orgEvents":{"enabled":true},"specialtyResources":[{"id":"doctrine","label":"Book of Doctrine","description":"Read the foundational teachings and eight pillars of Deism.","href":"https://deism.church/","category":"Doctrine","external":true},{"id":"deismu","label":"DeismU","description":"Explore the Deist education curriculum.","href":"https://deism.church/deismu.html","category":"Education","external":true}]}', 'portal.deism.church', 'requested', CURRENT_TIMESTAMP
FROM organizations WHERE slug = 'deism'
ON CONFLICT(id) DO NOTHING;
