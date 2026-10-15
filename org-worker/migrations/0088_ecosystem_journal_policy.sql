-- Rebuildable public source observations retain their reviewed immutable input
-- artifacts and checksums; avoid copying the entire imported feed to the journal.
-- Plans use deletable revision history plus minimal audit_events metadata so
-- deleting a plan does not leave its content in an immutable secondary journal.
INSERT INTO change_journal_exclusions(table_name,reason) VALUES
 ('government_award_records','rebuildable public government award observations; original retrieval artifacts and provenance retained'),
 ('nonprofit_filing_records','rebuildable public IRS financial summaries; filing object checksum and selected version retained'),
 ('nonprofit_grant_records','rebuildable public IRS organizational grant disclosures; source provenance retained'),
 ('ecosystem_initiatives','deletable public plans; revisions cascade on deletion; minimal audit_events metadata records mutations'),
 ('ecosystem_initiative_versions','deletable plan revision content cascades on deletion; do not duplicate into immutable journals');
