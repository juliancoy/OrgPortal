import {createRoot} from 'react-dom/client'
import {MemoryRouter,Routes,Route} from 'react-router-dom'
import {EventApplicationPage,ApplicationConfirmation,ApplicationPageHeader} from '../../src/ui/views/public/EventApplicationPage'
import {applicationBrandStyle} from '../../src/config/applicationBranding'
import {applyPortalBranding} from '../../src/config/portalBranding'
import {setGroupSite} from '../../src/config/timebankCommunity'
import {formDraftKey,writeFormDraft} from '../../src/ui/hooks/localFormDraft'
import '../../src/index.css'
import '../../src/styles/theme-foundation.css'
import '../../src/styles/themes/orgportal.css'
import '../../src/styles/themes/lifetech.css'
import '../../src/tenantBranding.css'
const params=new URLSearchParams(location.search)
setGroupSite({id:'lifetech',slug:'lifetech',organization_id:'fixture-org',hostname:'lifetech.fyi',name:'LifeTech',tagline:'Health × Medicine × Biotech',accent_color:'#155e59',profile:'lifetech',features:['events'],brand_image_path:'/assets/images/lifetech-logo.png'})
applyPortalBranding()
document.documentElement.dataset.theme=localStorage.getItem('orgportal.theme')||'dark'
if(params.has('existing')||params.has('edit'))writeFormDraft(localStorage,formDraftKey('fixture-member','presentation:fixture-event')!,{submissionId:params.has('edit')?'fixture-submission':'',editing:params.has('edit')?'true':'',imageOrg:'',imageUrl:'',org:'fixture-org',name:'',city:'Baltimore',description:'',title:'Making home rehabilitation more accessible',summary:'We are building an affordable wearable that helps people track their recovery at home. Our demo shows how patients and care teams can turn daily movement into useful feedback.',people:'[]'})
createRoot(document.getElementById('root')!).render(<MemoryRouter initialEntries={['/events/demo-day/apply'+location.search]}><main className="application-preview" style={{maxWidth:1120,margin:'0 auto',padding:'0 16px',boxSizing:'border-box'}}>{params.has('confirmation')?<div className="event-application-page" style={applicationBrandStyle()}><ApplicationPageHeader eventTitle="LifeTech Demo Day" submitted/><ApplicationConfirmation eventPath="/events/demo-day" submissionId="fixture-submission" editing={false}/></div>:<Routes><Route path="/events/:slug/apply" element={<EventApplicationPage/>}/></Routes>}</main></MemoryRouter>)
