import { portalPath } from '../../config/portalBase'

export function AboutPage() {
  return (
    <section className="panel">
      <h1 className="serif" style={{ marginTop: 0 }}>
        About
      </h1>
      <p className="sans" style={{ color: 'var(--text-muted)' }}>
        Meet the team behind Ballot.
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
