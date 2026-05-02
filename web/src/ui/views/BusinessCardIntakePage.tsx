import { useEffect, useRef, useState } from 'react'
import type { FormEvent, RefObject } from 'react'
import { useAuth } from '../../app/AppProviders'
import { pidpAppLoginUrl } from '../../config/pidp'

type SubmissionResult = {
  id?: string
  submitted_by_name?: string | null
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

type ScanTarget = {
  type?: string | null
  id?: string | null
  slug?: string | null
  name?: string | null
  url?: string | null
  summary?: string | null
}

function scanTargets(scan: SubmissionResult): ScanTarget[] {
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

function groupTargetsByCategory(scan: SubmissionResult): Record<string, ScanTarget[]> {
  const grouped: Record<string, ScanTarget[]> = {}
  for (const target of scanTargets(scan)) {
    const category = (target.type || 'resource').toLowerCase()
    if (!grouped[category]) grouped[category] = []
    grouped[category].push(target)
  }
  return grouped
}

function formatScanResult(scan: SubmissionResult): string {
  const grouped = groupTargetsByCategory(scan)
  const categories = Object.keys(grouped)
  if (scan.clarification_required) {
    return 'Clarification required before record creation'
  }
  if (categories.length > 0) {
    const summary = categories
      .map((category) => `${category} (${grouped[category].length})`)
      .join(', ')
    return `Added by category: ${summary}`
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
  const { token, user } = useAuth()
  const nextUrl = window.location.href
  const [file, setFile] = useState<File | null>(null)
  const [scanKind, setScanKind] = useState<'auto' | 'person' | 'organization' | 'event'>('auto')
  const [notes, setNotes] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isLoadingMyHistory, setIsLoadingMyHistory] = useState(false)
  const [isLoadingGlobalHistory, setIsLoadingGlobalHistory] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<SubmissionResult | null>(null)
  const [myHistory, setMyHistory] = useState<SubmissionResult[]>([])
  const [globalHistory, setGlobalHistory] = useState<SubmissionResult[]>([])
  const [filterMode, setFilterMode] = useState<'all' | 'clarification'>('all')
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({})
  const [imageLoading, setImageLoading] = useState<Record<string, boolean>>({})
  const [imageErrors, setImageErrors] = useState<Record<string, string>>({})
  const [rerunBusy, setRerunBusy] = useState<Record<string, boolean>>({})
  const [modalPreviewUrl, setModalPreviewUrl] = useState<string | null>(null)
  const imageUrlsRef = useRef<Record<string, string>>({})
  const cameraInputRef = useRef<HTMLInputElement | null>(null)
  const galleryInputRef = useRef<HTMLInputElement | null>(null)
  const selectedPreviewRef = useRef<string | null>(null)
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
    }
  }, [])

  useEffect(() => {
    if (!modalPreviewUrl) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setModalPreviewUrl(null)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [modalPreviewUrl])

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
      setMyHistory((prev) => [payload, ...prev])
      if (payload.id) {
        void loadScanImage(payload.id)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to rerun scan')
    } finally {
      setRerunBusy((previous) => ({ ...previous, [scan.id!]: false }))
    }
  }

  const filteredMyHistory = myHistory.filter((scan) => {
    if (filterMode === 'clarification') return Boolean(scan.clarification_required)
    return true
  })
  const filteredGlobalHistory = globalHistory.filter((scan) => {
    if (filterMode === 'clarification') return Boolean(scan.clarification_required)
    return true
  })

  useEffect(() => {
    if (!token) return
    const ids: string[] = []
    if (result?.id) ids.push(result.id)
    for (const scan of filteredMyHistory.slice(0, 24)) {
      if (scan.id) ids.push(scan.id)
    }
    for (const scan of filteredGlobalHistory.slice(0, 24)) {
      if (scan.id) ids.push(scan.id)
    }
    for (const submissionId of ids) {
      if (imageUrls[submissionId] || imageLoading[submissionId]) continue
      void loadScanImage(submissionId)
    }
  }, [token, result, filteredMyHistory, filteredGlobalHistory, imageUrls, imageLoading])

  useEffect(() => {
    if (!token) {
      setMyHistory([])
      setGlobalHistory([])
      return
    }
    let cancelled = false
    async function loadMyHistory() {
      try {
        setIsLoadingMyHistory(true)
        const response = await fetch('/api/org/api/network/scans?scope=mine&limit=100', {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!response.ok) {
          throw new Error(`Unable to load scans (${response.status})`)
        }
        const payload = (await response.json()) as SubmissionResult[]
        if (!cancelled) {
          setMyHistory(Array.isArray(payload) ? payload : [])
        }
      } catch {
        if (!cancelled) {
          setMyHistory([])
        }
      } finally {
        if (!cancelled) {
          setIsLoadingMyHistory(false)
        }
      }
    }
    async function loadGlobalHistory() {
      try {
        setIsLoadingGlobalHistory(true)
        const response = await fetch('/api/org/api/network/scans?scope=public&limit=100', {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!response.ok) {
          throw new Error(`Unable to load global scans (${response.status})`)
        }
        const payload = (await response.json()) as SubmissionResult[]
        if (!cancelled) {
          setGlobalHistory(Array.isArray(payload) ? payload : [])
        }
      } catch {
        if (!cancelled) {
          setGlobalHistory([])
        }
      } finally {
        if (!cancelled) {
          setIsLoadingGlobalHistory(false)
        }
      }
    }
    loadMyHistory().catch(() => {})
    loadGlobalHistory().catch(() => {})
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
      setMyHistory((prev) => [payload, ...prev])
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
                  <strong>Created Elements By Category</strong>
                  {Object.entries(groupTargetsByCategory(result)).map(([category, targets]) => (
                    <div key={`latest-${category}`} style={{ fontSize: '0.9rem' }}>
                      <span style={{ textTransform: 'capitalize', fontWeight: 700 }}>{category}</span>
                      {': '}
                      {targets.map((target, index) => (
                        <span key={`${category}-${target.id || target.slug || index}`}>
                          {index > 0 ? ', ' : ''}
                          {target.url ? (
                            <a href={target.url}>{target.name || target.slug || target.id || target.url}</a>
                          ) : (
                            <span>{target.name || target.slug || target.id || 'created'}</span>
                          )}
                        </span>
                      ))}
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
          <h2 style={{ marginTop: 0, marginBottom: '0.5rem' }}>Scan History</h2>
          <p className="muted" style={{ marginTop: 0 }}>
            Separate tables for your scans and the global feed{user?.displayName ? ` (${user.displayName})` : ''}.
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
          <h3 style={{ margin: '0.2rem 0 0.4rem' }}>My Scans</h3>
          {isLoadingMyHistory ? <p className="muted">Loading your scans...</p> : null}
          {!isLoadingMyHistory && filteredMyHistory.length === 0 ? <p className="muted">No scans in this filter.</p> : null}
          <div style={{ overflowX: 'auto', marginBottom: '1rem' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', borderBottom: '1px solid var(--border)', padding: '0.4rem' }}>Image</th>
                  <th style={{ textAlign: 'left', borderBottom: '1px solid var(--border)', padding: '0.4rem' }}>Details</th>
                  <th style={{ textAlign: 'left', borderBottom: '1px solid var(--border)', padding: '0.4rem' }}>Added By Category</th>
                </tr>
              </thead>
              <tbody>
                {filteredMyHistory.map((scan) => {
                  const groupedTargets = groupTargetsByCategory(scan)
                  const categories = Object.keys(groupedTargets)
                  const scanImageUrl = scan.id ? imageUrls[scan.id] : null
                  return (
                    <tr key={`mine-${scan.id || `${scan.created_at || ''}-${scan.extracted_email || ''}`}`}>
                      <td style={{ padding: '0.45rem', verticalAlign: 'top', width: 120 }}>
                        {scan.id && imageLoading[scan.id] ? <span className="muted">Loading…</span> : null}
                        {scan.id && imageErrors[scan.id] ? <span className="portal-chat-error">{imageErrors[scan.id]}</span> : null}
                        {scanImageUrl ? (
                          <button
                            type="button"
                            onClick={() => setModalPreviewUrl(scanImageUrl)}
                            style={{ border: 'none', background: 'transparent', padding: 0, cursor: 'zoom-in' }}
                          >
                            <img src={scanImageUrl} alt="Original submitted scan" style={{ width: 110, height: 78, objectFit: 'cover', borderRadius: 8 }} />
                          </button>
                        ) : null}
                      </td>
                      <td style={{ padding: '0.45rem', verticalAlign: 'top' }}>
                        <div style={{ display: 'grid', gap: '0.2rem' }}>
                          <strong>{scan.extracted_name || scan.created_target_name || scan.extracted_company || 'Scan'}</strong>
                          <span className="muted">{scan.created_at ? new Date(scan.created_at).toLocaleString() : 'Unknown time'}</span>
                          <span>{formatScanResult(scan)}</span>
                          <span className="muted">Type: {scan.scan_kind || 'n/a'} | Requested: {scan.scan_kind_requested || 'auto'}</span>
                          {scan.id ? (
                            <button type="button" onClick={() => void rerunScan(scan)} disabled={Boolean(rerunBusy[scan.id])} style={{ width: 'fit-content' }}>
                              {rerunBusy[scan.id] ? 'Rerunning…' : 'Rerun'}
                            </button>
                          ) : null}
                        </div>
                      </td>
                      <td style={{ padding: '0.45rem', verticalAlign: 'top' }}>
                        {categories.length === 0 ? (
                          <span className="muted">No created elements</span>
                        ) : (
                          <div style={{ display: 'grid', gap: '0.25rem' }}>
                            {categories.map((category) => (
                              <div key={`mine-${scan.id || scan.created_at}-${category}`}>
                                <strong style={{ textTransform: 'capitalize' }}>{category}</strong>
                                {': '}
                                {groupedTargets[category].map((target, index) => (
                                  <span key={`${category}-${target.id || target.slug || index}`}>
                                    {index > 0 ? ', ' : ''}
                                    {target.url ? <a href={target.url}>{target.name || target.slug || target.id || target.url}</a> : (target.name || target.slug || target.id || 'created')}
                                  </span>
                                ))}
                              </div>
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <h3 style={{ margin: '0.2rem 0 0.4rem' }}>Global Scans</h3>
          {isLoadingGlobalHistory ? <p className="muted">Loading global scans...</p> : null}
          {!isLoadingGlobalHistory && filteredGlobalHistory.length === 0 ? <p className="muted">No global scans in this filter.</p> : null}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', borderBottom: '1px solid var(--border)', padding: '0.4rem' }}>Submitted By</th>
                  <th style={{ textAlign: 'left', borderBottom: '1px solid var(--border)', padding: '0.4rem' }}>When</th>
                  <th style={{ textAlign: 'left', borderBottom: '1px solid var(--border)', padding: '0.4rem' }}>Summary</th>
                  <th style={{ textAlign: 'left', borderBottom: '1px solid var(--border)', padding: '0.4rem' }}>Added By Category</th>
                </tr>
              </thead>
              <tbody>
                {filteredGlobalHistory.map((scan) => {
                  const groupedTargets = groupTargetsByCategory(scan)
                  const categories = Object.keys(groupedTargets)
                  return (
                    <tr key={`global-${scan.id || `${scan.created_at || ''}-${scan.extracted_email || ''}`}`}>
                      <td style={{ padding: '0.45rem', verticalAlign: 'top' }}>{scan.submitted_by_name || 'Unknown'}</td>
                      <td style={{ padding: '0.45rem', verticalAlign: 'top' }}>{scan.created_at ? new Date(scan.created_at).toLocaleString() : 'Unknown time'}</td>
                      <td style={{ padding: '0.45rem', verticalAlign: 'top' }}>{formatScanResult(scan)}</td>
                      <td style={{ padding: '0.45rem', verticalAlign: 'top' }}>
                        {categories.length === 0 ? (
                          <span className="muted">No created elements</span>
                        ) : (
                          <div style={{ display: 'grid', gap: '0.25rem' }}>
                            {categories.map((category) => (
                              <div key={`global-${scan.id || scan.created_at}-${category}`}>
                                <strong style={{ textTransform: 'capitalize' }}>{category}</strong>
                                {': '}
                                {groupedTargets[category].map((target, index) => (
                                  <span key={`${category}-${target.id || target.slug || index}`}>
                                    {index > 0 ? ', ' : ''}
                                    {target.name || target.slug || target.id || 'created'}
                                  </span>
                                ))}
                              </div>
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>


        </aside>
      </div>
      {modalPreviewUrl ? (
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
          onClick={() => setModalPreviewUrl(null)}
          role="presentation"
        >
          <div onClick={(event) => event.stopPropagation()} style={{ position: 'relative' }}>
            <button
              type="button"
              onClick={() => setModalPreviewUrl(null)}
              aria-label="Close full screen scan preview"
              style={{
                position: 'absolute',
                top: '-0.75rem',
                right: '-0.75rem',
                width: '2.5rem',
                height: '2.5rem',
                borderRadius: '999px',
                border: '1px solid rgba(255, 255, 255, 0.75)',
                background: 'rgba(0, 0, 0, 0.8)',
                color: '#fff',
                fontSize: '1.2rem',
                cursor: 'pointer',
              }}
            >
              ×
            </button>
            <img
              src={modalPreviewUrl}
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
            />
            <div className="muted" style={{ marginTop: '0.5rem', textAlign: 'center', color: '#d9e8ff' }}>
              Press Esc or click × to close
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}
