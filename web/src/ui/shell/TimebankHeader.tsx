import { useTimebankInbox } from '../timebank/TimebankInbox'
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../../app/AppProviders'
import { useDomainCommunity, timebankHomePath } from '../../config/timebankCommunity'
import { getActivePortalProfileConfig } from '../../config/portalFeatures'
import { portalPath } from '../../config/portalBase'
import './timebank-shell.css'

function AccountIcon({ children }: { children: ReactNode }) {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
}

function ProfilePhoto({ src, name }: { src?: string | null; name: string }) {
  const [failed, setFailed] = useState(false)
  const parts = name.trim().split(/\s+/)
  const initials = [parts[0], ...(parts.length > 1 ? [parts[parts.length - 1]] : [])].map((part) => Array.from(part)[0] || '').join('').toLocaleUpperCase()
  return <span className="tb-account-avatar" aria-hidden="true">
    {src && !failed ? <img src={src} alt="" width="40" height="40" referrerPolicy="no-referrer" onError={() => setFailed(true)} /> : <span>{initials || '?'}</span>}
  </span>
}

export function TimebankHeader() {
  const community = useDomainCommunity()
  const profile = getActivePortalProfileConfig()
  const { user, role, logout } = useAuth()
  const location = useLocation()
  const inbox = useTimebankInbox()
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelId = useId()
  const name = user?.displayName || user?.email || 'My account'
  const close = () => setOpen(false)

  useEffect(close, [location.pathname, location.search, role])
  useEffect(() => {
    if (!open) return
    const outside = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      setOpen(false)
      triggerRef.current?.focus()
    }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('pointerdown', outside)
      document.removeEventListener('keydown', escape)
    }
  }, [open])

  return <header className="tb-shell-header">
    <Link to={timebankHomePath()} className="tb-shell-brand" aria-label={`${community?.name || 'Code Collective Timebank'} home`}>
      <span className="tb-shell-mark">{profile.brandImagePath ? <img src={portalPath(profile.brandImagePath)} alt="" /> : <AccountIcon><circle cx="12" cy="12" r="9" /><path d="M12 6v6l4 2" /></AccountIcon>}</span>
      <span>{community?.name || 'Code Collective Timebank'}</span>
    </Link>
    {role !== 'guest' ? <div className="tb-shell-actions"><Link to="/chat" className="tb-messages-link" aria-label={`Messages${inbox.unreadMessages ? `, ${inbox.unreadMessages} unread` : ''}`} aria-current={location.pathname.startsWith('/chat') ? 'page' : undefined}><AccountIcon><path d="M21 11a9 9 0 0 1-9 9H4l-3 2V11a10 10 0 0 1 20 0Z" /><path d="M7 10h8M7 14h5" /></AccountIcon><span className="tb-messages-label">Messages</span>{inbox.unreadMessages > 0 && <span className="tb-inbox-badge" aria-hidden="true">{inbox.unreadMessages > 99 ? '99+' : inbox.unreadMessages}</span>}</Link><div className="tb-account-menu" ref={menuRef} onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false)
    }}>
      <button type="button" className="tb-account-trigger" ref={triggerRef} aria-label={`${name}: account menu`} aria-expanded={open} aria-controls={panelId} onClick={() => setOpen((value) => !value)}>
        <ProfilePhoto key={user?.avatarUrl || 'initials'} src={user?.avatarUrl} name={name} />
        <span className="tb-account-trigger-name">{name}</span>
        <svg className="tb-account-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
      </button>
      {open && <div className="tb-account-panel" id={panelId}>
        <div className="tb-account-identity"><ProfilePhoto key={user?.avatarUrl || 'initials'} src={user?.avatarUrl} name={name} /><div><strong>{name}</strong>{user?.email && <span>{user.email}</span>}</div></div>
        <nav aria-label="Account">
          <Link to="/profile" onClick={close}><AccountIcon><circle cx="12" cy="8" r="4" /><path d="M4 21v-2a8 8 0 0 1 16 0v2" /></AccountIcon><span>Profile &amp; photo</span></Link>
          <Link to="/settings" onClick={close}><AccountIcon><path d="M4 7h16M4 17h16" /><circle cx="9" cy="7" r="3" fill="var(--panel)" /><circle cx="15" cy="17" r="3" fill="var(--panel)" /></AccountIcon><span>Account settings</span></Link>
        </nav>
        <div className="tb-account-signout"><button type="button" onClick={() => { close(); logout() }}><AccountIcon><path d="M9 4H4v16h5M9 12h12m-5-5 5 5-5 5" /></AccountIcon><span>Sign out</span></button></div>
      </div>}
    </div></div> : <Link className="tb-signin" to={`/users/login?next=${encodeURIComponent(timebankHomePath())}`}>Sign in</Link>}
  </header>
}
