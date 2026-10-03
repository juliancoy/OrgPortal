-- Local Docker browser-test tenant only. Apply with wrangler d1 execute --local.
-- Accounts, progress, tasks, and availability use the real local services.
INSERT INTO portal_tenants (
  id, hostname, name, tagline, profile, features, feature_config,
  public_base_url, canonical_path_prefix, member_home_path
) VALUES (
  'local-onboarding', 'lifetech.fyi', 'LifeTech', 'Local onboarding test',
  'community', '["directory","events","chat"]', '{"onboarding":{"enabled":true}}',
  'https://localhost:8443', '', '/people'
) ON CONFLICT(hostname) DO NOTHING;
