import {useEffect,useRef,useState} from 'react'
import {useAuth} from '../../app/AppProviders'
import {getDeviceNotificationState,enableDeviceNotifications,disableDeviceNotifications,type DeviceNotificationState} from '../../infrastructure/platform/notificationDelivery'
import {EmailPreferencesPage} from './email/EmailPreferencesPage'
type Preferences={organization_status_email:boolean;organization_status_push:boolean;push_enabled:boolean;email_delivery_ready?:boolean}
const deviceLabels:Record<DeviceNotificationState,string>={enabled:'Push notifications are enabled on this device.',disabled:'Push notifications are off on this device.',denied:'Allow notifications in your browser settings to enable push on this device.',unsupported:'This browser does not support push notifications.',unconfigured:'Push delivery is not configured yet.','native-unconfigured':'Push notifications are not available in this mobile build.'}
export function NotificationSettingsPage() {
 const {token,user}=useAuth()
 const identity=useRef(token);identity.current=token
 const [prefs,setPrefs]=useState<Preferences|null>(null),[device,setDevice]=useState<DeviceNotificationState|null>(null)
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[status,setStatus]=useState('')
 useEffect(()=>{
  let active=true;setPrefs(null);setDevice(null);setError('');setStatus('');setBusy(false)
  if(!token)return
  void fetch('/api/org/api/notifications/preferences',{headers:{Authorization:`Bearer ${token}`}}).then(async response=>{if(!response.ok)throw new Error('Notification preferences could not be loaded.');const data=await response.json() as Preferences;if(active)setPrefs(data)}).catch(error=>{if(active)setError(error.message)})
  void getDeviceNotificationState(token).then(value=>{if(active)setDevice(value)}).catch(()=>{if(active)setError('Device notification settings could not be loaded.')})
  return()=>{active=false}
 },[token,user?.id])
 async function save(key:keyof Pick<Preferences,'organization_status_email'|'organization_status_push'|'push_enabled'>,value:boolean) {
  const actingToken=token
  setBusy(true);setError('');setStatus('')
  try {const response=await fetch('/api/org/api/notifications/preferences',{method:'PUT',headers:{Authorization:`Bearer ${actingToken}`,'Content-Type':'application/json'},body:JSON.stringify({[key]:value})});if(!response.ok)throw new Error('Notification preferences could not be saved.');const data=await response.json();if(identity.current!==actingToken)return;setPrefs(previous=>previous?{...previous,...data}:data);setStatus('Notification preferences saved.')}catch(error){if(identity.current===actingToken)setError(error instanceof Error?error.message:'Please try again.')}finally{if(identity.current===actingToken)setBusy(false)}
 }
 async function changeDevice() {
  if(!token)return
  const actingToken=token
  setBusy(true);setError('');setStatus('')
  try {if(device==='enabled')await disableDeviceNotifications(actingToken);else await enableDeviceNotifications(actingToken);const state=await getDeviceNotificationState(actingToken);if(identity.current!==actingToken)return;setDevice(state);setStatus('Device notification setting updated.')}catch(error){if(identity.current===actingToken)setError(error instanceof Error?error.message:'Device notifications could not be updated.')}finally{if(identity.current===actingToken)setBusy(false)}
 }
 return <section className="panel"><h1>Notification settings</h1><p>These preferences belong to your account and apply across all organizations.</p>
  {error&&<p role="alert">{error}</p>}<p role="status">{status}</p>
  {!prefs&&!error&&<p>Loading notification settings…</p>}
  {prefs&&<>
   <section className="portal-card" style={{marginBottom:'1rem'}}><h2>Organization status changes</h2><p>Get notified when you join or leave an organization, claim it, or your member or organizer role changes. Email is enabled by default.</p>
    <label style={{display:'flex',gap:'.75rem',marginBottom:'.75rem'}}><input type="checkbox" checked={prefs.organization_status_email} disabled={busy} onChange={event=>void save('organization_status_email',event.target.checked)}/>Email me about organization status changes</label>
    <label style={{display:'flex',gap:'.75rem'}}><input type="checkbox" checked={prefs.organization_status_push} disabled={busy} onChange={event=>void save('organization_status_push',event.target.checked)}/>Send push notifications about organization status changes</label>
    {prefs.organization_status_email&&prefs.email_delivery_ready===false&&<p className="muted">Your email preference is on. Email delivery is awaiting sender setup; status updates will remain queued.</p>}
   </section>
   <section className="portal-card" style={{marginBottom:'1rem'}}><h2>Push notifications</h2>
    <label style={{display:'flex',gap:'.75rem'}}><input type="checkbox" checked={prefs.push_enabled} disabled={busy} onChange={event=>void save('push_enabled',event.target.checked)}/>Allow push notifications for my account</label>
    <p>{device?deviceLabels[device]:'Checking this device…'}</p><p className="muted">Enable push on each device where you want alerts. Turning off account push stops alerts on all your devices.</p>
    {(device==='enabled'||device==='disabled')&&<button type="button" className="btn-secondary" disabled={busy} onClick={()=>void changeDevice()}>{device==='enabled'?'Disable push on this device':'Enable push on this device'}</button>}
   </section>
  </>}
  <EmailPreferencesPage embedded/>
 </section>
}
