import { useState } from 'react'
import Share from 'lucide-react/dist/esm/icons/share.mjs'

export function OrganizationShareButton({ url }: { url: string }) {
  const [status, setStatus] = useState<'copied' | 'error' | null>(null)
  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url)
      setStatus('copied')
    } catch {
      setStatus('error')
    }
  }
  return <span className="organization-share">
    <button type="button" className="btn-secondary" aria-label="Share organization: copy link" title="Copy organization link" onClick={() => void copyLink()}>
      <Share size={18} aria-hidden="true" /> Share
    </button>
    <span role="status" aria-live="polite">{status === 'copied' ? 'Link copied' : status === 'error' ? <>Could not copy. <a href={url}>Organization link</a></> : ''}</span>
  </span>
}
