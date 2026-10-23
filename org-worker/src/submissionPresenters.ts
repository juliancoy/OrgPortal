import { HTTPException } from 'hono/http-exception';

type Reference={userId:string}|{invitationId:string};
export async function validateSubmissionPresenters(db:D1Database,org:string,input:unknown):Promise<string>{
 if(!Array.isArray(input)||input.length<1||input.length>51)throw new HTTPException(400,{message:'Choose between 1 and 51 teammates'});
 const references:Reference[]=[],seen=new Set<string>();
 for(const value of input){
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==1)throw new HTTPException(400,{message:'Choose a portal member or a team invitation'});
  const user=value.userId,invitation=value.invitationId;
  if((typeof user!=='string'||!user||user.length>255)&&(typeof invitation!=='string'||!invitation||invitation.length>255))throw new HTTPException(400,{message:'Invalid presenter'});
  if(typeof user==='string'){
   const member=await db.prepare("SELECT user_id FROM organization_memberships WHERE organization_id=? AND user_id=? AND status='active'").bind(org,user).first();
   if(!member)throw new HTTPException(400,{message:'A presenter must belong to this team'});
   const key='user:'+user;if(!seen.has(key)){references.push({userId:user});seen.add(key)}
  }else{
   const row=await db.prepare("SELECT i.id,i.status,i.accepted_user_id FROM organization_invitations i WHERE i.id=? AND i.organization_id=? AND i.purpose='member' AND ((i.status='pending' AND i.expires_at>?) OR (i.status='accepted' AND EXISTS(SELECT 1 FROM organization_memberships m WHERE m.organization_id=i.organization_id AND m.user_id=i.accepted_user_id AND m.status='active')))").bind(invitation,org,Date.now()).first<{id:string;status:string;accepted_user_id:string|null}>();
   if(!row)throw new HTTPException(400,{message:'The presenter invitation expired or does not belong to this team'});
   const reference:Reference=row.accepted_user_id?{userId:row.accepted_user_id}:{invitationId:row.id},key=row.accepted_user_id?'user:'+row.accepted_user_id:'invitation:'+row.id;
   if(!seen.has(key)){references.push(reference);seen.add(key)}
  }
 }
 return JSON.stringify(references);
}

// Called only after the parent query has established public or management scope.
// Public output never includes user IDs, invitation IDs or contact addresses.
export async function submissionPresenters(db:D1Database,event:string,ids:string[],privateView=false){
 if(!ids.length)return new Map<string,Record<string,unknown>[]>();
 const records:{submission_id:string;user_id:string|null;user_name:string|null;photo_url:string|null;invitation_id:string|null;invitation_email:string|null;invitation_status:string|null;invitation_expiry:number|null}[]=[];
 // Stay below D1's bound-parameter limit even for the 200-entry manager list.
 for(let offset=0;offset<ids.length;offset+=90){const page=ids.slice(offset,offset+90);
 const rows=await db.prepare(`SELECT s.submission_id,m.user_id,m.user_name,u.photo_url,
  i.id AS invitation_id,i.email AS invitation_email,i.status AS invitation_status,i.expires_at AS invitation_expiry
  FROM event_submissions s JOIN json_each(s.presenters_json) p
  LEFT JOIN organization_invitations i ON i.id=json_extract(p.value,'$.invitationId') AND i.organization_id=s.organization_id
  LEFT JOIN organization_memberships m ON m.organization_id=s.organization_id AND m.status='active' AND m.user_id=COALESCE(json_extract(p.value,'$.userId'),i.accepted_user_id)
  LEFT JOIN user_contact_pages u ON u.user_id=m.user_id AND u.enabled=1
  WHERE s.event_id=? AND s.submission_id IN (${page.map(()=>'?').join(',')}) ORDER BY s.submission_id,CAST(p.key AS INTEGER)`).bind(event,...page).all<{submission_id:string;user_id:string|null;user_name:string|null;photo_url:string|null;invitation_id:string|null;invitation_email:string|null;invitation_status:string|null;invitation_expiry:number|null}>();
 records.push(...rows.results);
 }
 const result=new Map<string,Record<string,unknown>[]>();
 for(const row of records){
  let person:Record<string,unknown>;
  if(row.user_id)person={name:row.user_name||'Team presenter',...(row.photo_url?{photo:row.photo_url}:{}),...(privateView?{userId:row.user_id}: {})};
  else if(row.invitation_status==='pending'&&Number(row.invitation_expiry)>Date.now())person=privateView?{name:row.invitation_email,email:row.invitation_email,invitationId:row.invitation_id}:{name:'Invited presenter',pending:true};
  else continue;
  const people=result.get(row.submission_id)||[];people.push(person);result.set(row.submission_id,people);
 }
 return result;
}
