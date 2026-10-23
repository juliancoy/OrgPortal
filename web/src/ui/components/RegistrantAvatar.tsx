import { useState } from 'react'

export function RegistrantAvatar({ name, photoUrl }: { name: string; photoUrl: string | null }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null)
  const initials = name.split(/\s+/).slice(0, 2).map((word) => word[0]).join('').toUpperCase()
  return photoUrl && failedUrl !== photoUrl ? (
    <img src={photoUrl} alt="" width={44} height={44} loading="lazy" referrerPolicy="no-referrer"
      onError={() => setFailedUrl(photoUrl)} className="public-event-registrant-avatar" />
  ) : (
    <span aria-hidden="true" className="public-event-registrant-avatar public-event-registrant-initials">{initials || '?'}</span>
  )
}

