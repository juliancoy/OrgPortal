import { portalUrl } from '../../config/portalBase'
export function EmbeddedOrganizationChat({ id, slug, name }: { id: string; slug: string; name: string }) {
  return <iframe key={id} title={`${name} chat messages and composer`}
      src={portalUrl(`/chat?start=org&org=${encodeURIComponent(slug)}`)}
      allow="camera; microphone; fullscreen" style={{ width: '100%', height: 'min(780px, 85vh)', minHeight: 460, border: 0, borderRadius: 8 }} />
}
