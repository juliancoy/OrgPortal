const DATA_URL = '/medical-science-field-atlas.json'
const DATABASES_URL = '/taxonomy-databases.json'
const CODE_SYSTEMS_URL = '/clinical-code-systems.json'

const elements = {
  database: document.getElementById('taxonomy-database'),
  search: document.getElementById('taxonomy-search'),
  bodyPart: document.getElementById('taxonomy-body-part'),
  clear: document.getElementById('taxonomy-clear'),
  total: document.getElementById('taxonomy-total'),
  sourceName: document.getElementById('taxonomy-source-name'),
  sourceDescription: document.getElementById('taxonomy-source-description'),
  sourceSteward: document.getElementById('taxonomy-source-steward'),
  sourceLink: document.getElementById('taxonomy-source-link'),
  status: document.getElementById('taxonomy-status'),
  map: document.getElementById('taxonomy-map'),
  resultCount: document.getElementById('taxonomy-result-count'),
  inspector: document.getElementById('taxonomy-inspector'),
  inspectorTitle: document.getElementById('taxonomy-inspector-title'),
  inspectorSummary: document.getElementById('taxonomy-inspector-summary'),
  inspectorContent: document.getElementById('taxonomy-inspector-content'),
  claimFlow: document.getElementById('claim-flow'),
  codeSearch: document.getElementById('code-system-search'),
  codeKind: document.getElementById('code-system-kind'),
  codeCount: document.getElementById('code-system-count'),
  codeGrid: document.getElementById('code-system-grid'),
  releaseNote: document.getElementById('code-release-note'),
  icdGrid: document.getElementById('icd-chapter-grid'),
  codingDisclaimer: document.getElementById('coding-disclaimer'),
  fieldIndex: document.getElementById('field-index'),
}

const state = {
  records: [],
  databases: [],
  codeData: null,
  selectedDatabase: 'medtech_index',
  selectedRecord: null,
}

const kindLabels = new Map([
  ['diagnosis', 'Diagnosis'],
  ['procedure', 'Procedure / service'],
  ['claim-context', 'Claim context'],
  ['product', 'Product identifier'],
  ['payer-policy', 'Payer policy'],
  ['facility-local', 'Facility-local'],
])

const connectionReasons = new Map([
  ['icd-10-cm', 'Diagnosis codes may describe the conditions managed in this field.'],
  ['icd-10-pcs', 'Hospital inpatient procedures may be reported with ICD-10-PCS.'],
  ['cpt-hcpcs-level-i', 'Professional services, tests, and procedures commonly use CPT / HCPCS Level I.'],
  ['hcpcs-level-ii', 'Supplies, products, drugs, equipment, or non-CPT services may use HCPCS Level II.'],
  ['claim-modifiers', 'Modifiers qualify how a reported service should be interpreted.'],
  ['place-of-service', 'The site of care can change claim logic and payment.'],
  ['ub04-revenue-codes', 'Institutional claims may pair charges with a facility revenue category.'],
  ['ndc', 'Drug claims or administered products may also require an NDC.'],
  ['cdt', 'Dental services use the CDT procedure vocabulary.'],
  ['maryland-medicaid', 'Maryland Medicaid policy determines coverage, edits, and applicable payment.'],
  ['local-charge-codes', 'A facility may map its own charge-capture item to standard claim codes.'],
])

function createElement(tag, className, text) {
  const element = document.createElement(tag)
  if (className) element.className = className
  if (text !== undefined) element.textContent = text
  return element
}

function selectedDatabase() {
  return state.databases.find(({ id }) => id === state.selectedDatabase) || state.databases[0]
}

function codeSystem(id) {
  return state.codeData?.systems.find((system) => system.id === id) || null
}

function sourceGroups(record, databaseId) {
  if (databaseId === 'medtech_index') return [record.scientific_lineage[0]]
  return record.source_lenses?.[databaseId] || []
}

function availableRecords() {
  if (state.selectedDatabase === 'medtech_index') return state.records
  return state.records.filter((record) => sourceGroups(record, state.selectedDatabase).length > 0)
}

function recordSearchText(record) {
  return [
    record.name,
    ...record.scientific_lineage,
    ...record.body_parts,
    ...record.subdisciplines,
    ...record.tags,
    ...Object.values(record.source_lenses || {}).flat(),
  ].join(' ').toLocaleLowerCase()
}

function matchesFilters(record) {
  const query = elements.search.value.trim().toLocaleLowerCase()
  const bodyPart = elements.bodyPart.value
  if (bodyPart && !record.body_parts.includes(bodyPart)) return false
  if (!query) return true

  const searchable = recordSearchText(record)
  const terms = query.split(/\s+/).filter(Boolean)
  return terms.every((term) => searchable.includes(term))
}

function syncUrl() {
  const url = new URL(window.location.href)
  const params = url.searchParams
  if (state.selectedDatabase === 'medtech_index') params.delete('framework')
  else params.set('framework', state.selectedDatabase)
  if (elements.search.value.trim()) params.set('q', elements.search.value.trim())
  else params.delete('q')
  if (elements.bodyPart.value) params.set('body', elements.bodyPart.value)
  else params.delete('body')
  if (state.selectedRecord) params.set('field', state.selectedRecord)
  else params.delete('field')
  window.history.replaceState(null, '', url)
}

function publishDiagnostics(overrides = {}) {
  window.__bmoreMedTechTaxonomyState = {
    ...(window.__bmoreMedTechTaxonomyState || {}),
    selectedRecord: state.selectedRecord,
    codeSystems: state.codeData?.systems.length || 0,
    icdChapters: state.codeData?.icd10cm_chapters.length || 0,
    ...overrides,
  }
}

function updateSourcePanel() {
  const database = selectedDatabase()
  if (!database) return
  elements.sourceName.textContent = database.name
  elements.sourceDescription.textContent = database.description
  elements.sourceSteward.textContent = database.steward
  elements.sourceLink.href = database.source_url
  elements.sourceLink.textContent = database.source_label
  elements.sourceLink.toggleAttribute('download', database.id === 'medtech_index')
  elements.sourceLink.target = database.id === 'medtech_index' ? '' : '_blank'
  elements.sourceLink.rel = database.id === 'medtech_index' ? '' : 'noreferrer'
}

function renderTagList(container, values, emptyLabel = 'None listed') {
  const list = createElement('div', 'taxonomy-tag-list')
  if (!values.length) {
    list.append(createElement('span', 'taxonomy-empty-tag', emptyLabel))
  } else {
    for (const value of values) list.append(createElement('span', 'taxonomy-tag', value))
  }
  container.append(list)
}

function relatedDisciplineList(ids) {
  const list = createElement('div', 'taxonomy-related-list')
  if (!ids.length) {
    list.append(createElement('span', 'taxonomy-empty-tag', 'None listed'))
    return list
  }
  for (const id of ids) {
    const record = state.records.find((item) => item.id === id)
    if (!record) continue
    const button = createElement('button', 'taxonomy-related', record.name)
    button.type = 'button'
    button.addEventListener('click', () => focusRecord(record.id, true))
    list.append(button)
  }
  return list
}

function inspectorSection(title) {
  const section = createElement('section', 'taxonomy-inspector-section')
  section.append(createElement('h3', '', title))
  elements.inspectorContent.append(section)
  return section
}

function includesAny(text, terms) {
  return terms.some((term) => text.includes(term))
}

function codingConnectionsForRecord(record) {
  const text = recordSearchText(record)
  const tagSet = new Set(record.tags.map((tag) => tag.toLocaleLowerCase()))
  const ids = []
  const add = (id) => {
    if (codeSystem(id) && !ids.includes(id)) ids.push(id)
  }

  const isDiseaseOrClinical = tagSet.has('disease domain') || tagSet.has('clinical') || includesAny(text, [
    'oncology', 'disease', 'medicine', 'psychiatry', 'cardiology', 'neurology', 'dermatology', 'ophthalmology',
    'urology', 'pediatrics', 'geriatrics', 'primary care',
  ])
  const isService = [...tagSet].some((tag) => [
    'clinical', 'diagnostic', 'therapeutic', 'surgical', 'laboratory', 'care setting', 'technology',
  ].includes(tag)) || includesAny(text, ['imaging', 'therapy', 'surgery', 'intervention', 'monitoring'])
  const isInpatientProcedure = tagSet.has('surgical') || includesAny(text, [
    'surgery', 'transplantation', 'inpatient', 'hospital medicine', 'interventional', 'critical care',
  ])
  const involvesProducts = tagSet.has('technology') || includesAny(text, [
    'pharmac', 'drug', 'immunotherapy', 'radiopharmaceutical', 'medical-device', 'prosthetic', 'robotics',
  ])
  const involvesFacility = tagSet.has('laboratory') || tagSet.has('diagnostic') || tagSet.has('surgical') || includesAny(text, [
    'hospital', 'radiology', 'imaging', 'pathology', 'laboratory', 'critical care', 'emergency', 'transfusion',
  ])
  const involvesDrug = includesAny(text, ['pharmac', 'drug', 'immunotherapy', 'radiopharmaceutical', 'toxicology'])
  const isDental = includesAny(text, ['dentistry', 'dental', 'oral surgery', 'oral health', 'maxillofacial'])

  if (isDiseaseOrClinical) add('icd-10-cm')
  if (isDental) add('cdt')
  if (isService) add('cpt-hcpcs-level-i')
  if (isInpatientProcedure) add('icd-10-pcs')
  if (involvesProducts) add('hcpcs-level-ii')
  if (involvesDrug) add('ndc')
  if (isService) add('claim-modifiers')
  if (isService || tagSet.has('care setting')) add('place-of-service')
  if (involvesFacility) add('ub04-revenue-codes')
  if (isService || isDiseaseOrClinical || isDental) add('maryland-medicaid')
  if (involvesFacility) add('local-charge-codes')

  return ids.slice(0, 7).map((id) => ({
    system: codeSystem(id),
    reason: connectionReasons.get(id),
  })).filter(({ system }) => system)
}

function relatedIcdChapters(record) {
  if (!state.codeData) return []
  const text = recordSearchText(record)
  const matches = new Set()
  const add = (...chapters) => chapters.forEach((chapter) => matches.add(chapter))

  if (includesAny(text, ['infectious', 'microbiology', 'virology', 'mycology', 'parasitology', 'pathogen'])) add('01')
  if (includesAny(text, ['cancer', 'oncology', 'neoplasia'])) add('02')
  if (includesAny(text, ['blood', 'hematology', 'bone marrow', 'immune system', 'immunology'])) add('03')
  if (includesAny(text, ['endocrine', 'metabolism', 'metabolic', 'diabetes', 'obesity', 'nutrition'])) add('04')
  if (includesAny(text, ['psychiatry', 'psychology', 'behavioral', 'neurodevelopmental'])) add('05')
  if (includesAny(text, ['nervous system', 'neurology', 'neuroscience', 'brain', 'spinal cord', 'epilepsy'])) add('06')
  if (includesAny(text, ['ophthalmology', 'vision science', 'eyes', 'visual system'])) add('07')
  if (includesAny(text, ['audiology', 'vestibular', 'otolaryngology', 'ear'])) add('08')
  if (includesAny(text, ['cardiovascular', 'heart', 'blood vessels', 'vascular', 'cardiology'])) add('09')
  if (includesAny(text, ['respiratory', 'pulmonology', 'lungs', 'airways', 'thoracic'])) add('10')
  if (includesAny(text, ['digestive', 'gastro', 'hepatology', 'liver', 'biliary', 'colorectal', 'oral health'])) add('11')
  if (includesAny(text, ['dermatology', 'skin', 'integumentary'])) add('12')
  if (includesAny(text, ['musculoskeletal', 'orthopedic', 'bones', 'joints', 'muscles', 'rheumatology', 'connective tissue'])) add('13')
  if (includesAny(text, ['renal', 'urinary', 'kidney', 'nephrology', 'urology', 'genitourinary'])) add('14')
  if (includesAny(text, ['maternal', 'obstetric', 'pregnancy', 'gynecology', 'placenta'])) add('15')
  if (includesAny(text, ['neonatology', 'perinatal'])) add('16')
  if (includesAny(text, ['genetic', 'genomic', 'chromosomal', 'congenital', 'developmental biology'])) add('17')
  if (includesAny(text, ['symptom', 'finding', 'pain medicine'])) add('18')
  if (includesAny(text, ['trauma', 'injury', 'poison', 'toxicological', 'brain-injury'])) add('19')
  if (includesAny(text, ['external cause', 'occupational health', 'environmental health', 'disaster medicine'])) add('20')
  if (includesAny(text, ['primary care', 'preventive medicine', 'health status', 'screening', 'encounter'])) add('21')
  if (includesAny(text, ['public health', 'population surveillance'])) add('22')

  return state.codeData.icd10cm_chapters.filter(({ chapter }) => matches.has(chapter)).slice(0, 5)
}

function renderCodingConnections(record) {
  const section = inspectorSection('Coding and payment connections')
  const intro = createElement('p', 'taxonomy-inspector-kicker', 'Likely claim layers')
  section.append(intro)

  const connections = codingConnectionsForRecord(record)
  if (!connections.length) {
    section.append(createElement('p', 'taxonomy-empty-tag', 'This field is primarily foundational or research-oriented; clinical coding depends on its application.'))
    return
  }

  const list = createElement('div', 'taxonomy-coding-connections')
  for (const { system, reason } of connections) {
    const item = createElement('div', 'taxonomy-coding-connection')
    item.append(createElement('span', '', system.short_name))
    const copy = createElement('div')
    copy.append(createElement('strong', '', system.layer))
    copy.append(createElement('p', '', reason))
    item.append(copy)
    list.append(item)
  }
  section.append(list)
}

function renderIcdConnections(record) {
  const section = inspectorSection('Related ICD-10-CM chapters')
  const chapters = relatedIcdChapters(record)
  if (!chapters.length) {
    const note = createElement('p', 'taxonomy-empty-tag', 'No single ICD chapter defines this field. Code the documented condition, not the specialty or technology.')
    section.append(note)
    return
  }

  const list = createElement('div', 'taxonomy-icd-links')
  for (const chapter of chapters) {
    const button = createElement('button', 'taxonomy-icd-link')
    button.type = 'button'
    button.title = `Search the field atlas for ${chapter.title}`
    button.append(createElement('span', '', chapter.range))
    button.append(createElement('strong', '', chapter.title))
    button.addEventListener('click', () => searchFieldAtlas(chapter.index_query))
    list.append(button)
  }
  section.append(list)
}

function renderInspector(record) {
  elements.inspectorTitle.textContent = record.name
  elements.inspectorSummary.textContent = record.scientific_lineage.join(' → ')
  elements.inspectorContent.replaceChildren()

  renderTagList(inspectorSection('Body parts and biological scale'), record.body_parts, 'Not anatomy-specific')
  renderTagList(inspectorSection('Scientific facets'), record.tags)
  renderCodingConnections(record)
  renderIcdConnections(record)

  const relationships = inspectorSection('Discipline relationships')
  relationships.append(createElement('h4', '', 'Parents'))
  relationships.append(relatedDisciplineList(record.parent_disciplines))
  relationships.append(createElement('h4', '', 'Children / subdisciplines'))
  relationships.append(relatedDisciplineList(record.child_disciplines))

  const crosswalk = inspectorSection('Framework crosswalk')
  let crosswalkCount = 0
  for (const database of state.databases.filter(({ id }) => id !== 'medtech_index')) {
    const values = record.source_lenses?.[database.id]
    if (!values?.length) continue
    crosswalkCount += 1
    const row = createElement('div', 'taxonomy-crosswalk-row')
    row.append(createElement('strong', '', database.name))
    renderTagList(row, values)
    crosswalk.append(row)
  }
  if (!crosswalkCount) crosswalk.append(createElement('span', 'taxonomy-empty-tag', 'No external framework crosswalk listed'))
}

function focusRecord(id, scrollIntoView = false) {
  const record = state.records.find((item) => item.id === id)
  if (!record) return

  state.selectedRecord = id
  let needsRender = false
  if (!availableRecords().some((item) => item.id === id)) {
    state.selectedDatabase = 'medtech_index'
    elements.database.value = state.selectedDatabase
    updateSourcePanel()
    needsRender = true
  }
  if (!matchesFilters(record)) {
    elements.search.value = ''
    elements.bodyPart.value = ''
    needsRender = true
  }

  if (needsRender) renderMap()
  renderInspector(record)
  for (const node of elements.map.querySelectorAll('.taxonomy-node')) {
    node.classList.toggle('is-selected', node.dataset.recordId === id)
  }
  publishDiagnostics()
  syncUrl()

  if (scrollIntoView) {
    elements.fieldIndex?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    window.setTimeout(() => {
      const node = elements.map.querySelector(`[data-record-id="${CSS.escape(id)}"]`)
      node?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 220)
  }
}

function groupRecords(records) {
  const groups = new Map()
  for (const record of records) {
    for (const groupName of sourceGroups(record, state.selectedDatabase)) {
      if (!groups.has(groupName)) groups.set(groupName, [])
      groups.get(groupName).push(record)
    }
  }
  return [...groups.entries()].sort(([left], [right]) => left.localeCompare(right))
}

function nodeMeta(record) {
  const preferred = record.tags.filter((tag) => !['clinical', 'research', 'subspecialty'].includes(tag)).slice(0, 2)
  return preferred.length ? preferred.join(' · ') : record.scientific_lineage.at(-1)
}

function renderMap() {
  const available = availableRecords()
  const visible = available.filter(matchesFilters)
  const groups = groupRecords(visible)
  elements.map.replaceChildren()
  elements.status.hidden = true
  elements.map.hidden = false
  elements.resultCount.textContent = `${visible.length} of ${available.length} fields shown`

  if (!visible.length) {
    const empty = createElement('div', 'taxonomy-empty')
    empty.append(createElement('strong', '', 'No fields match these filters.'))
    empty.append(createElement('p', '', 'Try a broader search or clear the body-part filter.'))
    elements.map.append(empty)
    syncUrl()
    publishDiagnostics({ visibleRecords: 0 })
    return
  }

  groups.forEach(([groupName, records], groupIndex) => {
    const group = createElement('section', 'taxonomy-cluster')
    group.style.setProperty('--cluster-index', groupIndex)
    const heading = createElement('div', 'taxonomy-cluster-heading')
    heading.append(createElement('h3', '', groupName))
    heading.append(createElement('span', '', String(records.length)))
    group.append(heading)

    const nodes = createElement('div', 'taxonomy-node-cloud')
    records.sort((left, right) => left.name.localeCompare(right.name))
    for (const record of records) {
      const button = createElement('button', 'taxonomy-node')
      button.type = 'button'
      button.dataset.recordId = record.id
      button.title = `${record.name} — ${record.scientific_lineage.join(' / ')}`
      button.classList.toggle('has-children', record.child_disciplines.length > 0)
      button.classList.toggle('is-selected', record.id === state.selectedRecord)
      button.append(createElement('span', 'taxonomy-node-name', record.name))
      button.append(createElement('span', 'taxonomy-node-meta', nodeMeta(record)))
      button.addEventListener('click', () => focusRecord(record.id))
      nodes.append(button)
    }
    group.append(nodes)
    elements.map.append(group)
  })

  syncUrl()
  publishDiagnostics({
    database: state.selectedDatabase,
    totalRecords: state.records.length,
    availableRecords: available.length,
    visibleRecords: visible.length,
    groups: groups.map(([name, records]) => ({ name, count: records.length })),
  })
}

function renderClaimFlow() {
  elements.claimFlow.replaceChildren()
  for (const stage of state.codeData.claim_flow) {
    const card = createElement('article', 'claim-flow-card')
    card.dataset.tone = stage.tone
    card.append(createElement('span', 'claim-flow-step', stage.step))
    card.append(createElement('p', 'claim-flow-eyebrow', stage.eyebrow))
    card.append(createElement('h3', '', stage.title))

    const copy = createElement('div')
    copy.append(createElement('p', 'claim-flow-question', stage.question))
    copy.append(createElement('p', 'claim-flow-description', stage.description))
    card.append(copy)

    const examples = createElement('div', 'claim-flow-examples')
    for (const example of stage.examples) examples.append(createElement('span', '', example))
    card.append(examples)
    elements.claimFlow.append(card)
  }
}

function codeSystemSearchText(system) {
  return [
    system.short_name,
    system.name,
    system.kind,
    system.layer,
    system.question,
    system.scope,
    system.steward,
    system.identifier_shape,
    system.note,
    ...system.tags,
  ].join(' ').toLocaleLowerCase()
}

function renderCodeSystemCard(system) {
  const card = createElement('article', 'code-system-card')
  card.dataset.kind = system.kind

  const head = createElement('div', 'code-system-card-head')
  head.append(createElement('span', 'code-system-badge', system.short_name))
  head.append(createElement('span', 'code-system-kind', kindLabels.get(system.kind) || system.kind))
  card.append(head)
  card.append(createElement('h4', '', system.name))
  card.append(createElement('p', 'code-system-layer', system.layer))
  card.append(createElement('p', 'code-system-question', system.question))
  card.append(createElement('p', 'code-system-scope', system.scope))

  const facts = createElement('div', 'code-system-facts')
  const steward = createElement('div', 'code-system-fact')
  steward.append(createElement('strong', '', 'Steward'))
  steward.append(createElement('span', '', system.steward))
  facts.append(steward)
  const format = createElement('div', 'code-system-fact')
  format.append(createElement('strong', '', 'Identifier'))
  format.append(createElement('span', '', system.identifier_shape))
  facts.append(format)
  card.append(facts)

  card.append(createElement('p', 'code-system-note', system.note))
  const links = createElement('div', 'code-system-links')
  for (const source of system.source_links) {
    const link = createElement('a', 'code-system-link', source.label)
    link.href = source.url
    link.target = '_blank'
    link.rel = 'noreferrer'
    links.append(link)
  }
  card.append(links)
  return card
}

function renderCodeSystems() {
  const query = elements.codeSearch.value.trim().toLocaleLowerCase()
  const kind = elements.codeKind.value
  const systems = state.codeData.systems.filter((system) => {
    if (kind && system.kind !== kind) return false
    if (!query) return true
    return query.split(/\s+/).filter(Boolean).every((term) => codeSystemSearchText(system).includes(term))
  })

  elements.codeGrid.replaceChildren()
  elements.codeCount.textContent = `${systems.length} of ${state.codeData.systems.length} coding and payment layers shown`
  if (!systems.length) {
    const empty = createElement('div', 'code-system-empty')
    empty.append(createElement('strong', '', 'No coding layers match these filters.'))
    empty.append(createElement('p', '', 'Try a broader term or choose all layer types.'))
    elements.codeGrid.append(empty)
    return
  }
  for (const system of systems) elements.codeGrid.append(renderCodeSystemCard(system))
}

function searchFieldAtlas(query) {
  state.selectedDatabase = 'medtech_index'
  state.selectedRecord = null
  elements.database.value = state.selectedDatabase
  elements.search.value = query
  elements.bodyPart.value = ''
  updateSourcePanel()
  renderMap()
  elements.inspectorTitle.textContent = 'Select a field'
  elements.inspectorSummary.textContent = 'Choose a matching field to inspect its cross-disciplinary and coding connections.'
  elements.inspectorContent.replaceChildren()
  elements.fieldIndex?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function renderIcdChapters() {
  elements.icdGrid.replaceChildren()
  for (const chapter of state.codeData.icd10cm_chapters) {
    const button = createElement('button', 'icd-chapter')
    button.type = 'button'
    button.dataset.tone = chapter.tone
    button.title = `Search related fields for ICD-10-CM chapter ${chapter.chapter}`
    button.append(createElement('span', 'icd-chapter-number', chapter.chapter))
    const copy = createElement('span', 'icd-chapter-copy')
    copy.append(createElement('span', 'icd-chapter-range', chapter.range))
    copy.append(createElement('span', 'icd-chapter-title', chapter.title))
    button.append(copy)
    button.append(createElement('span', 'icd-chapter-action', '↗'))
    button.addEventListener('click', () => searchFieldAtlas(chapter.index_query))
    elements.icdGrid.append(button)
  }
}

function renderCodingAtlas() {
  elements.releaseNote.textContent = `Reviewed ${state.codeData.meta.as_of}. ${state.codeData.meta.release_note}`
  elements.codingDisclaimer.textContent = state.codeData.meta.disclaimer
  renderClaimFlow()
  renderCodeSystems()
  renderIcdChapters()
}

function populateControls() {
  for (const database of state.databases) {
    const option = new Option(database.name, database.id)
    elements.database.add(option)
  }

  const parts = [...new Set(state.records.flatMap(({ body_parts }) => body_parts))].sort()
  for (const part of parts) elements.bodyPart.add(new Option(part, part))

  const params = new URLSearchParams(window.location.search)
  const framework = params.get('framework')
  if (state.databases.some(({ id }) => id === framework)) state.selectedDatabase = framework
  elements.database.value = state.selectedDatabase
  elements.search.value = params.get('q') || ''
  const body = params.get('body') || ''
  if (parts.includes(body)) elements.bodyPart.value = body
  const field = params.get('field')
  if (state.records.some(({ id }) => id === field)) state.selectedRecord = field
}

function bindEvents() {
  elements.database.addEventListener('change', () => {
    state.selectedDatabase = elements.database.value
    updateSourcePanel()
    renderMap()
  })
  elements.search.addEventListener('input', renderMap)
  elements.bodyPart.addEventListener('change', renderMap)
  elements.clear.addEventListener('click', () => {
    elements.search.value = ''
    elements.bodyPart.value = ''
    renderMap()
    elements.search.focus()
  })
  elements.codeSearch.addEventListener('input', renderCodeSystems)
  elements.codeKind.addEventListener('change', renderCodeSystems)

  for (const button of document.querySelectorAll('[data-focus-field]')) {
    button.addEventListener('click', () => focusRecord(button.dataset.focusField, true))
  }
}

async function initialize() {
  try {
    const [recordsResponse, databasesResponse, codeSystemsResponse] = await Promise.all([
      fetch(DATA_URL),
      fetch(DATABASES_URL),
      fetch(CODE_SYSTEMS_URL),
    ])
    if (!recordsResponse.ok || !databasesResponse.ok || !codeSystemsResponse.ok) {
      throw new Error('The medical atlas data could not be loaded.')
    }
    ;[state.records, state.databases, state.codeData] = await Promise.all([
      recordsResponse.json(),
      databasesResponse.json(),
      codeSystemsResponse.json(),
    ])

    elements.total.textContent = state.records.length.toLocaleString()
    populateControls()
    bindEvents()
    updateSourcePanel()
    renderMap()
    renderCodingAtlas()
    if (state.selectedRecord) {
      const record = state.records.find(({ id }) => id === state.selectedRecord)
      if (record) renderInspector(record)
    }
    publishDiagnostics({ initialized: true })
    window.__bmoreMedTechTaxonomyReady = true
  } catch (error) {
    elements.status.textContent = error instanceof Error ? error.message : 'The medical atlas data could not be loaded.'
    elements.status.classList.add('is-error')
    window.__bmoreMedTechTaxonomyReady = false
    publishDiagnostics({ initialized: false, error: elements.status.textContent })
  }
}

initialize()
