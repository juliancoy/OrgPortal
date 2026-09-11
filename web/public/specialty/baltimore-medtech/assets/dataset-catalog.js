const elements = {
  status: document.getElementById('dataset-catalog-status'),
  tableBody: document.getElementById('dataset-catalog-body'),
  search: document.getElementById('dataset-catalog-search'),
  mode: document.getElementById('dataset-catalog-mode'),
  count: document.getElementById('dataset-catalog-count'),
  liveCount: document.getElementById('dataset-live-count'),
  snapshotCount: document.getElementById('dataset-snapshot-count'),
  publisherCount: document.getElementById('dataset-publisher-count'),
  reviewed: document.getElementById('dataset-catalog-reviewed'),
}

const state = { registry: null }

function text(value) {
  return value === null || value === undefined ? '' : String(value)
}

function modeLabel(mode) {
  return ({
    'live-api': 'Live API',
    'live-release': 'Live release',
    'live-lookup': 'Live lookup',
    'repository-snapshot': 'Repository snapshot',
  })[mode] || mode
}

function render() {
  const q = elements.search.value.trim().toLocaleLowerCase()
  const mode = elements.mode.value
  const rows = state.registry.datasets.filter((dataset) => {
    if (mode && dataset.mode !== mode) return false
    if (!q) return true
    return [dataset.title, dataset.publisher, dataset.category, dataset.description, dataset.coverage, dataset.geography]
      .some((value) => text(value).toLocaleLowerCase().includes(q))
  })

  elements.tableBody.replaceChildren()
  for (const [index, dataset] of rows.entries()) {
    const tr = document.createElement('tr')
    const rowNumber = document.createElement('th')
    rowNumber.scope = 'row'
    rowNumber.className = 'dataset-row-number'
    rowNumber.textContent = String(index + 1)
    tr.append(rowNumber)

    const title = document.createElement('td')
    const link = document.createElement('a')
    link.href = dataset.page
    link.className = 'dataset-catalog-link'
    const strong = document.createElement('strong')
    strong.textContent = dataset.title
    const small = document.createElement('small')
    small.textContent = dataset.description
    link.append(strong, small)
    title.append(link)
    tr.append(title)

    const modeCell = document.createElement('td')
    const badge = document.createElement('span')
    badge.className = 'dataset-mode-badge'
    badge.dataset.mode = dataset.mode
    badge.textContent = modeLabel(dataset.mode)
    modeCell.append(badge)
    tr.append(modeCell)

    for (const value of [dataset.publisher, dataset.category, dataset.coverage, dataset.refresh, dataset.geography]) {
      const td = document.createElement('td')
      td.textContent = text(value)
      tr.append(td)
    }

    const openCell = document.createElement('td')
    const open = document.createElement('a')
    open.href = dataset.page
    open.className = 'dataset-open-cell'
    open.textContent = 'Open sheet →'
    openCell.append(open)
    tr.append(openCell)
    elements.tableBody.append(tr)
  }
  elements.count.textContent = `${rows.length} of ${state.registry.datasets.length} datasets`
}

async function getRegistry() {
  try {
    const response = await fetch('/specialty/baltimore-medtech/api/datasets')
    if (response.ok) return response.json()
  } catch {
    // Static preview fallback.
  }
  const fallback = await fetch('/specialty/baltimore-medtech/dataset-registry.json')
  if (!fallback.ok) throw new Error('Dataset registry could not be loaded.')
  const manifest = await fallback.json()
  if (!Array.isArray(manifest.parts)) return manifest
  const parts = await Promise.all(manifest.parts.map(async (path) => {
    const part = await fetch(path)
    if (!part.ok) throw new Error(`Dataset registry part could not be loaded: ${path}`)
    return part.json()
  }))
  return { meta: manifest.meta, datasets: parts.flatMap((part) => part.datasets || []) }
}

async function initialize() {
  try {
    const payload = await getRegistry()
    state.registry = payload
    elements.reviewed.textContent = `Registry reviewed ${state.registry.meta.as_of}`
    elements.liveCount.textContent = String(state.registry.datasets.filter((dataset) => dataset.mode.startsWith('live-')).length)
    elements.snapshotCount.textContent = String(state.registry.datasets.filter((dataset) => dataset.mode === 'repository-snapshot').length)
    elements.publisherCount.textContent = String(new Set(state.registry.datasets.map((dataset) => dataset.publisher)).size)
    elements.search.addEventListener('input', render)
    elements.mode.addEventListener('change', render)
    render()
    elements.status.hidden = true
    window.__bmoreMedTechDatasetCatalog = { ready: true, datasets: state.registry.datasets.length }
  } catch (error) {
    elements.status.textContent = error instanceof Error ? error.message : 'Dataset registry could not be loaded.'
    elements.status.classList.add('is-error')
    window.__bmoreMedTechDatasetCatalog = { ready: false, error: elements.status.textContent }
  }
}

initialize()
