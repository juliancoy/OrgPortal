import { useEffect, useId, useState } from 'react'

type Ranking = { user_id: string; name: string; minutes: number }
type Category = { category: string; minutes: number }
export type TimebankAnalyticsData = {
  circulation_minutes: number; rewarded_minutes: number; confirmed_exchanges: number
  categories: Category[]; beneficiaries: Ranking[]; providers: Ranking[]
}
const hours = (minutes: number) => `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(minutes / 60)} h`
const colors: Record<string, string> = { 'Home & garden': '#43794e', Learning: '#477cc2', 'Tech help': '#8058b3', 'Care & company': '#bb596f', Transport: '#b87924', Creative: '#157f7d', Other: '#75838e' }

function CategoryPie({ categories, total }: { categories: Category[]; total: number }) {
  const label = useId()
  let angle = -Math.PI / 2
  return <div className="tb-category-chart">
    <svg viewBox="0 0 240 240" role="img" aria-labelledby={label} className="tb-pie">
      <title id={label}>Rewarded hours by category. {categories.map((item) => `${item.category}: ${hours(item.minutes)}`).join('; ')}</title>
      {categories.map((item) => {
        const start = angle
        const fraction = item.minutes / total
        angle += fraction * Math.PI * 2
        const x1 = 120 + 108 * Math.cos(start), y1 = 120 + 108 * Math.sin(start)
        const x2 = 120 + 108 * Math.cos(angle), y2 = 120 + 108 * Math.sin(angle)
        const description = `${item.category}: ${hours(item.minutes)} (${(fraction * 100).toFixed(1)}%)`
        return fraction === 1 ? <circle key={item.category} cx="120" cy="120" r="108" fill={colors[item.category]}><title>{description}</title></circle>
          : <path key={item.category} d={`M120 120 L${x1} ${y1} A108 108 0 ${fraction > .5 ? 1 : 0} 1 ${x2} ${y2} Z`} fill={colors[item.category]} stroke="var(--panel)" strokeWidth="2"><title>{description}</title></path>
      })}
    </svg>
    <table className="tb-analytics-table"><caption className="tb-sr-only">Rewarded hours by category</caption><thead><tr><th>Category</th><th>Hours</th><th>Share</th></tr></thead><tbody>{categories.map((item) => <tr key={item.category}><th scope="row"><span className="tb-swatch" style={{ background: colors[item.category] }} />{item.category}</th><td>{hours(item.minutes)}</td><td>{new Intl.NumberFormat(undefined, { style: 'percent', maximumFractionDigits: 1 }).format(item.minutes / total)}</td></tr>)}</tbody></table>
  </div>
}

function RankingTable({ title, rows, description }: { title: string; rows: Ranking[]; description: string }) {
  return <section className="tb-analytics-panel"><h3>{title}</h3><p className="tb-muted">{description}</p>{rows.length ? <table className="tb-analytics-table"><thead><tr><th>Member</th><th>Hours</th></tr></thead><tbody>{rows.map((row) => <tr key={row.user_id}><th scope="row">{row.name}{row.minutes === rows[0].minutes && <span className="tb-leader">Top</span>}</th><td>{hours(row.minutes)}</td></tr>)}</tbody></table> : <p className="tb-muted">No confirmed hours yet.</p>}</section>
}

export function TimebankAnalytics({ api, revision }: { api: <T>(path: string, options?: RequestInit) => Promise<T>; revision: number }) {
  const [data, setData] = useState<TimebankAnalyticsData | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    const controller = new AbortController()
    setData(null); setError('')
    void api<TimebankAnalyticsData>('/analytics', { signal: controller.signal }).then((result) => { if (!controller.signal.aborted) setData(result) }).catch((error: unknown) => { if (!controller.signal.aborted) setError(error instanceof Error ? error.message : 'Unable to load analytics.') })
    return () => controller.abort()
  }, [api, revision])
  if (error) return <p role="alert" className="tb-alert">{error}</p>
  if (!data) return <p role="status">Loading analytics…</p>
  return <section className="tb-analytics" aria-label="Community analytics">
    <h2>Community analytics</h2><p className="tb-muted">All time · This community only · Confirmed hours</p>
    <div className="tb-analytics-totals">
      <article className="tb-analytics-panel"><h3>Total hours in circulation</h3><strong data-testid="circulation-hours">{hours(data.circulation_minutes)}</strong><p className="tb-muted">Sum of current positive member balances.</p></article>
      <article className="tb-analytics-panel"><h3>Total rewarded hours</h3><strong data-testid="rewarded-hours">{hours(data.rewarded_minutes)}</strong><p className="tb-muted">{data.confirmed_exchanges} confirmed exchanges, each counted once.</p></article>
    </div>
    <section className="tb-analytics-panel"><h3>Rewarded hours by category</h3>{data.rewarded_minutes > 0 ? <CategoryPie categories={data.categories} total={data.rewarded_minutes} /> : <p className="tb-muted">The pie chart will appear after the first confirmed exchange.</p>}</section>
    <div className="tb-analytics-rankings"><RankingTable title="Largest beneficiaries by hours" description="Most confirmed help received · Top 10" rows={data.beneficiaries} /><RankingTable title="Most hours provided" description="Most confirmed help given · Top 10" rows={data.providers} /></div>
  </section>
}
