// Synthetic content only. These records never leave the disposable render server.
const organizations=Array.from({length:6},(_,n)=>({id:'fixture-org'+n,name:['Harbor Research Collective','Open Health Community','Community Makers','Baltimore Science Exchange','Neighborhood Technology Lab','Design for Everyone'][n],slug:'fixture-'+n,description:'A community of researchers, builders, and neighbors turning shared ideas into practical projects. Join our monthly conversations and help shape what comes next.',image_url:null,membership_count:24+n*7,upcoming_events_count:n%3,feedback_count:0,pending_challenges_count:0,is_disputed:false,tags:[],city:'Baltimore'}))
export function fixtureData(path,params){
 if(path.endsWith('/admin/me'))return {is_sysadmin:false}
 if(path.endsWith('/scheme'))return {scheme:'nonprofit'}
 if(path.endsWith('/personnel'))return {classes:{},photos:{}}
 if(path.endsWith('/onboarding/availability'))return {start:'2026-10-24',end:'2026-10-31',timezone:'America/New_York',slots:Array.from({length:7*48},(_,n)=>new Date(Date.UTC(2026,9,24,4)+n*1800000).toISOString()),selected:[],suggested_slots:[]}
 if(path.endsWith('/onboarding'))return {enabled:true,organizationName:'LifeTech',organizationId:'fixture-org',start_date:'2026-10-24',end_date:'2026-11-24',completed_at:params.has('complete')?'2026-10-24T12:00:00Z':null,availability_saved_at:params.has('complete')?'2026-10-24T12:00:00Z':null,acknowledgements:params.has('complete')?{constitution:'2026-10-24',participation:'2026-10-24',selected_title:'Member'}:{},steps:[{id:'constitution',title:'Read the Constitution and bylaws',description:'Learn how the community works and how decisions are made.',href:'/governance/documents/lifetech-constitution'},{id:'participation',title:'Introduce yourself',description:'Meet the people you will be working with.',href:'/chat'}]}
 if(path.endsWith('/tasks'))return {tasks:[]}
 if(path.endsWith('/support'))return {tickets:[{id:'fixture-ticket',organization_id:'fixture-org',sender_email:'member@example.invalid',subject:'Help finding our next community meeting',category:'general',status:'open',assigned_user_id:null,updated_at:'2026-10-24T12:00:00Z'}],organizations:[{id:'fixture-org',name:'LifeTech'}],defaultOrganizationId:'fixture-org'}
 if(path.includes('/support/settings/'))return {canManage:false,canSend:false,activation:{enabled:true,sendingConfigured:false,mailboxAddress:null},faqs:[],routes:[],admins:[]}
 if(path.includes('/notifications'))return {notifications:[],unread:0,unread_count:0}
 if(path.includes('/connections/requests'))return {requests:[]}
 if(path.includes('/users')||path.endsWith('/people'))return Array.from({length:6},(_,n)=>({user_id:'fixture-person-'+n,user_name:['Alex Morgan','Sam Rivera','Jordan Lee','Taylor Bennett','Casey Patel','Avery Brooks'][n],public_profile:true,profile_visibility:'public',headline:['Community organizer','Biomedical researcher','Software engineer','Product designer','Volunteer coordinator','Graduate researcher'][n],photo_url:null}))
 if(path.includes('/events'))return [{id:'fixture-event',slug:'community-workshop',title:'Build something together: community workshop',starts_at:'2027-01-24T18:00:00Z',ends_at:'2027-01-24T20:00:00Z',description:'An open afternoon for sharing ideas, meeting collaborators, and making progress on community projects.',location:'Baltimore, Maryland',image_url:null,source_url:'https://example.invalid/workshop',host_org_name:'LifeTech',host_org_id:'fixture-org',links:[]}]
 if(path.includes('/calendar/'))return {connected:false}
 if(path.includes('/orgs')&&path.endsWith('/membership'))return {status:'active',role:'member',membership_count:24}
 if(path.includes('/orgs'))return params.get('empty')==='1'?[]:organizations
 return {}
}
