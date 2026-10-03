CREATE TABLE onboarding_enrollments (
 tenant_id TEXT NOT NULL REFERENCES portal_tenants(id),
 user_id TEXT NOT NULL,
 start_date TEXT NOT NULL,
 end_date TEXT NOT NULL,
 acknowledgements TEXT NOT NULL DEFAULT '{}',
 availability_saved_at TEXT,
 completed_at TEXT,
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 PRIMARY KEY (tenant_id,user_id)
);
UPDATE portal_tenants SET feature_config = json_set(feature_config, '$.onboarding.enabled', json('true'))
WHERE home_org_slug = 'lifetech';
