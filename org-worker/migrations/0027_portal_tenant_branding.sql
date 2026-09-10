ALTER TABLE portal_tenants ADD COLUMN brand_image_path TEXT;
ALTER TABLE portal_tenants ADD COLUMN home_url TEXT;
ALTER TABLE portal_tenants ADD COLUMN member_home_path TEXT;
ALTER TABLE portal_tenants ADD COLUMN manifest_path TEXT;
ALTER TABLE portal_tenants ADD COLUMN theme_color TEXT;

UPDATE portal_tenants
SET
  brand_image_path = '/images/namebanner.png',
  home_url = '/',
  member_home_path = '/chat',
  manifest_path = '/manifest.webmanifest',
  theme_color = '#12325b'
WHERE id = 'code-collective';

UPDATE portal_tenants
SET
  brand_image_path = '/images/baltimore-medtech-logo-square.jpg',
  home_url = 'https://medtech.social/',
  member_home_path = '/chat',
  manifest_path = '/medtech.webmanifest',
  theme_color = '#061a26'
WHERE id = 'baltimore-medtech';

UPDATE portal_tenants
SET
  home_url = '/',
  member_home_path = '/',
  manifest_path = '/manifest.webmanifest',
  theme_color = accent_color
WHERE profile = 'community';
