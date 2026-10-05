import { portalUrl } from '../../config/portalBase'
export function EmbeddedOrganizationChat({ id, slug, name }: { id: string; slug: string; name: string }) {
  return <section className="portal-card" aria-label={`${name} organization chat`} style={{ display: 'grid', gap: '0.75rem', minWidth: 0 }}>
    <h2 style={{ margin: 0, fontSize: '1rem' }}>{name} Chat</h2>
    <iframe key={id} title={`${name} chat messages and composer`}
      src={portalUrl(`/chat?start=org&org=${encodeURIComponent(slug)}`)}
      allow="camera; microphone; fullscreen" style={{ width: '100%', height: 'min(780px, 85vh)', minHeight: 460, border: 0, borderRadius: 8 }} />
  </section>
}
