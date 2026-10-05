import { useState } from 'react'
import { Link } from 'react-router-dom'
export type FundingCounterparty = {
  direction: 'deployed' | 'received'; organizationId: string | null; counterpartKey: string;
  name: string; slug: string | null; currency: string | null; status: 'reported' | 'delivered';
  amount: number | null; recordCount: number; undisclosedCount: number; lowerBoundCount: number;
}
function CounterpartyList({ rows, direction }: { rows: FundingCounterparty[]; direction: FundingCounterparty['direction'] }) {
  const [query, setQuery] = useState('')
  const [limit, setLimit] = useState(50)
  const title = direction === 'received' ? 'Funders' : 'Recipients'
  const selected = rows.filter(row => row.direction === direction)
  const filtered = selected.filter(row => row.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
  const groups = new Map<string, FundingCounterparty[]>()
  for (const row of filtered) {
    const key = JSON.stringify([row.currency, row.status])
    const group = groups.get(key) || []; group.push(row); groups.set(key, group)
  }
  let shown = 0
  return <section aria-label={`${title} bar charts`}>
    <h3>{title}</h3>
    {selected.length ? <>
      <label>Find a {direction === 'received' ? 'funder' : 'recipient'}<input type="search" value={query} onChange={event => { setQuery(event.target.value); setLimit(50) }} /></label>
      {[...groups].map(([key, group]) => {
        group.sort((a, b) => (b.amount ?? -1) - (a.amount ?? -1) || a.name.localeCompare(b.name))
        const maximum = group.reduce((max, row) => Math.max(max, row.amount || 0), 0)
        const visible = group.slice(0, Math.max(0, limit - shown)); shown += visible.length
        if (!visible.length) return null
        return <div key={key}>
          <h4>{group[0].currency || 'Undisclosed currency'} · {group[0].status === 'delivered' ? 'Documented delivered' : 'Reported / announced'}</h4>
          <p className="muted">Bar lengths compare amounts within this currency and status.</p>
          <ol className="tedco-funding-chart">{visible.map(row => <li key={row.counterpartKey}>
            <div className="tedco-chart-heading">
              {row.slug ? <Link to={`/orgs/${row.slug}`}>{row.name}</Link> : <strong>{row.name}</strong>}
              <span className="tedco-chart-amount">{row.amount === null ? 'Undisclosed' : `${row.lowerBoundCount ? 'At least ' : ''}${row.amount.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${row.currency || ''}`}</span>
            </div>
            {row.amount !== null && maximum > 0 && <div className="tedco-bar-track" aria-hidden="true"><span style={{ width: `${row.amount / maximum * 100}%` }} /></div>}
            <p className="tedco-chart-meta">{row.recordCount} source record(s){row.undisclosedCount > 0 && ` · ${row.undisclosedCount} with undisclosed amounts`}</p>
          </li>)}</ol>
        </div>
      })}
      {!filtered.length && <p>No matching organizations.</p>}
      {filtered.length > limit && <button onClick={() => setLimit(value => value + 50)}>Load more {title.toLocaleLowerCase()} ({Math.min(limit, filtered.length)} of {filtered.length})</button>}
    </> : <p>No documented monetary {direction === 'received' ? 'funders' : 'recipients'} yet.</p>}
  </section>
}
export function OrganizationFundingChart({ rows }: { rows: FundingCounterparty[] }) {
  return <section aria-label="Organization funders and recipients" className="organization-funding-charts">
    <h2>Funders and recipients</h2>
    <p className="muted">Ranked from the shared transaction database across all dates. Reported financing is separate from documented delivery. Undisclosed amounts have no bar. Named agency contributions are shown separately; the remaining round amount is attributed to the investor group, so received totals count each contribution once. Acquisition prices, cumulative disclosures and program limits are excluded.</p>
    <CounterpartyList rows={rows} direction="received" />
    <CounterpartyList rows={rows} direction="deployed" />
  </section>
}
