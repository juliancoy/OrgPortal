UPDATE portal_tenants
SET
  brand_image_path = '/images/baltimore-medtech-logo-square-v2.jpg',
  updated_at = CURRENT_TIMESTAMP
WHERE id = 'baltimore-medtech';
