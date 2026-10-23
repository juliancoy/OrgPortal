import { useState, type CSSProperties, type ReactNode } from 'react'
import { personnelClasses, type PersonnelClass } from '../../../../shared/organizationPersonnel'
import './organization-avatar.css'

export function OrganizationAvatar({ name, src, status, className = '', children }: {
  name: string; src?: string | null; status: PersonnelClass | null; className?: string; children?: ReactNode
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  const classification = status ? personnelClasses[status] : null
  const label = classification?.label || 'Status unavailable'
  return <span className={`organization-avatar ${className}`} data-personnel-class={status || 'unknown'}
    style={{ '--personnel-color': classification?.color || 'var(--text-muted)' } as CSSProperties}
    role="img" aria-label={`${name} · ${label}`} title={`${name} · ${label}`}>
    {children || (src && failedSrc !== src
      ? <img src={src} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailedSrc(src)} />
      : <span aria-hidden="true">{name.trim().slice(0, 1).toUpperCase() || '?'}</span>)}
  </span>
}

export function OrganizationPersonnelLegend() {
  return <details className="organization-personnel-legend"><summary>Avatar status colors</summary>
    <ul>{Object.entries(personnelClasses).map(([key, value]) => <li key={key}>
      <span className="organization-personnel-swatch" style={{ '--personnel-color': value.color } as CSSProperties} aria-hidden="true" />{value.label}
    </li>)}</ul>
  </details>
}
