# Ecosystem network data

The network includes the complete public organization directory, without a LifeTech tag filter. Production support records are read through the public OrgPortal API. `web/scripts/sync-portal-ecosystem.mjs` refreshes that evidence.

`web/scripts/build-network-history.mjs` reads every available `event_history.json`, `manual_events.json`, and `upcoming_events.json` at the CodeCollective root and its immediate source directories. Set `CODECOLLECTIVE_DIR` for a different checkout. Event occurrences are deduplicated by source URL and start date; cross-listed events with different source URLs remain distinct. All entries with a title and public URL are retained, including undated events. Organization links require source metadata or a Code Collective organizer URL; mentions alone do not establish hosting. The event browser searches the entire dataset and progressively displays results.

`web/public/ecosystem-data/ecosystem-research.json` contains sourced Maryland funding evidence and the user-reported Stand with Crypto contribution of $600 to Code Collective in 2026. The earlier $200 mention is excluded pending clarification. The ten Build Our Future awards retain individual amounts and the announcement date; the program total is not added as an extra transaction. State/agency affiliation is separate from funding. Awards do not establish cash settlement.

These files are public map evidence. They do not write the production `organization_support_records` table or `master_transaction_records` view. Production imports require authenticated API permissions and preview/apply receipts. The archive is a checkout snapshot, not a claim that every live platform event has been exhaustively fetched.

Validation: `npm run test:ecosystem`, `npm run test:events`, both Vite brand builds, and headless browser checks of event search and funding-source selection.

## Federal evidence added October 5, 2026

Federal departments, agencies and their Maryland recipients retain separate identities. The research file now includes NSF, SBA, DOE/ARPA-E, DoD/DARPA, NASA, Commerce/NIST, USDA/NIFA, FDA, CDC, Treasury and HHS; the existing NIH and EDA nodes are matched by name. Thirty-two sourced relationships cover institutional hierarchy, research collaboration, and awards. Examples include NSF's UMD-led quantum simulation institute, SBA FAST and Maryland STEP awards, Treasury's TEDCO BRIDGE award, NIST's historical Maryland MEP founding agreement, ARPA-E's UMD superinsulation project, NASA Dragonfly and DARPA prosthetics at Johns Hopkins APL, NIFA research projects, FDA CERSI centers, and annual CDC PHEP/PHIG funding.

The 2026 TEDCO FAST award amount remains undisclosed. FDA CERSI's $50M maximum is a program ceiling (`terms`), excluded from money-only links. Completed DARPA work and the 2013 NIST award remain explicitly historical. CDC PHIG's cumulative total is excluded because the individual yearly records already represent the funding. NSF's $25M institute award is not repeated as an award to every partner. Every added relationship carries its evidence URL and review date. Coverage remains a sourced selection, not a complete inventory of federal spending.

The shared page is `/ecosystem/network` (under `/p/` on CodeCollective). It uses the common portal navigation and live public tenant API. LifeTech owns its static directory and links into this shared page. The graph renderer aborts pending requests and releases graphics resources when the page unmounts.

## Connected organizations by default

“Hide organizations without connections” is checked initially and after Reset.
It removes nodes with no edges in the currently filtered graph, after category,
relationship, money-view and neighbor filters. Unchecking it reveals otherwise
eligible isolated organizations, including in the money view. Search, organization
details and evidence tables remain available for organizations hidden from the
map. No organization or relationship records are deleted.
