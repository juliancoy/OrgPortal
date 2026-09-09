import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../../app/AppProviders'
import { getDeviceNotificationState, enableDeviceNotifications, disableDeviceNotifications, type DeviceNotificationState } from '../../../infrastructure/platform/notificationDelivery'
import { useTimebankInbox, type TimebankNotice } from '../../timebank/TimebankInbox'
import { timebankNoticePath } from '../../timebank/links'

const deviceLabels: Record<DeviceNotificationState, string> = {
  enabled: 'Device alerts are on for this browser.', disabled: 'Device alerts are off for this browser.',
  denied: 'Notifications are blocked in your browser settings. Allow them there to enable device alerts.',
  unsupported: 'This browser does not support device alerts. Your notifications are still saved here.',
  unconfigured: 'Device alerts are not available yet. Your notifications are still saved here.',
  'native-unconfigured': 'Device alerts are not connected in this mobile build. Your notifications are still saved here.',
}
export function TimebankNotifications() {
  const inbox = useTimebankInbox()
  const { token, user } = useAuth()
  const navigate = useNavigate()
  const [onlyUnread, setOnlyUnread] = useState(false)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const [actionError, setActionError] = useState('')
  const [device, setDevice] = useState<DeviceNotificationState | null>(null)
  const [deviceError, setDeviceError] = useState('')
  const [deviceBusy, setDeviceBusy] = useState(false)
  useEffect(() => {
    let active = true
    if (token) void getDeviceNotificationState(token).then((state) => { if (active) setDevice(state) }).catch(() => { if (active) setDeviceError('Device settings could not be loaded.') })
    return () => { active = false }
  }, [token])
  const unread = inbox.items.filter((item) => item.status === 'unread')
  const items = onlyUnread ? unread : inbox.items
  const messages = inbox.conversations.filter((item) => (item.unread_count || 0) > 0)
  async function run(action: () => Promise<void>, success = '') {
    setBusy(true); setActionError(''); setStatus('')
    try { await action(); setStatus(success) } catch (err) { setActionError(err instanceof Error ? err.message : 'Please try again.') }
    finally { setBusy(false) }
  }
  async function openNotice(item: TimebankNotice) {
    await run(async () => { if (item.status === 'unread') await inbox.markRead([item.id]); navigate(timebankNoticePath(item.deep_link)) })
  }
  async function changeDevice() {
    if (!token) return
    setDeviceBusy(true); setDeviceError('')
    try {
      if (device === 'enabled') await disableDeviceNotifications(token)
      else await enableDeviceNotifications(token)
      setDevice(await getDeviceNotificationState(token))
    } catch (err) { setDeviceError(err instanceof Error ? err.message : 'Unable to update device alerts.') }
    finally { setDeviceBusy(false) }
  }
  return <section className="tb-notifications" aria-labelledby="tb-notifications-title">
    <div className="tb-notifications-heading"><div><h2 id="tb-notifications-title">Notifications</h2><p className="tb-muted">Messages and updates about your timebank activity.</p></div><button className="tb-text-button" disabled={busy || inbox.loading} onClick={() => { void run(inbox.refresh) }}>Refresh notifications</button></div>
    {inbox.error && <p role="alert" className="tb-alert">{inbox.error}</p>}{inbox.chatError && <p role="alert" className="tb-alert">{inbox.chatError}</p>}{actionError && <p role="alert" className="tb-alert">{actionError}</p>}<p role="status" className="tb-muted">{status}</p>
    <section className="tb-notification-device" aria-label="Device notifications"><div><h3>Device alerts</h3><p>{device ? deviceLabels[device] : deviceError ? 'Device settings are unavailable.' : 'Checking device settings…'}</p><small>Enable alerts on each device where you want to receive them.</small>{deviceError && <p role="alert">{deviceError}</p>}</div>{(device === 'disabled' || device === 'enabled') && <button className="tb-button tb-secondary" disabled={deviceBusy} onClick={() => { void changeDevice() }}>{deviceBusy ? 'Updating…' : device === 'enabled' ? 'Turn off on this device' : 'Enable device alerts'}</button>}</section>
    <section className="tb-notification-messages"><h3>Unread messages</h3>{messages.length ? <ul className="tb-notification-list">{messages.map((item) => {
      const name = item.members?.find((member) => member.user_id !== user?.id)?.user_name || item.title || 'Conversation'
      return <li key={item.id}><Link className="tb-notice-open" to={`/chat/${encodeURIComponent(item.id)}`}><span className="tb-notice-dot" aria-hidden="true" /><span><strong>{name}</strong><span>{item.last_message?.body || 'Open conversation'}</span></span><span className="tb-count">{item.unread_count}</span></Link></li>
    })}</ul> : <p className="tb-quiet">{inbox.loading ? 'Loading messages…' : inbox.chatError ? 'Open Messages to try again.' : 'No unread messages.'}</p>}<Link className="tb-text-link" to="/chat">Open all messages</Link></section>
    <section><div className="tb-notifications-heading"><h3>Timebank activity</h3><button className="tb-text-button" disabled={busy || !unread.length} onClick={() => { void run(() => inbox.markRead(unread.slice(0, 100).map((item) => item.id)), 'Displayed activity marked as read.') }}>Mark displayed activity read</button></div><label className="tb-mine"><input type="checkbox" checked={onlyUnread} onChange={(event) => setOnlyUnread(event.target.checked)} />Unread only</label>
      <ul className="tb-notification-list">{items.map((item) => <li key={item.id} data-notification-id={item.id} className={item.status === 'unread' ? 'is-unread' : ''}>
        <button className="tb-notice-open" disabled={busy} onClick={() => { void openNotice(item) }}><span className={`tb-notice-dot ${item.status === 'read' ? 'is-read' : ''}`} aria-hidden="true" /><span><strong>{item.title}<span className="tb-sr-only"> · {item.status}</span></strong><span>{item.body}</span><time dateTime={item.created_at}>{new Date(item.created_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</time></span></button>
        {item.status === 'unread' && <button className="tb-text-button tb-notice-read" disabled={busy} onClick={() => { void run(() => inbox.markRead([item.id]), 'Notification marked as read.') }}>Mark read</button>}
      </li>)}</ul>
      {!items.length && <p className="tb-quiet">{inbox.loading ? 'Loading activity…' : onlyUnread ? 'You’re all caught up.' : 'Request uptake and hour-exchange updates will appear here.'}</p>}
      {inbox.nextCursor && <button className="tb-button tb-secondary" disabled={busy} onClick={() => { void run(inbox.loadMore) }}>Load older activity</button>}
    </section>
  </section>
}
