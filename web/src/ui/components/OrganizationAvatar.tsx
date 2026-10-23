import { useState, type CSSProperties, type ReactNode } from 'react'
import { personnelClasses, personnelSchemes, type PersonnelScheme, type PersonnelClass } from '../../../../shared/organizationPersonnel'
import './organization-avatar.css'

export function OrganizationAvatar({ name, src, status, className = '', children, scheme = 'meetup', titles = [] }: {
  name: string; src?: string | null; status: PersonnelClass | null; className?: string; children?: ReactNode; scheme?: PersonnelScheme; titles?: string[]
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  const assignedClass = Object.values(personnelSchemes[scheme].classes).find(value => titles.some(title => title.toLowerCase() === value.label.toLowerCase()))
  const classification = scheme !== 'meetup' ? assignedClass : status ? personnelClasses[status] : null
  const label = classification?.label || 'Status unavailable'
  return <span className={`organization-avatar ${className}`} data-personnel-class={status || 'unknown'}
    style={{ '--personnel-color': classification?.color || 'var(--text-muted)' } as CSSProperties}
    role="img" aria-label={`${name} · ${label}`} title={`${name} · ${label}`}>
    {children || (src && failedSrc !== src
      ? <img src={src} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailedSrc(src)} />
      : <span aria-hidden="true">{name.trim().slice(0, 1).toUpperCase() || '?'}</span>)}
  </span>
}

export function OrganizationPersonnelLegend({scheme = 'meetup'}: {scheme?: PersonnelScheme} = {}) {
  return <details className="organization-personnel-legend"><summary>Personnel classes</summary>
    <p>{personnelSchemes[scheme].label}. {scheme === 'meetup' ? 'Avatar colors show recorded participation.' : 'People may hold several classes. Classes describe responsibilities and do not grant portal permissions.'}</p>
    <ul>{Object.entries(personnelSchemes[scheme].classes).map(([key, value]) => <li key={key}>
      <span className="organization-personnel-swatch" style={{ '--personnel-color': value.color } as CSSProperties} aria-hidden="true" />{value.label}{'description' in value && <span> · {value.description}</span>}
    </li>)}</ul>
  </details>
}
