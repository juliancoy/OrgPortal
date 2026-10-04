import { Link } from 'react-router-dom'
import { TENANT_BRAND_RESOURCE } from '../../config/specialtyResources'

export function OrganizationBrandGuide({ href }: { href?: string }) {
  const content = <><strong>{TENANT_BRAND_RESOURCE.label}</strong><small>{TENANT_BRAND_RESOURCE.description}</small></>
  return <section className="tenant-home-resources" aria-label="Organization branding">
    <div className="tenant-home-section-heading"><h2>Organization branding</h2></div>
    <div className="tenant-home-resource-list">
      {href ? <a className="tenant-home-resource" href={href}>{content}</a> : <Link className="tenant-home-resource" to="/branding">{content}</Link>}
    </div>
  </section>
}
