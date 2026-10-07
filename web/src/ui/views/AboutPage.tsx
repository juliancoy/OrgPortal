import { useEffect } from 'react'
import './aboutOrgPortal.css'
import { Link } from 'react-router-dom'
import { getActivePortalProfileConfig } from '../../config/portalFeatures'
import { useDomainTenant } from '../../config/timebankCommunity'
import { portalPath } from '../../config/portalBase'

export function AboutPage() {
  const tenant = useDomainTenant()
  if (getActivePortalProfileConfig().id === 'orgportal') return <AboutOrgPortal />
  return (
    <section className="panel">
      <h1 className="serif" style={{ marginTop: 0 }}>
        About
      </h1>
      <p className="sans" style={{ color: 'var(--text-muted)' }}>
        Meet the team behind {tenant?.name || 'Code Collective'}.
      </p>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '1.5rem',
          marginTop: '1.5rem',
        }}
      >
        <article
          style={{
            background: 'var(--panel)',
            border: '1px solid var(--border)',
            borderRadius: '18px',
            padding: '1.25rem',
            boxShadow: 'var(--shadow-card)',
            textAlign: 'center',
          }}
        >
          <img
            src={portalPath('/julian.jpeg')}
            alt="Julian"
            style={{
              width: '120px',
              height: '120px',
              borderRadius: '50%',
              objectFit: 'cover',
              border: '2px solid #efe9db',
              marginBottom: '0.75rem',
            }}
          />
          <h3 style={{ margin: 0, fontSize: '1.2rem' }}>Julian</h3>
          <p style={{ margin: '0.35rem 0 0', color: 'var(--text-muted)', fontSize: '0.95rem' }}>Programmer</p>
        </article>
        <article
          style={{
            background: 'var(--panel)',
            border: '1px solid var(--border)',
            borderRadius: '18px',
            padding: '1.25rem',
            boxShadow: 'var(--shadow-card)',
            textAlign: 'center',
          }}
        >
          <img
            src={portalPath('/dario.jpeg')}
            alt="Dario"
            style={{
              width: '120px',
              height: '120px',
              borderRadius: '50%',
              objectFit: 'cover',
              border: '2px solid #efe9db',
              marginBottom: '0.75rem',
            }}
          />
          <h3 style={{ margin: 0, fontSize: '1.2rem' }}>Dario</h3>
          <p style={{ margin: '0.35rem 0 0', color: 'var(--text-muted)', fontSize: '0.95rem' }}>Founder</p>
        </article>
      </div>
    </section>
  )
}

function AboutOrgPortal() {
  useEffect(() => { document.title = 'About OrgPortal' }, [])
  return <article className="about-orgportal">
    <header className="about-orgportal-intro">
      <p className="about-orgportal-eyebrow">Shared tools. Distinct communities.</p>
      <h1>About OrgPortal</h1>
      <p className="about-orgportal-lead">Communities need a place to organize without having to build their own software. OrgPortal brings people, organizations, events, and conversations together while giving each community room to be itself.</p>
    </header>

    <section aria-labelledby="about-need">
      <h2 id="about-need">Why a shared portal?</h2>
      <p>Many groups rely on a patchwork of websites, spreadsheets, event listings, and chat channels. People have to rediscover the same organizations and maintain separate accounts, while organizers repeat the work of keeping directories and participation tools running.</p>
      <p>OrgPortal provides a common foundation. A community can have its own name, logo, colors, domain, and enabled tools. Members can find related organizations and opportunities through the shared platform, then choose which communities to participate in.</p>
      <p>The homepage at orgportal.cc is a neutral entry point. Code Collective, Baltimore MedTech, Deism, LifeTech, and the Timebank communities have their own destinations. Choosing a community is explicit; visiting the platform does not enroll you in one.</p>
    </section>

    <section aria-labelledby="about-architecture">
      <h2 id="about-architecture">How the pieces fit together</h2>
      <p>OrgPortal uses a shared web application with community-specific configuration. The hostname or portal route selects the community’s branding and available features. Backend services handle organization data, conversations, and authentication.</p>
      <ol className="about-orgportal-layers" aria-label="OrgPortal architecture">
        <li><strong>Community portals</strong><span>Distinct domains, branding, navigation, and enabled tools on a shared frontend.</span></li>
        <li><strong>OrgPortal services</strong><span>Organizations, invitations, membership, roles, directories, events, and community workflows. Chat has a dedicated backend service.</span></li>
        <li><strong>PIdP · People’s Identity Provider</strong><span>Accounts, sign-in, sessions, core identity, account security, and authorization of connected clients.</span></li>
      </ol>
      <p>The production frontend and backend services run on Cloudflare Workers, with organization data in D1 and separate identity and chat services. A separate service is an operational boundary: it does not require a separate product experience. Timebank is a feature of the organization backend, with community-specific boards and hours ledgers.</p>
      <p>Sharing software reduces duplicated maintenance and lets improvements reach multiple communities. It also creates a shared responsibility: common services need careful permission checks and reliable operation. Distinct branding and domains do not mean each community has an independent deployment or identity system.</p>
    </section>

    <section aria-labelledby="about-pidp">
      <h2 id="about-pidp">One identity, membership by choice</h2>
      <p>PIdP separates the question “Who are you?” from “What may you do here?” It manages reusable identity and authentication. OrgPortal uses that identity, then checks current membership and permissions for the organization or community involved.</p>
      <div className="about-orgportal-responsibilities">
        <div><h3>PIdP owns identity</h3><p>Credentials, linked sign-in providers, verification and recovery, authentication sessions, core profile information, and account security.</p><p>For connected applications and tools, PIdP handles OAuth consent, token issuance, and revocation.</p></div>
        <div><h3>OrgPortal owns participation</h3><p>Organizations, invitations, membership, organization roles, member profiles, governance, and permissions for community tools.</p><p>Events, calendars, galleries, conversations, and Timebank activity belong to the application’s workflows rather than the identity store.</p></div>
      </div>
      <p>Signing in identifies you across the platform. It does not automatically join a community, grant an administrator role, or open private organization data. Likewise, consenting to a connected tool gives it an authorized scope; OrgPortal still checks what your account can do.</p>
      <p>Separating these responsibilities lets account security evolve without rebuilding every community portal. It also keeps community-specific roles and activity out of the core identity model. OrgPortal may provide a branded sign-in entry point, while identity operations go through PIdP.</p>
    </section>

    <section aria-labelledby="about-shared">
      <h2 id="about-shared">What is shared—and what stays local to a community?</h2>
      <p>The platform shares its application code, identity foundation, and service infrastructure. Communities keep their own presentation, membership decisions, roles, enabled features, and community-specific workflows. Access to protected information depends on permissions, not simply on having an account.</p>
      <p>This is a shared platform with distinct communities. It does not imply independent hosting, separate identity issuers, or automatic federation with other platforms. Public discovery helps people find a place to participate; membership and authority remain explicit.</p>
      <div className="about-orgportal-actions"><Link className="btn-primary" to="/communities">Find your community</Link><Link className="btn-secondary" to="/orgs">Explore organizations</Link></div>
    </section>
  </article>
}
