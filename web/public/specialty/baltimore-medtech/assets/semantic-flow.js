const SEMANTIC_DATA_URL = '/clinical-semantic-systems.json'
const MEDTECH_INDEX_URL = '/medical-science-field-atlas.json'

if (document.body.classList.contains('taxonomy-body')) {
  const state = {
    data: null,
    records: [],
  }

  const elements = {}

  function createElement(tag, className, text) {
    const element = document.createElement(tag)
    if (className) element.className = className
    if (text !== undefined) element.textContent = text
    return element
  }

  function injectSemanticAtlas() {
    const main = document.getElementById('main-content')
    const currentHero = main?.querySelector('.taxonomy-hero')
    if (!main || !currentHero || document.getElementById('global-flow-title')) return

    const flowHero = document.createElement('section')
    flowHero.className = 'global-flow-hero'
    flowHero.setAttribute('aria-labelledby', 'global-flow-title')
    flowHero.innerHTML = `
      <div class="global-flow-masthead">
        <div class="global-flow-copy">
          <p class="eyebrow">The global medical information flow</p>
          <h1 id="global-flow-title">Knowledge → care → <em>meaning</em> → payment.</h1>
          <p class="global-flow-lede">
            Medical disciplines organize knowledge. The clinical record describes what happened. Semantic standards
            preserve that meaning before it is exchanged, classified, billed, evaluated by Maryland Medicaid, and
            returned as outcomes and evidence.
          </p>
        </div>
        <aside class="global-flow-aside">
          <p id="global-flow-principle" class="global-flow-principle"></p>
          <nav class="global-flow-jumps" aria-label="Medical atlas sections">
            <a href="#semantic-layer">Semantic standards</a>
            <a href="#coordinate-map">Medical field map</a>
            <a href="#field-index">Interactive atlas</a>
            <a href="#coding-layer">Coding and Medicaid</a>
          </nav>
        </aside>
      </div>
      <div class="global-flow-shell">
        <div class="global-flow-shell-head">
          <strong>Global flowchart</strong>
          <span id="global-flow-review"></span>
        </div>
        <div class="global-flow-viewport">
          <div id="global-flow" class="global-flowchart" aria-label="Medical knowledge to clinical care, semantics, interoperability, coding, Maryland Medicaid, and learning"></div>
        </div>
        <div class="global-flow-feedback">Outcomes, claims, and real-world evidence feed back into care, research, public health, and policy.</div>
      </div>
    `

    const semanticLayer = document.createElement('section')
    semanticLayer.className = 'semantic-layer'
    semanticLayer.id = 'semantic-layer'
    semanticLayer.setAttribute('aria-labelledby', 'semantic-layer-title')
    semanticLayer.innerHTML = `
      <div class="semantic-layer-heading">
        <p class="eyebrow">The missing hinge</p>
        <h2 id="semantic-layer-title">Preserve clinical meaning before compressing it.</h2>
        <div>
          <p>
            SNOMED CT anchors detailed clinical concepts. LOINC identifies observations. RxNorm normalizes medications.
            FHIR and DICOM move structured records and images; UMLS supports cross-vocabulary relationships; GA4GH VRS
            represents genomic variation; OMOP supports secondary analysis and real-world evidence.
          </p>
          <span id="semantic-system-count" class="semantic-system-count"></span>
        </div>
      </div>
      <div class="semantic-axiom" role="note">
        <span class="semantic-axiom-mark" aria-hidden="true">≠</span>
        <div>
          <strong>Clinical meaning is richer than an administrative classification.</strong>
          <p>A diagnosis code summarizes a documented condition; it does not replace the findings, anatomy, measurements, medications, images, uncertainty, and context in the clinical record.</p>
        </div>
      </div>
      <div id="semantic-system-grid" class="semantic-system-grid"></div>
    `

    main.insertBefore(flowHero, currentHero)
    main.insertBefore(semanticLayer, currentHero)

    const objectModel = main.querySelector('.taxonomy-object-model')
    const objectHeading = objectModel?.querySelector('h2')
    const objectCopy = objectModel?.querySelector('.taxonomy-section-heading > p:not(.eyebrow)')
    const objectGrid = objectModel?.querySelector('.taxonomy-object-grid')
    if (objectHeading) objectHeading.innerHTML = 'Five different objects.<br />Five different questions.'
    if (objectCopy) {
      objectCopy.textContent = 'A medical field, a clinical concept, an exchange structure, an administrative code, and a payer rule may all describe one episode of care—but they are not interchangeable.'
    }
    if (objectGrid && !objectGrid.querySelector('.taxonomy-object-semantic')) {
      const cards = [...objectGrid.children]
      const semanticCard = document.createElement('article')
      semanticCard.className = 'taxonomy-object-card taxonomy-object-semantic'
      semanticCard.innerHTML = '<span>Clinical meaning</span><strong>SNOMED CT · LOINC · RxNorm</strong><p>Preserves detailed concepts, observations, and medications from the record.</p>'
      objectGrid.insertBefore(semanticCard, cards[1] || null)
      cards[1]?.classList.add('taxonomy-object-code')
      cards[2]?.classList.add('taxonomy-object-code')
      cards[3]?.classList.add('taxonomy-object-payment')
    }

    elements.flow = document.getElementById('global-flow')
    elements.principle = document.getElementById('global-flow-principle')
    elements.review = document.getElementById('global-flow-review')
    elements.systemGrid = document.getElementById('semantic-system-grid')
    elements.systemCount = document.getElementById('semantic-system-count')
    elements.inspectorContent = document.getElementById('taxonomy-inspector-content')
  }

  function renderFlowStage(stage) {
    const card = createElement('a', 'global-flow-stage')
    card.href = `#${stage.target}`
    card.dataset.stage = stage.id
    card.dataset.tone = stage.tone
    if (stage.featured) card.classList.add('is-featured')

    const top = createElement('div', 'global-flow-stage-top')
    top.append(createElement('span', 'global-flow-step', stage.step))
    top.append(createElement('span', 'global-flow-eyebrow', stage.eyebrow))
    card.append(top)
    card.append(createElement('h2', '', stage.title))
    card.append(createElement('p', 'global-flow-question', stage.question))
    card.append(createElement('p', 'global-flow-description', stage.description))

    const systems = createElement('div', 'global-flow-systems')
    for (const system of stage.systems) systems.append(createElement('span', '', system))
    card.append(systems)
    if (stage.featured) card.append(createElement('strong', 'global-flow-hinge', 'Semantic hinge'))

    const setActive = () => { elements.flow.dataset.activeStage = stage.id }
    const clearActive = () => { delete elements.flow.dataset.activeStage }
    card.addEventListener('mouseenter', setActive)
    card.addEventListener('mouseleave', clearActive)
    card.addEventListener('focus', setActive)
    card.addEventListener('blur', clearActive)
    return card
  }

  function renderGlobalFlow() {
    elements.flow.replaceChildren()
    for (const stage of state.data.flow_stages) elements.flow.append(renderFlowStage(stage))
    elements.principle.textContent = state.data.meta.principle
    elements.review.textContent = `Reviewed ${state.data.meta.as_of}`
  }

  function renderSemanticSystem(system) {
    const card = createElement('article', 'semantic-system-card')
    card.dataset.tone = system.tone
    card.dataset.stage = system.stage

    const head = createElement('div', 'semantic-system-head')
    head.append(createElement('span', 'semantic-system-badge', system.short_name))
    head.append(createElement('span', 'semantic-system-role', system.role))
    card.append(head)
    card.append(createElement('h3', '', system.name))
    card.append(createElement('p', 'semantic-system-question', system.question))
    card.append(createElement('p', 'semantic-system-scope', system.scope))

    const footer = createElement('div', 'semantic-system-footer')
    const steward = createElement('span', 'semantic-system-steward')
    steward.append(createElement('small', '', 'Steward'))
    steward.append(createElement('strong', '', system.steward))
    footer.append(steward)
    const link = createElement('a', 'semantic-system-link', system.source_label)
    link.href = system.source_url
    link.target = '_blank'
    link.rel = 'noreferrer'
    footer.append(link)
    card.append(footer)

    const note = createElement('p', 'semantic-system-note', system.note)
    if (system.licensed) note.dataset.licensed = 'true'
    card.append(note)
    return card
  }

  function renderSemanticSystems() {
    elements.systemGrid.replaceChildren()
    for (const system of state.data.systems) elements.systemGrid.append(renderSemanticSystem(system))
    elements.systemCount.textContent = `${state.data.systems.length} standards and infrastructure layers`
  }

  function recordText(record) {
    return [
      record.name,
      ...(record.scientific_lineage || []),
      ...(record.body_parts || []),
      ...(record.subdisciplines || []),
      ...(record.tags || []),
      ...Object.values(record.source_lenses || {}).flat(),
    ].join(' ').toLocaleLowerCase()
  }

  function semanticConnections(record) {
    const text = recordText(record)
    const tags = new Set((record.tags || []).map((tag) => tag.toLocaleLowerCase()))
    const clinical = ['clinical', 'diagnostic', 'therapeutic', 'surgical', 'care setting', 'disease domain']
      .some((tag) => tags.has(tag))
      || /(medicine|clinical|surgery|therapy|diagnostic|care|disease|oncology|neurology|cardiology|psychiatry)/.test(text)

    return state.data.systems
      .map((system) => {
        let score = system.match_terms.reduce((total, term) => total + (text.includes(term.toLocaleLowerCase()) ? 1 : 0), 0)
        if (clinical && system.id === 'snomed-ct') score += 4
        if (clinical && system.id === 'fhir') score += 3
        if (clinical && system.id === 'umls') score += 1
        if (system.id === 'loinc' && tags.has('diagnostic')) score += 3
        if (system.id === 'omop-cdm' && tags.has('research')) score += 2
        return { system, score }
      })
      .filter(({ score }) => score > 0)
      .sort((left, right) => right.score - left.score || left.system.short_name.localeCompare(right.system.short_name))
      .slice(0, 5)
      .map(({ system }) => system)
  }

  function selectedRecordId() {
    return window.__bmoreMedTechTaxonomyState?.selectedRecord
      || document.querySelector('.taxonomy-node.is-selected')?.dataset.recordId
      || null
  }

  function augmentInspector() {
    if (!state.data || !state.records.length || !elements.inspectorContent) return
    const recordId = selectedRecordId()
    if (!recordId) return
    const record = state.records.find(({ id }) => id === recordId)
    if (!record || elements.inspectorContent.querySelector('.semantic-inspector-section')) return

    const section = createElement('section', 'taxonomy-inspector-section semantic-inspector-section')
    section.append(createElement('h3', '', 'Clinical semantic connections'))
    section.append(createElement('p', 'taxonomy-inspector-kicker', 'Meaning before classification'))

    const systems = semanticConnections(record)
    if (!systems.length) {
      section.append(createElement('p', 'taxonomy-empty-tag', 'This field is primarily foundational; semantic standards depend on its clinical or data application.'))
    } else {
      const list = createElement('div', 'semantic-inspector-list')
      for (const system of systems) {
        const link = createElement('a', 'semantic-inspector-link')
        link.href = system.source_url
        link.target = '_blank'
        link.rel = 'noreferrer'
        link.dataset.tone = system.tone
        link.append(createElement('span', '', system.short_name))
        const copy = createElement('div')
        copy.append(createElement('strong', '', system.role))
        copy.append(createElement('p', '', system.question))
        link.append(copy)
        list.append(link)
      }
      section.append(list)
    }

    const atlasLink = createElement('a', 'semantic-inspector-atlas-link', 'See the global knowledge-to-payment flow')
    atlasLink.href = '#global-flow-title'
    section.append(atlasLink)

    const codingSection = [...elements.inspectorContent.children]
      .find((child) => child.querySelector?.('h3')?.textContent === 'Coding and payment connections')
    if (codingSection) elements.inspectorContent.insertBefore(section, codingSection)
    else elements.inspectorContent.append(section)
  }

  function observeInspector() {
    if (!elements.inspectorContent) return
    const observer = new MutationObserver(() => queueMicrotask(augmentInspector))
    observer.observe(elements.inspectorContent, { childList: true })
    window.setTimeout(augmentInspector, 0)
  }

  async function initialize() {
    injectSemanticAtlas()
    if (!elements.flow || !elements.systemGrid) return

    try {
      const [semanticResponse, recordsResponse] = await Promise.all([
        fetch(SEMANTIC_DATA_URL),
        fetch(MEDTECH_INDEX_URL),
      ])
      if (!semanticResponse.ok || !recordsResponse.ok) throw new Error('The clinical semantic flow data could not be loaded.')
      ;[state.data, state.records] = await Promise.all([semanticResponse.json(), recordsResponse.json()])
      renderGlobalFlow()
      renderSemanticSystems()
      observeInspector()
      window.__bmoreMedTechSemanticFlow = {
        ready: true,
        stages: state.data.flow_stages.length,
        systems: state.data.systems.length,
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'The clinical semantic flow data could not be loaded.'
      elements.flow.replaceChildren(createElement('p', 'status is-error', message))
      window.__bmoreMedTechSemanticFlow = { ready: false, error: message }
    }
  }

  initialize()
}
