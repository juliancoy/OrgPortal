import { renderCharts } from './strategy-charts.js'
import { strategyDashboardMarkup } from './strategy-template.js'
import { element, externalLink, formatInteger, formatMoney } from './strategy-utils.js'

const DATA_URLS = [
  '/specialty/baltimore-medtech/strategy-context.json',
  '/specialty/baltimore-medtech/strategy-neurology.json',
  '/specialty/baltimore-medtech/strategy-oncology.json',
  '/specialty/baltimore-medtech/strategy-radiology.json',
  '/specialty/baltimore-medtech/strategy-genomics.json',
]

const state = { data: null }

function injectDashboard() {
  const flowHero = document.querySelector('.global-flow-hero')
  if (!flowHero || document.getElementById('strategy-dashboard')) return false

  const dashboard = element('section', 'strategy-dashboard')
  dashboard.id = 'strategy-dashboard'
  dashboard.setAttribute('aria-labelledby', 'strategy-dashboard-title')
  dashboard.innerHTML = strategyDashboardMarkup
  flowHero.insertAdjacentElement('afterend', dashboard)

  const jumps = document.querySelector('.global-flow-jumps')
  if (jumps && !jumps.querySelector('[href="#strategy-dashboard"]')) {
    const link = element('a', '', 'Strategy dashboard')
    link.href = '#strategy-dashboard'
    jumps.prepend(link)
  }
  return true
}

function renderSignalStrip() {
  const container = document.getElementById('strategy-signal-strip')
  const field = (id) => state.data.fields.find((item) => item.id === id)
  const signals = [
    {
      label: 'Strongest scarcity signal',
      value: field('genomics').name,
      detail: `${field('genomics').workforce.display} physician proxy · ${field('genomics').pipeline.display} new diplomates`,
      key: 'genomics',
    },
    {
      label: 'Largest digital demand surface',
      value: field('radiology').name,
      detail: `${field('radiology').need.display} CT patients · 93M examinations`,
      key: 'radiology',
    },
    {
      label: 'Largest NIH lead-budget proxy',
      value: field('oncology').name,
      detail: `${formatMoney(field('oncology').funding.values.at(-1).value, 2)} in FY2024`,
      key: 'oncology',
    },
    {
      label: 'Selected Baltimore research base',
      value: formatMoney(state.data.baltimore.total_funding, 2),
      detail: `${formatInteger(state.data.baltimore.total_awards)} FY2024 NIH awards at two anchors`,
      key: 'baltimore',
    },
  ]

  container.replaceChildren()
  for (const signal of signals) {
    const card = element('article', 'strategy-signal')
    card.dataset.field = signal.key
    card.append(element('span', '', signal.label))
    card.append(element('strong', '', signal.value))
    card.append(element('p', '', signal.detail))
    container.append(card)
  }
}

function metricBlock(label, value, detail) {
  const block = element('div', 'strategy-field-metric')
  block.append(element('span', '', label))
  block.append(element('strong', '', value))
  block.append(element('small', '', detail))
  return block
}

function renderFieldCards() {
  const container = document.getElementById('strategy-field-cards')
  container.replaceChildren()

  for (const field of state.data.fields) {
    const card = element('article', 'strategy-field-card')
    card.dataset.field = field.id
    const heading = element('header')
    const title = element('div')
    title.append(element('p', 'strategy-field-label', field.name))
    title.append(element('h3', '', field.stance))
    heading.append(title)
    const atlasLink = element('a', 'strategy-field-atlas-link', 'Open field')
    atlasLink.href = `?field=${encodeURIComponent(field.index_field_id)}#field-index`
    heading.append(atlasLink)
    card.append(heading)

    const metrics = element('div', 'strategy-field-metrics')
    metrics.append(metricBlock('Need proxy', field.need.display, `${field.need.label} · ${field.need.year}`))
    metrics.append(metricBlock('Workforce proxy', field.workforce.display, `${field.workforce.label} · ${field.workforce.year}`))
    metrics.append(metricBlock('Entry pipeline', field.pipeline.display, `${field.pipeline.label} · ${field.pipeline.year}`))
    metrics.append(metricBlock('Federal funding proxy', formatMoney(field.funding.values.at(-1).value, 2), `${field.funding.proxy_label} · FY2024`))
    card.append(metrics)

    const context = element('div', 'strategy-field-context')
    for (const item of field.need.secondary) context.append(element('span', '', item))
    card.append(context)

    const priorities = element('div', 'strategy-field-priorities')
    const labor = element('p')
    labor.append(element('strong', '', 'Labor: '), document.createTextNode(field.strategy.labor))
    priorities.append(labor)
    const applications = element('p')
    applications.append(element('strong', '', 'Applications: '), document.createTextNode(field.strategy.applications))
    priorities.append(applications)
    card.append(priorities)

    const sources = element('footer')
    sources.append(externalLink('Need source', field.need.source_url))
    sources.append(externalLink('Workforce method', field.workforce.source_url))
    if (field.workforce.exact_table_url) sources.append(externalLink('Workforce snapshot', field.workforce.exact_table_url))
    sources.append(externalLink('Funding source', field.funding.source_url))
    card.append(sources)
    container.append(card)
  }
}

function renderGuidance() {
  const container = document.getElementById('strategy-guidance-grid')
  container.replaceChildren()
  for (const recommendation of state.data.recommendations) {
    const card = element('article', 'strategy-guidance-card')
    card.dataset.recommendation = recommendation.id
    card.append(element('span', 'strategy-guidance-index', String(container.children.length + 1).padStart(2, '0')))
    card.append(element('h4', '', recommendation.title))
    const signal = element('p', 'strategy-guidance-signal')
    signal.append(element('strong', '', 'Signal: '), document.createTextNode(recommendation.signal))
    card.append(signal)
    const action = element('p', 'strategy-guidance-action')
    action.append(element('strong', '', 'Act: '), document.createTextNode(recommendation.action))
    card.append(action)
    container.append(card)
  }
}

function renderSources() {
  const container = document.getElementById('strategy-source-register')
  container.replaceChildren()
  for (const source of state.data.sources) {
    const row = element('div', 'strategy-source')
    row.append(externalLink(source.label, source.url), element('p', '', source.note))
    container.append(row)
  }
}

function renderDashboard() {
  document.getElementById('strategy-as-of').textContent = `Reviewed ${state.data.meta.as_of}`
  document.getElementById('strategy-comparability-note').textContent = state.data.meta.comparability_note
  document.getElementById('strategy-radar-note').textContent = state.data.meta.radar_note
  document.getElementById('strategy-local-total').textContent = formatMoney(state.data.baltimore.total_funding, 3)
  document.getElementById('strategy-local-awards').textContent = `${formatInteger(state.data.baltimore.total_awards)} awards across two selected anchors`
  document.getElementById('strategy-methodology-comparability').textContent = state.data.meta.comparability_note
  document.getElementById('strategy-methodology-radar').textContent = state.data.meta.radar_note
  document.getElementById('strategy-methodology-review').textContent = state.data.meta.review_cycle

  renderSignalStrip()
  renderFieldCards()
  renderCharts(state.data)
  renderGuidance()
  renderSources()
  document.getElementById('strategy-status').hidden = true
  window.__bmoreMedTechStrategyDashboard = {
    ready: true,
    fields: state.data.fields.length,
    charts: document.querySelectorAll('.strategy-dashboard .strategy-chart-svg').length,
    recommendations: state.data.recommendations.length,
    localFunding: state.data.baltimore.total_funding,
  }
}

async function initialize() {
  if (!injectDashboard()) return
  const status = document.getElementById('strategy-status')
  try {
    const responses = await Promise.all(DATA_URLS.map((url) => fetch(url)))
    if (responses.some((response) => !response.ok)) throw new Error('The MedTech strategy metrics could not be loaded.')
    const [context, ...fields] = await Promise.all(responses.map((response) => response.json()))
    state.data = { ...context, fields }
    renderDashboard()
  } catch (error) {
    status.textContent = error instanceof Error ? error.message : 'The MedTech strategy metrics could not be loaded.'
    status.classList.add('is-error')
    window.__bmoreMedTechStrategyDashboard = { ready: false, error: status.textContent }
  }
}

initialize()
