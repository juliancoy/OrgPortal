import { Footer } from '../shell/Footer'
import { Header } from '../shell/Header'

type Department = {
  name: string
  mandate: string
  domain: string
}

const DEPARTMENTS: Department[] = [
  {
    name: 'Peacekeeping Force',
    domain: 'Security',
    mandate: 'Maintains defensive readiness and civil peacekeeping capacity under democratic fiscal direction.',
  },
  {
    name: 'Law Enforcement',
    domain: 'Security',
    mandate: 'Protects public safety, due process, and community order while remaining accountable to civic oversight.',
  },
  {
    name: 'Faith',
    domain: 'Meaning',
    mandate: 'Supports pluralistic spiritual, ethical, and chaplaincy services without establishing a single creed.',
  },
  {
    name: 'Communications',
    domain: 'Coordination',
    mandate: 'Maintains public communications, emergency messaging, civic media, and reliable information channels.',
  },
  {
    name: 'Culture',
    domain: 'Civic Life',
    mandate: 'Funds arts, heritage, public memory, education-adjacent culture, and shared civic rituals.',
  },
  {
    name: 'Housing',
    domain: 'Shelter',
    mandate: 'Coordinates shelter policy, housing supply, tenant stability, and homelessness prevention.',
  },
  {
    name: 'Dept of Housing',
    domain: 'Shelter',
    mandate: 'Operates as the explicit department account target for housing budgets, wage schedules, and housing programs.',
  },
  {
    name: 'Energy',
    domain: 'Infrastructure',
    mandate: 'Plans energy resilience, utility access, generation, distribution, and public-interest infrastructure.',
  },
  {
    name: 'Department of Industry',
    domain: 'Production',
    mandate: 'Coordinates industrial capacity, productive infrastructure, supply chains, and public-interest enterprise development.',
  },
]

export function DepartmentsPage() {
  return (
    <div className="portal-shell">
      <Header />
      <main className="portal-main">
        <div className="portal-container">
          <section className="portal-hero">
            <div>
              <span className="portal-pill">State Departments</span>
              <h1>Departments</h1>
              <p className="portal-muted">
                The departments below represent the public institutions that monetary policy should be able to fund directly
                through treasury accounts, fiscal allocations, and wage schedules.
              </p>
            </div>
          </section>

          <section className="portal-section" id="departments">
            <div className="portal-section-header">
              <h2>Directly financed departments</h2>
              <p className="portal-muted" style={{ maxWidth: 720 }}>
                These are policy targets today. Dedicated treasury accounts, budget disbursement, and personnel schedules still
                need implementation before they become executable fiscal entities.
              </p>
            </div>
            <div className="portal-grid">
              {DEPARTMENTS.map((department) => (
                <article key={department.name} className="portal-card" style={{ display: 'grid', gap: 10 }}>
                  <span className="portal-pill">{department.domain}</span>
                  <h2 style={{ margin: 0 }}>{department.name}</h2>
                  <p className="portal-muted" style={{ margin: 0 }}>{department.mandate}</p>
                </article>
              ))}
            </div>
          </section>
        </div>
      </main>
      <Footer />
    </div>
  )
}
