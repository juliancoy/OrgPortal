const datasetId = decodeURIComponent(location.pathname.split('/').filter(Boolean).at(-1)?.replace(/\.html$/, '') || '')
const elements = {
  title: document.getElementById('dataset-title'),
  shortTitle: document.getElementById('dataset-short-title'),
  description: document.getElementById('dataset-description'),
  publisher: document.getElementById('dataset-publisher'),
  mode: document.getElementById('dataset-mode'),
  coverage: document.getElementById('dataset-coverage'),
  geography: document.getElementById('dataset-geography'),
  refreshCadence: document.getElementById('dataset-refresh-cadence'),
  sourceLink: document.getElementById('dataset-source-link'),
  apiLink: document.getElementById('dataset-api-link'),
  fetched: document.getElementById('dataset-fetched'),
  updated: document.getElementById('dataset-updated'),
  rowSummary: document.getElementById('dataset-row-summary'),
  filterForm: document.getElementById('dataset-filter-form'),
  filterFields: document.getElementById('dataset-filter-fields'),
  pageSize: document.getElementById('dataset-page-size'),
  refreshButton: document.getElementById('dataset-refresh-button'),
  csvLink: document.getElementById('dataset-csv-link'),
  jsonLink: document.getElementById('dataset-json-link'),
  status: document.getElementById('dataset-status'),
  tableHead: document.getElementById('dataset-table-head'),
  tableBody: document.getElementById('dataset-table-body'),
  tableWrap: document.getElementById('dataset-table-wrap'),
  columnsPanel: document.getElementById('dataset-columns-panel'),
  dictionaryBody: document.getElementById('dataset-dictionary-body'),
  sourcePanel: document.getElementById('dataset-source-panel'),
  limitations: document.getElementById('dataset-limitations'),
  warnings: document.getElementById('dataset-warnings'),
  upstream: document.getElementById('dataset-upstream'),
  previous: document.getElementById('dataset-previous'),
  next: document.getElementById('dataset-next'),
  pageLabel: document.getElementById('dataset-page-label'),
  cellName: document.getElementById('dataset-cell-name'),
  formulaValue: document.getElementById('dataset-formula-value'),
  tabs: [...document.querySelectorAll('[data-sheet-tab]')],
  panels: [...document.querySelectorAll('[data-sheet-panel]')],
}

const state = {
  registry: null,
  dataset: null,
  payload: null,
  page: 1,
  sort: '',
  direction: 'asc',
  visibleColumns: new Set(),
  requestController: null,
}

function el(tag, className, value) {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (value !== undefined) node.textContent = value
  return node
}

function modeLabel(mode) {
  return ({
    'live-api': 'Live API',
    'live-release': 'Live release metadata',
    'live-lookup': 'Live interactive source',
    'repository-snapshot': 'Repository snapshot',
  })[mode] || mode
}

function humanize(column) {
  return column
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase())
}

function isUrl(value, column) {
  return /_url$/i.test(column) || /^https?:\/\//i.test(String(value || ''))
}

function formatValue(value) {
  if (value === '' || value === null || value === undefined) return ''
  if (typeof value === 'number') return new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 }).format(value)
  return String(value)
}

function cellValue(value, column) {
  if (isUrl(value, column) && /^https?:\/\//i.test(String(value || ''))) {
    const link = el('a', 'dataset-cell-link', 'Open ↗')
    link.href = String(value)
    link.target = '_blank'
    link.rel = 'noreferrer'
    link.title = String(value)
    return link
  }
  const span = el('span', '', formatValue(value))
  span.title = formatValue(value)
  return span
}

function columnLetter(index) {
  let value = index + 1
  let output = ''
  while (value > 0) {
    value -= 1
    output = String.fromCharCode(65 + (value % 26)) + output
    value = Math.floor(value / 26)
  }
  return output
}

function setSelectedCell(cell, rowIndex, columnIndex, rawValue) {
  document.querySelector('.dataset-cell.is-selected')?.classList.remove('is-selected')
  cell.classList.add('is-selected')
  elements.cellName.textContent = `${columnLetter(columnIndex)}${rowIndex + 2}`
  elements.formulaValue.textContent = formatValue(rawValue)
}

function visibleColumns() {
  const columns = state.payload?.columns || []
  if (!state.visibleColumns.size) return columns
  return columns.filter((column) => state.visibleColumns.has(column))
}

function renderTable() {
  const columns = visibleColumns()
  elements.tableHead.replaceChildren()
  elements.tableBody.replaceChildren()

  const headerRow = document.createElement('tr')
  const corner = el('th', 'dataset-sheet-corner', '')
  corner.scope = 'col'
  headerRow.append(corner)
  columns.forEach((column, index) => {
    const th = el('th', 'dataset-column-header')
    th.scope = 'col'
    th.dataset.column = column
    const letter = el('span', 'dataset-column-letter', columnLetter(index))
    const button = el('button', 'dataset-sort-button')
    button.type = 'button'
    button.append(el('strong', '', humanize(column)))
    if (state.sort === column) button.append(el('span', 'dataset-sort-direction', state.direction === 'asc' ? '↑' : '↓'))
    button.addEventListener('click', () => {
      if (state.sort === column) state.direction = state.direction === 'asc' ? 'desc' : 'asc'
      else {
        state.sort = column
        state.direction = 'asc'
      }
      state.page = 1
      loadData()
    })
    th.append(letter, button)
    headerRow.append(th)
  })
  elements.tableHead.append(headerRow)

  state.payload.rows.forEach((row, rowIndex) => {
    const tr = document.createElement('tr')
    const number = el('th', 'dataset-row-number', String((state.page - 1) * state.payload.page_size + rowIndex + 1))
    number.scope = 'row'
    tr.append(number)
    columns.forEach((column, columnIndex) => {
      const td = el('td', 'dataset-cell')
      td.dataset.column = column
      td.append(cellValue(row[column], column))
      td.addEventListener('click', () => setSelectedCell(td, rowIndex, columnIndex, row[column]))
      tr.append(td)
    })
    elements.tableBody.append(tr)
  })

  if (!state.payload.rows.length) {
    const tr = document.createElement('tr')
    const td = el('td', 'dataset-empty-cell', 'No rows matched this query.')
    td.colSpan = columns.length + 1
    tr.append(td)
    elements.tableBody.append(tr)
  }
}

function inferType(rows, column) {
  const values = rows.map((row) => row[column]).filter((value) => value !== '' && value !== null && value !== undefined)
  if (!values.length) return 'empty'
  if (values.every((value) => typeof value === 'number' || Number.isFinite(Number(String(value).replaceAll(',', ''))))) return 'number'
  if (values.every((value) => /^https?:\/\//i.test(String(value)))) return 'URL'
  if (values.every((value) => !Number.isNaN(Date.parse(String(value))) && /\d{4}/.test(String(value)))) return 'date / time'
  return 'text'
}

function renderColumns() {
  elements.columnsPanel.replaceChildren()
  elements.dictionaryBody.replaceChildren()
  for (const [index, column] of state.payload.columns.entries()) {
    const label = el('label', 'dataset-column-option')
    const checkbox = document.createElement('input')
    checkbox.type = 'checkbox'
    checkbox.checked = state.visibleColumns.has(column)
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) state.visibleColumns.add(column)
      else state.visibleColumns.delete(column)
      if (!state.visibleColumns.size) state.payload.columns.forEach((name) => state.visibleColumns.add(name))
      renderTable()
    })
    label.append(checkbox, el('span', '', humanize(column)), el('code', '', column))
    elements.columnsPanel.append(label)

    const tr = document.createElement('tr')
    for (const value of [columnLetter(index), column, humanize(column), inferType(state.payload.rows, column)]) {
      tr.append(el('td', '', value))
    }
    elements.dictionaryBody.append(tr)
  }
}

function renderSource() {
  elements.limitations.replaceChildren()
  for (const limitation of state.dataset.limitations || []) elements.limitations.append(el('li', '', limitation))
  elements.warnings.replaceChildren()
  for (const warning of state.payload.warnings || []) elements.warnings.append(el('li', '', warning))

  elements.upstream.replaceChildren()
  const rows = [
    ['Source page', state.dataset.source_url],
    ['Documented API', state.dataset.api_url || 'Not published'],
    ['Actual upstream request', state.payload.upstream?.url || 'Repository asset'],
    ['Upstream status', state.payload.upstream?.status ?? '—'],
    ['Dataset mode', modeLabel(state.dataset.mode)],
    ['Sort scope', state.payload.sort_scope],
    ['CSV export scope', 'Current displayed page and query only'],
  ]
  for (const [label, value] of rows) {
    const tr = document.createElement('tr')
    tr.append(el('th', '', label))
    const td = document.createElement('td')
    if (/^(?:https?:\/\/|\/)/.test(String(value))) {
      const link = el('a', '', String(value))
      link.href = String(value)
      link.target = '_blank'
      link.rel = 'noreferrer'
      td.append(link)
    } else td.textContent = String(value)
    tr.append(td)
    elements.upstream.append(tr)
  }
}

function renderMeta() {
  const payload = state.payload
  elements.fetched.textContent = new Date(payload.fetched_at).toLocaleString()
  elements.updated.textContent = payload.source_updated_at || 'Not supplied by publisher'
  const start = payload.rows.length ? (payload.page - 1) * payload.page_size + 1 : 0
  const end = (payload.page - 1) * payload.page_size + payload.rows.length
  const total = payload.total_known ? new Intl.NumberFormat('en-US').format(payload.total) : 'unknown total'
  elements.rowSummary.textContent = `${new Intl.NumberFormat('en-US').format(start)}–${new Intl.NumberFormat('en-US').format(end)} · ${total}`
  elements.pageLabel.textContent = `Page ${payload.page}${payload.total_known ? ` of ${Math.max(1, Math.ceil(payload.total / payload.page_size))}` : ''}`
  elements.previous.disabled = payload.page <= 1
  elements.next.disabled = payload.total_known
    ? payload.page * payload.page_size >= payload.total
    : payload.rows.length < payload.page_size

  const params = currentParams()
  elements.csvLink.href = `/specialty/baltimore-medtech/api/datasets/${datasetId}.csv?${params}`
  elements.csvLink.textContent = 'CSV page'
  elements.csvLink.title = 'Download the current query page as CSV'
  elements.jsonLink.href = `/specialty/baltimore-medtech/api/datasets/${datasetId}?${params}`
}

function renderPayload() {
  if (!state.visibleColumns.size) state.payload.columns.forEach((column) => state.visibleColumns.add(column))
  else {
    const next = new Set(state.payload.columns.filter((column) => state.visibleColumns.has(column)))
    state.visibleColumns = next.size ? next : new Set(state.payload.columns)
  }
  renderTable()
  renderColumns()
  renderSource()
  renderMeta()
}

function filterValues() {
  const values = Object.fromEntries(new FormData(elements.filterForm).entries())
  delete values.page_size
  return values
}

function currentParams(refresh = false) {
  const params = new URLSearchParams()
  const values = filterValues()
  for (const [key, value] of Object.entries(values)) if (String(value).trim()) params.set(key, String(value).trim())
  params.set('page', String(state.page))
  params.set('page_size', elements.pageSize.value)
  if (state.sort) {
    params.set('sort', state.sort)
    params.set('direction', state.direction)
  }
  if (refresh) params.set('refresh', '1')
  return params.toString()
}

function syncLocation() {
  const url = new URL(location.href)
  url.search = currentParams()
  history.replaceState(null, '', url)
}

async function readJsonResponse(response, label) {
  const text = await response.text()
  let payload
  try {
    payload = JSON.parse(text)
  } catch {
    const contentType = response.headers.get('content-type') || 'unknown content type'
    const excerpt = text.trim().replace(/\s+/g, ' ').slice(0, 160) || 'empty response'
    throw new Error(`${label} returned ${response.status} ${contentType}, not JSON: ${excerpt}`)
  }
  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.error || `${label} failed (${response.status})`)
  }
  return payload
}

async function loadData(refresh = false) {
  state.requestController?.abort()
  state.requestController = new AbortController()
  elements.status.hidden = false
  elements.status.classList.remove('is-error')
  elements.status.textContent = state.dataset.mode.startsWith('live-') ? 'Querying the publisher through the MedTech data gateway…' : 'Loading the versioned repository dataset…'
  elements.tableWrap.setAttribute('aria-busy', 'true')
  try {
    const response = await fetch(`/specialty/baltimore-medtech/api/datasets/${datasetId}?${currentParams(refresh)}`, { signal: state.requestController.signal })
    const payload = await readJsonResponse(response, 'Dataset API')
    state.payload = payload
    renderPayload()
    syncLocation()
    elements.status.hidden = true
    elements.tableWrap.setAttribute('aria-busy', 'false')
    window.__bmoreMedTechDatasetSheet = { ready: true, dataset: datasetId, rows: payload.rows.length, columns: payload.columns.length, live: payload.live }
  } catch (error) {
    if (error.name === 'AbortError') return
    elements.status.hidden = false
    elements.status.classList.add('is-error')
    elements.status.textContent = error instanceof Error ? error.message : 'Dataset request failed.'
    elements.tableWrap.setAttribute('aria-busy', 'false')
    window.__bmoreMedTechDatasetSheet = { ready: false, dataset: datasetId, error: elements.status.textContent }
  }
}

function renderFilters() {
  elements.filterFields.replaceChildren()
  const locationParams = new URLSearchParams(location.search)
  for (const filter of state.dataset.filters || []) {
    const label = el('label', 'dataset-filter-field')
    label.append(el('span', '', filter.label))
    let input
    if (filter.type === 'select') {
      input = document.createElement('select')
      for (const option of filter.options || []) {
        const node = el('option', '', option.label)
        node.value = option.value
        input.append(node)
      }
    } else {
      input = document.createElement('input')
      input.type = filter.type || 'text'
      input.placeholder = filter.placeholder || ''
    }
    input.name = filter.name
    input.value = locationParams.get(filter.name) ?? filter.default ?? ''
    label.append(input)
    elements.filterFields.append(label)
  }
  const maximum = state.dataset.max_page_size || 500
  for (const option of [...elements.pageSize.options]) {
    option.hidden = Number(option.value) > maximum
    option.disabled = Number(option.value) > maximum
  }
  const requestedPageSize = Number.parseInt(locationParams.get('page_size') || String(state.dataset.default_page_size || 100), 10)
  const allowedPageSizes = [...elements.pageSize.options].filter((option) => !option.disabled).map((option) => Number(option.value))
  elements.pageSize.value = String(allowedPageSizes.includes(requestedPageSize) ? requestedPageSize : allowedPageSizes.at(-1))
  state.page = Math.max(1, Number.parseInt(locationParams.get('page') || '1', 10) || 1)
  state.sort = locationParams.get('sort') || ''
  state.direction = locationParams.get('direction') === 'desc' ? 'desc' : 'asc'
}

function renderDatasetIdentity() {
  elements.refreshButton.textContent = state.dataset.mode.startsWith('live-') ? 'Refresh live' : 'Reload snapshot'
  elements.title.textContent = state.dataset.title
  elements.shortTitle.textContent = state.dataset.short_title
  elements.description.textContent = state.dataset.description
  elements.publisher.textContent = state.dataset.publisher
  elements.mode.textContent = modeLabel(state.dataset.mode)
  elements.mode.dataset.mode = state.dataset.mode
  elements.coverage.textContent = state.dataset.coverage
  elements.geography.textContent = state.dataset.geography
  elements.refreshCadence.textContent = state.dataset.refresh
  elements.sourceLink.href = state.dataset.source_url
  elements.sourceLink.textContent = state.dataset.mode === 'live-lookup' ? 'Open official lookup ↗' : 'Open official source ↗'
  if (state.dataset.api_url) {
    elements.apiLink.href = state.dataset.api_url
    elements.apiLink.hidden = false
  } else elements.apiLink.hidden = true
  document.title = `${state.dataset.short_title} data sheet | Baltimore MedTech`
}

function setupTabs() {
  function selectTab(name) {
    for (const tab of elements.tabs) {
      const selected = tab.dataset.sheetTab === name
      tab.setAttribute('aria-selected', String(selected))
      tab.tabIndex = selected ? 0 : -1
    }
    for (const panel of elements.panels) panel.hidden = panel.dataset.sheetPanel !== name
  }
  elements.tabs.forEach((tab) => tab.addEventListener('click', () => selectTab(tab.dataset.sheetTab)))
  selectTab('data')
}

async function getRegistry() {
  try {
    const response = await fetch('/specialty/baltimore-medtech/api/datasets')
    if (response.ok) return response.json()
  } catch {
    // Static preview fallback.
  }
  const response = await fetch('/specialty/baltimore-medtech/dataset-registry.json')
  if (!response.ok) throw new Error('Dataset registry could not be loaded.')
  const manifest = await response.json()
  if (!Array.isArray(manifest.parts)) return manifest
  const parts = await Promise.all(manifest.parts.map(async (path) => {
    const part = await fetch(path)
    if (!part.ok) throw new Error(`Dataset registry part could not be loaded: ${path}`)
    return part.json()
  }))
  return { meta: manifest.meta, datasets: parts.flatMap((part) => part.datasets || []) }
}

async function initialize() {
  setupTabs()
  try {
    state.registry = await getRegistry()
    state.dataset = state.registry.datasets.find((dataset) => dataset.id === datasetId)
    if (!state.dataset) throw new Error(`Unknown dataset page: ${datasetId}`)
    renderDatasetIdentity()
    renderFilters()

    elements.filterForm.addEventListener('submit', (event) => {
      event.preventDefault()
      state.page = 1
      loadData()
    })
    elements.pageSize.addEventListener('change', () => {
      state.page = 1
      loadData()
    })
    elements.refreshButton.addEventListener('click', () => loadData(true))
    elements.previous.addEventListener('click', () => {
      if (state.page > 1) {
        state.page -= 1
        loadData()
      }
    })
    elements.next.addEventListener('click', () => {
      state.page += 1
      loadData()
    })
    await loadData()
  } catch (error) {
    elements.status.textContent = error instanceof Error ? error.message : 'Dataset page could not be initialized.'
    elements.status.classList.add('is-error')
  }
}

initialize()
