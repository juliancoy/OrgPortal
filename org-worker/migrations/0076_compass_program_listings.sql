-- Public program directory disclosures are not funding transactions.
CREATE TABLE funding_program_listings (
 id TEXT PRIMARY KEY,
 source TEXT NOT NULL,
 external_id TEXT NOT NULL,
 organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
 agency_organization_id TEXT REFERENCES organizations(id) ON DELETE RESTRICT,
 source_slug TEXT NOT NULL,
 compass_url TEXT NOT NULL,
 program_name TEXT NOT NULL,
 agency_label TEXT,
 url TEXT,
 program_description TEXT,
 is_accepting_applications INTEGER CHECK(is_accepting_applications IS NULL OR is_accepting_applications IN (0,1)),
 is_recurring INTEGER CHECK(is_recurring IS NULL OR is_recurring IN (0,1)),
 data_quality TEXT,
 funding_source TEXT,
 geographic_scope TEXT,
 assistance_description TEXT,
 business_stage TEXT,
 max_amount_int REAL,
 max_amount_str TEXT,
 application_deadline_string TEXT,
 application_deadline_date TEXT,
 application_process_overview TEXT,
 program_audience TEXT,
 use_of_funds TEXT,
 geographic_eligibility TEXT,
 contact_name TEXT,
 contact_email TEXT,
 contact_phone TEXT,
 source_count INTEGER,
 source_created_at TEXT,
 source_updated_at TEXT,
 retrieved_at TEXT NOT NULL,
 source_sha256 TEXT NOT NULL,
 UNIQUE(source,external_id),
 UNIQUE(source,source_slug)
);
CREATE INDEX funding_program_listings_org ON funding_program_listings(organization_id);
CREATE INDEX funding_program_listings_agency ON funding_program_listings(agency_organization_id);
CREATE INDEX funding_program_listings_deadline ON funding_program_listings(application_deadline_date,is_accepting_applications);
-- Lists and featured metadata remain ordered flat rows, not JSON blobs.
CREATE TABLE funding_program_properties (
 listing_id TEXT NOT NULL REFERENCES funding_program_listings(id) ON DELETE CASCADE,
 field TEXT NOT NULL,
 position INTEGER NOT NULL DEFAULT 0,
 value TEXT,
 value_type TEXT NOT NULL CHECK(value_type IN ('string','number','boolean','null','empty_array','empty_object')),
 PRIMARY KEY(listing_id,field,position)
);
CREATE INDEX funding_program_properties_lookup ON funding_program_properties(field,value,listing_id);
