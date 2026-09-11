import { Link } from 'react-router-dom'
import type { SpecialtyResource } from '../../config/specialtyResources'

function isInternalHref(href: string) {
  return href.startsWith('/') && !href.startsWith('//')
}

export function SpecialtyResourcesPanel({ resources, compact = false }: { resources: SpecialtyResource[]; compact?: boolean }) {
  if (!resources.length) return null
  return <section className="tenant-home-resources" aria-labelledby="tenant-specialty-resources-title">
    <div className="tenant-home-section-heading">
      <div>
        <p className="tenant-home-eyebrow">Resources</p>
        <h2 id="tenant-specialty-resources-title">Specialty Resources</h2>
      </div>
      {compact ? <Link to="/resources">View All</Link> : null}
    </div>
    <div className="tenant-home-resource-list">
      {resources.map((resource) => {
        const content = <>
          {resource.category ? <span>{resource.category}</span> : null}
          <strong>{resource.label}</strong>
          {resource.description ? <small>{resource.description}</small> : null}
        </>
        return isInternalHref(resource.href)
          ? <Link className="tenant-home-resource" to={resource.href} key={resource.id}>{content}</Link>
          : <a className="tenant-home-resource" href={resource.href} target={resource.external ? '_blank' : undefined} rel={resource.external ? 'noreferrer' : undefined} key={resource.id}>{content}</a>
      })}
    </div>
  </section>
}
