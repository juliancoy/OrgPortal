-- Generated from ../bmoremedtech/assets/data/ecosystem.json (2026-10-01T19:51:37.942Z).

-- Public evidence only. No payments, identities, roles or permissions are created.

CREATE TABLE IF NOT EXISTS organization_source_identities (
    source TEXT NOT NULL, external_id TEXT NOT NULL,
    organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    PRIMARY KEY (source, external_id)
  );

INSERT OR IGNORE INTO organizations (id, name, slug, description, source_url, tags, city, created_at, updated_at)
      VALUES ('org-amplify-medtech', 'Amplify MedTech', 'amplify-medtech', 'Core — directly aligned with regional MedTech community-building', 'https://www.amplifymedtech.com/', '["ecosystem","MedTech network / ESO"]', 'Baltimore', '2026-10-01T19:51:37.942Z', '2026-10-01T19:51:37.942Z');

INSERT OR IGNORE INTO organization_source_identities (source, external_id, organization_id)
      SELECT 'bmoremedtech', 'org-amplify-medtech', id FROM organizations WHERE slug = 'amplify-medtech';

INSERT OR IGNORE INTO organizations (id, name, slug, description, source_url, tags, city, created_at, updated_at)
      VALUES ('org-the-launchport', 'The LaunchPort', 'the-launchport', 'Core — medical-device commercialization and manufacturing', 'https://thelaunchport.com/', '["ecosystem","MedTech accelerator / manufacturing"]', 'Baltimore', '2026-10-01T19:51:37.942Z', '2026-10-01T19:51:37.942Z');

INSERT OR IGNORE INTO organization_source_identities (source, external_id, organization_id)
      SELECT 'bmoremedtech', 'org-the-launchport', id FROM organizations WHERE slug = 'the-launchport';

INSERT OR IGNORE INTO organizations (id, name, slug, description, source_url, tags, city, created_at, updated_at)
      VALUES ('org-mdc-studio-maryland-development-center', 'MDC Studio / Maryland Development Center', 'mdc-studio-maryland-development-center', 'Core — medical-device venture creation and commercialization', 'https://mdcstudio.com/', '["ecosystem","MedTech venture studio"]', 'Baltimore', '2026-10-01T19:51:37.942Z', '2026-10-01T19:51:37.942Z');

INSERT OR IGNORE INTO organization_source_identities (source, external_id, organization_id)
      SELECT 'bmoremedtech', 'org-mdc-studio-maryland-development-center', id FROM organizations WHERE slug = 'mdc-studio-maryland-development-center';

INSERT OR IGNORE INTO organizations (id, name, slug, description, source_url, tags, city, created_at, updated_at)
      VALUES ('org-techstars-ai-health-baltimore', 'Techstars AI Health Baltimore', 'techstars-ai-health-baltimore', 'Very high — AI/health venture acceleration', 'https://www.techstars.com/accelerators/baltimore-ai-health', '["ecosystem","Health accelerator"]', 'Baltimore', '2026-10-01T19:51:37.942Z', '2026-10-01T19:51:37.942Z');

INSERT OR IGNORE INTO organization_source_identities (source, external_id, organization_id)
      SELECT 'bmoremedtech', 'org-techstars-ai-health-baltimore', id FROM organizations WHERE slug = 'techstars-ai-health-baltimore';

INSERT OR IGNORE INTO organizations (id, name, slug, description, source_url, tags, city, created_at, updated_at)
      VALUES ('org-university-of-maryland-baltimore-um-ventures', 'University of Maryland, Baltimore / UM Ventures', 'university-of-maryland-baltimore-um-ventures', 'Very high — biomedical research, tech transfer, BioPark and venture funding', 'https://www.umaryland.edu/ord/', '["university","Academic medical commercialization / research"]', 'Baltimore', '2026-10-01T19:51:37.942Z', '2026-10-01T19:51:37.942Z');

INSERT OR IGNORE INTO organization_source_identities (source, external_id, organization_id)
      SELECT 'bmoremedtech', 'org-university-of-maryland-baltimore-um-ventures', id FROM organizations WHERE slug = 'university-of-maryland-baltimore-um-ventures';

INSERT OR IGNORE INTO organizations (id, name, slug, description, source_url, tags, city, created_at, updated_at)
      VALUES ('org-hexcite-johns-hopkins-technology-ventures', 'Hexcite — Johns Hopkins Technology Ventures', 'hexcite-johns-hopkins-technology-ventures', 'Very high — clinical, design and digital-health translation', 'https://ventures.jhu.edu/programs-services/cohort-based-programs/hexcite/', '["ecosystem","Digital-health venture program"]', 'Baltimore', '2026-10-01T19:51:37.942Z', '2026-10-01T19:51:37.942Z');

INSERT OR IGNORE INTO organization_source_identities (source, external_id, organization_id)
      SELECT 'bmoremedtech', 'org-hexcite-johns-hopkins-technology-ventures', id FROM organizations WHERE slug = 'hexcite-johns-hopkins-technology-ventures';

INSERT OR IGNORE INTO organizations (id, name, slug, description, source_url, tags, city, created_at, updated_at)
      VALUES ('org-healthworx-carefirst', 'Healthworx / CareFirst', 'healthworx-carefirst', 'Very high — Baltimore healthcare capital, accelerator and strategic partner', 'https://healthworx.com/', '["funding","Healthcare innovation + investment arm"]', 'Baltimore', '2026-10-01T19:51:37.942Z', '2026-10-01T19:51:37.942Z');

INSERT OR IGNORE INTO organization_source_identities (source, external_id, organization_id)
      SELECT 'bmoremedtech', 'org-healthworx-carefirst', id FROM organizations WHERE slug = 'healthworx-carefirst';

INSERT OR IGNORE INTO organizations (id, name, slug, description, source_url, tags, city, created_at, updated_at)
      VALUES ('org-fastforward-johns-hopkins-technology-ventures', 'FastForward / Johns Hopkins Technology Ventures', 'fastforward-johns-hopkins-technology-ventures', 'Very high — Hopkins translation, labs and startup support', 'https://ventures.jhu.edu/fastforward/', '["university","University commercialization / incubator"]', 'Baltimore', '2026-10-01T19:51:37.942Z', '2026-10-01T19:51:37.942Z');

INSERT OR IGNORE INTO organization_source_identities (source, external_id, organization_id)
      SELECT 'bmoremedtech', 'org-fastforward-johns-hopkins-technology-ventures', id FROM organizations WHERE slug = 'fastforward-johns-hopkins-technology-ventures';

INSERT OR IGNORE INTO organizations (id, name, slug, description, source_url, tags, city, created_at, updated_at)
      VALUES ('org-lifebridge-health', 'LifeBridge Health', 'lifebridge-health', 'Very high — provider network, clinical access and co-founder of 1501 Health', 'https://www.lifebridgehealth.org/', '["health","Health system / innovation partner"]', 'Baltimore', '2026-10-01T19:51:37.942Z', '2026-10-01T19:51:37.942Z');

INSERT OR IGNORE INTO organization_source_identities (source, external_id, organization_id)
      SELECT 'bmoremedtech', 'org-lifebridge-health', id FROM organizations WHERE slug = 'lifebridge-health';

INSERT OR IGNORE INTO organizations (id, name, slug, description, source_url, tags, city, created_at, updated_at)
      VALUES ('org-blackbird-laboratories', 'Blackbird Laboratories', 'blackbird-laboratories', 'Very high — life-science venture creation and lab ecosystem', 'https://blackbirdlab.org/', '["ecosystem","Biotech incubator / venture studio"]', 'Baltimore', '2026-10-01T19:51:37.942Z', '2026-10-01T19:51:37.942Z');

INSERT OR IGNORE INTO organization_source_identities (source, external_id, organization_id)
      SELECT 'bmoremedtech', 'org-blackbird-laboratories', id FROM organizations WHERE slug = 'blackbird-laboratories';

INSERT OR IGNORE INTO organizations (id, name, slug, description, source_url, tags, city, created_at, updated_at)
      VALUES ('org-connect-labs-by-wexford-baltimore', 'Connect Labs by Wexford — Baltimore', 'connect-labs-by-wexford-baltimore', 'Very high — lab infrastructure beside Baltimore BioPark', 'https://www.connectlabsbywexford.com/', '["ecosystem","Life-science labs / incubator"]', 'Baltimore', '2026-10-01T19:51:37.942Z', '2026-10-01T19:51:37.942Z');

INSERT OR IGNORE INTO organization_source_identities (source, external_id, organization_id)
      SELECT 'bmoremedtech', 'org-connect-labs-by-wexford-baltimore', id FROM organizations WHERE slug = 'connect-labs-by-wexford-baltimore';

INSERT OR IGNORE INTO organizations (id, name, slug, description, source_url, tags, city, created_at, updated_at)
      VALUES ('org-nucleate-baltimore-dmv', 'Nucleate Baltimore / DMV', 'nucleate-baltimore-dmv', 'Very high — JHU/UMD-linked biotech founder and scientist network', 'https://nucleate.xyz/locations/baltimore-md/', '["ecosystem","Biotech / ecotech venture community"]', 'Baltimore', '2026-10-01T19:51:37.942Z', '2026-10-01T19:51:37.942Z');

INSERT OR IGNORE INTO organization_source_identities (source, external_id, organization_id)
      SELECT 'bmoremedtech', 'org-nucleate-baltimore-dmv', id FROM organizations WHERE slug = 'nucleate-baltimore-dmv';

INSERT OR IGNORE INTO organizations (id, name, slug, description, source_url, tags, city, created_at, updated_at)
      VALUES ('org-chesapeake-digital-health-exchange-cdhx', 'Chesapeake Digital Health Exchange (CDHX)', 'chesapeake-digital-health-exchange-cdhx', 'Very high — JHU-linked digital health and commercialization network', 'https://chesapeakedhx.org/about.html', '["ecosystem","Digital-health commercialization network"]', 'Baltimore', '2026-10-01T19:51:37.942Z', '2026-10-01T19:51:37.942Z');

INSERT OR IGNORE INTO organization_source_identities (source, external_id, organization_id)
      SELECT 'bmoremedtech', 'org-chesapeake-digital-health-exchange-cdhx', id FROM organizations WHERE slug = 'chesapeake-digital-health-exchange-cdhx';

INSERT OR IGNORE INTO organizations (id, name, slug, description, source_url, tags, city, created_at, updated_at)
      VALUES ('org-harbor-launch-at-imet', 'Harbor Launch at IMET', 'harbor-launch-at-imet', 'Very high — Baltimore wet-lab and biotech founder infrastructure', 'https://www.harborlaunch.com/', '["ecosystem","Life-science incubator"]', 'Baltimore', '2026-10-01T19:51:37.942Z', '2026-10-01T19:51:37.942Z');

INSERT OR IGNORE INTO organization_source_identities (source, external_id, organization_id)
      SELECT 'bmoremedtech', 'org-harbor-launch-at-imet', id FROM organizations WHERE slug = 'harbor-launch-at-imet';

INSERT OR IGNORE INTO organizations (id, name, slug, description, source_url, tags, city, created_at, updated_at)
      VALUES ('org-biohealth-innovation', 'BioHealth Innovation', 'biohealth-innovation', 'Very high — health/life-science commercialization and funding', 'https://biohealthinnovation.org/', '["ecosystem","BioHealth commercialization / ESO"]', 'Baltimore', '2026-10-01T19:51:37.942Z', '2026-10-01T19:51:37.942Z');

INSERT OR IGNORE INTO organization_source_identities (source, external_id, organization_id)
      SELECT 'bmoremedtech', 'org-biohealth-innovation', id FROM organizations WHERE slug = 'biohealth-innovation';

INSERT OR IGNORE INTO organizations (id, name, slug, description, source_url, tags, city, created_at, updated_at)
      VALUES ('org-lifebridge-health-bioincubator-at-sinai-hospital', 'LifeBridge Health BioIncubator at Sinai Hospital', 'lifebridge-health-bioincubator-at-sinai-hospital', 'Very high — hospital-linked life-science lab and incubation infrastructure', 'https://www.lifebridgehealth.org/', '["ecosystem","Health-system bioincubator"]', 'Baltimore', '2026-10-01T19:51:37.942Z', '2026-10-01T19:51:37.942Z');

INSERT OR IGNORE INTO organization_source_identities (source, external_id, organization_id)
      SELECT 'bmoremedtech', 'org-lifebridge-health-bioincubator-at-sinai-hospital', id FROM organizations WHERE slug = 'lifebridge-health-bioincubator-at-sinai-hospital';

INSERT OR IGNORE INTO organizations (id, name, slug, description, source_url, tags, city, created_at, updated_at)
      VALUES ('org-1501-health', '1501 Health', '1501-health', 'Very high — healthcare venture support and payer connectivity', 'https://1501health.com/', '["ecosystem","Health accelerator"]', 'Baltimore', '2026-10-01T19:51:37.942Z', '2026-10-01T19:51:37.942Z');

INSERT OR IGNORE INTO organization_source_identities (source, external_id, organization_id)
      SELECT 'bmoremedtech', 'org-1501-health', id FROM organizations WHERE slug = '1501-health';

INSERT OR IGNORE INTO organizations (id, name, slug, description, source_url, tags, city, created_at, updated_at)
      VALUES ('org-the-grid-um-ventures', 'The GRID | UM Ventures', 'the-grid-um-ventures', 'Very high — UMB founder infrastructure embedded in academic medicine', 'https://www.graduate.umaryland.edu/grid/', '["university","Academic entrepreneurship / health innovation hub"]', 'Baltimore', '2026-10-01T19:51:37.942Z', '2026-10-01T19:51:37.942Z');

INSERT OR IGNORE INTO organization_source_identities (source, external_id, organization_id)
      SELECT 'bmoremedtech', 'org-the-grid-um-ventures', id FROM organizations WHERE slug = 'the-grid-um-ventures';

INSERT OR IGNORE INTO organizations (id, name, slug, description, source_url, tags, city, created_at, updated_at)
      VALUES ('org-irazu-oncology', 'Irazu Oncology', 'irazu-oncology', 'Very high — Baltimore oncology biotech with UMB license and local financing links', 'https://www.irazuoncology.com/', '["company","Biotech company"]', 'Baltimore', '2026-10-01T19:51:37.942Z', '2026-10-01T19:51:37.942Z');

INSERT OR IGNORE INTO organization_source_identities (source, external_id, organization_id)
      SELECT 'bmoremedtech', 'org-irazu-oncology', id FROM organizations WHERE slug = 'irazu-oncology';

INSERT OR IGNORE INTO organizations (id, name, slug, description, source_url, tags, city, created_at, updated_at)
      VALUES ('org-pava-marie-lapere-center-for-entrepreneurship', 'Pava Marie LaPere Center for Entrepreneurship', 'pava-marie-lapere-center-for-entrepreneurship', 'High — founder pipeline and Hopkins commercialization', 'https://pavacenter.jhu.edu/', '["university","University entrepreneurship center"]', 'Baltimore', '2026-10-01T19:51:37.942Z', '2026-10-01T19:51:37.942Z');

INSERT OR IGNORE INTO organization_source_identities (source, external_id, organization_id)
      SELECT 'bmoremedtech', 'org-pava-marie-lapere-center-for-entrepreneurship', id FROM organizations WHERE slug = 'pava-marie-lapere-center-for-entrepreneurship';

INSERT OR IGNORE INTO organizations (id, name, slug, description, source_url, tags, city, created_at, updated_at)
      VALUES ('org-bwtech-umbc-biotech-incubator', 'bwtech@UMBC Biotech Incubator', 'bwtech-umbc-biotech-incubator', 'Very high — wet-lab and life-science startup infrastructure', 'https://bwtech.umbc.edu/incubators/biotech/', '["ecosystem","Biotech incubator"]', 'Baltimore', '2026-10-01T19:51:37.942Z', '2026-10-01T19:51:37.942Z');

INSERT OR IGNORE INTO organization_source_identities (source, external_id, organization_id)
      SELECT 'bmoremedtech', 'org-bwtech-umbc-biotech-incubator', id FROM organizations WHERE slug = 'bwtech-umbc-biotech-incubator';

INSERT OR IGNORE INTO organizations (id, name, slug, description, source_url, tags, city, created_at, updated_at)
      VALUES ('org-harbor-designs-manufacturing', 'Harbor Designs & Manufacturing', 'harbor-designs-manufacturing', 'High — ISO 13485-capable product development and manufacturing resource', 'https://www.harbordesigns.net/', '["company","Medical-device design / manufacturing"]', 'Baltimore', '2026-10-01T19:51:37.942Z', '2026-10-01T19:51:37.942Z');

INSERT OR IGNORE INTO organization_source_identities (source, external_id, organization_id)
      SELECT 'bmoremedtech', 'org-harbor-designs-manufacturing', id FROM organizations WHERE slug = 'harbor-designs-manufacturing';

INSERT OR IGNORE INTO organizations (id, name, slug, description, source_url, tags, city, created_at, updated_at)
      VALUES ('org-dmv-petri-dish', 'DMV Petri Dish', 'dmv-petri-dish', 'High — regional public biotech community and networking', 'https://www.dmvpetridish.com/', '["ecosystem","Biotech community / meetup"]', 'Baltimore', '2026-10-01T19:51:37.942Z', '2026-10-01T19:51:37.942Z');

INSERT OR IGNORE INTO organization_source_identities (source, external_id, organization_id)
      SELECT 'bmoremedtech', 'org-dmv-petri-dish', id FROM organizations WHERE slug = 'dmv-petri-dish';

INSERT OR IGNORE INTO organizations (id, name, slug, description, source_url, tags, city, created_at, updated_at)
      VALUES ('org-tedco', 'TEDCO', 'tedco', 'High — grants, investment and commercialization pathways', 'https://www.tedcomd.com/', '["funding","State innovation funder / ESO"]', 'Baltimore', '2026-10-01T19:51:37.942Z', '2026-10-01T19:51:37.942Z');

INSERT OR IGNORE INTO organization_source_identities (source, external_id, organization_id)
      SELECT 'bmoremedtech', 'org-tedco', id FROM organizations WHERE slug = 'tedco';

INSERT OR IGNORE INTO organizations (id, name, slug, description, source_url, tags, city, created_at, updated_at)
      VALUES ('org-biohub-maryland', 'BioHub Maryland', 'biohub-maryland', 'High — Maryland Tech Council biopharma workforce infrastructure', 'https://www.biohubmaryland.com/', '["ecosystem","Biopharma workforce / training"]', 'Baltimore', '2026-10-01T19:51:37.942Z', '2026-10-01T19:51:37.942Z');

INSERT OR IGNORE INTO organization_source_identities (source, external_id, organization_id)
      SELECT 'bmoremedtech', 'org-biohub-maryland', id FROM organizations WHERE slug = 'biohub-maryland';

INSERT OR IGNORE INTO organizations (id, name, slug, description, source_url, tags, city, created_at, updated_at)
      VALUES ('org-stephen-renee-bisciotti-foundation', 'Stephen & Renee Bisciotti Foundation', 'stephen-renee-bisciotti-foundation', 'High — major Baltimore ecosystem funder and Blackbird founder', 'https://www.bisciotti.org/', '["funding","Philanthropic funder"]', 'Baltimore', '2026-10-01T19:51:37.942Z', '2026-10-01T19:51:37.942Z');

INSERT OR IGNORE INTO organization_source_identities (source, external_id, organization_id)
      SELECT 'bmoremedtech', 'org-stephen-renee-bisciotti-foundation', id FROM organizations WHERE slug = 'stephen-renee-bisciotti-foundation';

INSERT OR IGNORE INTO organizations (id, name, slug, description, source_url, tags, city, created_at, updated_at)
      VALUES ('org-maryland-tech-council', 'Maryland Tech Council', 'maryland-tech-council', 'High — statewide life-science/technology network', 'https://mdtechcouncil.com/', '["ecosystem","Industry association"]', 'Baltimore', '2026-10-01T19:51:37.942Z', '2026-10-01T19:51:37.942Z');

INSERT OR IGNORE INTO organization_source_identities (source, external_id, organization_id)
      SELECT 'bmoremedtech', 'org-maryland-tech-council', id FROM organizations WHERE slug = 'maryland-tech-council';

INSERT OR IGNORE INTO organizations (id, name, slug, description, source_url, tags, city, created_at, updated_at)
      VALUES ('org-rpm-tech', 'RPM Tech', 'rpm-tech', 'High — local product development, electronics and prototyping capacity', 'https://rpm-tech.com/', '["company","MedTech engineering / prototyping"]', 'Baltimore', '2026-10-01T19:51:37.942Z', '2026-10-01T19:51:37.942Z');

INSERT OR IGNORE INTO organization_source_identities (source, external_id, organization_id)
      SELECT 'bmoremedtech', 'org-rpm-tech', id FROM organizations WHERE slug = 'rpm-tech';

INSERT OR IGNORE INTO organizations (id, name, slug, description, source_url, tags, city, created_at, updated_at)
      VALUES ('org-biobuild', 'BioBuild', 'biobuild', 'High — local life-science founder peer', 'https://www.biobuild.bio/', '["company","Life-science startup"]', 'Baltimore', '2026-10-01T19:51:37.942Z', '2026-10-01T19:51:37.942Z');

INSERT OR IGNORE INTO organization_source_identities (source, external_id, organization_id)
      SELECT 'bmoremedtech', 'org-biobuild', id FROM organizations WHERE slug = 'biobuild';

INSERT OR IGNORE INTO organizations (id, name, slug, description, source_url, tags, city, created_at, updated_at)
      VALUES ('org-materic-early-charm', 'Materic / Early Charm', 'materic-early-charm', 'High — Baltimore manufacturing capacity serving medical devices', 'https://matericgroup.com/capabilities/', '["company","Advanced materials / medical-device manufacturing"]', 'Baltimore', '2026-10-01T19:51:37.942Z', '2026-10-01T19:51:37.942Z');

INSERT OR IGNORE INTO organization_source_identities (source, external_id, organization_id)
      SELECT 'bmoremedtech', 'org-materic-early-charm', id FROM organizations WHERE slug = 'materic-early-charm';

INSERT OR IGNORE INTO organizations (id, name, slug, description, source_url, tags, city, created_at, updated_at)
      VALUES ('org-postcare-ai', 'PostCare.ai', 'postcare-ai', 'High — clinical documentation and provider workflow technology', 'https://postcare.ai/', '["company","Digital-health / clinical AI company"]', 'Baltimore', '2026-10-01T19:51:37.942Z', '2026-10-01T19:51:37.942Z');

INSERT OR IGNORE INTO organization_source_identities (source, external_id, organization_id)
      SELECT 'bmoremedtech', 'org-postcare-ai', id FROM organizations WHERE slug = 'postcare-ai';

INSERT OR IGNORE INTO organizations (id, name, slug, description, source_url, tags, city, created_at, updated_at)
      VALUES ('org-salynt', 'Salynt', 'salynt', 'High — healthcare technology founder peer', 'https://www.salynt.io/', '["company","Health-tech company"]', 'Baltimore', '2026-10-01T19:51:37.942Z', '2026-10-01T19:51:37.942Z');

INSERT OR IGNORE INTO organization_source_identities (source, external_id, organization_id)
      SELECT 'bmoremedtech', 'org-salynt', id FROM organizations WHERE slug = 'salynt';

INSERT OR IGNORE INTO organizations (id, name, slug, description, source_url, tags, city, created_at, updated_at)
      VALUES ('org-protenus', 'Protenus', 'protenus', 'High — Baltimore healthcare technology network', 'https://www.protenus.com/', '["company","Health-tech company"]', 'Baltimore', '2026-10-01T19:51:37.942Z', '2026-10-01T19:51:37.942Z');

INSERT OR IGNORE INTO organization_source_identities (source, external_id, organization_id)
      SELECT 'bmoremedtech', 'org-protenus', id FROM organizations WHERE slug = 'protenus';

INSERT OR IGNORE INTO organizations (id, name, slug, description, source_url, tags, city, created_at, updated_at)
      VALUES ('org-tessa-g-lebinger-m-d-llc', 'Tessa G. Lebinger, M.D. LLC', 'tessa-g-lebinger-m-d-llc', 'High — specialized medical-device regulatory expertise', 'https://www.youtube.com/watch?v=QCtEqu9cRC0&t=1263s', '["company","FDA medical-device regulatory consulting"]', 'Baltimore', '2026-10-01T19:51:37.942Z', '2026-10-01T19:51:37.942Z');

INSERT OR IGNORE INTO organization_source_identities (source, external_id, organization_id)
      SELECT 'bmoremedtech', 'org-tessa-g-lebinger-m-d-llc', id FROM organizations WHERE slug = 'tessa-g-lebinger-m-d-llc';

INSERT OR IGNORE INTO organizations (id, name, slug, description, source_url, tags, city, created_at, updated_at)
      VALUES ('org-baltimore-regional-tech-council', 'Baltimore Regional Tech Council', 'baltimore-regional-tech-council', 'High — Baltimore-facing arm of Maryland Tech Council', 'https://mdtechcouncil.com/chapter/brtc/', '["ecosystem","Regional tech / life-science council"]', 'Baltimore', '2026-10-01T19:51:37.942Z', '2026-10-01T19:51:37.942Z');

INSERT OR IGNORE INTO organization_source_identities (source, external_id, organization_id)
      SELECT 'bmoremedtech', 'org-baltimore-regional-tech-council', id FROM organizations WHERE slug = 'baltimore-regional-tech-council';

INSERT OR IGNORE INTO organizations (id, name, slug, description, source_url, tags, city, created_at, updated_at)
      VALUES ('org-baltimore-underground-science-space-bugss', 'Baltimore Underground Science Space (BUGSS)', 'baltimore-underground-science-space-bugss', 'High — accessible community wet-lab and biology education resource', 'https://bugssonline.org/', '["ecosystem","Community biology lab"]', 'Baltimore', '2026-10-01T19:51:37.942Z', '2026-10-01T19:51:37.942Z');

INSERT OR IGNORE INTO organization_source_identities (source, external_id, organization_id)
      SELECT 'bmoremedtech', 'org-baltimore-underground-science-space-bugss', id FROM organizations WHERE slug = 'baltimore-underground-science-space-bugss';

INSERT OR IGNORE INTO organizations (id, name, slug, description, source_url, tags, city, created_at, updated_at)
      VALUES ('org-early-charm-ventures', 'Early Charm Ventures', 'early-charm-ventures', 'High — science commercialization and company formation', 'https://earlycharm.com/', '["funding","Venture studio"]', 'Baltimore', '2026-10-01T19:51:37.942Z', '2026-10-01T19:51:37.942Z');

INSERT OR IGNORE INTO organization_source_identities (source, external_id, organization_id)
      SELECT 'bmoremedtech', 'org-early-charm-ventures', id FROM organizations WHERE slug = 'early-charm-ventures';

INSERT OR IGNORE INTO organizations (id, name, slug, description, source_url, tags, city, created_at, updated_at)
      VALUES ('org-biobuzz', 'BioBuzz', 'biobuzz', 'High — community discovery and life-science connectivity', 'https://www.biobuzz.io/', '["ecosystem","Life-science ecosystem media / community"]', 'Baltimore', '2026-10-01T19:51:37.942Z', '2026-10-01T19:51:37.942Z');

INSERT OR IGNORE INTO organization_source_identities (source, external_id, organization_id)
      SELECT 'bmoremedtech', 'org-biobuzz', id FROM organizations WHERE slug = 'biobuzz';

INSERT OR IGNORE INTO organizations (id, name, slug, description, source_url, tags, city, created_at, updated_at)
      VALUES ('org-healthier-forms', 'Healthier Forms', 'healthier-forms', 'High — medical workflow and MRI safety technology', 'https://bemrisafe.com/', '["company","Digital-health / MRI safety company"]', 'Baltimore', '2026-10-01T19:51:37.942Z', '2026-10-01T19:51:37.942Z');

INSERT OR IGNORE INTO organization_source_identities (source, external_id, organization_id)
      SELECT 'bmoremedtech', 'org-healthier-forms', id FROM organizations WHERE slug = 'healthier-forms';

INSERT OR IGNORE INTO organizations (id, name, slug, description, source_url, tags, city, created_at, updated_at)
      VALUES ('org-bdc-emerging-technology-center-etc', 'BDC Emerging Technology Center (ETC)', 'bdc-emerging-technology-center-etc', 'High — Baltimore startup infrastructure', 'https://baltimoredevelopment.com/', '["general","Incubator / ESO"]', 'Baltimore', '2026-10-01T19:51:37.942Z', '2026-10-01T19:51:37.942Z');

INSERT OR IGNORE INTO organization_source_identities (source, external_id, organization_id)
      SELECT 'bmoremedtech', 'org-bdc-emerging-technology-center-etc', id FROM organizations WHERE slug = 'bdc-emerging-technology-center-etc';

INSERT OR IGNORE INTO organizations (id, name, slug, description, source_url, tags, city, created_at, updated_at)
      VALUES ('org-the-novella-center-for-entrepreneurship', 'The Novella Center for Entrepreneurship', 'the-novella-center-for-entrepreneurship', 'High — Baltimore founder and venture network', 'https://www.novellacenter.com/', '["general","Entrepreneurship center"]', 'Baltimore', '2026-10-01T19:51:37.942Z', '2026-10-01T19:51:37.942Z');

INSERT OR IGNORE INTO organization_source_identities (source, external_id, organization_id)
      SELECT 'bmoremedtech', 'org-the-novella-center-for-entrepreneurship', id FROM organizations WHERE slug = 'the-novella-center-for-entrepreneurship';

INSERT OR IGNORE INTO organizations (id, name, slug, description, source_url, tags, city, created_at, updated_at)
      VALUES ('org-usm-maryland-momentum-fund', 'USM Maryland Momentum Fund', 'usm-maryland-momentum-fund', 'High — Maryland university commercialization capital', 'https://www.usmd.edu/usm-momentum-fund/', '["funding","Venture fund"]', 'Baltimore', '2026-10-01T19:51:37.942Z', '2026-10-01T19:51:37.942Z');

INSERT OR IGNORE INTO organization_source_identities (source, external_id, organization_id)
      SELECT 'bmoremedtech', 'org-usm-maryland-momentum-fund', id FROM organizations WHERE slug = 'usm-maryland-momentum-fund';

INSERT OR IGNORE INTO organizations (id, name, slug, description, source_url, tags, city, created_at, updated_at)
      VALUES ('org-conscious-venture-partners', 'Conscious Venture Partners', 'conscious-venture-partners', 'High — early-stage regional capital and founder network', 'https://consciousventurepartners.com/', '["funding","Venture capital"]', 'Baltimore', '2026-10-01T19:51:37.942Z', '2026-10-01T19:51:37.942Z');

INSERT OR IGNORE INTO organization_source_identities (source, external_id, organization_id)
      SELECT 'bmoremedtech', 'org-conscious-venture-partners', id FROM organizations WHERE slug = 'conscious-venture-partners';

INSERT OR IGNORE INTO organizations (id, name, slug, description, source_url, tags, city, created_at, updated_at)
      VALUES ('org-startup-at-the-armory', 'StarTUp at the Armory', 'startup-at-the-armory', 'Moderate — founder pipeline and regional startup network', 'https://www.towson.edu/startup/', '["university","University incubator / entrepreneurship hub"]', 'Baltimore', '2026-10-01T19:51:37.942Z', '2026-10-01T19:51:37.942Z');

INSERT OR IGNORE INTO organization_source_identities (source, external_id, organization_id)
      SELECT 'bmoremedtech', 'org-startup-at-the-armory', id FROM organizations WHERE slug = 'startup-at-the-armory';

INSERT OR IGNORE INTO organizations (id, name, slug, description, source_url, tags, city, created_at, updated_at)
      VALUES ('org-morgan-state-innovation-entrepreneurship-center', 'Morgan State Innovation & Entrepreneurship Center', 'morgan-state-innovation-entrepreneurship-center', 'Moderate — Baltimore founder and student pipeline', 'https://www.morgan.edu/', '["university","University entrepreneurship center"]', 'Baltimore', '2026-10-01T19:51:37.942Z', '2026-10-01T19:51:37.942Z');

INSERT OR IGNORE INTO organization_source_identities (source, external_id, organization_id)
      SELECT 'bmoremedtech', 'org-morgan-state-innovation-entrepreneurship-center', id FROM organizations WHERE slug = 'morgan-state-innovation-entrepreneurship-center';

INSERT OR IGNORE INTO organizations (id, name, slug, description, source_url, tags, city, created_at, updated_at)
      VALUES ('org-squadra-ventures', 'Squadra Ventures', 'squadra-ventures', 'High — Baltimore technology investment network', 'https://squadraventures.com/', '["funding","Venture capital"]', 'Baltimore', '2026-10-01T19:51:37.942Z', '2026-10-01T19:51:37.942Z');

INSERT OR IGNORE INTO organization_source_identities (source, external_id, organization_id)
      SELECT 'bmoremedtech', 'org-squadra-ventures', id FROM organizations WHERE slug = 'squadra-ventures';

INSERT OR IGNORE INTO organizations (id, name, slug, description, source_url, tags, city, created_at, updated_at)
      VALUES ('org-tcp-venture-capital', 'TCP Venture Capital', 'tcp-venture-capital', 'High — local early-stage investment network', 'https://tcpventurecapital.com/', '["funding","Venture capital"]', 'Baltimore', '2026-10-01T19:51:37.942Z', '2026-10-01T19:51:37.942Z');

INSERT OR IGNORE INTO organization_source_identities (source, external_id, organization_id)
      SELECT 'bmoremedtech', 'org-tcp-venture-capital', id FROM organizations WHERE slug = 'tcp-venture-capital';

INSERT OR IGNORE INTO organizations (id, name, slug, description, source_url, tags, city, created_at, updated_at)
      VALUES ('org-rarebreed-ventures', 'RareBreed Ventures', 'rarebreed-ventures', 'Moderate — Baltimore early-stage capital network', 'https://rarebreed.vc/', '["funding","Venture capital"]', 'Baltimore', '2026-10-01T19:51:37.942Z', '2026-10-01T19:51:37.942Z');

INSERT OR IGNORE INTO organization_source_identities (source, external_id, organization_id)
      SELECT 'bmoremedtech', 'org-rarebreed-ventures', id FROM organizations WHERE slug = 'rarebreed-ventures';

INSERT OR IGNORE INTO organizations (id, name, slug, description, source_url, tags, city, created_at, updated_at)
      VALUES ('org-innovation-works', 'Innovation Works', 'innovation-works', 'Moderate — community entrepreneurship and founder support', 'https://iwbmore.org/', '["general","Inclusive entrepreneurship ESO"]', 'Baltimore', '2026-10-01T19:51:37.942Z', '2026-10-01T19:51:37.942Z');

INSERT OR IGNORE INTO organization_source_identities (source, external_id, organization_id)
      SELECT 'bmoremedtech', 'org-innovation-works', id FROM organizations WHERE slug = 'innovation-works';

INSERT OR IGNORE INTO organizations (id, name, slug, description, source_url, tags, city, created_at, updated_at)
      VALUES ('org-the-gateway-howard-county-eda', 'The Gateway / Howard County EDA', 'the-gateway-howard-county-eda', 'Moderate — regional startup support and facilities', 'https://www.hceda.org/', '["general","Economic development / incubator"]', 'Baltimore', '2026-10-01T19:51:37.942Z', '2026-10-01T19:51:37.942Z');

INSERT OR IGNORE INTO organization_source_identities (source, external_id, organization_id)
      SELECT 'bmoremedtech', 'org-the-gateway-howard-county-eda', id FROM organizations WHERE slug = 'the-gateway-howard-county-eda';

INSERT OR IGNORE INTO organizations (id, name, slug, description, source_url, tags, city, created_at, updated_at)
      VALUES ('org-loyola-simon-center-for-innovation-entrepreneurship', 'Loyola Simon Center for Innovation & Entrepreneurship', 'loyola-simon-center-for-innovation-entrepreneurship', 'Moderate — founder pipeline and regional network', 'https://www.loyola.edu/sellinger-business/centers/simon-center/', '["university","University entrepreneurship center"]', 'Baltimore', '2026-10-01T19:51:37.942Z', '2026-10-01T19:51:37.942Z');

INSERT OR IGNORE INTO organization_source_identities (source, external_id, organization_id)
      SELECT 'bmoremedtech', 'org-loyola-simon-center-for-innovation-entrepreneurship', id FROM organizations WHERE slug = 'loyola-simon-center-for-innovation-entrepreneurship';

INSERT OR IGNORE INTO organizations (id, name, slug, description, source_url, tags, city, created_at, updated_at)
      VALUES ('org-world-trade-center-institute-wtci', 'World Trade Center Institute (WTCI)', 'world-trade-center-institute-wtci', 'Moderate — partnerships and international commercialization', 'https://www.wtci.org/', '["general","Global business network"]', 'Baltimore', '2026-10-01T19:51:37.942Z', '2026-10-01T19:51:37.942Z');

INSERT OR IGNORE INTO organization_source_identities (source, external_id, organization_id)
      SELECT 'bmoremedtech', 'org-world-trade-center-institute-wtci', id FROM organizations WHERE slug = 'world-trade-center-institute-wtci';

INSERT OR IGNORE INTO organizations (id, name, slug, description, source_url, tags, city, created_at, updated_at)
      VALUES ('org-hutch-fearless', 'Hutch / Fearless', 'hutch-fearless', 'Moderate — Baltimore technology founder network', 'https://fearless.tech/hutch/', '["general","Tech accelerator / community"]', 'Baltimore', '2026-10-01T19:51:37.942Z', '2026-10-01T19:51:37.942Z');

INSERT OR IGNORE INTO organization_source_identities (source, external_id, organization_id)
      SELECT 'bmoremedtech', 'org-hutch-fearless', id FROM organizations WHERE slug = 'hutch-fearless';

INSERT OR IGNORE INTO organizations (id, name, slug, description, source_url, tags, city, created_at, updated_at)
      VALUES ('org-visurraga-enterprises', 'Visurraga Enterprises', 'visurraga-enterprises', 'Moderate — local industry relationship', 'https://www.visurragaenterprises.com/', '["company","Medical / engineering company"]', 'Baltimore', '2026-10-01T19:51:37.942Z', '2026-10-01T19:51:37.942Z');

INSERT OR IGNORE INTO organization_source_identities (source, external_id, organization_id)
      SELECT 'bmoremedtech', 'org-visurraga-enterprises', id FROM organizations WHERE slug = 'visurraga-enterprises';

INSERT OR IGNORE INTO organizations (id, name, slug, description, source_url, tags, city, created_at, updated_at)
      VALUES ('org-baltimore-city', 'Baltimore City', 'baltimore-city', 'Funding-network organization', NULL, '["general","Funding-network organization"]', 'Baltimore', '2026-10-01T19:51:37.942Z', '2026-10-01T19:51:37.942Z');

INSERT OR IGNORE INTO organization_source_identities (source, external_id, organization_id)
      SELECT 'bmoremedtech', 'org-baltimore-city', id FROM organizations WHERE slug = 'baltimore-city';

INSERT OR IGNORE INTO organizations (id, name, slug, description, source_url, tags, city, created_at, updated_at)
      VALUES ('org-conscious-venture-fund-ii', 'Conscious Venture Fund II', 'conscious-venture-fund-ii', 'Funding-network organization', NULL, '["funding","Funding-network organization"]', 'Baltimore', '2026-10-01T19:51:37.942Z', '2026-10-01T19:51:37.942Z');

INSERT OR IGNORE INTO organization_source_identities (source, external_id, organization_id)
      SELECT 'bmoremedtech', 'org-conscious-venture-fund-ii', id FROM organizations WHERE slug = 'conscious-venture-fund-ii';

INSERT OR IGNORE INTO organizations (id, name, slug, description, source_url, tags, city, created_at, updated_at)
      VALUES ('org-johns-hopkins-technology-ventures', 'Johns Hopkins Technology Ventures', 'johns-hopkins-technology-ventures', 'Funding-network organization', 'https://ventures.jhu.edu/', '["university","Funding-network organization"]', 'Baltimore', '2026-10-01T19:51:37.942Z', '2026-10-01T19:51:37.942Z');

INSERT OR IGNORE INTO organization_source_identities (source, external_id, organization_id)
      SELECT 'bmoremedtech', 'org-johns-hopkins-technology-ventures', id FROM organizations WHERE slug = 'johns-hopkins-technology-ventures';

INSERT OR IGNORE INTO organizations (id, name, slug, description, source_url, tags, city, created_at, updated_at)
      VALUES ('org-johns-hopkins-university', 'Johns Hopkins University', 'johns-hopkins-university', 'Funding-network organization', 'https://www.jhu.edu/', '["university","Funding-network organization"]', 'Baltimore', '2026-10-01T19:51:37.942Z', '2026-10-01T19:51:37.942Z');

INSERT OR IGNORE INTO organization_source_identities (source, external_id, organization_id)
      SELECT 'bmoremedtech', 'org-johns-hopkins-university', id FROM organizations WHERE slug = 'johns-hopkins-university';

INSERT OR IGNORE INTO organizations (id, name, slug, description, source_url, tags, city, created_at, updated_at)
      VALUES ('org-national-institutes-of-health', 'National Institutes of Health', 'national-institutes-of-health', 'Funding-network organization', 'https://www.nih.gov/', '["funding","Funding-network organization"]', 'Baltimore', '2026-10-01T19:51:37.942Z', '2026-10-01T19:51:37.942Z');

INSERT OR IGNORE INTO organization_source_identities (source, external_id, organization_id)
      SELECT 'bmoremedtech', 'org-national-institutes-of-health', id FROM organizations WHERE slug = 'national-institutes-of-health';

INSERT OR IGNORE INTO organizations (id, name, slug, description, source_url, tags, city, created_at, updated_at)
      VALUES ('org-rarebreed-ventures-fund-i', 'RareBreed Ventures Fund I', 'rarebreed-ventures-fund-i', 'Funding-network organization', NULL, '["funding","Funding-network organization"]', 'Baltimore', '2026-10-01T19:51:37.942Z', '2026-10-01T19:51:37.942Z');

INSERT OR IGNORE INTO organization_source_identities (source, external_id, organization_id)
      SELECT 'bmoremedtech', 'org-rarebreed-ventures-fund-i', id FROM organizations WHERE slug = 'rarebreed-ventures-fund-i';

INSERT OR IGNORE INTO organizations (id, name, slug, description, source_url, tags, city, created_at, updated_at)
      VALUES ('org-sagamore-ventures', 'Sagamore Ventures', 'sagamore-ventures', 'Funding-network organization', NULL, '["funding","Funding-network organization"]', 'Baltimore', '2026-10-01T19:51:37.942Z', '2026-10-01T19:51:37.942Z');

INSERT OR IGNORE INTO organization_source_identities (source, external_id, organization_id)
      SELECT 'bmoremedtech', 'org-sagamore-ventures', id FROM organizations WHERE slug = 'sagamore-ventures';

INSERT OR IGNORE INTO organizations (id, name, slug, description, source_url, tags, city, created_at, updated_at)
      VALUES ('org-squadra-ii', 'Squadra II', 'squadra-ii', 'Funding-network organization', NULL, '["funding","Funding-network organization"]', 'Baltimore', '2026-10-01T19:51:37.942Z', '2026-10-01T19:51:37.942Z');

INSERT OR IGNORE INTO organization_source_identities (source, external_id, organization_id)
      SELECT 'bmoremedtech', 'org-squadra-ii', id FROM organizations WHERE slug = 'squadra-ii';

INSERT OR IGNORE INTO organizations (id, name, slug, description, source_url, tags, city, created_at, updated_at)
      VALUES ('org-techstars', 'Techstars', 'techstars', 'Funding-network organization', 'https://www.techstars.com/', '["funding","Funding-network organization"]', 'Baltimore', '2026-10-01T19:51:37.942Z', '2026-10-01T19:51:37.942Z');

INSERT OR IGNORE INTO organization_source_identities (source, external_id, organization_id)
      SELECT 'bmoremedtech', 'org-techstars', id FROM organizations WHERE slug = 'techstars';

INSERT OR IGNORE INTO organizations (id, name, slug, description, source_url, tags, city, created_at, updated_at)
      VALUES ('org-tedco-equitech-growth-fund', 'TEDCO Equitech Growth Fund', 'tedco-equitech-growth-fund', 'Funding-network organization', NULL, '["funding","Funding-network organization"]', 'Baltimore', '2026-10-01T19:51:37.942Z', '2026-10-01T19:51:37.942Z');

INSERT OR IGNORE INTO organization_source_identities (source, external_id, organization_id)
      SELECT 'bmoremedtech', 'org-tedco-equitech-growth-fund', id FROM organizations WHERE slug = 'tedco-equitech-growth-fund';

INSERT OR IGNORE INTO organizations (id, name, slug, description, source_url, tags, city, created_at, updated_at)
      VALUES ('org-tedco-life-science-investment-fund', 'TEDCO Life Science Investment Fund', 'tedco-life-science-investment-fund', 'Funding-network organization', NULL, '["funding","Funding-network organization"]', 'Baltimore', '2026-10-01T19:51:37.942Z', '2026-10-01T19:51:37.942Z');

INSERT OR IGNORE INTO organization_source_identities (source, external_id, organization_id)
      SELECT 'bmoremedtech', 'org-tedco-life-science-investment-fund', id FROM organizations WHERE slug = 'tedco-life-science-investment-fund';

INSERT OR IGNORE INTO organizations (id, name, slug, description, source_url, tags, city, created_at, updated_at)
      VALUES ('org-tedco-seed-funds-ssbci', 'TEDCO Seed Funds / SSBCI', 'tedco-seed-funds-ssbci', 'Funding-network organization', NULL, '["funding","Funding-network organization"]', 'Baltimore', '2026-10-01T19:51:37.942Z', '2026-10-01T19:51:37.942Z');

INSERT OR IGNORE INTO organization_source_identities (source, external_id, organization_id)
      SELECT 'bmoremedtech', 'org-tedco-seed-funds-ssbci', id FROM organizations WHERE slug = 'tedco-seed-funds-ssbci';

INSERT OR IGNORE INTO organizations (id, name, slug, description, source_url, tags, city, created_at, updated_at)
      VALUES ('org-u-s-economic-development-administration', 'U.S. Economic Development Administration', 'u-s-economic-development-administration', 'Funding-network organization', 'https://www.eda.gov/', '["funding","Funding-network organization"]', 'Baltimore', '2026-10-01T19:51:37.942Z', '2026-10-01T19:51:37.942Z');

INSERT OR IGNORE INTO organization_source_identities (source, external_id, organization_id)
      SELECT 'bmoremedtech', 'org-u-s-economic-development-administration', id FROM organizations WHERE slug = 'u-s-economic-development-administration';

INSERT OR IGNORE INTO organizations (id, name, slug, description, source_url, tags, city, created_at, updated_at)
      VALUES ('org-university-of-maryland-baltimore-county', 'University of Maryland, Baltimore County', 'university-of-maryland-baltimore-county', 'Funding-network organization', 'https://umbc.edu/', '["university","Funding-network organization"]', 'Baltimore', '2026-10-01T19:51:37.942Z', '2026-10-01T19:51:37.942Z');

INSERT OR IGNORE INTO organization_source_identities (source, external_id, organization_id)
      SELECT 'bmoremedtech', 'org-university-of-maryland-baltimore-county', id FROM organizations WHERE slug = 'university-of-maryland-baltimore-county';

INSERT OR IGNORE INTO organizations (id, name, slug, description, source_url, tags, city, created_at, updated_at)
      VALUES ('org-university-system-of-maryland', 'University System of Maryland', 'university-system-of-maryland', 'Funding-network organization', 'https://www.usmd.edu/', '["university","Funding-network organization"]', 'Baltimore', '2026-10-01T19:51:37.942Z', '2026-10-01T19:51:37.942Z');

INSERT OR IGNORE INTO organization_source_identities (source, external_id, organization_id)
      SELECT 'bmoremedtech', 'org-university-system-of-maryland', id FROM organizations WHERE slug = 'university-system-of-maryland';

INSERT OR IGNORE INTO organization_support_records
      (id, from_organization_id, to_organization_id, from_label, to_label, support_kind, amount, currency, amount_label, description, occurred_at, source_url, evidence, notes, provenance_json, created_at)
      VALUES ('bmoremedtech:fin-blackbird-laboratories-stephen-renee-bisciotti-foundation-100-000-000-2023-11-07-founding-grant', (SELECT organization_id FROM organization_source_identities WHERE source = 'bmoremedtech' AND external_id = 'org-stephen-renee-bisciotti-foundation'), (SELECT organization_id FROM organization_source_identities WHERE source = 'bmoremedtech' AND external_id = 'org-blackbird-laboratories'), 'Stephen & Renee Bisciotti Foundation', 'Blackbird Laboratories', 'transfer', 100000000, 'USD', '$100,000,000', 'Founding grant', '2023-11-07', 'https://blackbirdlab.org/baltimore-community-release/', 'Primary source', 'Into listed organization · Founding grant used to launch Baltimore life-sciences accelerator.', '[{"source":"LifeTech Associates","snapshot":"2026-10-01T19:51:37.942Z","sheet":"Financing & Money Flows","row":2,"sourceUrl":"https://blackbirdlab.org/baltimore-community-release/"},{"source":"LifeTech Associates","snapshot":"2026-10-01T19:51:37.942Z","sheet":"Funding Network","row":3,"sourceUrl":"https://blackbirdlab.org/baltimore-community-release/"}]', '2026-10-01T19:51:37.942Z');

INSERT OR IGNORE INTO organization_support_records
      (id, from_organization_id, to_organization_id, from_label, to_label, support_kind, amount, currency, amount_label, description, occurred_at, source_url, evidence, notes, provenance_json, created_at)
      VALUES ('bmoremedtech:fin-blackbird-research-infrastructure-blackbird-laboratories-33-000-000-current-reported-total-research-infrastructure-commitments', (SELECT organization_id FROM organization_source_identities WHERE source = 'bmoremedtech' AND external_id = 'org-blackbird-laboratories'), NULL, 'Blackbird Laboratories', 'Blackbird research + infrastructure', 'portfolio', 33000000, 'USD', '$33,000,000', 'Research / infrastructure commitments', 'Current reported total', 'https://blackbirdlab.org/what-we-do/', 'Primary source', 'Deployed by listed organization · Blackbird reports $33M committed to research and infrastructure.', '[{"source":"LifeTech Associates","snapshot":"2026-10-01T19:51:37.942Z","sheet":"Financing & Money Flows","row":3,"sourceUrl":"https://blackbirdlab.org/what-we-do/"},{"source":"LifeTech Associates","snapshot":"2026-10-01T19:51:37.942Z","sheet":"Funding Network","row":5,"sourceUrl":"https://blackbirdlab.org/what-we-do/"}]', '2026-10-01T19:51:37.942Z');

INSERT OR IGNORE INTO organization_support_records
      (id, from_organization_id, to_organization_id, from_label, to_label, support_kind, amount, currency, amount_label, description, occurred_at, source_url, evidence, notes, provenance_json, created_at)
      VALUES ('bmoremedtech:fin-blackbird-investments-blackbird-laboratories-37-000-000-current-reported-total-strategic-investments', (SELECT organization_id FROM organization_source_identities WHERE source = 'bmoremedtech' AND external_id = 'org-blackbird-laboratories'), NULL, 'Blackbird Laboratories', 'Blackbird investments', 'portfolio', 37000000, 'USD', '$37,000,000', 'Strategic investments', 'Current reported total', 'https://blackbirdlab.org/what-we-do/', 'Primary source', 'Deployed by listed organization · Blackbird reports $37M in investments.', '[{"source":"LifeTech Associates","snapshot":"2026-10-01T19:51:37.942Z","sheet":"Financing & Money Flows","row":4,"sourceUrl":"https://blackbirdlab.org/what-we-do/"},{"source":"LifeTech Associates","snapshot":"2026-10-01T19:51:37.942Z","sheet":"Funding Network","row":6,"sourceUrl":"https://blackbirdlab.org/what-we-do/"}]', '2026-10-01T19:51:37.942Z');

INSERT OR IGNORE INTO organization_support_records
      (id, from_organization_id, to_organization_id, from_label, to_label, support_kind, amount, currency, amount_label, description, occurred_at, source_url, evidence, notes, provenance_json, created_at)
      VALUES ('bmoremedtech:fin-johns-hopkins-research-initiatives-blackbird-laboratories-3-500-000-2024-2025-cumulative-research-support', (SELECT organization_id FROM organization_source_identities WHERE source = 'bmoremedtech' AND external_id = 'org-blackbird-laboratories'), NULL, 'Blackbird Laboratories', 'Johns Hopkins research initiatives', 'portfolio', 3500000, 'USD', '$3,500,000', 'Research support', '2024-2025 cumulative', 'https://ventures.jhu.edu/wp-content/uploads/2025/09/JHTV-FY25-Annual-Report.pdf', 'Primary source', 'Between ecosystem organizations · JHTV reports Blackbird support exceeding $3.5M.', '[{"source":"LifeTech Associates","snapshot":"2026-10-01T19:51:37.942Z","sheet":"Financing & Money Flows","row":5,"sourceUrl":"https://ventures.jhu.edu/wp-content/uploads/2025/09/JHTV-FY25-Annual-Report.pdf"},{"source":"LifeTech Associates","snapshot":"2026-10-01T19:51:37.942Z","sheet":"Funding Network","row":4,"sourceUrl":"https://ventures.jhu.edu/wp-content/uploads/2025/09/JHTV-FY25-Annual-Report.pdf"}]', '2026-10-01T19:51:37.942Z');

INSERT OR IGNORE INTO organization_support_records
      (id, from_organization_id, to_organization_id, from_label, to_label, support_kind, amount, currency, amount_label, description, occurred_at, source_url, evidence, notes, provenance_json, created_at)
      VALUES ('bmoremedtech:fin-protenus-early-investors-1-200-000-2014-09-angel-seed', NULL, (SELECT organization_id FROM organization_source_identities WHERE source = 'bmoremedtech' AND external_id = 'org-protenus'), 'Early investors', 'Protenus', 'transfer', 1200000, 'USD', '$1,200,000', 'Angel / seed', '2014-09', 'https://app.dealroom.co/companies/protenus', 'Secondary corroborated', 'Into listed company · Early disclosed angel round.', '[{"source":"LifeTech Associates","snapshot":"2026-10-01T19:51:37.942Z","sheet":"Financing & Money Flows","row":6,"sourceUrl":"https://app.dealroom.co/companies/protenus"}]', '2026-10-01T19:51:37.942Z');

INSERT OR IGNORE INTO organization_support_records
      (id, from_organization_id, to_organization_id, from_label, to_label, support_kind, amount, currency, amount_label, description, occurred_at, source_url, evidence, notes, provenance_json, created_at)
      VALUES ('bmoremedtech:fin-protenus-investors-incl-arthur-ventures-4-000-000-2016-01-series-a', NULL, (SELECT organization_id FROM organization_source_identities WHERE source = 'bmoremedtech' AND external_id = 'org-protenus'), 'Investors incl. Arthur Ventures', 'Protenus', 'transfer', 4000000, 'USD', '$4,000,000', 'Series A', '2016-01', 'https://app.dealroom.co/companies/protenus', 'Secondary corroborated', 'Into listed company · Disclosed Series A financing.', '[{"source":"LifeTech Associates","snapshot":"2026-10-01T19:51:37.942Z","sheet":"Financing & Money Flows","row":7,"sourceUrl":"https://app.dealroom.co/companies/protenus"}]', '2026-10-01T19:51:37.942Z');

INSERT OR IGNORE INTO organization_support_records
      (id, from_organization_id, to_organization_id, from_label, to_label, support_kind, amount, currency, amount_label, description, occurred_at, source_url, evidence, notes, provenance_json, created_at)
      VALUES ('bmoremedtech:fin-protenus-investors-incl-f-prime-lionbird-kaiser-permanente-ventures-3-000-000-2017-07-series-a-extension', NULL, (SELECT organization_id FROM organization_source_identities WHERE source = 'bmoremedtech' AND external_id = 'org-protenus'), 'Investors incl. F-Prime, LionBird, Kaiser Permanente Ventures', 'Protenus', 'transfer', 3000000, 'USD', '$3,000,000', 'Series A extension', '2017-07', 'https://app.dealroom.co/companies/protenus', 'Secondary corroborated', 'Into listed company · Disclosed extension financing.', '[{"source":"LifeTech Associates","snapshot":"2026-10-01T19:51:37.942Z","sheet":"Financing & Money Flows","row":8,"sourceUrl":"https://app.dealroom.co/companies/protenus"}]', '2026-10-01T19:51:37.942Z');

INSERT OR IGNORE INTO organization_support_records
      (id, from_organization_id, to_organization_id, from_label, to_label, support_kind, amount, currency, amount_label, description, occurred_at, source_url, evidence, notes, provenance_json, created_at)
      VALUES ('bmoremedtech:fin-protenus-f-prime-kaiser-permanente-ventures-arthur-ventures-lionbird-cognosante-11-000-000-2018-01-series-b', NULL, (SELECT organization_id FROM organization_source_identities WHERE source = 'bmoremedtech' AND external_id = 'org-protenus'), 'F-Prime, Kaiser Permanente Ventures, Arthur Ventures, LionBird, Cognosante', 'Protenus', 'transfer', 11000000, 'USD', '$11,000,000', 'Series B', '2018-01', 'https://email.protenus.com/hubfs/Protenus_Sep2020/Resources/Protenus-raises-11-in-funding-Press-Release-Jan-2018.pdf', 'Primary/company release', 'Into listed company · Series B financing.', '[{"source":"LifeTech Associates","snapshot":"2026-10-01T19:51:37.942Z","sheet":"Financing & Money Flows","row":9,"sourceUrl":"https://email.protenus.com/hubfs/Protenus_Sep2020/Resources/Protenus-raises-11-in-funding-Press-Release-Jan-2018.pdf"}]', '2026-10-01T19:51:37.942Z');

INSERT OR IGNORE INTO organization_support_records
      (id, from_organization_id, to_organization_id, from_label, to_label, support_kind, amount, currency, amount_label, description, occurred_at, source_url, evidence, notes, provenance_json, created_at)
      VALUES ('bmoremedtech:fin-protenus-investors-incl-transformation-capital-and-providence-ventures-17-000-000-2019-08-series-c', NULL, (SELECT organization_id FROM organization_source_identities WHERE source = 'bmoremedtech' AND external_id = 'org-protenus'), 'Investors incl. Transformation Capital and Providence Ventures', 'Protenus', 'transfer', 17000000, 'USD', '$17,000,000', 'Series C', '2019-08', 'https://app.dealroom.co/companies/protenus', 'Secondary corroborated', 'Into listed company · Disclosed Series C round.', '[{"source":"LifeTech Associates","snapshot":"2026-10-01T19:51:37.942Z","sheet":"Financing & Money Flows","row":10,"sourceUrl":"https://app.dealroom.co/companies/protenus"}]', '2026-10-01T19:51:37.942Z');

INSERT OR IGNORE INTO organization_support_records
      (id, from_organization_id, to_organization_id, from_label, to_label, support_kind, amount, currency, amount_label, description, occurred_at, source_url, evidence, notes, provenance_json, created_at)
      VALUES ('bmoremedtech:fin-protenus-investors-incl-memorialcare-f-prime-kaiser-permanente-ventures-arthur-ventures-lionbird-21-000-000-2021-06-series-d', NULL, (SELECT organization_id FROM organization_source_identities WHERE source = 'bmoremedtech' AND external_id = 'org-protenus'), 'Investors incl. MemorialCare, F-Prime, Kaiser Permanente Ventures, Arthur Ventures, LionBird', 'Protenus', 'transfer', 21000000, 'USD', '$21,000,000', 'Series D', '2021-06', 'https://www.cbinsights.com/company/protenus/financials', 'Secondary corroborated', 'Into listed company · Disclosed Series D round.', '[{"source":"LifeTech Associates","snapshot":"2026-10-01T19:51:37.942Z","sheet":"Financing & Money Flows","row":11,"sourceUrl":"https://www.cbinsights.com/company/protenus/financials"}]', '2026-10-01T19:51:37.942Z');

INSERT OR IGNORE INTO organization_support_records
      (id, from_organization_id, to_organization_id, from_label, to_label, support_kind, amount, currency, amount_label, description, occurred_at, source_url, evidence, notes, provenance_json, created_at)
      VALUES ('bmoremedtech:fin-early-charm-ventures-baltimore-city-economic-development-bond-funds-100-000-2023-03-convertible-term-loan', (SELECT organization_id FROM organization_source_identities WHERE source = 'bmoremedtech' AND external_id = 'org-baltimore-city'), (SELECT organization_id FROM organization_source_identities WHERE source = 'bmoremedtech' AND external_id = 'org-early-charm-ventures'), 'Baltimore City / Economic Development Bond Funds', 'Early Charm Ventures', 'transfer', 100000, 'USD', '$100,000', 'Convertible term loan', '2023-03', 'https://comptroller.baltimorecity.gov/sites/default/files/comptroller_baltimorecity_gov/attachments/3152023_Final%20Agenda.pdf', 'Government record', 'Into listed organization · Five-year equipment loan for Bayard Street manufacturing facility.', '[{"source":"LifeTech Associates","snapshot":"2026-10-01T19:51:37.942Z","sheet":"Financing & Money Flows","row":12,"sourceUrl":"https://comptroller.baltimorecity.gov/sites/default/files/comptroller_baltimorecity_gov/attachments/3152023_Final%20Agenda.pdf"},{"source":"LifeTech Associates","snapshot":"2026-10-01T19:51:37.942Z","sheet":"Funding Network","row":7,"sourceUrl":"https://comptroller.baltimorecity.gov/sites/default/files/comptroller_baltimorecity_gov/attachments/3152023_Final%20Agenda.pdf"}]', '2026-10-01T19:51:37.942Z');

INSERT OR IGNORE INTO organization_support_records
      (id, from_organization_id, to_organization_id, from_label, to_label, support_kind, amount, currency, amount_label, description, occurred_at, source_url, evidence, notes, provenance_json, created_at)
      VALUES ('bmoremedtech:fin-biohealth-innovation-u-s-economic-development-administration-495-000-2015-i6-grant', (SELECT organization_id FROM organization_source_identities WHERE source = 'bmoremedtech' AND external_id = 'org-u-s-economic-development-administration'), (SELECT organization_id FROM organization_source_identities WHERE source = 'bmoremedtech' AND external_id = 'org-biohealth-innovation'), 'U.S. Economic Development Administration', 'BioHealth Innovation', 'transfer', 495000, 'USD', '$495,000', 'i6 grant', '2015', 'https://www.eda.gov/funding/programs/build-to-scale/past-grantees/2015-venture-challenge/BioHealth-Innovation', 'Federal record', 'Into listed organization · Expansion of Venture Commercialization Model.', '[{"source":"LifeTech Associates","snapshot":"2026-10-01T19:51:37.942Z","sheet":"Financing & Money Flows","row":13,"sourceUrl":"https://www.eda.gov/funding/programs/build-to-scale/past-grantees/2015-venture-challenge/BioHealth-Innovation"},{"source":"LifeTech Associates","snapshot":"2026-10-01T19:51:37.942Z","sheet":"Funding Network","row":8,"sourceUrl":"https://www.eda.gov/funding/programs/build-to-scale/past-grantees/2015-venture-challenge/BioHealth-Innovation"}]', '2026-10-01T19:51:37.942Z');

INSERT OR IGNORE INTO organization_support_records
      (id, from_organization_id, to_organization_id, from_label, to_label, support_kind, amount, currency, amount_label, description, occurred_at, source_url, evidence, notes, provenance_json, created_at)
      VALUES ('bmoremedtech:fin-umbc-umb-national-institutes-of-health-4-000-000-2023-reach-grant', (SELECT organization_id FROM organization_source_identities WHERE source = 'bmoremedtech' AND external_id = 'org-national-institutes-of-health'), NULL, 'National Institutes of Health', 'UMBC + UMB', 'transfer', 4000000, 'USD', '$4,000,000', 'REACH grant', '2023', 'https://bwtech.umbc.edu/umbc-umb-to-create-innovation-hub-in-west-baltimore/', 'Institutional source', 'Ecosystem infrastructure · Four-year biomedical/life-sciences accelerator and commercialization award.', '[{"source":"LifeTech Associates","snapshot":"2026-10-01T19:51:37.942Z","sheet":"Financing & Money Flows","row":14,"sourceUrl":"https://bwtech.umbc.edu/umbc-umb-to-create-innovation-hub-in-west-baltimore/"},{"source":"LifeTech Associates","snapshot":"2026-10-01T19:51:37.942Z","sheet":"Funding Network","row":9,"sourceUrl":"https://bwtech.umbc.edu/umbc-umb-to-create-innovation-hub-in-west-baltimore/"}]', '2026-10-01T19:51:37.942Z');

INSERT OR IGNORE INTO organization_support_records
      (id, from_organization_id, to_organization_id, from_label, to_label, support_kind, amount, currency, amount_label, description, occurred_at, source_url, evidence, notes, provenance_json, created_at)
      VALUES ('bmoremedtech:fin-hutch-fearless-u-s-economic-development-administration-661-725-2022-build-to-scale-grant', (SELECT organization_id FROM organization_source_identities WHERE source = 'bmoremedtech' AND external_id = 'org-u-s-economic-development-administration'), (SELECT organization_id FROM organization_source_identities WHERE source = 'bmoremedtech' AND external_id = 'org-hutch-fearless'), 'U.S. Economic Development Administration', 'Hutch / Fearless', 'transfer', 661725, 'USD', '$661,725', 'Build to Scale grant', '2022', 'https://www.eda.gov/funding/programs/build-to-scale/past-grantees/2022-venture-challenge/Fearless-Solutions', 'Federal record', 'Into listed program · Federal share.', '[{"source":"LifeTech Associates","snapshot":"2026-10-01T19:51:37.942Z","sheet":"Financing & Money Flows","row":15,"sourceUrl":"https://www.eda.gov/funding/programs/build-to-scale/past-grantees/2022-venture-challenge/Fearless-Solutions"},{"source":"LifeTech Associates","snapshot":"2026-10-01T19:51:37.942Z","sheet":"Funding Network","row":10,"sourceUrl":"https://www.eda.gov/funding/programs/build-to-scale/past-grantees/2022-venture-challenge/Fearless-Solutions"}]', '2026-10-01T19:51:37.942Z');

INSERT OR IGNORE INTO organization_support_records
      (id, from_organization_id, to_organization_id, from_label, to_label, support_kind, amount, currency, amount_label, description, occurred_at, source_url, evidence, notes, provenance_json, created_at)
      VALUES ('bmoremedtech:fin-hutch-fearless-local-match-661-725-2022-matching-funds', NULL, (SELECT organization_id FROM organization_source_identities WHERE source = 'bmoremedtech' AND external_id = 'org-hutch-fearless'), 'Local match', 'Hutch / Fearless', 'transfer', 661725, 'USD', '$661,725', 'Matching funds', '2022', 'https://www.eda.gov/funding/programs/build-to-scale/past-grantees/2022-venture-challenge/Fearless-Solutions', 'Federal record', 'Into listed program · Required local match.', '[{"source":"LifeTech Associates","snapshot":"2026-10-01T19:51:37.942Z","sheet":"Financing & Money Flows","row":16,"sourceUrl":"https://www.eda.gov/funding/programs/build-to-scale/past-grantees/2022-venture-challenge/Fearless-Solutions"},{"source":"LifeTech Associates","snapshot":"2026-10-01T19:51:37.942Z","sheet":"Funding Network","row":11,"sourceUrl":"https://www.eda.gov/funding/programs/build-to-scale/past-grantees/2022-venture-challenge/Fearless-Solutions"}]', '2026-10-01T19:51:37.942Z');

INSERT OR IGNORE INTO organization_support_records
      (id, from_organization_id, to_organization_id, from_label, to_label, support_kind, amount, currency, amount_label, description, occurred_at, source_url, evidence, notes, provenance_json, created_at)
      VALUES ('bmoremedtech:fin-launchport-tedco-equitech-growth-fund-41-500-fy2025-workforce-grant', (SELECT organization_id FROM organization_source_identities WHERE source = 'bmoremedtech' AND external_id = 'org-tedco-equitech-growth-fund'), (SELECT organization_id FROM organization_source_identities WHERE source = 'bmoremedtech' AND external_id = 'org-the-launchport'), 'TEDCO Equitech Growth Fund', 'LaunchPort', 'transfer', 41500, 'USD', '$41,500', 'Workforce grant', 'FY2025', 'https://www.tedcomd.com/insight/tedcos-first-round-equitech-growth-fund-awardees-unveiled-0', 'State record', 'Into listed organization · First of two Equitech awards.', '[{"source":"LifeTech Associates","snapshot":"2026-10-01T19:51:37.942Z","sheet":"Financing & Money Flows","row":17,"sourceUrl":"https://www.tedcomd.com/insight/tedcos-first-round-equitech-growth-fund-awardees-unveiled-0"},{"source":"LifeTech Associates","snapshot":"2026-10-01T19:51:37.942Z","sheet":"Funding Network","row":12,"sourceUrl":"https://www.tedcomd.com/insight/tedcos-first-round-equitech-growth-fund-awardees-unveiled-0"}]', '2026-10-01T19:51:37.942Z');

INSERT OR IGNORE INTO organization_support_records
      (id, from_organization_id, to_organization_id, from_label, to_label, support_kind, amount, currency, amount_label, description, occurred_at, source_url, evidence, notes, provenance_json, created_at)
      VALUES ('bmoremedtech:fin-launchport-tedco-equitech-growth-fund-234-100-fy2025-infrastructure-grant', (SELECT organization_id FROM organization_source_identities WHERE source = 'bmoremedtech' AND external_id = 'org-tedco-equitech-growth-fund'), (SELECT organization_id FROM organization_source_identities WHERE source = 'bmoremedtech' AND external_id = 'org-the-launchport'), 'TEDCO Equitech Growth Fund', 'LaunchPort', 'transfer', 234100, 'USD', '$234,100', 'Infrastructure grant', 'FY2025', 'https://www.tedcomd.com/insight/tedcos-first-round-equitech-growth-fund-awardees-unveiled-0', 'State record', 'Into listed organization · Second of two Equitech awards.', '[{"source":"LifeTech Associates","snapshot":"2026-10-01T19:51:37.942Z","sheet":"Financing & Money Flows","row":18,"sourceUrl":"https://www.tedcomd.com/insight/tedcos-first-round-equitech-growth-fund-awardees-unveiled-0"},{"source":"LifeTech Associates","snapshot":"2026-10-01T19:51:37.942Z","sheet":"Funding Network","row":13,"sourceUrl":"https://www.tedcomd.com/insight/tedcos-first-round-equitech-growth-fund-awardees-unveiled-0"}]', '2026-10-01T19:51:37.942Z');

INSERT OR IGNORE INTO organization_support_records
      (id, from_organization_id, to_organization_id, from_label, to_label, support_kind, amount, currency, amount_label, description, occurred_at, source_url, evidence, notes, provenance_json, created_at)
      VALUES ('bmoremedtech:fin-biobuzz-networks-tedco-equitech-growth-fund-224-800-fy2026-workforce-grant', (SELECT organization_id FROM organization_source_identities WHERE source = 'bmoremedtech' AND external_id = 'org-tedco-equitech-growth-fund'), (SELECT organization_id FROM organization_source_identities WHERE source = 'bmoremedtech' AND external_id = 'org-biobuzz'), 'TEDCO Equitech Growth Fund', 'BioBuzz Networks', 'transfer', 224800, 'USD', '$224,800', 'Workforce grant', 'FY2026', 'https://www.tedcomd.com/sites/default/files/2026-02/FY27%20TEDCO%20budget%20Testimony%20FINAL.pdf', 'State record', 'Into listed organization · Healthcare, life sciences and bioinformatics project.', '[{"source":"LifeTech Associates","snapshot":"2026-10-01T19:51:37.942Z","sheet":"Financing & Money Flows","row":19,"sourceUrl":"https://www.tedcomd.com/sites/default/files/2026-02/FY27%20TEDCO%20budget%20Testimony%20FINAL.pdf"},{"source":"LifeTech Associates","snapshot":"2026-10-01T19:51:37.942Z","sheet":"Funding Network","row":14,"sourceUrl":"https://www.tedcomd.com/sites/default/files/2026-02/FY27%20TEDCO%20budget%20Testimony%20FINAL.pdf"}]', '2026-10-01T19:51:37.942Z');

INSERT OR IGNORE INTO organization_support_records
      (id, from_organization_id, to_organization_id, from_label, to_label, support_kind, amount, currency, amount_label, description, occurred_at, source_url, evidence, notes, provenance_json, created_at)
      VALUES ('bmoremedtech:fin-techstars-ai-health-cohort-company-techstars-220-000-current-terms-accelerator-investment', (SELECT organization_id FROM organization_source_identities WHERE source = 'bmoremedtech' AND external_id = 'org-techstars'), NULL, 'Techstars', 'Techstars AI Health cohort company', 'terms', 220000, 'USD', '$220,000', 'Accelerator investment', 'Current terms', 'https://www.techstars.com/accelerators/baltimore-ai-health', 'Primary source', 'Deployed by listed program · Per participating company.', '[{"source":"LifeTech Associates","snapshot":"2026-10-01T19:51:37.942Z","sheet":"Financing & Money Flows","row":20,"sourceUrl":"https://www.techstars.com/accelerators/baltimore-ai-health"},{"source":"LifeTech Associates","snapshot":"2026-10-01T19:51:37.942Z","sheet":"Funding Network","row":15,"sourceUrl":"https://www.techstars.com/accelerators/baltimore-ai-health"}]', '2026-10-01T19:51:37.942Z');

INSERT OR IGNORE INTO organization_support_records
      (id, from_organization_id, to_organization_id, from_label, to_label, support_kind, amount, currency, amount_label, description, occurred_at, source_url, evidence, notes, provenance_json, created_at)
      VALUES ('bmoremedtech:fin-1501-health-cohort-company-healthworx-carefirst-lifebridge-health-100-000-2021-2022-incubator-investment', NULL, NULL, 'Healthworx / CareFirst + LifeBridge Health', '1501 Health cohort company', 'terms', 100000, 'USD', '$100,000', 'Incubator investment', '2021-2022', 'https://www.lifebridgehealth.org/news/healthworx-and-lifebridge-health-launch-startup-incubator-1501-health', 'Primary source', 'Deployed by listed program · Up to $100K per company in early cohorts.', '[{"source":"LifeTech Associates","snapshot":"2026-10-01T19:51:37.942Z","sheet":"Financing & Money Flows","row":21,"sourceUrl":"https://www.lifebridgehealth.org/news/healthworx-and-lifebridge-health-launch-startup-incubator-1501-health"},{"source":"LifeTech Associates","snapshot":"2026-10-01T19:51:37.942Z","sheet":"Funding Network","row":16,"sourceUrl":"https://www.lifebridgehealth.org/news/healthworx-and-lifebridge-health-launch-startup-incubator-1501-health"}]', '2026-10-01T19:51:37.942Z');

INSERT OR IGNORE INTO organization_support_records
      (id, from_organization_id, to_organization_id, from_label, to_label, support_kind, amount, currency, amount_label, description, occurred_at, source_url, evidence, notes, provenance_json, created_at)
      VALUES ('bmoremedtech:fin-1501-health-cohort-company-healthworx-carefirst-lifebridge-health-125-000-2023-terms-incubator-investment', NULL, NULL, 'Healthworx / CareFirst + LifeBridge Health', '1501 Health cohort company', 'terms', 125000, 'USD', '$125,000', 'Incubator investment', '2023 terms', 'https://ventures.jhu.edu/event/1501-health-incubator-application/', 'Institutional source', 'Deployed by listed program · Up to $125K per company for third cohort.', '[{"source":"LifeTech Associates","snapshot":"2026-10-01T19:51:37.942Z","sheet":"Financing & Money Flows","row":22,"sourceUrl":"https://ventures.jhu.edu/event/1501-health-incubator-application/"},{"source":"LifeTech Associates","snapshot":"2026-10-01T19:51:37.942Z","sheet":"Funding Network","row":17,"sourceUrl":"https://ventures.jhu.edu/event/1501-health-incubator-application/"}]', '2026-10-01T19:51:37.942Z');

INSERT OR IGNORE INTO organization_support_records
      (id, from_organization_id, to_organization_id, from_label, to_label, support_kind, amount, currency, amount_label, description, occurred_at, source_url, evidence, notes, provenance_json, created_at)
      VALUES ('bmoremedtech:fin-hexcite-selected-project-johns-hopkins-technology-ventures-10-000-2026-venture-lab-award', (SELECT organization_id FROM organization_source_identities WHERE source = 'bmoremedtech' AND external_id = 'org-johns-hopkins-technology-ventures'), NULL, 'Johns Hopkins Technology Ventures', 'Hexcite selected project', 'terms', 10000, 'USD', '$10,000', 'Venture lab award', '2026', 'https://ventures.jhu.edu/programs-services/cohort-based-programs/hexcite/', 'Primary source', 'Deployed by listed program · Select project receives $10K.', '[{"source":"LifeTech Associates","snapshot":"2026-10-01T19:51:37.942Z","sheet":"Financing & Money Flows","row":23,"sourceUrl":"https://ventures.jhu.edu/programs-services/cohort-based-programs/hexcite/"},{"source":"LifeTech Associates","snapshot":"2026-10-01T19:51:37.942Z","sheet":"Funding Network","row":18,"sourceUrl":"https://ventures.jhu.edu/programs-services/cohort-based-programs/hexcite/"}]', '2026-10-01T19:51:37.942Z');

INSERT OR IGNORE INTO organization_support_records
      (id, from_organization_id, to_organization_id, from_label, to_label, support_kind, amount, currency, amount_label, description, occurred_at, source_url, evidence, notes, provenance_json, created_at)
      VALUES ('bmoremedtech:fin-mdc-studio-client-companies-contracts-grants-and-investors-15-000-000-cumulative-aggregate-financing', NULL, NULL, 'Contracts, grants and investors', 'MDC Studio client companies', 'portfolio', 15000000, 'USD', '$15,000,000', 'Aggregate financing', 'Cumulative', 'https://mdcstudio.com/', 'Primary source', 'Portfolio aggregate · Over $15M raised; includes overlapping categories below.', '[{"source":"LifeTech Associates","snapshot":"2026-10-01T19:51:37.942Z","sheet":"Financing & Money Flows","row":24,"sourceUrl":"https://mdcstudio.com/"}]', '2026-10-01T19:51:37.942Z');

INSERT OR IGNORE INTO organization_support_records
      (id, from_organization_id, to_organization_id, from_label, to_label, support_kind, amount, currency, amount_label, description, occurred_at, source_url, evidence, notes, provenance_json, created_at)
      VALUES ('bmoremedtech:fin-mdc-studio-client-companies-contract-and-grant-funders-13-000-000-cumulative-contracts-grants', NULL, NULL, 'Contract and grant funders', 'MDC Studio client companies', 'portfolio', 13000000, 'USD', '$13,000,000', 'Contracts + grants', 'Cumulative', 'https://www.mdcstudio.com/for-entrepreneurs/', 'Primary source', 'Portfolio aggregate · About $13M; subset of aggregate.', '[{"source":"LifeTech Associates","snapshot":"2026-10-01T19:51:37.942Z","sheet":"Financing & Money Flows","row":25,"sourceUrl":"https://www.mdcstudio.com/for-entrepreneurs/"}]', '2026-10-01T19:51:37.942Z');

INSERT OR IGNORE INTO organization_support_records
      (id, from_organization_id, to_organization_id, from_label, to_label, support_kind, amount, currency, amount_label, description, occurred_at, source_url, evidence, notes, provenance_json, created_at)
      VALUES ('bmoremedtech:fin-mdc-studio-client-companies-angel-investors-3-000-000-cumulative-angel-investment', NULL, NULL, 'Angel investors', 'MDC Studio client companies', 'portfolio', 3000000, 'USD', '$3,000,000', 'Angel investment', 'Cumulative', 'https://mdcstudio.com/', 'Primary source', 'Portfolio aggregate · About $3M; may overlap aggregate.', '[{"source":"LifeTech Associates","snapshot":"2026-10-01T19:51:37.942Z","sheet":"Financing & Money Flows","row":26,"sourceUrl":"https://mdcstudio.com/"}]', '2026-10-01T19:51:37.942Z');

INSERT OR IGNORE INTO organization_support_records
      (id, from_organization_id, to_organization_id, from_label, to_label, support_kind, amount, currency, amount_label, description, occurred_at, source_url, evidence, notes, provenance_json, created_at)
      VALUES ('bmoremedtech:fin-maryland-momentum-portfolio-maryland-momentum-fund-usm-11-700-000-since-2017-equity-investments', (SELECT organization_id FROM organization_source_identities WHERE source = 'bmoremedtech' AND external_id = 'org-usm-maryland-momentum-fund'), NULL, 'Maryland Momentum Fund / USM', 'Maryland Momentum portfolio', 'portfolio', 11700000, 'USD', '$11,700,000', 'Equity investments', 'Since 2017', 'https://mpower.maryland.edu/center-for-maryland-advanced-ventures/', 'Institutional report', 'Deployed by listed fund · 27 companies across 8 USM institutions.', '[{"source":"LifeTech Associates","snapshot":"2026-10-01T19:51:37.942Z","sheet":"Financing & Money Flows","row":27,"sourceUrl":"https://mpower.maryland.edu/center-for-maryland-advanced-ventures/"},{"source":"LifeTech Associates","snapshot":"2026-10-01T19:51:37.942Z","sheet":"Funding Network","row":19,"sourceUrl":"https://mpower.maryland.edu/center-for-maryland-advanced-ventures/"}]', '2026-10-01T19:51:37.942Z');

INSERT OR IGNORE INTO organization_support_records
      (id, from_organization_id, to_organization_id, from_label, to_label, support_kind, amount, currency, amount_label, description, occurred_at, source_url, evidence, notes, provenance_json, created_at)
      VALUES ('bmoremedtech:fin-maryland-momentum-portfolio-co-investors-125-000-000-since-2017-co-investment', NULL, NULL, 'Co-investors', 'Maryland Momentum portfolio', 'coinvestment', 125000000, 'USD', '$125,000,000', 'Co-investment', 'Since 2017', 'https://mpower.maryland.edu/center-for-maryland-advanced-ventures/', 'Institutional report', 'Portfolio aggregate · 230+ unique co-investors.', '[{"source":"LifeTech Associates","snapshot":"2026-10-01T19:51:37.942Z","sheet":"Financing & Money Flows","row":28,"sourceUrl":"https://mpower.maryland.edu/center-for-maryland-advanced-ventures/"},{"source":"LifeTech Associates","snapshot":"2026-10-01T19:51:37.942Z","sheet":"Funding Network","row":20,"sourceUrl":"https://mpower.maryland.edu/center-for-maryland-advanced-ventures/"}]', '2026-10-01T19:51:37.942Z');

INSERT OR IGNORE INTO organization_support_records
      (id, from_organization_id, to_organization_id, from_label, to_label, support_kind, amount, currency, amount_label, description, occurred_at, source_url, evidence, notes, provenance_json, created_at)
      VALUES ('bmoremedtech:fin-maryland-momentum-fund-university-system-of-maryland-16-000-000-current-fund-size-fund-capitalization', (SELECT organization_id FROM organization_source_identities WHERE source = 'bmoremedtech' AND external_id = 'org-university-system-of-maryland'), (SELECT organization_id FROM organization_source_identities WHERE source = 'bmoremedtech' AND external_id = 'org-usm-maryland-momentum-fund'), 'University System of Maryland', 'Maryland Momentum Fund', 'capitalization', 16000000, 'USD', '$16,000,000', 'Fund capitalization', 'Current fund size', 'https://innovate.umd.edu/resources/momentum-fund', 'Institutional source', 'Into listed fund · USM early-stage investment fund.', '[{"source":"LifeTech Associates","snapshot":"2026-10-01T19:51:37.942Z","sheet":"Financing & Money Flows","row":29,"sourceUrl":"https://innovate.umd.edu/resources/momentum-fund"},{"source":"LifeTech Associates","snapshot":"2026-10-01T19:51:37.942Z","sheet":"Funding Network","row":21,"sourceUrl":"https://innovate.umd.edu/resources/momentum-fund"}]', '2026-10-01T19:51:37.942Z');

INSERT OR IGNORE INTO organization_support_records
      (id, from_organization_id, to_organization_id, from_label, to_label, support_kind, amount, currency, amount_label, description, occurred_at, source_url, evidence, notes, provenance_json, created_at)
      VALUES ('bmoremedtech:fin-tedco-life-science-investment-fund-portfolio-tedco-500-000-fy2025-life-science-investment', (SELECT organization_id FROM organization_source_identities WHERE source = 'bmoremedtech' AND external_id = 'org-tedco'), NULL, 'TEDCO', 'TEDCO Life Science Investment Fund portfolio', 'portfolio', 500000, 'USD', '$500,000', 'Life-science investment', 'FY2025', 'https://www.tedcomd.com/sites/default/files/2025-12/TEDCO%20Annual%20Report%20FY%202025.pdf', 'Annual report', 'Deployed by listed fund · One LSIF investment in FY2025.', '[{"source":"LifeTech Associates","snapshot":"2026-10-01T19:51:37.942Z","sheet":"Financing & Money Flows","row":30,"sourceUrl":"https://www.tedcomd.com/sites/default/files/2025-12/TEDCO%20Annual%20Report%20FY%202025.pdf"}]', '2026-10-01T19:51:37.942Z');

INSERT OR IGNORE INTO organization_support_records
      (id, from_organization_id, to_organization_id, from_label, to_label, support_kind, amount, currency, amount_label, description, occurred_at, source_url, evidence, notes, provenance_json, created_at)
      VALUES ('bmoremedtech:fin-irazu-oncology-tedco-life-science-investment-fund-500-000-2025-03-life-science-investment', (SELECT organization_id FROM organization_source_identities WHERE source = 'bmoremedtech' AND external_id = 'org-tedco-life-science-investment-fund'), (SELECT organization_id FROM organization_source_identities WHERE source = 'bmoremedtech' AND external_id = 'org-irazu-oncology'), 'TEDCO Life Science Investment Fund', 'Irazu Oncology', 'transfer', 500000, 'USD', '$500,000', 'Life-science investment', '2025-03', 'https://www.tedcomd.com/insight/tedco-invests-irazu-oncology-0', 'Primary source', 'Named ecosystem transaction · Cancer immunotherapy company.', '[{"source":"LifeTech Associates","snapshot":"2026-10-01T19:51:37.942Z","sheet":"Financing & Money Flows","row":31,"sourceUrl":"https://www.tedcomd.com/insight/tedco-invests-irazu-oncology-0"},{"source":"LifeTech Associates","snapshot":"2026-10-01T19:51:37.942Z","sheet":"Funding Network","row":22,"sourceUrl":"https://www.tedcomd.com/insight/tedco-invests-irazu-oncology-0"}]', '2026-10-01T19:51:37.942Z');

INSERT OR IGNORE INTO organization_support_records
      (id, from_organization_id, to_organization_id, from_label, to_label, support_kind, amount, currency, amount_label, description, occurred_at, source_url, evidence, notes, provenance_json, created_at)
      VALUES ('bmoremedtech:fin-conscious-venture-fund-ii-investors-led-by-sagamore-ventures-15-800-000-2022-07-vc-fund-commitments', NULL, (SELECT organization_id FROM organization_source_identities WHERE source = 'bmoremedtech' AND external_id = 'org-conscious-venture-fund-ii'), 'Investors led by Sagamore Ventures', 'Conscious Venture Fund II', 'capitalization', 15800000, 'USD', '$15,800,000', 'VC fund commitments', '2022-07', 'https://www.prnewswire.com/news-releases/conscious-venture-partners-raises-15-8-million-for-conscious-venture-fund-ii-led-locally-by-kevin-planks-sagamore-ventures-301585334.html', 'Primary release', 'Into listed fund manager · Raised at announcement toward $50M goal.', '[{"source":"LifeTech Associates","snapshot":"2026-10-01T19:51:37.942Z","sheet":"Financing & Money Flows","row":32,"sourceUrl":"https://www.prnewswire.com/news-releases/conscious-venture-partners-raises-15-8-million-for-conscious-venture-fund-ii-led-locally-by-kevin-planks-sagamore-ventures-301585334.html"},{"source":"LifeTech Associates","snapshot":"2026-10-01T19:51:37.942Z","sheet":"Funding Network","row":25,"sourceUrl":"https://www.prnewswire.com/news-releases/conscious-venture-partners-raises-15-8-million-for-conscious-venture-fund-ii-led-locally-by-kevin-planks-sagamore-ventures-301585334.html"}]', '2026-10-01T19:51:37.942Z');

INSERT OR IGNORE INTO organization_support_records
      (id, from_organization_id, to_organization_id, from_label, to_label, support_kind, amount, currency, amount_label, description, occurred_at, source_url, evidence, notes, provenance_json, created_at)
      VALUES ('bmoremedtech:fin-conscious-venture-fund-ii-sagamore-ventures-2-500-000-2022-07-lp-commitment', (SELECT organization_id FROM organization_source_identities WHERE source = 'bmoremedtech' AND external_id = 'org-sagamore-ventures'), (SELECT organization_id FROM organization_source_identities WHERE source = 'bmoremedtech' AND external_id = 'org-conscious-venture-fund-ii'), 'Sagamore Ventures', 'Conscious Venture Fund II', 'capitalization', 2500000, 'USD', '$2,500,000', 'LP commitment', '2022-07', 'https://www.prnewswire.com/news-releases/conscious-venture-partners-raises-15-8-million-for-conscious-venture-fund-ii-led-locally-by-kevin-planks-sagamore-ventures-301585334.html', 'Primary release', 'Into listed fund manager · Named lead commitment; included in fund total above.', '[{"source":"LifeTech Associates","snapshot":"2026-10-01T19:51:37.942Z","sheet":"Financing & Money Flows","row":33,"sourceUrl":"https://www.prnewswire.com/news-releases/conscious-venture-partners-raises-15-8-million-for-conscious-venture-fund-ii-led-locally-by-kevin-planks-sagamore-ventures-301585334.html"},{"source":"LifeTech Associates","snapshot":"2026-10-01T19:51:37.942Z","sheet":"Funding Network","row":26,"sourceUrl":"https://www.prnewswire.com/news-releases/conscious-venture-partners-raises-15-8-million-for-conscious-venture-fund-ii-led-locally-by-kevin-planks-sagamore-ventures-301585334.html"}]', '2026-10-01T19:51:37.942Z');

INSERT OR IGNORE INTO organization_support_records
      (id, from_organization_id, to_organization_id, from_label, to_label, support_kind, amount, currency, amount_label, description, occurred_at, source_url, evidence, notes, provenance_json, created_at)
      VALUES ('bmoremedtech:fin-squadra-ii-limited-partners-investors-105-000-000-2023-07-vc-fund-raise', NULL, (SELECT organization_id FROM organization_source_identities WHERE source = 'bmoremedtech' AND external_id = 'org-squadra-ii'), 'Limited partners / investors', 'Squadra II', 'capitalization', 105000000, 'USD', '$105,000,000', 'VC fund raise', '2023-07', 'https://blog.squadra.vc/articles/squadra-ventures-raises-105-million-to-invest-in-early-stage-cyber-and-national-security-companies', 'Primary source', 'Into listed fund manager · Fund raise announced at $105M.', '[{"source":"LifeTech Associates","snapshot":"2026-10-01T19:51:37.942Z","sheet":"Financing & Money Flows","row":34,"sourceUrl":"https://blog.squadra.vc/articles/squadra-ventures-raises-105-million-to-invest-in-early-stage-cyber-and-national-security-companies"},{"source":"LifeTech Associates","snapshot":"2026-10-01T19:51:37.942Z","sheet":"Funding Network","row":27,"sourceUrl":"https://blog.squadra.vc/articles/squadra-ventures-raises-105-million-to-invest-in-early-stage-cyber-and-national-security-companies"}]', '2026-10-01T19:51:37.942Z');

INSERT OR IGNORE INTO organization_support_records
      (id, from_organization_id, to_organization_id, from_label, to_label, support_kind, amount, currency, amount_label, description, occurred_at, source_url, evidence, notes, provenance_json, created_at)
      VALUES ('bmoremedtech:fin-rarebreed-ventures-fund-i-limited-partners-investors-10-000-000-2022-reported-vc-fund-raise', NULL, (SELECT organization_id FROM organization_source_identities WHERE source = 'bmoremedtech' AND external_id = 'org-rarebreed-ventures-fund-i'), 'Limited partners / investors', 'RareBreed Ventures Fund I', 'capitalization', 10000000, 'USD', '$10,000,000', 'VC fund raise', '2022 reported', 'https://www.bizjournals.com/baltimore/inno/stories/fundings/2022/03/03/mac-conwell-rarebreed-ventures-second-fund.html', 'Secondary reported', 'Into listed fund manager · Reported first fund close.', '[{"source":"LifeTech Associates","snapshot":"2026-10-01T19:51:37.942Z","sheet":"Financing & Money Flows","row":35,"sourceUrl":"https://www.bizjournals.com/baltimore/inno/stories/fundings/2022/03/03/mac-conwell-rarebreed-ventures-second-fund.html"},{"source":"LifeTech Associates","snapshot":"2026-10-01T19:51:37.942Z","sheet":"Funding Network","row":28,"sourceUrl":"https://www.bizjournals.com/baltimore/inno/stories/fundings/2022/03/03/mac-conwell-rarebreed-ventures-second-fund.html"}]', '2026-10-01T19:51:37.942Z');

INSERT OR IGNORE INTO organization_support_records
      (id, from_organization_id, to_organization_id, from_label, to_label, support_kind, amount, currency, amount_label, description, occurred_at, source_url, evidence, notes, provenance_json, created_at)
      VALUES ('bmoremedtech:fin-startup-accelerator-company-towson-university-startup-10-000-current-program-equity-free-stipend', (SELECT organization_id FROM organization_source_identities WHERE source = 'bmoremedtech' AND external_id = 'org-startup-at-the-armory'), NULL, 'Towson University StarTUp', 'StarTUp Accelerator company', 'terms', 10000, 'USD', '$10,000', 'Equity-free stipend', 'Current program', 'https://www.towson.edu/startup/programs/community-entrepreneurship/accelerator/', 'Primary source', 'Deployed by listed program · Per selected accelerator company.', '[{"source":"LifeTech Associates","snapshot":"2026-10-01T19:51:37.942Z","sheet":"Financing & Money Flows","row":36,"sourceUrl":"https://www.towson.edu/startup/programs/community-entrepreneurship/accelerator/"},{"source":"LifeTech Associates","snapshot":"2026-10-01T19:51:37.942Z","sheet":"Funding Network","row":29,"sourceUrl":"https://www.towson.edu/startup/programs/community-entrepreneurship/accelerator/"}]', '2026-10-01T19:51:37.942Z');

INSERT OR IGNORE INTO organization_support_records
      (id, from_organization_id, to_organization_id, from_label, to_label, support_kind, amount, currency, amount_label, description, occurred_at, source_url, evidence, notes, provenance_json, created_at)
      VALUES ('bmoremedtech:fin-morgan-entrepreneurship-research-awardee-morgan-innovation-entrepreneurship-center-10-000-current-program-research-grant', (SELECT organization_id FROM organization_source_identities WHERE source = 'bmoremedtech' AND external_id = 'org-morgan-state-innovation-entrepreneurship-center'), NULL, 'Morgan Innovation & Entrepreneurship Center', 'Morgan entrepreneurship research awardee', 'terms', 10000, 'USD', '$10,000', 'Research grant', 'Current program', 'https://www.morgan.edu/innovation-and-entrepreneurship-center/research', 'Primary source', 'Deployed by listed program · Per research award.', '[{"source":"LifeTech Associates","snapshot":"2026-10-01T19:51:37.942Z","sheet":"Financing & Money Flows","row":37,"sourceUrl":"https://www.morgan.edu/innovation-and-entrepreneurship-center/research"},{"source":"LifeTech Associates","snapshot":"2026-10-01T19:51:37.942Z","sheet":"Funding Network","row":30,"sourceUrl":"https://www.morgan.edu/innovation-and-entrepreneurship-center/research"}]', '2026-10-01T19:51:37.942Z');

INSERT OR IGNORE INTO organization_support_records
      (id, from_organization_id, to_organization_id, from_label, to_label, support_kind, amount, currency, amount_label, description, occurred_at, source_url, evidence, notes, provenance_json, created_at)
      VALUES ('bmoremedtech:fin-pava-center-supported-teams-various-investors-and-funders-200-000-000-cumulative-reported-capital-raised-by-supported-teams', NULL, NULL, 'Various investors and funders', 'Pava Center supported teams', 'portfolio', 200000000, 'USD', '$200,000,000', 'Capital raised by supported teams', 'Cumulative reported', 'https://hub.jhu.edu/2024/04/08/pava-center-dedication/', 'Institutional source', 'Portfolio aggregate · More than $200M raised by student/community teams; not direct Pava disbursement.', '[{"source":"LifeTech Associates","snapshot":"2026-10-01T19:51:37.942Z","sheet":"Financing & Money Flows","row":38,"sourceUrl":"https://hub.jhu.edu/2024/04/08/pava-center-dedication/"}]', '2026-10-01T19:51:37.942Z');

INSERT OR IGNORE INTO organization_support_records
      (id, from_organization_id, to_organization_id, from_label, to_label, support_kind, amount, currency, amount_label, description, occurred_at, source_url, evidence, notes, provenance_json, created_at)
      VALUES ('bmoremedtech:edge-tedco-seed-funds-ssbci-irazu-oncology-250-000-equity-seed-investment-2026', (SELECT organization_id FROM organization_source_identities WHERE source = 'bmoremedtech' AND external_id = 'org-tedco-seed-funds-ssbci'), (SELECT organization_id FROM organization_source_identities WHERE source = 'bmoremedtech' AND external_id = 'org-irazu-oncology'), 'TEDCO Seed Funds / SSBCI', 'Irazu Oncology', 'transfer', 250000, 'USD', '$250,000', 'Equity/seed investment · State fund → biotech company', '2026', 'https://www.tedcomd.com/insight/tedco-announces-state-small-business-credit-initiative-investment-irazu-oncology', 'Source linked in Funding Network', '', '[{"source":"LifeTech Associates","snapshot":"2026-10-01T19:51:37.942Z","sheet":"Funding Network","row":23,"sourceUrl":"https://www.tedcomd.com/insight/tedco-announces-state-small-business-credit-initiative-investment-irazu-oncology"}]', '2026-10-01T19:51:37.942Z');

INSERT OR IGNORE INTO organization_support_records
      (id, from_organization_id, to_organization_id, from_label, to_label, support_kind, amount, currency, amount_label, description, occurred_at, source_url, evidence, notes, provenance_json, created_at)
      VALUES ('bmoremedtech:edge-investors-irazu-oncology-2-600-000-seed-investment-2023', NULL, (SELECT organization_id FROM organization_source_identities WHERE source = 'bmoremedtech' AND external_id = 'org-irazu-oncology'), 'Investors', 'Irazu Oncology', 'transfer', 2600000, 'USD', '$2,600,000', 'Seed investment · Investors → biotech company', '2023', 'https://www.irazuoncology.com/news/', 'Source linked in Funding Network', '', '[{"source":"LifeTech Associates","snapshot":"2026-10-01T19:51:37.942Z","sheet":"Funding Network","row":24,"sourceUrl":"https://www.irazuoncology.com/news/"}]', '2026-10-01T19:51:37.942Z');

INSERT OR IGNORE INTO organization_support_records
      (id, from_organization_id, to_organization_id, from_label, to_label, support_kind, amount, currency, amount_label, description, occurred_at, source_url, evidence, notes, provenance_json, created_at)
      VALUES ('bmoremedtech:rel-org-techstars-ai-health-baltimore-org-techstars-acceleration', (SELECT organization_id FROM organization_source_identities WHERE source = 'bmoremedtech' AND external_id = 'org-techstars-ai-health-baltimore'), (SELECT organization_id FROM organization_source_identities WHERE source = 'bmoremedtech' AND external_id = 'org-techstars'), 'Techstars AI Health Baltimore', 'Techstars', 'acceleration', NULL, NULL, '', 'Techstars accelerator program · Techstars accelerator program', '', 'https://www.techstars.com/accelerators/baltimore-ai-health', 'Directory affiliation / program description', '', '[{"source":"LifeTech Associates","snapshot":"2026-10-01T19:51:37.942Z","sheet":"Sheet1","row":7,"sourceUrl":"https://www.techstars.com/accelerators/baltimore-ai-health"}]', '2026-10-01T19:51:37.942Z');

INSERT OR IGNORE INTO organization_support_records
      (id, from_organization_id, to_organization_id, from_label, to_label, support_kind, amount, currency, amount_label, description, occurred_at, source_url, evidence, notes, provenance_json, created_at)
      VALUES ('bmoremedtech:rel-org-hexcite-johns-hopkins-technology-ventures-org-johns-hopkins-technology-ventures-affiliation', (SELECT organization_id FROM organization_source_identities WHERE source = 'bmoremedtech' AND external_id = 'org-hexcite-johns-hopkins-technology-ventures'), (SELECT organization_id FROM organization_source_identities WHERE source = 'bmoremedtech' AND external_id = 'org-johns-hopkins-technology-ventures'), 'Hexcite — Johns Hopkins Technology Ventures', 'Johns Hopkins Technology Ventures', 'affiliation', NULL, NULL, '', 'Hexcite is a JHTV venture program · Hexcite is a JHTV venture program', '', 'https://ventures.jhu.edu/programs-services/cohort-based-programs/hexcite/', 'Directory affiliation / program description', '', '[{"source":"LifeTech Associates","snapshot":"2026-10-01T19:51:37.942Z","sheet":"Sheet1","row":8,"sourceUrl":"https://ventures.jhu.edu/programs-services/cohort-based-programs/hexcite/"}]', '2026-10-01T19:51:37.942Z');

INSERT OR IGNORE INTO organization_support_records
      (id, from_organization_id, to_organization_id, from_label, to_label, support_kind, amount, currency, amount_label, description, occurred_at, source_url, evidence, notes, provenance_json, created_at)
      VALUES ('bmoremedtech:rel-org-fastforward-johns-hopkins-technology-ventures-org-johns-hopkins-technology-ventures-affiliation', (SELECT organization_id FROM organization_source_identities WHERE source = 'bmoremedtech' AND external_id = 'org-fastforward-johns-hopkins-technology-ventures'), (SELECT organization_id FROM organization_source_identities WHERE source = 'bmoremedtech' AND external_id = 'org-johns-hopkins-technology-ventures'), 'FastForward / Johns Hopkins Technology Ventures', 'Johns Hopkins Technology Ventures', 'affiliation', NULL, NULL, '', 'FastForward is a JHTV commercialization program · FastForward is a JHTV commercialization program', '', 'https://ventures.jhu.edu/fastforward/', 'Directory affiliation / program description', '', '[{"source":"LifeTech Associates","snapshot":"2026-10-01T19:51:37.942Z","sheet":"Sheet1","row":9,"sourceUrl":"https://ventures.jhu.edu/fastforward/"}]', '2026-10-01T19:51:37.942Z');

INSERT OR IGNORE INTO organization_support_records
      (id, from_organization_id, to_organization_id, from_label, to_label, support_kind, amount, currency, amount_label, description, occurred_at, source_url, evidence, notes, provenance_json, created_at)
      VALUES ('bmoremedtech:rel-org-1501-health-org-lifebridge-health-collaboration', (SELECT organization_id FROM organization_source_identities WHERE source = 'bmoremedtech' AND external_id = 'org-1501-health'), (SELECT organization_id FROM organization_source_identities WHERE source = 'bmoremedtech' AND external_id = 'org-lifebridge-health'), '1501 Health', 'LifeBridge Health', 'collaboration', NULL, NULL, '', 'Co-founded 1501 Health · Co-founded 1501 Health', '', 'https://www.lifebridgehealth.org/news/healthworx-and-lifebridge-health-launch-startup-incubator-1501-health', 'Directory affiliation / program description', '', '[{"source":"LifeTech Associates","snapshot":"2026-10-01T19:51:37.942Z","sheet":"Sheet1","row":14,"sourceUrl":"https://www.lifebridgehealth.org/news/healthworx-and-lifebridge-health-launch-startup-incubator-1501-health"}]', '2026-10-01T19:51:37.942Z');

INSERT OR IGNORE INTO organization_support_records
      (id, from_organization_id, to_organization_id, from_label, to_label, support_kind, amount, currency, amount_label, description, occurred_at, source_url, evidence, notes, provenance_json, created_at)
      VALUES ('bmoremedtech:rel-org-1501-health-org-healthworx-carefirst-collaboration', (SELECT organization_id FROM organization_source_identities WHERE source = 'bmoremedtech' AND external_id = 'org-1501-health'), (SELECT organization_id FROM organization_source_identities WHERE source = 'bmoremedtech' AND external_id = 'org-healthworx-carefirst'), '1501 Health', 'Healthworx / CareFirst', 'collaboration', NULL, NULL, '', 'Co-founded 1501 Health · Co-founded 1501 Health', '', 'https://www.lifebridgehealth.org/news/healthworx-and-lifebridge-health-launch-startup-incubator-1501-health', 'Directory affiliation / program description', '', '[{"source":"LifeTech Associates","snapshot":"2026-10-01T19:51:37.942Z","sheet":"Sheet1","row":14,"sourceUrl":"https://www.lifebridgehealth.org/news/healthworx-and-lifebridge-health-launch-startup-incubator-1501-health"}]', '2026-10-01T19:51:37.942Z');

INSERT OR IGNORE INTO organization_support_records
      (id, from_organization_id, to_organization_id, from_label, to_label, support_kind, amount, currency, amount_label, description, occurred_at, source_url, evidence, notes, provenance_json, created_at)
      VALUES ('bmoremedtech:rel-org-bwtech-umbc-biotech-incubator-org-university-of-maryland-baltimore-county-incubation', (SELECT organization_id FROM organization_source_identities WHERE source = 'bmoremedtech' AND external_id = 'org-bwtech-umbc-biotech-incubator'), (SELECT organization_id FROM organization_source_identities WHERE source = 'bmoremedtech' AND external_id = 'org-university-of-maryland-baltimore-county'), 'bwtech@UMBC Biotech Incubator', 'University of Maryland, Baltimore County', 'incubation', NULL, NULL, '', 'University biotech incubator · University biotech incubator', '', 'https://bwtech.umbc.edu/incubators/biotech/', 'Directory affiliation / program description', '', '[{"source":"LifeTech Associates","snapshot":"2026-10-01T19:51:37.942Z","sheet":"Sheet1","row":15,"sourceUrl":"https://bwtech.umbc.edu/incubators/biotech/"}]', '2026-10-01T19:51:37.942Z');

INSERT OR IGNORE INTO organization_support_records
      (id, from_organization_id, to_organization_id, from_label, to_label, support_kind, amount, currency, amount_label, description, occurred_at, source_url, evidence, notes, provenance_json, created_at)
      VALUES ('bmoremedtech:rel-org-pava-marie-lapere-center-for-entrepreneurship-org-johns-hopkins-university-affiliation', (SELECT organization_id FROM organization_source_identities WHERE source = 'bmoremedtech' AND external_id = 'org-pava-marie-lapere-center-for-entrepreneurship'), (SELECT organization_id FROM organization_source_identities WHERE source = 'bmoremedtech' AND external_id = 'org-johns-hopkins-university'), 'Pava Marie LaPere Center for Entrepreneurship', 'Johns Hopkins University', 'affiliation', NULL, NULL, '', 'University entrepreneurship center · University entrepreneurship center', '', 'https://pavacenter.jhu.edu/', 'Directory affiliation / program description', '', '[{"source":"LifeTech Associates","snapshot":"2026-10-01T19:51:37.942Z","sheet":"Sheet1","row":24,"sourceUrl":"https://pavacenter.jhu.edu/"}]', '2026-10-01T19:51:37.942Z');

INSERT OR IGNORE INTO organization_support_records
      (id, from_organization_id, to_organization_id, from_label, to_label, support_kind, amount, currency, amount_label, description, occurred_at, source_url, evidence, notes, provenance_json, created_at)
      VALUES ('bmoremedtech:rel-org-lifebridge-health-bioincubator-at-sinai-hospital-org-lifebridge-health-incubation', (SELECT organization_id FROM organization_source_identities WHERE source = 'bmoremedtech' AND external_id = 'org-lifebridge-health-bioincubator-at-sinai-hospital'), (SELECT organization_id FROM organization_source_identities WHERE source = 'bmoremedtech' AND external_id = 'org-lifebridge-health'), 'LifeBridge Health BioIncubator at Sinai Hospital', 'LifeBridge Health', 'incubation', NULL, NULL, '', 'Health-system bioincubator · Health-system bioincubator', '', 'https://www.lifebridgehealth.org/', 'Directory affiliation / program description', '', '[{"source":"LifeTech Associates","snapshot":"2026-10-01T19:51:37.942Z","sheet":"Sheet1","row":61,"sourceUrl":"https://www.lifebridgehealth.org/"}]', '2026-10-01T19:51:37.942Z');

INSERT OR IGNORE INTO organization_support_records
      (id, from_organization_id, to_organization_id, from_label, to_label, support_kind, amount, currency, amount_label, description, occurred_at, source_url, evidence, notes, provenance_json, created_at)
      VALUES ('bmoremedtech:rel-org-the-grid-um-ventures-org-university-of-maryland-baltimore-um-ventures-affiliation', (SELECT organization_id FROM organization_source_identities WHERE source = 'bmoremedtech' AND external_id = 'org-the-grid-um-ventures'), (SELECT organization_id FROM organization_source_identities WHERE source = 'bmoremedtech' AND external_id = 'org-university-of-maryland-baltimore-um-ventures'), 'The GRID | UM Ventures', 'University of Maryland, Baltimore / UM Ventures', 'affiliation', NULL, NULL, '', 'UMB entrepreneurship hub · UMB entrepreneurship hub', '', 'https://www.graduate.umaryland.edu/grid/', 'Directory affiliation / program description', '', '[{"source":"LifeTech Associates","snapshot":"2026-10-01T19:51:37.942Z","sheet":"Sheet1","row":62,"sourceUrl":"https://www.graduate.umaryland.edu/grid/"}]', '2026-10-01T19:51:37.942Z');

INSERT OR IGNORE INTO organization_support_records
      (id, from_organization_id, to_organization_id, from_label, to_label, support_kind, amount, currency, amount_label, description, occurred_at, source_url, evidence, notes, provenance_json, created_at)
      VALUES ('bmoremedtech:rel-org-biohub-maryland-org-maryland-tech-council-affiliation', (SELECT organization_id FROM organization_source_identities WHERE source = 'bmoremedtech' AND external_id = 'org-biohub-maryland'), (SELECT organization_id FROM organization_source_identities WHERE source = 'bmoremedtech' AND external_id = 'org-maryland-tech-council'), 'BioHub Maryland', 'Maryland Tech Council', 'affiliation', NULL, NULL, '', 'Maryland Tech Council workforce program · Maryland Tech Council workforce program', '', 'https://www.biohubmaryland.com/', 'Directory affiliation / program description', '', '[{"source":"LifeTech Associates","snapshot":"2026-10-01T19:51:37.942Z","sheet":"Sheet1","row":64,"sourceUrl":"https://www.biohubmaryland.com/"}]', '2026-10-01T19:51:37.942Z');

INSERT OR IGNORE INTO organization_support_records
      (id, from_organization_id, to_organization_id, from_label, to_label, support_kind, amount, currency, amount_label, description, occurred_at, source_url, evidence, notes, provenance_json, created_at)
      VALUES ('bmoremedtech:rel-org-baltimore-regional-tech-council-org-maryland-tech-council-affiliation', (SELECT organization_id FROM organization_source_identities WHERE source = 'bmoremedtech' AND external_id = 'org-baltimore-regional-tech-council'), (SELECT organization_id FROM organization_source_identities WHERE source = 'bmoremedtech' AND external_id = 'org-maryland-tech-council'), 'Baltimore Regional Tech Council', 'Maryland Tech Council', 'affiliation', NULL, NULL, '', 'Regional chapter · Regional chapter', '', 'https://mdtechcouncil.com/chapter/brtc/', 'Directory affiliation / program description', '', '[{"source":"LifeTech Associates","snapshot":"2026-10-01T19:51:37.942Z","sheet":"Sheet1","row":65,"sourceUrl":"https://mdtechcouncil.com/chapter/brtc/"}]', '2026-10-01T19:51:37.942Z');

INSERT OR IGNORE INTO organization_support_records
      (id, from_organization_id, to_organization_id, from_label, to_label, support_kind, amount, currency, amount_label, description, occurred_at, source_url, evidence, notes, provenance_json, created_at)
      VALUES ('bmoremedtech:rel-org-johns-hopkins-technology-ventures-org-johns-hopkins-university-affiliation', (SELECT organization_id FROM organization_source_identities WHERE source = 'bmoremedtech' AND external_id = 'org-johns-hopkins-technology-ventures'), (SELECT organization_id FROM organization_source_identities WHERE source = 'bmoremedtech' AND external_id = 'org-johns-hopkins-university'), 'Johns Hopkins Technology Ventures', 'Johns Hopkins University', 'affiliation', NULL, NULL, '', 'University technology ventures · University technology ventures', '', 'https://ventures.jhu.edu/', 'Directory affiliation / program description', '', '[{"source":"LifeTech Associates","snapshot":"2026-10-01T19:51:37.942Z","sheet":"Sheet1","row":null,"sourceUrl":"https://ventures.jhu.edu/"}]', '2026-10-01T19:51:37.942Z');
