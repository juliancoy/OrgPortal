-- Shared editorial triage; formal amendments still use governance motions.
-- No reviewer identity or free text is copied here; preview receipts retain their existing lifecycle.
CREATE TABLE governance_suggestion_reviews (
 organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 document_id TEXT NOT NULL,
 section_id TEXT NOT NULL,
 suggestion_hash TEXT NOT NULL,
 decision TEXT NOT NULL CHECK(decision IN ('approved','denied','pending')),
 updated_at TEXT NOT NULL,
 PRIMARY KEY(organization_id,document_id,section_id)
);
