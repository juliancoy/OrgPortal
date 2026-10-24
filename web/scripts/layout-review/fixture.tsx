import {createRoot} from 'react-dom/client'
import {MemoryRouter,Routes,Route} from 'react-router-dom'
import {Header} from '../../src/ui/shell/Header'
import {Footer} from '../../src/ui/shell/Footer'
import {OnboardingPage} from '../../src/ui/views/OnboardingPage'
import {SupportPage} from '../../src/ui/views/support/SupportPage'
import {PeoplePage} from '../../src/ui/views/PeoplePage'
import {PublicOrganizationsPage} from '../../src/ui/views/public/PublicOrganizationsPage'
import {PublicEventsPage} from '../../src/ui/views/public/PublicEventsPage'
import {TenantBrandingPage} from '../../src/ui/views/TenantBrandingPage'
import {LocalHomePage} from '../../src/ui/views/LocalHomePage'
import {EventSubmissions} from '../../src/ui/components/EventSubmissions'
import {AboutPage} from '../../src/ui/views/AboutPage'
import {applyPortalBranding} from '../../src/config/portalBranding'
import {setGroupSite} from '../../src/config/timebankCommunity'
import '../../src/index.css'
import '../../src/styles/theme-foundation.css'
import '../../src/styles/themes/orgportal.css'
import '../../src/styles/themes/lifetech.css'
import '../../src/tenantBranding.css'
import '../../src/styles/layout.css'
const brand=new URLSearchParams(location.search).get('brand')
const life={id:'lifetech',slug:'lifetech',organization_id:'fixture-org',hostname:'lifetech.fyi',name:'LifeTech',tagline:'Health × Medicine × Biotech',accent_color:'#155e59',profile:'lifetech',features:['directory','events','chat'],brand_image_path:'/fixture-assets/lifetech-logo.png'}
if(brand==='lifetech')setGroupSite(life)
applyPortalBranding()
const body=<Routes>
 <Route path="/submissions" element={<EventSubmissions eventId="fixture-event" onEdit={()=>{}} onDeleted={()=>{}}/>}/>
 <Route path="/onboarding" element={<OnboardingPage/>}/>
 <Route path="/people" element={<PeoplePage/>}/>
 <Route path="/orgs" element={<PublicOrganizationsPage/>}/>
 <Route path="/events" element={<PublicEventsPage/>}/>
 <Route path="/support" element={<SupportPage/>}/>
 <Route path="/support/:ticketId" element={<SupportPage/>}/>
 <Route path="/branding" element={<TenantBrandingPage tenant={life}/>}/>
 <Route path="/about" element={<AboutPage/>}/>
</Routes>
createRoot(document.getElementById('root')!).render(<MemoryRouter initialEntries={[location.pathname+location.search]}>{location.pathname==='/workspace'?<LocalHomePage/>:<div className="portal-shell"><Header/><main className="portal-main"><div className="portal-container">{body}</div></main><Footer/></div>}</MemoryRouter>)
