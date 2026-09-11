import {
  createChartSvg,
  element,
  formatCompact,
  formatMoney,
  niceTicks,
  svgElement,
} from './strategy-utils.js'

export function renderHorizontalBars(containerId, rows, options = {}) {
  const container = document.getElementById(containerId)
  const width = 760
  const height = Math.max(255, rows.length * 58 + 54)
  const margin = { top: 18, right: 100, bottom: 30, left: 170 }
  const innerWidth = width - margin.left - margin.right
  const innerHeight = height - margin.top - margin.bottom
  const svg = createChartSvg(options.label || 'Horizontal bar chart', `0 0 ${width} ${height}`)
  const max = Math.max(...rows.map(({ value }) => value))
  const ticks = niceTicks(max)
  const scale = (value) => (value / ticks.at(-1)) * innerWidth

  for (const tick of ticks) {
    const x = margin.left + scale(tick)
    svg.append(svgElement('line', {
      x1: x,
      y1: margin.top,
      x2: x,
      y2: height - margin.bottom,
      class: 'strategy-chart-gridline',
    }))
    svg.append(svgElement('text', {
      x,
      y: height - 9,
      'text-anchor': 'middle',
      class: 'strategy-chart-tick',
    }, options.tickFormat ? options.tickFormat(tick) : formatCompact(tick)))
  }

  const band = innerHeight / rows.length
  rows.forEach((row, index) => {
    const y = margin.top + index * band + band * 0.18
    const barHeight = band * 0.54
    const barWidth = Math.max(4, scale(row.value))
    const group = svgElement('g', { class: 'strategy-chart-series', 'data-field': row.id })
    group.append(svgElement('text', {
      x: margin.left - 12,
      y: y + barHeight * 0.68,
      'text-anchor': 'end',
      class: 'strategy-chart-label',
    }, row.label))
    group.append(svgElement('rect', {
      x: margin.left,
      y,
      width: barWidth,
      height: barHeight,
      rx: Math.min(7, barHeight / 2),
      class: 'strategy-chart-bar',
    }))
    group.append(svgElement('text', {
      x: Math.min(width - 6, margin.left + barWidth + 8),
      y: y + barHeight * 0.68,
      class: 'strategy-chart-value',
    }, row.display || formatCompact(row.value)))
    svg.append(group)
  })

  container.replaceChildren(svg)
}

export function renderFundingLine(data) {
  const container = document.getElementById('strategy-funding-chart')
  const width = 900
  const height = 360
  const margin = { top: 30, right: 136, bottom: 48, left: 72 }
  const innerWidth = width - margin.left - margin.right
  const innerHeight = height - margin.top - margin.bottom
  const svg = createChartSvg(
    'Lead NIH institute appropriations by field, fiscal years 2022 through 2024',
    `0 0 ${width} ${height}`,
  )
  const years = [2022, 2023, 2024]
  const allValues = data.fields.flatMap(({ funding }) => funding.values.map(({ value }) => value))
  const max = Math.ceil(Math.max(...allValues) / 2_000_000_000) * 2_000_000_000
  const ticks = niceTicks(max, 4)
  const x = (year) => margin.left + ((year - years[0]) / (years.at(-1) - years[0])) * innerWidth
  const y = (value) => margin.top + innerHeight - (value / ticks.at(-1)) * innerHeight

  for (const tick of ticks) {
    const yPos = y(tick)
    svg.append(svgElement('line', {
      x1: margin.left,
      y1: yPos,
      x2: width - margin.right,
      y2: yPos,
      class: 'strategy-chart-gridline',
    }))
    svg.append(svgElement('text', {
      x: margin.left - 12,
      y: yPos + 4,
      'text-anchor': 'end',
      class: 'strategy-chart-tick',
    }, tick === 0 ? '$0' : `$${(tick / 1_000_000_000).toFixed(0)}B`))
  }

  for (const year of years) {
    const xPos = x(year)
    svg.append(svgElement('line', {
      x1: xPos,
      y1: margin.top,
      x2: xPos,
      y2: height - margin.bottom,
      class: 'strategy-chart-gridline strategy-chart-gridline-vertical',
    }))
    svg.append(svgElement('text', {
      x: xPos,
      y: height - 16,
      'text-anchor': 'middle',
      class: 'strategy-chart-tick',
    }, String(year)))
  }

  const labelOffsets = { oncology: -8, neurology: 4, genomics: -9, radiology: 16 }
  for (const field of data.fields) {
    const points = field.funding.values.map(({ year, value }) => [x(year), y(value)])
    const path = points.map(([px, py], index) => `${index ? 'L' : 'M'} ${px.toFixed(2)} ${py.toFixed(2)}`).join(' ')
    const group = svgElement('g', {
      class: 'strategy-chart-series strategy-line-series',
      'data-field': field.id,
    })
    group.append(svgElement('path', { d: path, class: 'strategy-chart-line-path' }))
    field.funding.values.forEach(({ year, value }, index) => {
      const [cx, cy] = points[index]
      group.append(svgElement('circle', { cx, cy, r: 5, class: 'strategy-chart-point' }))
      if (year === 2024) {
        group.append(svgElement('text', {
          x: cx + 12,
          y: cy + 4 + (labelOffsets[field.id] || 0),
          class: 'strategy-chart-end-label',
        }, `${field.name} ${formatMoney(value, 2)}`))
      }
    })
    svg.append(group)
  }

  container.replaceChildren(svg)
}

export function renderFundingLegend(data) {
  const container = document.getElementById('strategy-funding-legend')
  container.replaceChildren()
  for (const field of data.fields) {
    const item = element('span', 'strategy-chart-legend-item')
    item.dataset.field = field.id
    item.append(element('i'))
    item.append(document.createTextNode(`${field.name} · ${field.funding.proxy_label}`))
    container.append(item)
  }
}
