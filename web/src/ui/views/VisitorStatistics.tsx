import { useEffect, useState } from 'react'
import { refreshRuntimeTokenFromSession } from '../../infrastructure/auth/sessionToken'

type Counts = { page_views: number; visits: number }
export type VisitorReport = Counts & {
  status: 'ready'
  source: string
  start: string
  end: string
  hosts: string[]
  daily: Array<Counts & { date: string; host: string }>
  top_pages: Array<Counts & { host: string; path: string }>
}
type Report = VisitorReport | { status: 'not_configured' | 'unavailable'; message: string }

export function VisitorStatistics({ token }: { token: string }) {
  const [days, setDays] = useState('7')
  const [host, setHost] = useState('')
  const [hosts, setHosts] = useState<string[]>([])
  const [report, setReport] = useState<Report | null>(null)
  const [loading, setLoading] = useState(true)
  const [refresh, setRefresh] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setReport(null)
    const url = `/api/org/api/admin/visitor-statistics?${new URLSearchParams({ days, ...(host ? { host } : {}) })}`
    async function load() {
      try {
        const request = (value: string) => fetch(url, { headers: { Authorization: `Bearer ${value}` }, signal: controller.signal })
        let response = await request(token)
        if (response.status === 401) {
          const refreshed = await refreshRuntimeTokenFromSession()
          if (refreshed && !controller.signal.aborted) response = await request(refreshed)
        }
        if (!response.ok && response.status !== 503) throw new Error('Unable to load visitor statistics.')
        const data = await response.json() as Report
        if (!['ready', 'not_configured', 'unavailable'].includes(data.status)) throw new Error('Unable to load visitor statistics.')
        if (!controller.signal.aborted) {
          setReport(data)
          if (data.status === 'ready') setHosts(data.hosts)
        }
      } catch {
        if (!controller.signal.aborted) setReport({ status: 'unavailable', message: 'Unable to load visitor statistics. Try again later.' })
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }
    void load()
    return () => controller.abort()
  }, [token, days, host, refresh])

  const data = report?.status === 'ready' ? report : null
  return <section className="portal-card visitor-statistics" aria-label="Visitor statistics">
    <div className="visitor-statistics-toolbar">
      <h2>Visitor statistics</h2>
      <label>Period <select value={days} onChange={event => setDays(event.target.value)}><option value="7">7 days</option><option value="30">30 days</option></select></label>
      {hosts.length > 0 && <label>Website <select value={host} onChange={event => setHost(event.target.value)}><option value="">All production websites</option>{hosts.map(value => <option key={value} value={value}>{value}</option>)}</select></label>}
      <button type="button" disabled={loading} onClick={() => setRefresh(value => value + 1)}>Refresh visitors</button>
    </div>
    <p className="muted">Cloudflare Web Analytics · Complete UTC days · Known bots excluded</p>
    {loading && <p role="status">Loading visitor statistics…</p>}
    {!loading && report && report.status !== 'ready' && <p role="status">{report.message}</p>}
    {data && <>
      <p>{data.start.slice(0, 10)} through {new Date(Date.parse(data.end) - 86400000).toISOString().slice(0, 10)}</p>
      <div className="visitor-statistics-totals">
        <div><strong>{data.page_views.toLocaleString()}</strong><span>Page views</span></div>
        <div><strong>{data.visits.toLocaleString()}</strong><span>Visits</span></div>
      </div>
      <p className="muted">Visits are estimates, not distinct people or registered users. Browser blockers can reduce counts.</p>
      {data.daily.length === 0 ? <p>No visitor traffic reported for this period.</p> : <div className="visitor-statistics-table"><table>
        <caption>Daily traffic by website</caption>
        <thead><tr><th scope="col">Date (UTC)</th><th scope="col">Website</th><th scope="col">Page views</th><th scope="col">Visits</th></tr></thead>
        <tbody>{data.daily.map(row => <tr key={`${row.date}:${row.host}`}><th scope="row">{row.date}</th><td>{row.host}</td><td>{row.page_views.toLocaleString()}</td><td>{row.visits.toLocaleString()}</td></tr>)}</tbody>
      </table></div>}
      {data.top_pages.length > 0 && <div className="visitor-statistics-table"><table>
        <caption>Top 20 pages by page views</caption>
        <thead><tr><th scope="col">Website</th><th scope="col">Page</th><th scope="col">Page views</th><th scope="col">Visits</th></tr></thead>
        <tbody>{data.top_pages.map(row => <tr key={`${row.host}:${row.path}`}><td>{row.host}</td><th scope="row">{row.path}</th><td>{row.page_views.toLocaleString()}</td><td>{row.visits.toLocaleString()}</td></tr>)}</tbody>
      </table></div>}
    </>}
  </section>
}
