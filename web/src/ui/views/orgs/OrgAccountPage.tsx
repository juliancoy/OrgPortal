import { useEffect, useState } from 'react'

export function OrgAccountPage() {
  const [email, setEmail] = useState('saferstreets@example.com')
  const [contactName, setContactName] = useState('Org Admin')

  useEffect(() => {
    document.title = 'Org Portal • Org account'
  }, [])

  return (
    <section className="panel">
      <h1 style={{ marginTop: 0 }}>Account (org)</h1>
      <p className="muted" style={{ marginTop: 0 }}>
        Static demo form.
      </p>
      <div style={{ display: 'grid', gap: '0.6rem' }}>
        <div>
          <label className="muted" htmlFor="name">
            Contact name
          </label>
          <input id="name" value={contactName} onChange={(e) => setContactName(e.target.value)} style={{ width: '100%' }} />
        </div>
        <div>
          <label className="muted" htmlFor="email">
            Email
          </label>
          <input id="email" value={email} onChange={(e) => setEmail(e.target.value)} style={{ width: '100%' }} />
        </div>
        <button type="button" onClick={() => alert('Saved (mock)')}>Save account</button>
      </div>
    </section>
  )
}
