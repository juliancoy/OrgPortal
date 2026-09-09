import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { fetchTimebank, useTimebankApi } from '../timebank/useTimebankApi'
import { useTimebankInbox, signalInboxChange } from '../timebank/TimebankInbox'
import { timebankMessagePath } from '../timebank/links'
import { TimebankNotifications } from './timebank/TimebankNotifications'
import { TimebankAnalytics } from './timebank/TimebankAnalytics'
import { useCallback, useEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react'
import { useAuth } from '../../app/AppProviders'
import { toUserFacingErrorMessage } from '../../infrastructure/http/userFacingError'
import { setDomainCommunity, type TimebankCommunity } from '../../config/timebankCommunity'
import { TimebankDialog } from './timebank/TimebankDialog'
import { prepareTimebankPhoto } from './timebank/photo'
import './timebank.css'

type Listing = {
  id: string; user_id: string; member_name: string; kind: 'offer' | 'request'
  title: string; description: string; location: string; minutes: number; status: 'open' | 'closed'
  category: string; contact: string; image_key: string | null
  visibility: 'public' | 'members'
  uptake_count: number; user_has_taken_up: number; user_has_helped: number
}
type Exchange = {
  id: string; listing_title: string; provider_user_id: string; recipient_user_id: string
  provider_name: string; recipient_name: string; proposed_by_user_id: string
  minutes: number; note: string; status: 'pending' | 'confirmed' | 'declined' | 'canceled'
  created_at: string; resolved_at: string | null
}
type Dashboard = {
  account: { user_id: string; balance_minutes: number; earned_minutes: number; spent_minutes: number } | null
  listings: Listing[]; exchanges: Exchange[]; community: TimebankCommunity; can_manage_community: boolean
}
const categories = ['Home & garden', 'Learning', 'Tech help', 'Care & company', 'Transport', 'Creative', 'Other']
const categorySymbols: Record<string, string> = { 'Home & garden': '❀', Learning: 'Aa', 'Tech help': '</>', 'Care & company': '♡', Transport: '↗', Creative: '✳', Other: '↔' }
const emptyListing = (kind: 'offer' | 'request' = 'offer') => ({ id: crypto.randomUUID(), kind, title: '', description: '', location: '', hours: '1', category: 'Other', contact: '', visibility: 'public' as Listing['visibility'] })
const hours = (minutes: number) => new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(minutes / 60)
const formatHours = (minutes: number) => `${hours(minutes)} h`
function accentForeground(color: string) {
  const channels = [1, 3, 5].map((offset) => parseInt(color.slice(offset, offset + 2), 16) / 255).map((value) => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4)
  return .2126 * channels[0] + .7152 * channels[1] + .0722 * channels[2] > .179 ? '#10221b' : '#ffffff'
}
const imageUrl = (item: Listing) => `/api/org/api/timebank/listings/${item.id}/image?v=${encodeURIComponent(item.image_key || '')}`

function ListingPhoto({ item, large = false }: { item: Listing; large?: boolean }) {
  const { token } = useAuth()
  const [photo, setPhoto] = useState<{ key: string; url: string } | null>(null)
  const needsAuth = item.visibility === 'members' || item.status === 'closed'
  const key = `${item.id}/${item.image_key}/${token}`
  useEffect(() => {
    if (!item.image_key || !needsAuth || !token) return
    const controller = new AbortController()
    let url = ''
    void fetchTimebank(`/listings/${item.id}/image`, token, { signal: controller.signal })
      .then((response) => response.blob()).then((blob) => {
        if (controller.signal.aborted) return
        url = URL.createObjectURL(blob); setPhoto({ key, url })
      }).catch(() => { /* Keep the category placeholder if a photo is unavailable. */ })
    return () => { controller.abort(); if (url) URL.revokeObjectURL(url) }
  }, [item.id, item.image_key, needsAuth, token, key])
  const src = needsAuth ? photo?.key === key ? photo.url : '' : imageUrl(item)
  return item.image_key && src
    ? <img className={`tb-listing-photo ${large ? 'tb-photo-large' : ''}`} src={src} alt={item.title} loading={large ? 'eager' : 'lazy'} />
    : <div className={`tb-photo-placeholder ${large ? 'tb-photo-large' : ''}`} data-category={item.category} aria-label={`${item.category} listing; no photo added`}><span aria-hidden="true">{categorySymbols[item.category] || '↔'}</span><small>{item.category}</small></div>
}

export function TimebankPage() {
  const { token } = useAuth()
  const navigate = useNavigate()
  const signInPath = (listingId?: string) => `/users/login?next=${encodeURIComponent(`/timebanking${listingId ? `?listing=${listingId}` : ''}`)}`
  const [data, setData] = useState<Dashboard | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const [params, setParams] = useSearchParams()
  const inbox = useTimebankInbox()
  const tabsRef = useRef<HTMLElement>(null)
  const requestedTab = params.get('tab')
  const tab = token && (requestedTab === 'activity' || requestedTab === 'admin' || requestedTab === 'notifications') ? requestedTab : 'home'
  const setTab = (next: 'home' | 'activity' | 'admin' | 'notifications') => {
    if (next === 'home') setSearch('')
    setParams(next === 'home' ? {} : { tab: next })
  }
  const linkedListing = params.get('listing')
  const linkedExchange = params.get('exchange')
  const [showForm, setShowForm] = useState(false)
  const [listing, setListing] = useState(() => emptyListing())
  const [photo, setPhoto] = useState<File | null>(null)
  const [preview, setPreview] = useState('')
  const [photoBusy, setPhotoBusy] = useState(false)
  const [postedId, setPostedId] = useState<string | null>(null)
  const mine = Boolean(token) && params.get('mine') === 'true'
  const setMine = (value: boolean) => setParams(value ? { mine: 'true' } : {})
  const [requestSort, setRequestSort] = useState('most')
  const [revision, setRevision] = useState(0)
  const [search, setSearch] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)
  const [selected, setSelected] = useState<Listing | null>(null)
  const [recording, setRecording] = useState(false)
  const [exchange, setExchange] = useState({ id: crypto.randomUUID(), hours: '1', note: '' })
  const [settings, setSettings] = useState<TimebankCommunity | null>(null)
  const [newCommunity, setNewCommunity] = useState(false)
  const [savedDomain, setSavedDomain] = useState('')

  const api = useTimebankApi()

  const refresh = useCallback(async (signal?: AbortSignal) => {
    const query = new URLSearchParams({ request_sort: requestSort })
    if (mine) query.set('mine', 'true')
    const dashboard = await api<Dashboard>(`?${query}`, { signal })
    if (signal?.aborted) return dashboard
    setData(dashboard)
    setSelected((current) => current ? dashboard.listings.find((item) => item.id === current.id) || current : null)
    setRevision((value) => value + 1)
    setDomainCommunity(dashboard.community)
    document.title = `${dashboard.community.name} · Timebanking`
    return dashboard
  }, [api, requestSort, mine])

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    refresh(controller.signal).catch((err: unknown) => {
      if (!controller.signal.aborted) setError(toUserFacingErrorMessage(err, 'Unable to load timebanking.'))
    }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [refresh, token])
  useEffect(() => {
    const url = photo ? URL.createObjectURL(photo) : ''
    setPreview(url)
    return () => { if (url) URL.revokeObjectURL(url) }
  }, [photo])

  useEffect(() => {
    if (!message) return
    const timeout = window.setTimeout(() => setMessage(''), 8000)
    return () => window.clearTimeout(timeout)
  }, [message])

  useEffect(() => {
    if (!linkedListing) return
    const controller = new AbortController()
    void api<Listing>(`/listings/${encodeURIComponent(linkedListing)}`, { signal: controller.signal }).then((item) => {
      if (!controller.signal.aborted) { setSelected(item); setRecording(false); setExchange({ id: crypto.randomUUID(), hours: String(item.minutes / 60), note: '' }) }
    }).catch((err) => { if (!controller.signal.aborted) setError(toUserFacingErrorMessage(err, 'Unable to open this listing.')) })
    return () => controller.abort()
  }, [api, linkedListing, token])

  async function run(action: () => Promise<unknown>, success: string, onSaved?: () => void) {
    if (busyRef.current) return
    busyRef.current = true; setBusy(true); setError(''); setMessage('')
    try {
      await action()
      onSaved?.()
      try { await refresh(); signalInboxChange(); setMessage(success) } catch { setError('Saved, but the latest hours could not be loaded. Use Refresh to try again.') }
    } catch (err) { setError(toUserFacingErrorMessage(err, 'Unable to save. Please try again.')) }
    finally { busyRef.current = false; setBusy(false) }
  }
  const mutate = (path: string, body: unknown, success: string, onSaved?: () => void) => run(() => api(path, { method: 'PATCH', body: JSON.stringify(body) }), success, onSaved)
  const closeDialog = () => { setShowForm(false); setSelected(null); setSettings(null); setError(''); setPhoto(null); if (linkedListing) setParams({}, { replace: true }) }
  const openComposer = (kind: 'offer' | 'request') => {
    if (!token) { navigate(signInPath()); return }
    setListing(emptyListing(kind)); setPhoto(null); setPostedId(null); setError(''); setShowForm(true)
  }
  async function choosePhoto(file?: File, item?: Listing) {
    if (!file || photoBusy || busy) return
    setPhotoBusy(true); setError('')
    try {
      const prepared = await prepareTimebankPhoto(file)
      if (item) await run(async () => {
        const result = await api<{ image_key: string }>(`/listings/${item.id}/image`, { method: 'PUT', headers: { 'Content-Type': prepared.type }, body: prepared })
        setSelected({ ...item, image_key: result.image_key })
      }, 'Photo updated.')
      else setPhoto(prepared)
    } catch (err) { setError(toUserFacingErrorMessage(err, 'Unable to use this photo.')) }
    finally { setPhotoBusy(false) }
  }
  async function postListing(event: FormEvent) {
    event.preventDefault()
    if (photoBusy) return
    await run(async () => {
      if (!postedId) {
        await api('/listings', { method: 'POST', body: JSON.stringify({ ...listing, minutes: Number(listing.hours) * 60 }) })
        setPostedId(listing.id)
      }
      if (photo) {
        try { await api(`/listings/${listing.id}/image`, { method: 'PUT', headers: { 'Content-Type': photo.type }, body: photo }) }
        catch { throw new Error('Your listing is saved, but its photo did not upload. Retry to finish, or close and add the photo from My listings.') }
      }
    }, 'Your listing is live. Neighbors can now find it.', () => { closeDialog(); setTab('home') })
  }

  const userId = data?.account?.user_id
  const visible = (data?.listings || []).filter((item) => {
    const scope = mine ? item.user_id === userId : item.status === 'open'
    return scope && `${item.title} ${item.description} ${item.location} ${item.member_name}`.toLowerCase().includes(search.trim().toLowerCase())
  })
  const pending = (data?.exchanges || []).filter((item) => item.status === 'pending')
  const needsYou = pending.filter((item) => item.proposed_by_user_id !== userId).length
  const history = (data?.exchanges || []).filter((item) => item.status !== 'pending')
  const community = data?.community
  const modalError = error && <p className="tb-alert" role="alert">{error}</p>
  const hasDialog = showForm || selected || settings

  useEffect(() => {
    if (tab !== 'activity' || !token) return
    const controller = new AbortController()
    void refresh(controller.signal).catch((err) => { if (!controller.signal.aborted) setError(toUserFacingErrorMessage(err, 'Unable to load this exchange.')) })
    return () => controller.abort()
  }, [linkedExchange, tab, token, refresh])

  useEffect(() => {
    if (tab !== 'activity' || !linkedExchange || !data) return
    const target = document.getElementById(`exchange-${linkedExchange}`)
    target?.scrollIntoView({ block: 'center' }); target?.focus({ preventScroll: true })
  }, [tab, linkedExchange, data])

  useEffect(() => {
    const nav = tabsRef.current
    const active = nav?.querySelector<HTMLElement>('button[aria-current]')
    if (!nav || !active) return
    const align = () => { nav.scrollLeft += active.getBoundingClientRect().left - nav.getBoundingClientRect().left - Math.max(0, (nav.clientWidth - active.offsetWidth) / 2) }
    align()
    const observer = new ResizeObserver(align)
    observer.observe(nav)
    return () => observer.disconnect()
  }, [tab, inbox.unreadActivity, inbox.unreadMessages, pending.length, data?.can_manage_community])

  const takeUp = (item: Listing) => {
    if (!token) { navigate(signInPath(item.id)); return }
    return run(() => api(`/listings/${item.id}/uptake`, { method: item.user_has_taken_up ? 'DELETE' : 'PUT' }), item.user_has_taken_up ? 'You withdrew from this request. No hours moved.' : 'You have taken up this request. Arrange the help with its owner.')
  }
  const refreshButton = <button className="tb-text-button" disabled={busy || loading} onClick={() => {
    setLoading(true); setError('')
    void Promise.all([refresh(), inbox.refresh()]).catch((err) => setError(toUserFacingErrorMessage(err, 'Unable to refresh.'))).finally(() => setLoading(false))
  }}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M20 7v5h-5M4 17v-5h5" /><path d="M6 6a8 8 0 0 1 13 2M5 16a8 8 0 0 0 13 2" /></svg><span>Refresh</span></button>

  return <div className="timebank-page" style={{ '--tb-accent': community?.accent_color || '#155e59', '--tb-accent-ink': accentForeground(community?.accent_color || '#155e59') } as CSSProperties}>
    <h1 className="tb-sr-only">Timebank offers and requests</h1>
    <div className="tb-toolbar">
      <nav ref={tabsRef} className="tb-tabs" aria-label="Timebank sections">
        <button aria-current={tab === 'home' ? 'page' : undefined} onClick={() => setTab('home')}>Home</button>
        {token && <button aria-current={tab === 'activity' ? 'page' : undefined} onClick={() => setTab('activity')}>My hours {pending.length > 0 && <span className="tb-count">{pending.length}</span>}</button>}
        {token && <button aria-current={tab === 'notifications' ? 'page' : undefined} onClick={() => setTab('notifications')}>Notifications{inbox.unreadActivity + inbox.conversations.filter((item) => (item.unread_count || 0) > 0).length > 0 && <span className="tb-count">{inbox.unreadActivity + inbox.conversations.filter((item) => (item.unread_count || 0) > 0).length}</span>}</button>}
        {data?.can_manage_community && <button aria-current={tab === 'admin' ? 'page' : undefined} onClick={() => setTab('admin')}>Admin</button>}
      </nav>
      {refreshButton}
    </div>
    <div className="tb-announcements">
      {!hasDialog && error && <p className="tb-alert" role="alert">{error}</p>}
      <p role="status" aria-live="polite">{loading ? 'Loading your community…' : message}</p>
    </div>
    {data && tab === 'home' && <section className="tb-home" aria-label="Offers and requests">
      <p className="tb-muted">{token ? 'Offers and requests from everyone in this community.' : <>Explore public offers and requests from the community. <Link to={signInPath()}>Sign in</Link> to share yours and arrange help.</>}</p>
      <div className="tb-board-tools"><div className="tb-search"><label className="tb-sr-only" htmlFor="timebank-search">Search offers and requests</label><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></svg><input id="timebank-search" ref={searchRef} type="search" placeholder="Search offers and requests" value={search} onChange={(event) => setSearch(event.target.value)} />{search && <button className="tb-search-clear" aria-label="Clear search" onClick={() => { setSearch(''); searchRef.current?.focus() }}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m6 6 12 12M6 18 18 6" /></svg></button>}</div>{token && <label className="tb-mine"><input type="checkbox" checked={mine} onChange={(event) => setMine(event.target.checked)} />My listings</label>}{needsYou > 0 && <button className="tb-text-button" onClick={() => setTab('activity')}>{needsYou} awaiting confirmation</button>}</div>
      <p className="tb-sr-only" role="status" aria-live="polite">{visible.filter((item) => item.kind === 'offer').length} offers and {visible.filter((item) => item.kind === 'request').length} requests{search ? ' match your search' : ' shown'}.</p>
      <div className="tb-columns">
        {(['offer', 'request'] as const).map((kind) => {
          const items = visible.filter((item) => item.kind === kind)
          return <section className="tb-column" key={kind} aria-labelledby={`timebank-${kind}-title`}>
            <div className="tb-column-heading"><h2 id={`timebank-${kind}-title`}>{kind === 'offer' ? 'Offers' : 'Requests'}</h2><button className="tb-button tb-add" aria-label={kind === 'offer' ? 'Add offer' : 'Add request'} disabled={busy} onClick={() => openComposer(kind)}>＋<span>Add</span></button></div>
            <div className="tb-column-meta">{kind === 'request' ? <label><span className="tb-sr-only">Sort requests</span><select aria-label="Sort requests" value={requestSort} onChange={(event) => setRequestSort(event.target.value)}><option value="most">Most taken up</option><option value="least">Least taken up</option><option value="newest">Newest</option></select></label> : <span>Newest offers</span>}</div>
            <ul className="tb-list">{items.map((item) => <li key={item.id}><article className="tb-listing" aria-label={item.title}>
              <button className="tb-row-open" aria-label={`View ${item.title}`} onClick={() => { setSelected(item); setRecording(false); setError(''); setExchange({ id: crypto.randomUUID(), hours: String(item.minutes / 60), note: '' }) }}>
                <ListingPhoto item={item} /><div className="tb-row-body"><h3>{item.title}</h3><p className="tb-card-description">{item.description}</p><p className="tb-row-meta">{formatHours(item.minutes)} · {item.category}</p><p className="tb-row-member">{item.member_name}{item.user_id === userId ? ' (you)' : ''}{item.location ? ` · ${item.location}` : ''}{item.visibility === 'members' ? ' · Members only' : ''}{item.status === 'closed' ? ' · Closed' : ''}</p></div>
              </button>
              {item.user_id !== userId && <div className="tb-listing-message"><Link to={timebankMessagePath(item.user_id, item.member_name, item.id)} aria-label={`Message ${item.member_name} about ${item.title}`}>Message member</Link></div>}
              {kind === 'request' && <div className="tb-uptake"><span aria-label={`${item.uptake_count} people have taken up this request`}>{item.uptake_count} {item.uptake_count === 1 ? 'person' : 'people'} took this up</span>{item.user_id !== userId && (item.user_has_helped ? <span className="tb-muted">You helped</span> : <button className="tb-text-button" disabled={busy || (item.status !== 'open' && !item.user_has_taken_up)} onClick={() => { void takeUp(item) }}>{item.user_has_taken_up ? 'Withdraw' : 'Take up request'}</button>)}</div>}
            </article></li>)}</ul>
            {!items.length && <p className="tb-empty">{search ? `No ${kind}s match your search.` : mine ? `You have no ${kind}s here.` : `No ${kind}s yet.`}</p>}
            {data.listings.filter((item) => item.kind === kind).length === 200 && <p className="tb-muted">Showing up to 200 {kind}s in the selected order.</p>}
          </section>
        })}
      </div>
    </section>}
    {tab === 'notifications' && <TimebankNotifications />}
    {data?.can_manage_community && tab === 'admin' && <>
      <div className="tb-admin-tools"><button className="tb-text-button" onClick={() => { setNewCommunity(false); setSettings(data.community); setSavedDomain(''); setError('') }}>Community settings</button></div>
      <TimebankAnalytics api={api} revision={revision} />
    </>}
    {data?.account && tab === 'activity' && <section className="tb-activity" aria-label="Hours activity">
      <h2>My hours</h2><div className="tb-personal-totals" aria-label="Your hours"><span>Balance <strong data-testid="hours-balance">{formatHours(data.account.balance_minutes)}</strong></span><span>Provided <strong>{formatHours(data.account.earned_minutes)}</strong></span><span>Received <strong>{formatHours(data.account.spent_minutes)}</strong></span></div><p className="tb-muted">Balances start at zero and can go negative when you receive help. Both members agree before hours move.</p>
      <h3>Pending confirmation <span className="tb-count">{pending.length}</span></h3>
      {pending.length === 0 && <div className="tb-quiet">You’re all caught up. No hours awaiting confirmation.</div>}
      {pending.map((item) => <article className="tb-exchange" key={item.id} id={`exchange-${item.id}`} tabIndex={-1} aria-label={`Pending: ${item.listing_title}`}>
        <div><span className="tb-category">{item.proposed_by_user_id === userId ? 'Waiting for your neighbor' : 'Your confirmation needed'}</span><h3>{item.listing_title}</h3><p>{item.provider_name} helped {item.recipient_name} · {formatHours(item.minutes)}</p><p className="tb-description">{item.note}</p></div>
        <div className="tb-exchange-actions">{item.proposed_by_user_id === userId ? <button className="tb-button tb-secondary" disabled={busy} onClick={() => { void mutate(`/exchanges/${item.id}`, { status: 'canceled' }, 'Exchange canceled. No hours moved.') }}>Cancel exchange</button> : <><strong>{item.provider_user_id === userId ? '+' : '−'}{formatHours(item.minutes)}</strong><div className="tb-actions"><button className="tb-button" disabled={busy} onClick={() => { void mutate(`/exchanges/${item.id}`, { status: 'confirmed' }, 'Exchange confirmed. Your hours have been updated.') }}>Confirm hours</button><button className="tb-text-button" disabled={busy} onClick={() => { void mutate(`/exchanges/${item.id}`, { status: 'declined' }, 'Exchange declined. No hours moved.') }}>Decline</button></div></>}</div>
      </article>)}
      <h3>Hours history</h3>{history.length === 0 && <div className="tb-quiet">Your confirmed exchanges will appear here.</div>}
      {history.map((item) => <article className="tb-exchange" key={item.id} id={`exchange-${item.id}`} tabIndex={-1} aria-label={`History: ${item.listing_title}`}><div><span className="tb-category">{item.status} · {new Date(item.resolved_at || item.created_at).toLocaleDateString()}</span><h3>{item.listing_title}</h3><p>{item.provider_name} helped {item.recipient_name}</p><p className="tb-description">{item.note}</p></div><strong className="tb-history-hours">{item.status === 'confirmed' ? `${item.provider_user_id === userId ? '+' : '−'}${formatHours(item.minutes)}` : 'No hours moved'}</strong></article>)}
      {data.exchanges.length === 100 && <p className="tb-muted">Showing the latest 100 exchanges. Your balance includes all confirmed hours.</p>}
    </section>}

    {showForm && <TimebankDialog title={listing.kind === 'offer' ? 'Add offer' : 'Add request'} busy={busy || photoBusy} onClose={closeDialog}>
      <form className="tb-form" onSubmit={postListing}>{modalError}
        <p className="tb-muted">{listing.kind === 'offer' ? 'Describe the help you can provide.' : 'Describe the help you need.'}</p>
        <fieldset disabled={busy || !!postedId} className="tb-form-fields">
          <label className="tb-upload">{preview ? <img src={preview} alt="Listing photo preview" /> : <span><b>＋ Add a photo</b><small>Show your skill, your project, or what you need help with.</small></span>}<input type="file" accept="image/jpeg,image/png,image/webp" aria-label="Listing photo" disabled={photoBusy} onChange={(event) => { void choosePhoto(event.target.files?.[0]); event.target.value = '' }} /><small>{photoBusy ? 'Preparing your photo…' : 'JPEG, PNG or WebP · up to 5 MB · optional'}</small></label>
          {photo && <button className="tb-text-button" type="button" onClick={() => setPhoto(null)}>Remove photo</button>}
          <label>Title<input autoFocus required maxLength={120} placeholder={listing.kind === 'offer' ? 'e.g. Bicycle tune-ups and small repairs' : 'e.g. Help setting up a vegetable garden'} value={listing.title} onChange={(event) => setListing({ ...listing, title: event.target.value })} /></label>
          <div className="tb-field-row"><label>Category<select value={listing.category} onChange={(event) => setListing({ ...listing, category: event.target.value })}>{categories.map((value) => <option key={value}>{value}</option>)}</select></label><label>Estimated hours<input required type="number" min="0.25" max="24" step="0.25" value={listing.hours} onChange={(event) => setListing({ ...listing, hours: event.target.value })} /></label></div>
          <label>Visibility<select value={listing.visibility} onChange={(event) => setListing({ ...listing, visibility: event.target.value as Listing['visibility'] })}><option value="public">Public</option><option value="members">Members only</option></select><small>Public listings, including photos and details, are visible to everyone. Members only listings require sign-in.</small></label>
          <label>Description<textarea required maxLength={2000} rows={3} placeholder="What’s included? Anything your neighbor should know?" value={listing.description} onChange={(event) => setListing({ ...listing, description: event.target.value })} /></label>
          <label>Location or remote<input maxLength={160} placeholder="e.g. Charles Village, Baltimore · or Remote" value={listing.location} onChange={(event) => setListing({ ...listing, location: event.target.value })} /></label>
          <label>How to arrange it<input maxLength={300} placeholder="e.g. Available Saturday mornings." value={listing.contact} onChange={(event) => setListing({ ...listing, contact: event.target.value })} /><small>Optional availability or meeting details. Members can contact you through Messages.</small></label>
        </fieldset>
        <div className="tb-dialog-footer"><span>1 hour of help = 1 timebank hour</span><button className="tb-button" disabled={busy || photoBusy} type="submit">{busy ? 'Publishing…' : postedId ? 'Retry photo upload' : 'Publish listing'}</button></div>
      </form>
    </TimebankDialog>}
    {selected && <TimebankDialog title={recording ? 'Record completed help' : selected.title} busy={busy || photoBusy} onClose={closeDialog}>
      {modalError}
      {recording ? <form className="tb-form" onSubmit={(event) => {
        event.preventDefault()
        void run(() => api('/exchanges', { method: 'POST', body: JSON.stringify({ id: exchange.id, listing_id: selected.id, minutes: Number(exchange.hours) * 60, note: exchange.note }) }), 'Hours sent to the other member for confirmation.', () => { closeDialog(); setTab('activity') })
      }}><h3>{selected.title}</h3><p>{selected.kind === 'offer' ? `You received help from ${selected.member_name}. These hours will be subtracted from your balance when they confirm.` : `You helped ${selected.member_name}. These hours will be added to your balance when they confirm.`}</p><label>Completed hours<input autoFocus required type="number" min="0.25" max="24" step="0.25" value={exchange.hours} onChange={(event) => setExchange({ ...exchange, hours: event.target.value })} /></label><label>Work completed<textarea required rows={3} maxLength={1000} value={exchange.note} onChange={(event) => setExchange({ ...exchange, note: event.target.value })} /></label><div className="tb-dialog-footer"><button type="button" className="tb-text-button" disabled={busy} onClick={() => setRecording(false)}>Back to listing</button><button className="tb-button" disabled={busy} type="submit">Send hours for confirmation</button></div></form> : <div className="tb-detail">
        <ListingPhoto item={selected} large /><div className="tb-detail-meta"><span className={`tb-badge tb-${selected.kind}`}>{selected.kind === 'offer' ? 'Offering' : 'Looking for help'}</span><span className="tb-badge">{selected.visibility === 'members' ? 'Members only' : 'Public'}</span><span>{selected.category} · {formatHours(selected.minutes)} estimated</span></div><p className="tb-description">{selected.description}</p><p className="tb-muted">Shared by <b>{selected.member_name}</b> · {selected.location || 'Arrange with member'}</p>
        <div className="tb-arrange"><h3>Arrange the help</h3><p className="tb-description">{selected.contact || 'Use Messages to agree on the details before exchanging hours.'}</p>{selected.user_id !== userId && <Link className="tb-button" to={timebankMessagePath(selected.user_id, selected.member_name, selected.id)}>Message {selected.member_name}</Link>}</div>
        {selected.kind === 'request' && <div className="tb-detail-uptake"><p>{selected.uptake_count} {selected.uptake_count === 1 ? 'person has' : 'people have'} taken up this request.</p>{selected.user_id !== userId && (selected.user_has_helped ? <p>You have already provided confirmed help for this request.</p> : <button className="tb-button" disabled={busy || (selected.status !== 'open' && !selected.user_has_taken_up)} onClick={() => { void takeUp(selected) }}>{selected.user_has_taken_up ? 'Withdraw' : 'Take up request'}</button>)}</div>}
        {selected.user_id === userId ? <><label className="tb-visibility-edit tb-form">Visibility<select aria-label="Listing visibility" value={selected.visibility} disabled={busy || photoBusy} onChange={(event) => { void mutate(`/listings/${selected.id}`, { visibility: event.target.value }, 'Listing visibility updated.') }}><option value="public">Public</option><option value="members">Members only</option></select></label><div className="tb-owner-tools"><label className="tb-photo-edit">{photoBusy ? 'Preparing photo…' : selected.image_key ? 'Replace photo' : 'Add a photo'}<input type="file" accept="image/jpeg,image/png,image/webp" aria-label="Replace listing photo" disabled={busy || photoBusy} onChange={(event) => { void choosePhoto(event.target.files?.[0], selected); event.target.value = '' }} /></label>{selected.image_key && <button className="tb-text-button" disabled={busy || photoBusy} onClick={() => { void run(async () => { await api(`/listings/${selected.id}/image`, { method: 'DELETE' }); setSelected({ ...selected, image_key: null }) }, 'Photo removed.') }}>Remove photo</button>}<button className="tb-button tb-secondary" disabled={busy || photoBusy} onClick={() => { void mutate(`/listings/${selected.id}`, { status: selected.status === 'open' ? 'closed' : 'open' }, selected.status === 'open' ? 'Listing closed.' : 'Listing reopened.', closeDialog) }}>{selected.status === 'open' ? 'Close listing' : 'Reopen listing'}</button></div></> : token ? <div className="tb-dialog-footer"><span>Already helped each other?</span><button className="tb-button" disabled={selected.status !== 'open'} onClick={() => setRecording(true)}>Record completed help</button></div> : <p className="tb-muted"><Link to={signInPath(selected.id)}>Sign in to arrange help and exchange hours.</Link></p>}
      </div>}
    </TimebankDialog>}
    {settings && <TimebankDialog title={newCommunity ? 'Create a community' : 'Community settings'} busy={busy} onClose={closeDialog}><form className="tb-form" onSubmit={(event) => {
      event.preventDefault()
      void run(async () => { const saved = await api<TimebankCommunity>(`/communities/${settings.id}`, { method: 'PUT', body: JSON.stringify(settings) }); if (newCommunity) setSavedDomain(saved.hostname); else { setDomainCommunity(saved); closeDialog() } }, newCommunity ? 'Community created. Connect its subdomain to make it available.' : 'Community settings saved.')
    }}>{modalError}<p className="tb-muted">Each community has its own listings, photos and hour ledger. Members use their shared Code Collective sign-in.</p>
      {newCommunity ? <label>Subdomain<div className="tb-domain-field"><input required pattern="[a-z][a-z0-9-]{2,39}" maxLength={40} value={settings.id} onChange={(event) => setSettings({ ...settings, id: event.target.value })} /><span>.codecollective.us</span></div></label> : <p className="tb-domain">{settings.hostname}</p>}
      <label>Community name<input required maxLength={80} value={settings.name} onChange={(event) => setSettings({ ...settings, name: event.target.value })} /></label>
      <label>Welcome message<input required maxLength={180} value={settings.tagline} onChange={(event) => setSettings({ ...settings, tagline: event.target.value })} /></label>
      <label>Accent color<input type="color" value={settings.accent_color} onChange={(event) => setSettings({ ...settings, accent_color: event.target.value })} /></label>
      {savedDomain && <p role="status">Saved {savedDomain}. Connect this hostname to the shared Code Collective site Worker in Cloudflare, then <a href={`https://${savedDomain}/`}>open the community</a>.</p>}
      <div className="tb-dialog-footer">{!newCommunity && <button type="button" className="tb-text-button" onClick={() => { setNewCommunity(true); setSettings({ id: '', hostname: '', name: '', tagline: '', accent_color: '#155e59' }); setError('') }}>＋ Create another community</button>}<button className="tb-button" disabled={busy} type="submit">{busy ? 'Saving…' : newCommunity ? 'Create community' : 'Save settings'}</button></div>
    </form></TimebankDialog>}
  </div>
}
