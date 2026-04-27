import { useEffect, useRef, useState } from 'react'
import type { FormEvent, RefObject } from 'react'
import { useAuth } from '../../app/AppProviders'
import { pidpAppLoginUrl } from '../../config/pidp'

type SubmissionResult = {
  id?: string
  extracted_name?: string | null
  extracted_email?: string | null
  extracted_company?: string | null
  scan_kind_requested?: string | null
  scan_kind?: string | null
  created_target_type?: string | null
  created_target_id?: string | null
  created_target_slug?: string | null
  created_target_name?: string | null
  created_targets?: Array<{
    type?: string | null
    id?: string | null
    slug?: string | null
    name?: string | null
    url?: string | null
    summary?: string | null
  }>
  clarification_required?: boolean
  clarification_message?: string | null
  processing_status?: string | null
  pidp_user_created?: boolean
  notification_email_sent?: boolean
  notification_error?: string | null
  created_at?: string | null
}

function formatScanResult(scan: SubmissionResult): string {
  const targets = Array.isArray(scan.created_targets) && scan.created_targets.length > 0
    ? scan.created_targets
    : scan.created_target_type
      ? [
          {
            type: scan.created_target_type,
            id: scan.created_target_id || null,
            slug: scan.created_target_slug || null,
            name: scan.created_target_name || null,
          },
        ]
      : []
  if (scan.clarification_required) {
    return 'Clarification required before record creation'
  }
  if (targets.length > 0) {
    const labeled = targets.map((target) => {
      const typeLabel = target.type || 'resource'
      const nameLabel = target.name || target.slug || target.id || 'created'
      return `${typeLabel}: ${nameLabel}`
    })
    return `Created ${labeled.join(' · ')}`
  }
  if (scan.created_target_type) {
    return `Created ${scan.created_target_type}`
  }
  if (scan.scan_kind === 'person') {
    if (scan.pidp_user_created) return 'Created person profile and sent invite'
    return 'Matched existing person profile'
  }
  if (scan.scan_kind === 'event') return 'Processed event details'
  if (scan.scan_kind === 'organization') return 'Processed organization details'
  return 'Processed scan'
}

export function BusinessCardIntakePage() {
  const { token } = useAuth()
  const nextUrl = window.location.href
  const [file, setFile] = useState<File | null>(null)
  const [scanKind, setScanKind] = useState<'auto' | 'person' | 'organization' | 'event'>('auto')
  const [notes, setNotes] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isLoadingHistory, setIsLoadingHistory] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<SubmissionResult | null>(null)
  const [history, setHistory] = useState<SubmissionResult[]>([])
  const [filterMode, setFilterMode] = useState<'all' | 'clarification'>('all')
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({})
  const [imageLoading, setImageLoading] = useState<Record<string, boolean>>({})
  const [imageErrors, setImageErrors] = useState<Record<string, string>>({})
  const [rerunBusy, setRerunBusy] = useState<Record<string, boolean>>({})
  const [hoverPreviewUrl, setHoverPreviewUrl] = useState<string | null>(null)
  const imageUrlsRef = useRef<Record<string, string>>({})
  const cameraInputRef = useRef<HTMLInputElement | null>(null)
  const galleryInputRef = useRef<HTMLInputElement | null>(null)
  const selectedPreviewRef = useRef<string | null>(null)
  const hoverPreviewHideTimerRef = useRef<number | null>(null)
  const [selectedPreviewUrl, setSelectedPreviewUrl] = useState<string | null>(null)

  useEffect(() => {
    imageUrlsRef.current = imageUrls
  }, [imageUrls])

  useEffect(() => {
    return () => {
      Object.values(imageUrlsRef.current).forEach((url) => URL.revokeObjectURL(url))
      if (selectedPreviewRef.current) {
        URL.revokeObjectURL(selectedPreviewRef.current)
      }
      if (hoverPreviewHideTimerRef.current !== null) {
        window.clearTimeout(hoverPreviewHideTimerRef.current)
      }
    }
  }, [])

  function openHoverPreview(url: string) {
    if (hoverPreviewHideTimerRef.current !== null) {
      window.clearTimeout(hoverPreviewHideTimerRef.current)
      hoverPreviewHideTimerRef.current = null
    }
    setHoverPreviewUrl(url)
  }

  function closeHoverPreviewSoon() {
    if (hoverPreviewHideTimerRef.current !== null) {
      window.clearTimeout(hoverPreviewHideTimerRef.current)
    }
    hoverPreviewHideTimerRef.current = window.setTimeout(() => {
      setHoverPreviewUrl(null)
      hoverPreviewHideTimerRef.current = null
    }, 120)
  }

  function resetFileInputs() {
    if (cameraInputRef.current) cameraInputRef.current.value = ''
    if (galleryInputRef.current) galleryInputRef.current.value = ''
  }

  function applySelectedFile(nextFile: File | null) {
    setFile(nextFile)
    setError(null)
    if (selectedPreviewRef.current) {
      URL.revokeObjectURL(selectedPreviewRef.current)
      selectedPreviewRef.current = null
    }
    if (!nextFile) {
      setSelectedPreviewUrl(null)
      return
    }
    const previewUrl = URL.createObjectURL(nextFile)
    selectedPreviewRef.current = previewUrl
    setSelectedPreviewUrl(previewUrl)
  }

  function openPicker(ref: RefObject<HTMLInputElement | null>) {
    if (!ref.current) return
    ref.current.value = ''
    ref.current.click()
  }

  async function loadScanImage(submissionId: string) {
    if (!token || !submissionId) return
    if (imageUrls[submissionId] || imageLoading[submissionId]) return
    setImageLoading((previous) => ({ ...previous, [submissionId]: true }))
    setImageErrors((previous) => ({ ...previous, [submissionId]: '' }))
    try {
      const response = await fetch(`/api/org/api/network/scans/${encodeURIComponent(submissionId)}/image`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!response.ok) {
        const text = await response.text().catch(() => '')
        throw new Error(text || `Unable to load image (${response.status})`)
      }
      const blob = await response.blob()
      const objectUrl = URL.createObjectURL(blob)
      setImageUrls((previous) => {
        const priorUrl = previous[submissionId]
        if (priorUrl) URL.revokeObjectURL(priorUrl)
        return { ...previous, [submissionId]: objectUrl }
      })
    } catch (err) {
      setImageErrors((previous) => ({
        ...previous,
        [submissionId]: err instanceof Error ? err.message : 'Unable to load image',
      }))
    } finally {
      setImageLoading((previous) => ({ ...previous, [submissionId]: false }))
    }
  }

  async function rerunScan(scan: SubmissionResult) {
    if (!token || !scan.id) {
      setError('Unable to rerun this scan.')
      return
    }
    if (rerunBusy[scan.id]) return
    setError(null)
    setRerunBusy((previous) => ({ ...previous, [scan.id!]: true }))
    try {
      const imageResponse = await fetch(`/api/org/api/network/scans/${encodeURIComponent(scan.id)}/image`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!imageResponse.ok) {
        const text = await imageResponse.text().catch(() => '')
        throw new Error(text || `Unable to load original image (${imageResponse.status})`)
      }
      const imageBlob = await imageResponse.blob()
      const imageContentType = (imageResponse.headers.get('content-type') || 'image/jpeg').split(';', 1)[0].trim()
      const extension = imageContentType === 'image/png' ? 'png' : imageContentType === 'image/webp' ? 'webp' : 'jpg'
      const uploadFile = new File([imageBlob], `rerun-${scan.id}.${extension}`, { type: imageContentType })

      const formData = new FormData()
      formData.append('image', uploadFile)
      formData.append('scan_kind', scan.scan_kind_requested || 'auto')
      formData.append('notes', `Rerun of scan ${scan.id}`)

      const rerunResponse = await fetch('/api/org/api/network/scans', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      })
      if (!rerunResponse.ok) {
        const text = await rerunResponse.text().catch(() => '')
        throw new Error(text || `Rerun failed (${rerunResponse.status})`)
      }
      const payload = (await rerunResponse.json()) as SubmissionResult
      setResult(payload)
      setHistory((prev) => [payload, ...prev])
      if (payload.id) {
        void loadScanImage(payload.id)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to rerun scan')
    } finally {
      setRerunBusy((previous) => ({ ...previous, [scan.id!]: false }))
    }
  }

  const filteredHistory = history.filter((scan) => {
    if (filterMode === 'clarification') return Boolean(scan.clarification_required)
    return true
  })

  function scanTargets(scan: SubmissionResult) {
    if (Array.isArray(scan.created_targets) && scan.created_targets.length > 0) {
      return scan.created_targets
    }
    if (scan.created_target_type) {
      const fallbackUrl =
        scan.created_target_type === 'organization' && scan.created_target_slug
          ? `/orgs/${encodeURIComponent(scan.created_target_slug)}`
          : scan.created_target_type === 'event' && scan.created_target_slug
            ? `/events/${encodeURIComponent(scan.created_target_slug)}`
            : null
      return [
        {
          type: scan.created_target_type,
          id: scan.created_target_id || null,
          slug: scan.created_target_slug || null,
          name: scan.created_target_name || null,
          url: fallbackUrl,
        },
      ]
    }
    return []
  }

  function primaryTargetUrl(scan: SubmissionResult): string | null {
    const targets = scanTargets(scan)
    const firstWithUrl = targets.find((target) => Boolean(target.url))
    return firstWithUrl?.url ?? null
  }

  useEffect(() => {
    if (!token) return
    const ids: string[] = []
    if (result?.id) ids.push(result.id)
    for (const scan of filteredHistory.slice(0, 24)) {
      if (scan.id) ids.push(scan.id)
    }
    for (const submissionId of ids) {
      if (imageUrls[submissionId] || imageLoading[submissionId]) continue
      void loadScanImage(submissionId)
    }
  }, [token, result, filteredHistory, imageUrls, imageLoading])

  useEffect(() => {
    if (!token) {
      setHistory([])
      return
    }
    let cancelled = false
    async function loadHistory() {
      try {
        setIsLoadingHistory(true)
        const response = await fetch('/api/org/api/network/scans?limit=100', {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!response.ok) {
          throw new Error(`Unable to load scans (${response.status})`)
        }
        const payload = (await response.json()) as SubmissionResult[]
        if (!cancelled) {
          setHistory(Array.isArray(payload) ? payload : [])
        }
      } catch {
        if (!cancelled) {
          setHistory([])
        }
      } finally {
        if (!cancelled) {
          setIsLoadingHistory(false)
        }
      }
    }
    loadHistory().catch(() => {})
    return () => {
      cancelled = true
    }
  }, [token])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setResult(null)
    if (!token) {
      setError('You must be logged in.')
      return
    }
    if (!file) {
      setError('Please choose an image file.')
      return
    }

    const formData = new FormData()
    formData.append('image', file)
    formData.append('scan_kind', scanKind)
    if (notes.trim()) formData.append('notes', notes.trim())

    try {
      setIsSubmitting(true)
      const response = await fetch('/api/org/api/network/scans', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      })
      if (!response.ok) {
        const text = await response.text().catch(() => '')
        throw new Error(text || `Submission failed (${response.status})`)
      }
      const payload = (await response.json()) as SubmissionResult
      setResult(payload)
      setHistory((prev) => [payload, ...prev])
      setFile(null)
      if (selectedPreviewRef.current) {
        URL.revokeObjectURL(selectedPreviewRef.current)
        selectedPreviewRef.current = null
      }
      setSelectedPreviewUrl(null)
      resetFileInputs()
      setNotes('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Submission failed')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <section className="panel">
      <h1 style={{ marginTop: 0 }}>Scan Intake</h1>
      <p className="muted">Upload an image of a person card, event flyer, or organization sheet to create records.</p>
      {!token ? (
        <p className="muted" style={{ marginTop: 0 }}>
          Sign in to submit cards.{' '}
          <a className="portal-button" href={pidpAppLoginUrl(nextUrl)}>
            Log In
          </a>
        </p>
      ) : null}

      <div className="scan-intake-layout">
        <div>
          <form onSubmit={handleSubmit}>
            <div style={{ display: 'grid', gap: '0.75rem' }}>
              <label>
                Scan image
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.35rem' }}>
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => openPicker(cameraInputRef)}
                  >
                    Take Photo
                  </button>
                  <button
                    type="button"
                    onClick={() => openPicker(galleryInputRef)}
                  >
                    Choose from Gallery
                  </button>
                </div>
                <input
                  ref={cameraInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  style={{ display: 'none' }}
                  onChange={(event) => applySelectedFile(event.target.files?.[0] ?? null)}
                />
                <input
                  ref={galleryInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  style={{ display: 'none' }}
                  onChange={(event) => applySelectedFile(event.target.files?.[0] ?? null)}
                />
                <div className="muted" style={{ marginTop: '0.35rem' }}>
                  {file ? `Selected: ${file.name}` : 'No image selected.'}
                </div>
                {selectedPreviewUrl ? (
                  <div style={{ marginTop: '0.6rem', display: 'grid', gap: '0.35rem' }}>
                    <span className="muted">Image to be processed:</span>
                    <img
                      src={selectedPreviewUrl}
                      alt="Selected scan preview"
                      style={{ width: '100%', maxHeight: '260px', objectFit: 'contain', borderRadius: 8 }}
                    />
                  </div>
                ) : null}
              </label>

              <label>
                Scan type
                <select value={scanKind} onChange={(event) => setScanKind(event.target.value as 'auto' | 'person' | 'organization' | 'event')}>
                  <option value="auto">Auto-detect</option>
                  <option value="person">Person</option>
                  <option value="organization">Organization</option>
                  <option value="event">Event</option>
                </select>
              </label>

              <label>
                Notes (optional)
                <textarea
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  rows={4}
                  placeholder="Context for this contact"
                />
              </label>

              <button type="submit" className="btn-primary" disabled={isSubmitting}>
                {isSubmitting ? 'Submitting...' : 'Submit Scan'}
              </button>
            </div>
          </form>

          {error ? <p className="portal-chat-error">{error}</p> : null}

          {result ? (
            <div style={{ marginTop: '1rem' }}>
              <h2 style={{ marginBottom: '0.5rem' }}>Latest Result</h2>
              {result.clarification_required ? (
                <p className="portal-chat-error" style={{ marginTop: 0 }}>
                  {result.clarification_message || 'We could not confidently classify this scan. Please retry and choose the type explicitly.'}
                </p>
              ) : null}
              <ul style={{ paddingLeft: '1.2rem' }}>
                <li>Name: {result.extracted_name || 'n/a'}</li>
                <li>Email: {result.extracted_email || 'n/a'}</li>
                <li>Company: {result.extracted_company || 'n/a'}</li>
                <li>Requested type: {result.scan_kind_requested || 'auto'}</li>
                <li>Detected type: {result.scan_kind || 'n/a'}</li>
                <li>Status: {result.processing_status || 'processed'}</li>
                {result.created_target_type ? (
                  <li>
                    Created: {result.created_target_type} {result.created_target_name ? `(${result.created_target_name})` : ''}
                    {result.created_target_slug ? ` slug=${result.created_target_slug}` : ''}
                  </li>
                ) : null}
                <li>PIdP user created: {result.pidp_user_created ? 'yes' : 'no'}</li>
                <li>Email notification sent: {result.notification_email_sent ? 'yes' : 'pending/failed'}</li>
                {result.notification_error ? <li>Notification error: {result.notification_error}</li> : null}
              </ul>
              {scanTargets(result).length > 0 ? (
                <div style={{ display: 'grid', gap: '0.3rem', marginBottom: '0.5rem' }}>
                  <strong>Created elements ({scanTargets(result).length})</strong>
                  {scanTargets(result).map((target, index) => (
                    <div key={`${target.type || 'resource'}-${target.id || target.slug || index}`} style={{ fontSize: '0.9rem' }}>
                      <span style={{ textTransform: 'capitalize' }}>{target.type || 'resource'}</span>
                      {': '}
                      {target.url ? (
                        <a href={target.url}>{target.name || target.slug || target.id || target.url}</a>
                      ) : (
                        <span>{target.name || target.slug || target.id || 'created'}</span>
                      )}
                      {target.summary ? (
                        <div className="muted" style={{ fontSize: '0.82rem' }}>
                          {target.summary}
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : null}
              {result.id ? (
                <div style={{ display: 'grid', gap: '0.5rem' }}>
                  {imageLoading[result.id] ? <span className="muted">Loading original image…</span> : null}
                  {imageErrors[result.id] ? (
                    <p className="portal-chat-error" style={{ margin: 0 }}>{imageErrors[result.id]}</p>
                  ) : null}
                  {imageUrls[result.id] ? (
                    <img
                      src={imageUrls[result.id]}
                      alt="Original submitted scan"
                      style={{ maxWidth: '100%', maxHeight: '340px', objectFit: 'contain', borderRadius: 8 }}
                    />
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        <aside>
          <h2 style={{ marginTop: 0, marginBottom: '0.5rem' }}>Completed Scans</h2>
          <p className="muted" style={{ marginTop: 0 }}>
            Recent scans and their outcomes.
          </p>
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.65rem', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => setFilterMode('all')}
              aria-pressed={filterMode === 'all'}
            >
              All
            </button>
            <button
              type="button"
              onClick={() => setFilterMode('clarification')}
              aria-pressed={filterMode === 'clarification'}
            >
              Needs Clarification
            </button>
          </div>
          {isLoadingHistory ? <p className="muted">Loading scans...</p> : null}
          {!isLoadingHistory && filteredHistory.length === 0 ? <p className="muted">No scans in this filter.</p> : null}
          <div style={{ display: 'grid', gap: '0.65rem', maxHeight: '70vh', overflowY: 'auto', paddingRight: '0.2rem' }}>
            {filteredHistory.map((scan) => {
              const cardTargetUrl = primaryTargetUrl(scan)
              const targets = scanTargets(scan)
              const scanImageUrl = scan.id ? imageUrls[scan.id] : null
              return (
              <article
                key={scan.id || `${scan.created_at || ''}-${scan.extracted_email || ''}`}
                className="panel"
                style={{ margin: 0, cursor: cardTargetUrl ? 'pointer' : 'default' }}
                role={cardTargetUrl ? 'link' : undefined}
                tabIndex={cardTargetUrl ? 0 : undefined}
                onClick={
                  cardTargetUrl
                    ? (event) => {
                        const targetElement = event.target as HTMLElement | null
                        if (targetElement?.closest('a')) return
                        window.location.assign(cardTargetUrl)
                      }
                    : undefined
                }
                onKeyDown={
                  cardTargetUrl
                    ? (event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault()
                          window.location.assign(cardTargetUrl)
                        }
                      }
                    : undefined
                }
              >
                <div style={{ display: 'grid', gap: '0.3rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
                    <strong>{scan.extracted_name || scan.created_target_name || scan.extracted_company || 'Scan'}</strong>
                    {scan.id ? (
                      <button
                        type="button"
                        title="Run this scan again"
                        aria-label="Run this scan again"
                        onClick={(event) => {
                          event.preventDefault()
                          event.stopPropagation()
                          void rerunScan(scan)
                        }}
                        disabled={Boolean(rerunBusy[scan.id])}
                        style={{
                          minWidth: '2rem',
                          minHeight: '2rem',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          borderRadius: '999px',
                          fontSize: '1rem',
                          lineHeight: 1,
                          padding: 0,
                        }}
                      >
                        {rerunBusy[scan.id] ? '…' : '↻'}
                      </button>
                    ) : null}
                  </div>
                  <span className="muted" style={{ fontSize: '0.85rem' }}>
                    {scan.created_at ? new Date(scan.created_at).toLocaleString() : 'Unknown time'}
                  </span>
                  <span style={{ fontSize: '0.9rem' }}>{formatScanResult(scan)}</span>
                  <span className="muted" style={{ fontSize: '0.85rem' }}>
                    Type: {scan.scan_kind || 'n/a'} | Requested: {scan.scan_kind_requested || 'auto'}
                  </span>
                  {targets.length > 0 ? (
                    <div style={{ display: 'grid', gap: '0.2rem', fontSize: '0.85rem' }}>
                      <strong>Created elements ({targets.length})</strong>
                      {targets.map((target, index) => (
                        <span key={`${scan.id || 'scan'}-${target.type || 'resource'}-${target.id || target.slug || index}`}>
                          <span style={{ textTransform: 'capitalize' }}>{target.type || 'resource'}</span>
                          {': '}
                          {target.url ? (
                            <a href={target.url}>{target.name || target.slug || target.id || target.url}</a>
                          ) : (
                            <span>{target.name || target.slug || target.id || 'created'}</span>
                          )}
                          {target.summary ? (
                            <span className="muted" style={{ display: 'block', marginTop: '0.15rem' }}>
                              {target.summary}
                            </span>
                          ) : null}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  {scan.extracted_email ? <span className="muted" style={{ fontSize: '0.85rem' }}>Email: {scan.extracted_email}</span> : null}
                  {scan.notification_error ? (
                    <span className="portal-chat-error" style={{ margin: 0, fontSize: '0.85rem' }}>
                      Notification: {scan.notification_error}
                    </span>
                  ) : null}
                  {scan.id ? (
                    <div style={{ display: 'grid', gap: '0.35rem' }}>
                      {imageLoading[scan.id] ? <span className="muted">Loading image…</span> : null}
                      {imageErrors[scan.id] ? (
                        <span className="portal-chat-error" style={{ margin: 0, fontSize: '0.85rem' }}>
                          {imageErrors[scan.id]}
                        </span>
                      ) : null}
                      {scanImageUrl ? (
                        <img
                          src={scanImageUrl}
                          alt="Original submitted scan"
                          style={{ width: '100%', maxHeight: '180px', objectFit: 'cover', borderRadius: 8 }}
                          onMouseEnter={() => openHoverPreview(scanImageUrl)}
                          onMouseLeave={closeHoverPreviewSoon}
                          onFocus={() => openHoverPreview(scanImageUrl)}
                          onBlur={closeHoverPreviewSoon}
                        />
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </article>
            )})}
          </div>
        </aside>
      </div>
      {hoverPreviewUrl ? (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1200,
            background: 'rgba(0, 17, 43, 0.72)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1.25rem',
          }}
          onMouseEnter={() => openHoverPreview(hoverPreviewUrl)}
          onMouseLeave={closeHoverPreviewSoon}
          onClick={() => setHoverPreviewUrl(null)}
          role="presentation"
        >
          <img
            src={hoverPreviewUrl}
            alt="Large scan preview"
            style={{
              maxWidth: 'min(1100px, 96vw)',
              maxHeight: '92vh',
              width: 'auto',
              height: 'auto',
              objectFit: 'contain',
              borderRadius: 12,
              boxShadow: '0 22px 80px rgba(0, 0, 0, 0.55)',
              border: '1px solid rgba(111, 188, 255, 0.35)',
              background: '#001f49',
            }}
            onClick={(event) => event.stopPropagation()}
          />
        </div>
      ) : null}
    </section>
  )
}
