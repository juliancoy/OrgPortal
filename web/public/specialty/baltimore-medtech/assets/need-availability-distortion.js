import { renderHorizontalBars } from './strategy-bars.js'
import {
  createChartSvg,
  element,
  externalLink,
  formatCompact,
  formatInteger,
  renderDataTable,
  svgElement,
} from './strategy-utils.js'
import { calculateNeedAvailabilityMetrics } from './need-availability-metrics.js'

const urls = [
  '/specialty/baltimore-medtech/need-availability-distortions.json',
  '/specialty/baltimore-medtech/need-availability-care-teams.json',
  '/specialty/baltimore-medtech/strategy-neurology.json',
  '/specialty/baltimore-medtech/strategy-oncology.json',
  '/specialty/baltimore-medtech/strategy-radiology.json',
  '/specialty/baltimore-medtech/strategy-genomics.json',
]

const state = { editorial: null, careTeams: null, fields: [], result: null }
const byId = (id) => document.getElementById(id)
const signed = (value) => `${value > 0 ? '+' : ''}${value.toFixed(1)}`

function interpretation(id) {
  return state.editorial.interpretations.find((item) => item.id === id)
}

function careTeam(id) {
  return state.careTeams.groups.find((group) => group.id === id)
}

function renderHero() {
  const leader = state.result.leader
  const team = careTeam(leader.id)
  byId('distortion-as-of').textContent = `Reviewed ${state.editorial.meta.as_of}`
  byId('distortion-leader-name').textContent = leader.name
  byId('distortion-leader-index').textContent = `${leader.distortionIndex.toFixed(1)} / 100`
  byId('distortion-leader-ratio').textContent = `${formatInteger(leader.peoplePerSpecialist)} need-proxy people per physician-specialist proxy`
  byId('distortion-leader-gap').textContent = `${signed(leader.signedNeedAvailabilityGap)} normalized need–physician-availability gap`
  byId('distortion-leader-team').textContent = `${formatInteger(team.jobs_total)} mapped allied-care jobs · ${formatInteger(team.annual_openings_total)} projected annual openings`
  byId('distortion-conclusion').textContent = state.editorial.meta.conclusion
}

function renderRanking() {
  const container = byId('distortion-ranking-cards')
  container.replaceChildren()
  for (const metric of state.result.records) {
    const note = interpretation(metric.id)
    const card = element('article', 'distortion-rank-card')
    card.dataset.field = metric.id
    card.innerHTML = `
      <div class="distortion-rank-card-top"><span>${String(metric.rank).padStart(2, '0')}</span><small>${metric.rank === 1 ? 'Largest physician shortfall signal' : 'Relative physician pressure signal'}</small></div>
      <h3>${metric.name}</h3><strong>${metric.distortionIndex.toFixed(1)}</strong><em>relative physician-capacity distortion index</em>
      <p>${note.headline}</p>
      <div><span>${formatInteger(metric.peoplePerSpecialist)} need-proxy people / physician proxy</span><span>${metric.entrantsPerThousandSpecialists.toFixed(1)} physician entrants / 1,000</span></div>`
    container.append(card)
  }
}

function renderQuadrant() {
  const container = byId('distortion-quadrant-chart')
  const width = 760
  const height = 500
  const margin = { top: 48, right: 92, bottom: 82, left: 82 }
  const innerW = width - margin.left - margin.right
  const innerH = height - margin.top - margin.bottom
  const x = (value) => margin.left + ((value - 20) / 80) * innerW
  const y = (value) => margin.top + innerH - ((value - 20) / 80) * innerH
  const svg = createChartSvg('Normalized patient need versus physician service-availability proxy', `0 0 ${width} ${height}`)
  svg.append(svgElement('polygon', {
    points: `${x(20)},${y(100)} ${x(100)},${y(100)} ${x(20)},${y(20)}`,
    class: 'distortion-shortfall-zone',
  }))

  for (const tick of [20, 40, 60, 80, 100]) {
    svg.append(svgElement('line', { x1: x(tick), y1: margin.top, x2: x(tick), y2: margin.top + innerH, class: 'strategy-chart-gridline' }))
    svg.append(svgElement('line', { x1: margin.left, y1: y(tick), x2: margin.left + innerW, y2: y(tick), class: 'strategy-chart-gridline' }))
    svg.append(svgElement('text', { x: x(tick), y: height - margin.bottom + 27, 'text-anchor': 'middle', class: 'strategy-chart-tick' }, String(tick)))
    svg.append(svgElement('text', { x: margin.left - 13, y: y(tick) + 4, 'text-anchor': 'end', class: 'strategy-chart-tick' }, String(tick)))
  }

  svg.append(svgElement('line', { x1: x(20), y1: y(20), x2: x(100), y2: y(100), class: 'distortion-balance-line' }))
  svg.append(svgElement('text', { x: x(24), y: y(92), class: 'distortion-zone-label' }, 'NEED OUTRUNS PHYSICIAN AVAILABILITY'))
  const offsets = { genomics: [14, -10], radiology: [-14, -12], oncology: [-12, 20], neurology: [-12, -12] }

  for (const metric of state.result.records) {
    const [dx, dy] = offsets[metric.id]
    const group = svgElement('g', { class: 'strategy-chart-series', 'data-field': metric.id })
    group.append(svgElement('circle', {
      cx: x(metric.availabilityScore),
      cy: y(metric.needScore),
      r: metric.rank === 1 ? 12 : 10,
      class: 'distortion-quadrant-point',
    }))
    group.append(svgElement('text', {
      x: x(metric.availabilityScore) + dx,
      y: y(metric.needScore) + dy,
      'text-anchor': dx < 0 ? 'end' : 'start',
      class: 'distortion-quadrant-label',
    }, metric.name))
    svg.append(group)
  }

  svg.append(svgElement('text', { x: margin.left + innerW / 2, y: height - 20, 'text-anchor': 'middle', class: 'distortion-axis-title' }, 'Physician service-availability proxy score →'))
  svg.append(svgElement('text', { x: 19, y: margin.top + innerH / 2, 'text-anchor': 'middle', transform: `rotate(-90 19 ${margin.top + innerH / 2})`, class: 'distortion-axis-title' }, 'Patient need / demand proxy score →'))
  container.replaceChildren(svg)
}

function renderCharts() {
  renderHorizontalBars('distortion-index-chart', state.result.records.map((metric) => ({
    id: metric.id,
    label: metric.name,
    value: metric.distortionIndex,
    display: metric.distortionIndex.toFixed(1),
  })), { label: 'Relative need-to-physician-availability distortion index', tickFormat: (value) => value.toFixed(0) })

  renderHorizontalBars('distortion-ratio-chart', state.result.records.map((metric) => ({
    id: metric.id,
    label: metric.name,
    value: metric.peoplePerSpecialist,
    display: formatInteger(metric.peoplePerSpecialist),
  })), { label: 'Need or service-demand proxy per physician-specialist proxy', tickFormat: formatCompact })

  renderHorizontalBars('distortion-pipeline-chart', [...state.result.records]
    .sort((left, right) => right.entrantsPerThousandSpecialists - left.entrantsPerThousandSpecialists)
    .map((metric) => ({
      id: metric.id,
      label: metric.name,
      value: metric.entrantsPerThousandSpecialists,
      display: metric.entrantsPerThousandSpecialists.toFixed(1),
    })), { label: 'Annual physician entrants per one thousand current physician specialists', tickFormat: (value) => value.toFixed(0) })

  renderQuadrant()
  renderDataTable('distortion-data-table', 'Need–physician-availability distortion inputs and outputs', [
    { key: 'rank', label: 'Rank' },
    { key: 'field', label: 'Field' },
    { key: 'index', label: 'Index', format: (value) => value.toFixed(1) },
    { key: 'need', label: 'Need proxy' },
    { key: 'needType', label: 'Need definition' },
    { key: 'workforce', label: 'Physician workforce' },
    { key: 'pipeline', label: 'Physician pipeline' },
    { key: 'ratio', label: 'Need / physician', format: formatInteger },
    { key: 'renewal', label: 'Entrants / 1,000', format: (value) => value.toFixed(1) },
    { key: 'gap', label: 'Need–availability gap', format: signed },
  ], state.result.records.map((metric) => ({
    rank: metric.rank,
    field: metric.name,
    index: metric.distortionIndex,
    need: metric.field.need.display,
    needType: metric.field.need.type,
    workforce: metric.field.workforce.display,
    pipeline: metric.field.pipeline.display,
    ratio: metric.peoplePerSpecialist,
    renewal: metric.entrantsPerThousandSpecialists,
    gap: metric.signedNeedAvailabilityGap,
  })))
}

function roleSourceLinks(group) {
  const seen = new Set()
  const fragment = document.createDocumentFragment()
  for (const role of group.roles) {
    if (seen.has(role.source_url)) continue
    seen.add(role.source_url)
    fragment.append(externalLink(role.source_label, role.source_url))
  }
  return fragment
}

function renderCareTeams() {
  const rankedGroups = state.result.records.map((metric) => careTeam(metric.id))
  renderHorizontalBars('distortion-team-jobs-chart', rankedGroups.map((group) => ({
    id: group.id,
    label: group.name,
    value: group.jobs_total,
    display: formatInteger(group.jobs_total),
  })), {
    label: 'Selected national allied-care occupations mapped to each field, 2025 jobs',
    tickFormat: formatCompact,
  })

  renderHorizontalBars('distortion-team-openings-chart', rankedGroups.map((group) => ({
    id: group.id,
    label: group.name,
    value: group.annual_openings_total,
    display: formatInteger(group.annual_openings_total),
  })), {
    label: 'Projected average annual openings in selected allied-care occupations, 2025 to 2035',
    tickFormat: formatCompact,
  })

  renderDataTable('distortion-team-table', 'Selected allied-care-team occupations', [
    { key: 'field', label: 'Mapped field' },
    { key: 'occupation', label: 'Occupation' },
    { key: 'soc', label: 'SOC' },
    { key: 'jobs', label: '2025 jobs', format: formatInteger },
    { key: 'openings', label: 'Annual openings', format: formatInteger },
    { key: 'mapping', label: 'Mapping strength' },
  ], rankedGroups.flatMap((group) => group.roles.map((role) => ({
    field: group.name,
    occupation: role.title,
    soc: role.soc,
    jobs: role.jobs,
    openings: role.annual_openings,
    mapping: group.mapping_strength,
  }))))

  const cards = byId('distortion-care-team-groups')
  cards.replaceChildren()
  for (const group of rankedGroups) {
    const card = element('article', 'distortion-team-card')
    card.dataset.field = group.id
    const header = element('header')
    const title = element('div')
    title.append(element('span', 'distortion-team-label', group.mapping_strength))
    title.append(element('h3', '', group.name))
    header.append(title)
    const total = element('div', 'distortion-team-total')
    total.append(element('strong', '', formatInteger(group.jobs_total)))
    total.append(element('span', '', 'selected 2025 jobs'))
    header.append(total)
    card.append(header)

    const renewal = element('div', 'distortion-team-renewal')
    renewal.append(element('strong', '', formatInteger(group.annual_openings_total)))
    renewal.append(element('span', '', 'projected openings per year'))
    card.append(renewal)

    const roles = element('div', 'distortion-team-roles')
    for (const role of group.roles) {
      const row = element('div', 'distortion-team-role')
      const copy = element('div')
      copy.append(element('strong', '', role.title))
      copy.append(element('span', '', `${role.soc} · ${formatInteger(role.annual_openings)} annual openings`))
      row.append(copy, element('b', '', formatInteger(role.jobs)))
      roles.append(row)
    }
    card.append(roles)
    card.append(statement('What this adds', group.strategic_read))
    card.append(statement('Mapping limit', group.scope_note, true))
    const footer = element('footer')
    footer.append(roleSourceLinks(group))
    card.append(footer)
    cards.append(card)
  }

  byId('distortion-care-team-fixed').textContent = state.careTeams.meta.fixed_limitation
  byId('distortion-care-team-policy').textContent = state.careTeams.meta.index_policy
}

function metric(label, value) {
  const node = element('div', 'distortion-field-metric')
  node.append(element('span', '', label), element('strong', '', value))
  return node
}

function statement(label, text, warning = false) {
  const node = element('div', `distortion-statement${warning ? ' is-warning' : ''}`)
  node.append(element('strong', '', label), element('p', '', text))
  return node
}

function renderProfiles() {
  const container = byId('distortion-field-profiles')
  container.replaceChildren()
  for (const metricRecord of state.result.records) {
    const note = interpretation(metricRecord.id)
    const group = careTeam(metricRecord.id)
    const card = element('article', 'distortion-field-card')
    card.dataset.field = metricRecord.id
    const header = element('header')
    const title = element('div')
    title.append(element('span', 'distortion-field-rank', `Rank ${metricRecord.rank}`), element('h3', '', metricRecord.name))
    const link = element('a', 'distortion-field-link', 'Open field atlas')
    link.href = `/taxonomy.html?field=${encodeURIComponent(metricRecord.field.index_field_id)}#field-index`
    header.append(title, link)
    card.append(header)

    const score = element('div', 'distortion-field-score')
    score.append(element('strong', '', metricRecord.distortionIndex.toFixed(1)), element('span', '', note.headline))
    card.append(score)
    const metrics = element('div', 'distortion-field-metrics')
    metrics.append(
      metric('Need / physician', formatInteger(metricRecord.peoplePerSpecialist)),
      metric('Physician pipeline / 1,000', metricRecord.entrantsPerThousandSpecialists.toFixed(1)),
      metric('Mapped allied jobs', formatInteger(group.jobs_total)),
      metric('Allied openings / year', formatInteger(group.annual_openings_total)),
    )
    card.append(metrics)
    card.append(statement('Why it appears here', note.summary))
    card.append(statement('Allied team context', note.care_team_context))
    card.append(statement('Strategic response', note.action))
    card.append(statement('Do not overread', note.caution, true))

    const footer = element('footer')
    footer.append(
      externalLink('Need source', metricRecord.field.need.source_url),
      externalLink('Physician source', metricRecord.field.workforce.source_url),
      externalLink('Physician pipeline source', metricRecord.field.pipeline.source_url),
    )
    footer.append(roleSourceLinks(group))
    card.append(footer)
    container.append(card)
  }
}

function renderMethod() {
  const meta = state.editorial.meta
  byId('distortion-method-formula').textContent = meta.formula
  byId('distortion-method-availability').textContent = meta.availability_definition
  byId('distortion-method-team').textContent = `${state.careTeams.meta.scope} ${state.careTeams.meta.counting_rule} ${state.careTeams.meta.index_policy}`
  byId('distortion-method-scaling').textContent = meta.scaling
  byId('distortion-method-gap').textContent = meta.signed_gap_note
  byId('distortion-method-guardrail').textContent = `${meta.comparability_guardrail} ${state.careTeams.meta.remaining_gap}`

  const sources = byId('distortion-source-register')
  const seen = new Set()
  sources.replaceChildren()
  const addSource = (label, url, note) => {
    if (!url || seen.has(url)) return
    seen.add(url)
    const row = element('div', 'distortion-source')
    row.append(externalLink(label, url), element('p', '', note))
    sources.append(row)
  }

  for (const field of state.fields) {
    addSource(field.need.source_label, field.need.source_url, `${field.name} need proxy`)
    addSource(field.workforce.source_label, field.workforce.source_url, `${field.name} physician workforce proxy`)
    addSource(field.pipeline.source_label, field.pipeline.source_url, `${field.name} physician pipeline proxy`)
  }
  for (const group of state.careTeams.groups) {
    for (const role of group.roles) addSource(role.source_label, role.source_url, `${group.name} allied-care context · ${role.title}`)
  }
}

async function initialize() {
  const status = byId('distortion-status')
  try {
    const responses = await Promise.all(urls.map((url) => fetch(url)))
    if (responses.some((response) => !response.ok)) throw new Error('The need–availability distortion data could not be loaded.')
    const [editorial, careTeams, ...fields] = await Promise.all(responses.map((response) => response.json()))
    state.editorial = editorial
    state.careTeams = careTeams
    state.fields = fields
    state.result = calculateNeedAvailabilityMetrics(fields)

    renderHero()
    renderRanking()
    renderCharts()
    renderCareTeams()
    renderProfiles()
    renderMethod()
    status.hidden = true

    window.__bmoreMedTechNeedAvailability = {
      ready: true,
      fields: state.result.records.length,
      leader: state.result.leader.id,
      leaderIndex: state.result.leader.distortionIndex,
      alliedOccupations: state.careTeams.groups.reduce((total, group) => total + group.roles.length, 0),
      charts: document.querySelectorAll('.distortion-page .strategy-chart-svg').length,
    }
  } catch (error) {
    status.classList.add('is-error')
    status.textContent = error instanceof Error ? error.message : 'The need–availability distortion data could not be loaded.'
    window.__bmoreMedTechNeedAvailability = { ready: false, error: status.textContent }
  }
}

initialize()
