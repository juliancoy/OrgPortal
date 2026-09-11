export const SVG_NS = 'http://www.w3.org/2000/svg'

export function element(tag, className, text) {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

export function svgElement(tag, attributes = {}, text) {
  const node = document.createElementNS(SVG_NS, tag)
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, String(value))
  if (text !== undefined) node.textContent = text
  return node
}

export function formatInteger(value) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value)
}

export function formatCompact(value) {
  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: value >= 1_000_000_000 ? 2 : 1,
  }).format(value)
}

export function formatMoney(value, digits = 1) {
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(digits)}B`
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(digits)}M`
  return `$${formatInteger(value)}`
}

export function externalLink(label, url, className = 'strategy-source-link') {
  const link = element('a', className, label)
  link.href = url
  link.target = '_blank'
  link.rel = 'noreferrer'
  return link
}

export function createChartSvg(label, viewBox = '0 0 760 300') {
  return svgElement('svg', {
    class: 'strategy-chart-svg',
    viewBox,
    role: 'img',
    'aria-label': label,
    preserveAspectRatio: 'xMidYMid meet',
  })
}

export function niceTicks(max, count = 4) {
  const rough = max / count
  const magnitude = 10 ** Math.floor(Math.log10(rough))
  const normalized = rough / magnitude
  const nice = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10
  const step = nice * magnitude
  const top = Math.ceil(max / step) * step
  return Array.from({ length: Math.round(top / step) + 1 }, (_, index) => index * step)
}

export function logNormalize(values, reverse = false) {
  const logs = values.map((value) => Math.log10(value))
  const min = Math.min(...logs)
  const max = Math.max(...logs)
  return logs.map((value) => {
    const normalized = min === max ? 60 : 20 + 80 * ((value - min) / (max - min))
    return reverse ? 120 - normalized : normalized
  })
}

export function renderDataTable(containerId, caption, columns, rows) {
  const container = document.getElementById(containerId)
  const details = element('details', 'strategy-data-details')
  details.append(element('summary', '', 'View exact data'))
  const table = element('table', 'strategy-data-table')
  table.append(element('caption', '', caption))
  const thead = element('thead')
  const headRow = element('tr')
  for (const column of columns) headRow.append(element('th', '', column.label))
  thead.append(headRow)
  table.append(thead)
  const tbody = element('tbody')
  for (const row of rows) {
    const tr = element('tr')
    for (const column of columns) {
      const value = column.format ? column.format(row[column.key], row) : String(row[column.key])
      tr.append(element('td', '', value))
    }
    tbody.append(tr)
  }
  table.append(tbody)
  details.append(table)
  container.replaceChildren(details)
}
