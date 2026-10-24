import {createRoot} from 'react-dom/client'
import {MemoryRouter} from 'react-router-dom'
import {EventPresentations} from '../../src/ui/components/EventPresentations'
import {applyPortalBranding} from '../../src/config/portalBranding'
import {setGroupSite} from '../../src/config/timebankCommunity'
import {formDraftKey,writeFormDraft} from '../../src/ui/hooks/localFormDraft'
import '../../src/index.css'
import '../../src/styles/theme-foundation.css'
import '../../src/styles/themes/orgportal.css'
import '../../src/styles/themes/lifetech.css'
import '../../src/tenantBranding.css'
const params=new URLSearchParams(location.search)
setGroupSite({id:'lifetech',slug:'lifetech',organization_id:'fixture-org',hostname:'lifetech.fyi',name:'LifeTech',tagline:'Health × Medicine × Biotech',accent_color:'#155e59',profile:'lifetech',features:['events'],brand_image_path:'/orgportal.svg'})
applyPortalBranding()
document.documentElement.dataset.theme=localStorage.getItem('orgportal.theme')||'dark'
if(params.has('existing')||params.has('edit'))writeFormDraft(localStorage,formDraftKey('fixture-member','presentation:fixture-event')!,{submissionId:params.has('edit')?'fixture-submission':'',editing:params.has('edit')?'true':'',imageOrg:'',imageUrl:'',org:'fixture-org',name:'',city:'Baltimore',description:'',title:'Making home rehabilitation more accessible',summary:'We are building an affordable wearable that helps people track their recovery at home. Our demo shows how patients and care teams can turn daily movement into useful feedback.',people:'[]'})
createRoot(document.getElementById('root')!).render(<MemoryRouter><main className="application-preview" style={{maxWidth:1040,margin:'0 auto',padding:'clamp(16px, 4vw, 48px)',boxSizing:'border-box'}}><p style={{color:'var(--text-muted)',margin:'0 0 8px'}}>LifeTech · Demo Day</p><EventPresentations eventId="fixture-event"/></main></MemoryRouter>)
