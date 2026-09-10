ALTER TABLE portal_tenants ADD COLUMN home_kind TEXT NOT NULL DEFAULT 'default';
ALTER TABLE portal_tenants ADD COLUMN home_path TEXT;
ALTER TABLE portal_tenants ADD COLUMN home_org_slug TEXT;
ALTER TABLE portal_tenants ADD COLUMN home_heading TEXT;
ALTER TABLE portal_tenants ADD COLUMN home_description TEXT;
ALTER TABLE portal_tenants ADD COLUMN home_primary_label TEXT;
ALTER TABLE portal_tenants ADD COLUMN home_primary_href TEXT;
ALTER TABLE portal_tenants ADD COLUMN home_secondary_label TEXT;
ALTER TABLE portal_tenants ADD COLUMN home_secondary_href TEXT;
ALTER TABLE portal_tenants ADD COLUMN home_image_url TEXT;

UPDATE portal_tenants
SET
  home_kind = 'auth',
  home_org_slug = 'baltimore-medtech',
  home_heading = 'Baltimore MedTech',
  home_description = 'Find your next conversation, connection, or local event across health, medicine, and biotech.',
  home_primary_label = 'Join Baltimore MedTech',
  home_primary_href = '/users/register',
  home_secondary_label = 'Browse MedTech Events',
  home_secondary_href = '/medtech-events',
  home_image_url = '/images/baltimore-medtech-hero.webp'
WHERE id = 'baltimore-medtech';

UPDATE portal_tenants
SET
  home_kind = 'timebank',
  home_heading = name,
  home_description = tagline
WHERE profile = 'community' AND features LIKE '%timebank%';
