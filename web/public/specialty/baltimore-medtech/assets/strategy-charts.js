import { renderFundingLegend, renderFundingLine, renderHorizontalBars } from './strategy-bars.js'
import { renderRadar } from './strategy-radar.js'
import { formatInteger, formatMoney, renderDataTable } from './strategy-utils.js'

export function renderCharts(data) {
  const fields = data.fields

  renderHorizontalBars('strategy-workforce-chart', fields.map((field) => ({
    id: field.id,
    label: field.name,
    value: field.workforce.value,
    display: field.workforce.display,
  })), {
    label: 'Physician workforce proxies for four medical fields',
    tickFormat: (value) => new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(value),
  })
  renderDataTable('strategy-workforce-table', 'Physician workforce proxy', [
    { key: 'name', label: 'Field' },
    { key: 'value', label: 'People', format: formatInteger },
    { key: 'year', label: 'Year' },
    { key: 'definition', label: 'Definition' },
  ], fields.map((field) => ({
    name: field.name,
    value: field.workforce.value,
    year: field.workforce.year,
    definition: field.workforce.definition,
  })))

  renderHorizontalBars('strategy-pipeline-chart', fields.map((field) => ({
    id: field.id,
    label: field.name,
    value: field.pipeline.value,
    display: field.pipeline.display,
  })), {
    label: 'Annual new physician entrant proxies for four medical fields',
    tickFormat: (value) => new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(value),
  })
  renderDataTable('strategy-pipeline-table', 'Physician entry pipeline proxy', [
    { key: 'name', label: 'Field' },
    { key: 'value', label: 'New entrants', format: formatInteger },
    { key: 'year', label: 'Year' },
    { key: 'definition', label: 'Definition' },
  ], fields.map((field) => ({
    name: field.name,
    value: field.pipeline.value,
    year: field.pipeline.year,
    definition: field.pipeline.definition,
  })))

  renderFundingLine(data)
  renderFundingLegend(data)
  renderDataTable('strategy-funding-table', 'Lead NIH institute appropriations', [
    { key: 'field', label: 'Field' },
    { key: 'proxy', label: 'Proxy' },
    { key: 'year', label: 'Fiscal year' },
    { key: 'value', label: 'Appropriation', format: (value) => formatMoney(value, 3) },
  ], fields.flatMap((field) => field.funding.values.map(({ year, value }) => ({
    field: field.name,
    proxy: field.funding.proxy_label,
    year,
    value,
  }))))

  renderHorizontalBars('strategy-need-chart', fields.map((field) => ({
    id: field.id,
    label: field.name,
    value: field.need.value,
    display: field.need.display,
  })), {
    label: 'Field-specific population and service-demand proxies',
    tickFormat: (value) => `${(value / 1_000_000).toFixed(0)}M`,
  })
  renderDataTable('strategy-need-table', 'Field-specific need proxies', [
    { key: 'name', label: 'Field' },
    { key: 'value', label: 'People', format: formatInteger },
    { key: 'year', label: 'Year' },
    { key: 'label', label: 'Measure' },
    { key: 'type', label: 'Proxy type' },
  ], fields.map((field) => ({
    name: field.name,
    value: field.need.value,
    year: field.need.year,
    label: field.need.label,
    type: field.need.type,
  })))

  renderRadar(data)

  const anchors = data.baltimore.anchors
  renderHorizontalBars('strategy-local-chart', anchors.map((anchor, index) => ({
    id: `local-${index}`,
    label: anchor.short_name,
    value: anchor.funding,
    display: `${formatMoney(anchor.funding, anchor.funding >= 100_000_000 ? 1 : 2)} · ${formatInteger(anchor.awards)} awards`,
  })), {
    label: 'FY2024 NIH funding at two selected Baltimore research institutions',
    tickFormat: formatMoney,
  })
  renderDataTable('strategy-local-table', 'Selected Baltimore NIH research anchors, fiscal year 2024', [
    { key: 'name', label: 'Institution' },
    { key: 'funding', label: 'Funding', format: (value) => formatMoney(value, 3) },
    { key: 'awards', label: 'Awards', format: formatInteger },
  ], anchors)
}
