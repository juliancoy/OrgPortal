function featureLabel(feature: string) {
  if (feature === 'timebank') return 'Timebank'
  if (feature === 'directory') return 'Directory'
  if (feature === 'events') return 'Events'
  if (feature === 'chat') return 'Messages'
  if (feature === 'ubi') return 'Civic finance'
  return feature.replace(/[-_]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

export function OrganizationPortalSections({ features, name }: { features: string[]; name: string }) {
  const sections = features.filter(feature => !['ubi', 'calendar'].includes(feature))
  if (!sections.length) return null
  return <section className="tenant-home-grid" aria-label={`${name} portal sections`}>
    {sections.map(feature => <article className="tenant-home-card" key={feature}>
      <span>{featureLabel(feature)}</span>
      <h2>{feature === 'events' ? 'Events and registration' : feature === 'chat' ? 'Messages' : featureLabel(feature)}</h2>
      <p>{feature === 'events' ? 'Publish events, collect registrations, and keep attendance visible.' : feature === 'chat' ? 'Keep member conversations close to the organization.' : `Use the ${featureLabel(feature).toLowerCase()} tools configured for this tenant.`}</p>
    </article>)}
  </section>
}
