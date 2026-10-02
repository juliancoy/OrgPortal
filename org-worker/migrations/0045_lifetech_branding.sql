UPDATE portal_tenants
SET brand_image_path = '/assets/images/lifetech-logo.png',
    manifest_path = '/lifetech.webmanifest',
    theme_color = '#061a26',
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE home_org_slug = 'lifetech';

UPDATE organizations
SET image_url = 'https://lifetech.fyi/assets/images/lifetech-logo.png',
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE slug = 'lifetech';
