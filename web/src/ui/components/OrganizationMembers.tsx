import { OrganizationEmailInvite } from './OrganizationEmailInvite'
import { useOrganizationPersonnel } from '../hooks/useOrganizationPersonnel'
import { OrganizationPersonnelActions } from './OrganizationPersonnelActions'
import { OrganizationAvatar } from './OrganizationAvatar'
import { personnelClasses, personnelSchemes, type PersonnelScheme } from '../../../../shared/organizationPersonnel'
import { SignInLink } from './SignInLink'
import './OrganizationMembers.css'
import { useEffect, useId, useState } from 'react'
import { useAuth } from '../../app/AppProviders'
import { toUserFacingErrorMessage } from '../../infrastructure/http/userFacingError'
import { uniqueAccounts } from './organizationMemberSearch'
import type { NetworkUser } from '../views/peopleDirectory'

type Member = { description?: string | null; portrait?: {url:string;source_url:string}|null; titles?: string[]; photo_url?: string | null; personnel_class?: string | null; status?: string; user_id: string; user_name?: string | null; role: string; user_email?: string | null; pending_organizer?: number; onboarding_completed_at?: string | null }

async function readResponse<T>(response: Response): Promise<T> {
  const data = await response.json()
  if (!response.ok) throw new Error(data.detail || data.error || `Request failed (${response.status})`)
  return data as T
}

export function OrganizationMembers({ organizationId, name, canRead, canManage, membershipCount, scheme, memberType = 'community' }: {
  organizationId: string; name: string; canRead: boolean; canManage: boolean; membershipCount: number; scheme: PersonnelScheme; memberType?: 'community' | 'team'
}) {
  const memberLabel = memberType === 'team' ? 'Team' : 'Community'
  const { token } = useAuth()
  const personnelFor = useOrganizationPersonnel(organizationId)
  const searchId = useId()
  const [requests, setRequests] = useState<NetworkUser[]>([])
  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [people, setPeople] = useState<NetworkUser[]>([])
  const [searchOffset, setSearchOffset] = useState(0)
  const [nextSearchOffset, setNextSearchOffset] = useState<number | null>(null)
  useEffect(() => { setSearchOffset(0) }, [query])
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState('')
  const [adding, setAdding] = useState<string | null>(null)
  const [status, setStatus] = useState('')
  const [preview, setPreview] = useState<{ previewId: string; person: NetworkUser; role: 'member' | 'administrator'; assignment?: { pending_organizer: number } | null } | null>(null)
  const [revision, setRevision] = useState(0)
  const [editingTitles,setEditingTitles]=useState<string|null>(null)
  const [titlesDraft,setTitlesDraft]=useState('')
  const [descriptionDraft,setDescriptionDraft]=useState('')
  const roleScheme = scheme
  const [portraitUrl,setPortraitUrl]=useState(''),[portraitSource,setPortraitSource]=useState('')
  const [titlePreview,setTitlePreview]=useState<{previewId:string;titles:string[];description:string|null;portrait:{url:string;source_url:string}|null;before:{titles:string[];description:string|null}}|null>(null)
  const url = `/api/org/api/network/orgs/${encodeURIComponent(organizationId)}/members`

  useEffect(() => { setPreview(null); setQuery(''); setStatus(''); setEditingTitles(null); setTitlePreview(null) }, [organizationId, token])

  useEffect(() => {
    setMembers([]); setError('')
    if (!token || !canRead) return
    const controller = new AbortController()
    setLoading(true)
    void fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal })
      .then(readResponse<Member[]>).then(rows => { if (!controller.signal.aborted) setMembers(uniqueAccounts(rows)) })
      .catch(err => { if (!controller.signal.aborted) setError(toUserFacingErrorMessage(err, `Could not load ${memberType} members.`)) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [url, token, canRead, membershipCount, revision, memberType])

  useEffect(() => {
    setRequests([])
    if (!token || !canManage) return
    const controller = new AbortController()
    void fetch(`/api/org/api/network/orgs/${encodeURIComponent(organizationId)}/membership-requests`, {headers:{Authorization:`Bearer ${token}`},signal:controller.signal})
      .then(readResponse<NetworkUser[]>).then(setRequests)
      .catch(err=>{if(!controller.signal.aborted)setError(toUserFacingErrorMessage(err,'Could not load join requests.'))})
    return ()=>controller.abort()
  }, [organizationId, token, canManage, revision])

  async function declineRequest(person: NetworkUser) {
    if (!token || adding) return
    setAdding(person.user_id)
    try {
      await readResponse(await fetch(`/api/org/api/network/orgs/${encodeURIComponent(organizationId)}/membership-requests/${encodeURIComponent(person.user_id)}`,{method:'DELETE',headers:{Authorization:`Bearer ${token}`}}))
      setRevision(value=>value+1)
    } catch(err) {setSearchError(toUserFacingErrorMessage(err,'Could not decline request.'))}
    finally {setAdding(null)}
  }

  useEffect(() => {
    if (!searchOffset) setPeople([]); setNextSearchOffset(null); setSearchError(''); setSearching(false)
    if (!token || !canManage || query.trim().length < 2) return
    const controller = new AbortController()
    setSearching(true)
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams({ q: query.trim(), limit: '40', offset: String(searchOffset) })
      void fetch(`/api/org/api/network/users/lookup?${params}`, { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal })
        .then(readResponse<{people:NetworkUser[];nextOffset:number|null}>).then(result => { if (!controller.signal.aborted) {setPeople(previous => uniqueAccounts([...(searchOffset ? previous : []), ...result.people]));setNextSearchOffset(result.nextOffset)} })
        .catch(err => { if (!controller.signal.aborted) setSearchError(toUserFacingErrorMessage(err, 'Could not search people.')) })
        .finally(() => { if (!controller.signal.aborted) setSearching(false) })
    }, 250)
    return () => { controller.abort(); window.clearTimeout(timer) }
  }, [query, token, canManage, searchOffset])

  async function assignMember(person: NetworkUser, role: 'member' | 'administrator', confirm = false) {
    if (!token || !canManage || adding) return
    setAdding(person.user_id); setSearchError(''); setStatus('')
    const payload = { user_id: person.user_id, user_name: person.user_name || undefined, role,
      ...(role === 'member' ? { add_only: true } : {}),
      ...(confirm && preview ? { previewId: preview.previewId } : {}) }
    try {
      const data = await readResponse<{ previewId: string; result?: Member; assignment?: { pending_organizer: number } | null }>(await fetch(`${url}/${confirm ? 'apply' : 'preview'}`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }))
      if (!confirm) setPreview({ previewId: data.previewId, person, role, assignment: data.assignment })
      else {
        setPreview(null); setRevision(value => value + 1);window.dispatchEvent(new CustomEvent('organization-member-titles-updated',{detail:{organizationId}}))
        setStatus(data.result?.pending_organizer ? `${person.user_name} is an organizer pending onboarding.` : `${person.user_name} assigned as ${role === 'administrator' ? 'an organizer' : 'a member'}.`)
      }
    } catch (err) { setPreview(null); setSearchError(toUserFacingErrorMessage(err, 'Could not update membership.')) }
    finally { setAdding(null) }
  }

  async function saveTitles(member:Member,confirm=false) {
    if(!token||!canManage||adding)return
    setAdding(member.user_id);setError('');setStatus('')
    const titles=titlesDraft.split('\n').map(value=>value.trim()).filter(Boolean)
    try {
      const result=await readResponse<{previewId:string;titles:string[];description:string|null;portrait:{url:string;source_url:string}|null;before:{titles:string[];description:string|null}}>(await fetch(`${url}/${encodeURIComponent(member.user_id)}/titles/${confirm?'apply':'preview'}`,{
        method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({titles,description:descriptionDraft.trim()||null,portrait:portraitUrl.trim()||portraitSource.trim()?{url:portraitUrl.trim(),source_url:portraitSource.trim()}:null,...(confirm&&titlePreview?{previewId:titlePreview.previewId}:{})}),
      }))
      if(!confirm)setTitlePreview(result)
      else{setEditingTitles(null);setTitlePreview(null);setRevision(value=>value+1);setStatus(`Roles saved for ${member.user_name||'this member'}.`);window.dispatchEvent(new CustomEvent('organization-member-titles-updated',{detail:{organizationId}}))}
    }catch(reason){setTitlePreview(null);setError(toUserFacingErrorMessage(reason,'Could not save organization roles.'))}
    finally{setAdding(null)}
  }

  if(!canManage && !error && ((!canRead && membershipCount === 0) || (canRead && !loading && members.length === 0)))return null
  return <details className="personnel-member-tools"><summary>{canManage ? 'Edit profiles and member access' : 'Member directory'}</summary><section className="portal-card organization-members" aria-label={`${memberLabel} members`}>
    <h2>{memberLabel} members <span className="muted">({canRead && !loading && !error ? members.length : membershipCount})</span></h2>
    {canManage && requests.length > 0 && <section aria-label="Join requests"><h3>Join requests</h3><p>Requests grant no access until you approve them.</p><ul>{requests.map(person=><li key={person.user_id}>{person.user_name || person.user_id} <button type="button" disabled={!!adding || !!preview} onClick={()=>void assignMember(person,'member')}>Review request</button> <button type="button" disabled={!!adding || !!preview} onClick={()=>void declineRequest(person)}>Decline</button></li>)}</ul></section>}
    {!canRead ? <p className="muted">{token ? `Join ${name} to see ${memberType} members.` : <><SignInLink /> to see {memberType} members.</>}</p> : <>
      {loading && <p role="status">Loading members…</p>}
      {error && <p role="alert">{error} <button type="button" onClick={() => setRevision(value => value + 1)}>Retry</button></p>}
      {!loading && !error && (members.length ? <ul className="organization-members-list">
        {members.map(member => <li key={member.user_id}>
          <OrganizationAvatar name={member.user_name || `${memberLabel} member`} src={member.photo_url || personnelFor.photoFor(member.user_id)} status={personnelFor(member.user_id)} scheme={scheme} titles={member.titles} />
          <div className="organization-member-identity">{member.user_name || `${memberLabel} member`}<small className="muted" style={{ display: 'block', overflowWrap: 'anywhere' }}>{member.user_email || 'Portal member'}</small>{!!member.titles?.length && <span className="organization-member-titles">{member.titles.map(title=><span className="pill" key={title}>{title}</span>)}</span>}</div>
          <span className="pill">{personnelFor(member.user_id) === 'persona_non_grata' ? personnelClasses.persona_non_grata.label : member.pending_organizer ? (member.onboarding_completed_at ? 'Organizer ready for activation' : 'Organizer pending onboarding') : member.role === 'administrator' ? 'Organizer' : member.role === 'owner' ? 'Owner' : 'Member'}</span>
          {canManage && <button type="button" className="btn-secondary" disabled={!!adding||!!preview} onClick={()=>{setEditingTitles(member.user_id);setTitlesDraft((member.titles||[]).join('\n'));setDescriptionDraft(member.description||'');setPortraitUrl(member.portrait?.url||'');setPortraitSource(member.portrait?.source_url||'');setTitlePreview(null);setStatus('')}}>Edit roles</button>}
          {editingTitles===member.user_id && canManage && <form className="organization-title-editor" aria-label={`Roles for ${member.user_name||'member'}`} onSubmit={event=>{event.preventDefault();void saveTitles(member,!!titlePreview)}}>
            <label>Add a class<select aria-label="Add a class" value="" onChange={event=>{const value=event.target.value;if(value){setTitlesDraft(previous=>[...new Set([...previous.split('\n').map(title=>title.trim()).filter(Boolean),value])].join('\n'));setTitlePreview(null)}}}><option value="">Choose a class…</option>{Object.entries(personnelSchemes[roleScheme].classes).map(([key,value])=><option key={key} value={value.label}>{value.label}</option>)}</select></label>
            <label>Organization roles (one per line)<textarea rows={3} maxLength={808} value={titlesDraft} onChange={event=>{setTitlesDraft(event.target.value);setTitlePreview(null)}} placeholder={'CEO\nAdvisor'} /></label>
            <label>Personnel description or bio<textarea aria-label="Personnel description or bio" rows={4} maxLength={600} value={descriptionDraft} onChange={event=>{setDescriptionDraft(event.target.value);setTitlePreview(null)}} placeholder="A short introduction and their work with this organization" /></label>
            <label>Personnel photo URL<input type="url" maxLength={2048} value={portraitUrl} onChange={event=>{setPortraitUrl(event.target.value);setTitlePreview(null)}} placeholder="https://…" /></label>
            <label>Photo source page<input type="url" maxLength={2048} required={!!portraitUrl.trim()} value={portraitSource} onChange={event=>{setPortraitSource(event.target.value);setTitlePreview(null)}} placeholder="https://…" /></label>
            <p className="muted">Up to eight roles, such as CEO, Geneticist, or Advisor. Roles, descriptions and optional sourced photos appear on the public Personnel tab. Publishing a photo also lists the person in Personnel. Membership access is separate. Clearing the photo restores their public profile image or initials.</p>
            {titlePreview && <p role="status">Current roles: {titlePreview.before.titles.join(', ')||'None'}. New roles: {titlePreview.titles.join(', ')||'None'}. Public description: {titlePreview.description||'Use enabled public bio or headline'}.</p>}
            {titlePreview && <div>{titlePreview.portrait?<><OrganizationAvatar name={member.user_name||'Member'} src={titlePreview.portrait.url} status={personnelFor(member.user_id)} scheme={scheme} titles={member.titles} /><a href={titlePreview.portrait.source_url} target="_blank" rel="noopener noreferrer">Review photo source</a></>:<p>Photo: public profile image or initials.</p>}</div>}
            <div><button type="submit" className="btn-primary" disabled={!!adding}>{adding===member.user_id?'Saving…':titlePreview?'Save roles':'Review roles'}</button><button type="button" className="btn-secondary" disabled={!!adding} onClick={()=>{setEditingTitles(null);setTitlePreview(null)}}>Cancel</button></div>
          </form>}
          {canManage && member.role === 'member'  && (!member.pending_organizer || member.onboarding_completed_at) && <button type="button" disabled={!!adding || !!preview} onClick={() => void assignMember({ user_id: member.user_id, user_name: member.user_name || 'Community member' } as NetworkUser, 'administrator')}>{member.pending_organizer ? 'Activate organizer' : 'Assign organizer'}</button>}
        </li>)}
      </ul> : <p className="muted">No {memberType} members yet.</p>)}
    </>}
    {canRead && <OrganizationPersonnelActions organizationId={organizationId} canManage={canManage} />}
    {canManage && <div className="organization-member-search">
      <label htmlFor={searchId}>Add people by email or portal member name</label>
      <input id={searchId} type="search" value={query} onChange={event => { setQuery(event.target.value); setPreview(null) }} placeholder="Email address or existing member’s name" />
      {searching && <p role="status">Searching people…</p>}
      {searchError && <p role="alert">{searchError}</p>}
      {query.trim() && !searching && !searchError && !people.length && <p className="muted">No people match “{query.trim()}”.</p>}
      {!searching && !searchError && !people.length && <OrganizationEmailInvite key={query} organizationId={organizationId} email={query} purpose="member" />}
      {!!people.length && <ul className="organization-members-list" aria-label="People search results">
        {people.map(person => {
          const alreadyMember = members.some(member => member.user_id === person.user_id)
          return <li key={person.user_id}>
            <OrganizationAvatar name={person.user_name} src={person.photo_url} status={personnelFor(person.user_id)} />
            <div className="organization-member-identity"><strong>{person.user_name}</strong><small className="muted" style={{ display: 'block', overflowWrap: 'anywhere' }}>{person.email || 'Portal member'}</small>{person.headline && <p className="muted">{person.headline}</p>}</div>
            {alreadyMember ? <span className="pill">Already a member</span> : <button type="button" className="btn-secondary" disabled={!!adding || !!preview || loading || !!error} onClick={() => void assignMember(person, 'member')} aria-label={`Add ${person.user_name}`}>
              {adding === person.user_id ? 'Adding…' : 'Add'}
            </button>}
            {!members.some(member => member.user_id === person.user_id && (member.role !== 'member' || member.pending_organizer)) && <button type="button" disabled={!!adding || !!preview || loading || !!error} onClick={() => void assignMember(person, 'administrator')}>Assign organizer</button>}
          </li>
        })}
      </ul>}
      {nextSearchOffset !== null && <button type="button" className="btn-secondary" disabled={searching} onClick={() => setSearchOffset(nextSearchOffset)}>Load more portal members</button>}
      {preview && <div role="region" aria-label="Review membership assignment">
        <h3>Review assignment</h3>
        <p>{preview.person.user_name}</p>
        <p>{preview.role === 'member' ? 'Add as a member. Existing roles are retained.' : preview.assignment?.pending_organizer ? 'Organizer pending onboarding. Member permissions remain until onboarding is complete and an organizer activates the role.' : 'Activate organizer permissions.'}</p>
        <button type="button" disabled={!!adding} onClick={() => void assignMember(preview.person, preview.role, true)}>Confirm assignment</button>
        <button type="button" disabled={!!adding} onClick={() => setPreview(null)}>Cancel</button>
      </div>}
      {status && <p role="status">{status}</p>}
    </div>}
  </section></details>
}
