import { useEffect, useState } from 'react'
import catalog from '../../data/test-status-catalog.json'
import './test-status.css'

type Status = 'passed' | 'failed' | 'not_run'
type Check = { id: string; label: string; status: Status; recordedAt?: string | null; durationMs?: number | null }
type Group = { id: string; label: string; category?: string; cases: Check[]; recordedAt?: string | null; revision?: string | null; stale?: boolean }
type Report = { version: number; title: string; generatedAt?: string; environment?: string; groups: Group[] }
const emptyReport: Report = { ...catalog, groups: catalog.groups.map(group => ({ ...group, cases: group.cases.map(check => ({ ...check, status: 'not_run' })) })) }
const labels: Record<Status, string> = { passed: 'Passed', failed: 'Failed', not_run: 'Not run' }
function counts(cases: Check[]) {
 return cases.reduce((totals, check) => ({ ...totals, [check.status]: totals[check.status] + 1 }), { passed: 0, failed: 0, not_run: 0 })
}
function CountSummary({ cases }: { cases: Check[] }) {
 const total = counts(cases)
 return <span className="test-status-counts"><span className="test-status-passed">{total.passed} passed</span><span className="test-status-failed">{total.failed} failed</span><span className="test-status-not-run">{total.not_run} not run</span></span>
}
function fill(cases: Check[]) {
 const total = counts(cases)
 const passed = cases.length ? total.passed / cases.length * 100 : 0
 const failed = cases.length ? total.failed / cases.length * 100 : 0
 return `linear-gradient(to right, var(--test-pass-fill) 0% ${passed}%, var(--test-fail-fill) ${passed}% ${passed + failed}%, var(--test-idle-fill) ${passed + failed}% 100%)`
}
function validReport(value: unknown): value is Report {
 if (!value || typeof value !== 'object') return false
 const data = value as Report
 const text = (item: unknown) => item == null || typeof item === 'string'
 return data.version === 1 && typeof data.title === 'string' && text(data.environment) && text(data.generatedAt) && Array.isArray(data.groups) && data.groups.every(group => group && typeof group.id === 'string' && typeof group.label === 'string' && text(group.category) && text(group.recordedAt) && text(group.revision) && Array.isArray(group.cases) && group.cases.every(check => check && typeof check.id === 'string' && typeof check.label === 'string' && text(check.recordedAt) && (check.durationMs == null || (Number.isFinite(check.durationMs) && check.durationMs >= 0)) && ['passed', 'failed', 'not_run'].includes(check.status)))
}
function date(value?: string | null) {
 return value && !Number.isNaN(Date.parse(value)) ? new Date(value).toLocaleString() : 'Never run'
}
export function TestStatusPage() {
 const [report, setReport] = useState<Report>(emptyReport)
 const [error, setError] = useState('')
 const [refresh, setRefresh] = useState(0)
 const [loading, setLoading] = useState(true)
 useEffect(() => {
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout>
  async function load() {
   try {
    const response = await fetch('/test-status.json', { signal: controller.signal, cache: 'no-store' })
    if (response.status === 404) {
     setReport(emptyReport); setError('No recorded results are available yet. These tests are not run.')
    } else {
     if (!response.ok) throw Error()
     const data: unknown = await response.json()
     if (!validReport(data)) throw Error()
     if (!controller.signal.aborted) { setReport(data); setError('') }
    }
   } catch { if (!controller.signal.aborted) setError('Could not refresh results. Showing the last available report.') }
   finally {
    if (!controller.signal.aborted) { setLoading(false); timer = setTimeout(load, 15000) }
   }
  }
  setLoading(true); void load()
  return () => { controller.abort(); clearTimeout(timer) }
 }, [refresh])
 const all = report.groups.flatMap(group => group.cases)
 const categories = [...new Set(report.groups.map(group => group.category || 'Other tests'))]
 return <div className="portal-section test-status-page">
  <header className="test-status-header"><div><h1>Test status</h1><p>{report.title}</p></div><button className="btn-secondary" type="button" disabled={loading} onClick={() => setRefresh(value => value + 1)}>{loading ? 'Refreshing…' : 'Refresh results'}</button></header>
  <p>Recorded test outcomes. Green passed, red failed, gray not run. Results from changed source files are shown as not run until checked again.</p>
  <section className="test-status-overview" aria-label="All test results" style={{ background: fill(all) }}>
   <strong>{all.length} checks</strong><CountSummary cases={all} />
  </section>
  <p className="muted">{report.environment || 'No run recorded'} · Report updated: {report.generatedAt ? date(report.generatedAt) : 'Not yet'} · Refreshes every 15 seconds.</p>
  {error && <p role="status">{error}</p>}
  <div className="test-status-groups">
   {categories.map(category => {
    const groups = report.groups.filter(group => (group.category || 'Other tests') === category)
    const cases = groups.flatMap(group => group.cases)
    return <details key={category} className="test-status-group test-status-category">
     <summary style={{ background: fill(cases) }}><span className="test-status-group-name">{category}</span><CountSummary cases={cases} /></summary>
     <div className="test-status-category-body">{groups.map(group => <details key={group.id} className="test-status-group">
    <summary style={{ background: fill(group.cases) }}><span className="test-status-group-name">{group.label}</span><CountSummary cases={group.cases} /></summary>
    <div className="test-status-group-body">
     <p className="muted">Last run: {date(group.recordedAt)}{group.revision ? ` · Revision ${group.revision}` : ''}{group.stale ? ' · Source changed — run these checks again.' : ''}</p>
     <ul aria-label={group.label + ' checks'}>{group.cases.map(check => <li key={check.id} className={`test-status-check test-status-${check.status.replace('_', '-')}`}>
      <span className="test-status-check-label">{check.label}</span><strong>{labels[check.status]}</strong>
      {check.recordedAt && <small>{date(check.recordedAt)}{typeof check.durationMs === 'number' ? ` · ${(check.durationMs / 1000).toFixed(2)}s` : ''}</small>}
     </li>)}</ul>
    </div>
   </details>)}</div>
    </details>
   })}
  </div>
 </div>
}
