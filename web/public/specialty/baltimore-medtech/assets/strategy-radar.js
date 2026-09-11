import { createChartSvg, element, logNormalize, svgElement } from './strategy-utils.js'

let focusedField = null

function radarScores(data) {
  const need = logNormalize(data.fields.map(({ need: metric }) => metric.value))
  const scarcity = logNormalize(data.fields.map(({ workforce }) => workforce.value), true)
  const funding = logNormalize(data.fields.map(({ funding: metric }) => metric.values.at(-1).value))
  const pipeline = logNormalize(data.fields.map(({ pipeline: metric }) => metric.value))
  return data.fields.map((field, index) => ({
    id: field.id,
    label: field.name,
    scores: [
      Math.round(need[index]),
      Math.round(scarcity[index]),
      Math.round(funding[index]),
      Math.round(pipeline[index]),
      field.digital_leverage.score,
    ],
  }))
}

function applyFocus() {
  const chart = document.getElementById('strategy-radar-chart')
  chart.dataset.focusedField = focusedField || ''
  for (const series of chart.querySelectorAll('.strategy-radar-series')) {
    series.classList.toggle('is-muted', Boolean(focusedField && series.dataset.field !== focusedField))
    series.classList.toggle('is-focused', series.dataset.field === focusedField)
  }
  for (const button of document.querySelectorAll('.strategy-radar-key')) {
    button.setAttribute('aria-pressed', String(button.dataset.field === focusedField))
  }
}

export function renderRadar(data) {
  const container = document.getElementById('strategy-radar-chart')
  const width = 600
  const height = 470
  const cx = 300
  const cy = 225
  const radius = 155
  const axes = ['Need proxy', 'Workforce scarcity', 'Funding intensity', 'Pipeline strength', 'Digital leverage']
  const scores = radarScores(data)
  const svg = createChartSvg(
    'Radar chart comparing five directional strategic signals for neurology, oncology, radiology, and genomics',
    `0 0 ${width} ${height}`,
  )
  const point = (index, value) => {
    const angle = -Math.PI / 2 + (Math.PI * 2 * index) / axes.length
    const radial = radius * (value / 100)
    return [cx + Math.cos(angle) * radial, cy + Math.sin(angle) * radial]
  }

  for (const ring of [20, 40, 60, 80, 100]) {
    svg.append(svgElement('polygon', {
      points: axes.map((_, index) => point(index, ring).join(',')).join(' '),
      class: 'strategy-radar-ring',
    }))
    if (ring < 100) {
      svg.append(svgElement('text', {
        x: cx + 5,
        y: cy - radius * (ring / 100) + 4,
        class: 'strategy-radar-tick',
      }, String(ring)))
    }
  }

  axes.forEach((axis, index) => {
    const [xEnd, yEnd] = point(index, 100)
    const [xLabel, yLabel] = point(index, 122)
    const anchor = xLabel < cx - 25 ? 'end' : xLabel > cx + 25 ? 'start' : 'middle'
    svg.append(svgElement('line', {
      x1: cx,
      y1: cy,
      x2: xEnd,
      y2: yEnd,
      class: 'strategy-radar-axis',
    }))
    svg.append(svgElement('text', {
      x: xLabel,
      y: yLabel,
      'text-anchor': anchor,
      class: 'strategy-radar-axis-label',
    }, axis))
  })

  for (const field of scores) {
    const group = svgElement('g', {
      class: 'strategy-radar-series strategy-chart-series',
      'data-field': field.id,
    })
    group.append(svgElement('polygon', {
      points: field.scores.map((value, index) => point(index, value).join(',')).join(' '),
      class: 'strategy-radar-shape',
    }))
    field.scores.forEach((value, index) => {
      const [px, py] = point(index, value)
      group.append(svgElement('circle', { cx: px, cy: py, r: 3.5, class: 'strategy-radar-point' }))
    })
    svg.append(group)
  }
  container.replaceChildren(svg)

  const legend = document.getElementById('strategy-radar-legend')
  legend.replaceChildren()
  for (const field of scores) {
    const button = element('button', 'strategy-radar-key', field.label)
    button.type = 'button'
    button.dataset.field = field.id
    button.setAttribute('aria-pressed', 'false')
    button.addEventListener('click', () => {
      focusedField = focusedField === field.id ? null : field.id
      applyFocus()
    })
    legend.append(button)
  }
  applyFocus()
}
