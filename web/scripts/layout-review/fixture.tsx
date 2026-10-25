import {EventStandings} from '../../src/ui/components/EventStandings'
import {PublicAdminPage} from '../../src/ui/views/public/PublicAdminPage'
import { fixtureThemes } from './organization-themes'
import { UserSettingsPage } from '../../src/ui/views/users/UserSettingsPage'
import {createRoot} from 'react-dom/client'
import {MemoryRouter,Routes,Route} from 'react-router-dom'
import {Header} from '../../src/ui/shell/Header'
import {Footer} from '../../src/ui/shell/Footer'
import {OnboardingPage} from '../../src/ui/views/OnboardingPage'
import {SupportPage} from '../../src/ui/views/support/SupportPage'
import {PeoplePage} from '../../src/ui/views/PeoplePage'
import {PublicOrganizationsPage} from '../../src/ui/views/public/PublicOrganizationsPage'
import {PublicEventsPage} from '../../src/ui/views/public/PublicEventsPage'
import {EventPosterTools} from '../../src/ui/components/EventPosterTools'
import {OrganizationBoard} from '../../src/ui/components/OrganizationBoard'
import {OrganizationBranding} from '../../src/ui/components/OrganizationBranding'
import {EventPresentations} from '../../src/ui/components/EventPresentations'
import {TenantBrandingPage} from '../../src/ui/views/TenantBrandingPage'
import {LocalHomePage} from '../../src/ui/views/LocalHomePage'
import {EventApplyButtons} from '../../src/ui/components/EventApplyButtons'
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
const life={id:'lifetech',slug:'lifetech',organization_id:'fixture-org',hostname:'lifetech.fyi',name:'LifeTech',tagline:'Health × Medicine × Biotech',accent_color:'#155e59',profile:'lifetech',features:['directory','events','chat'],brand_image_path:'/fixture-assets/lifetech-logo.png',feature_config:new URLSearchParams(location.search).has('customThemes')?{brandThemes:fixtureThemes}:undefined}
if(brand==='lifetech')setGroupSite(life)
applyPortalBranding()
const body=<Routes>
 <Route path="/standings" element={<main><h1>Demo Day</h1><EventStandings eventId="fixture-event" eventSlug="demo-day"/></main>}/>
 <Route path="/orgs/:handle" element={<PublicAdminPage/>}/>
 <Route path="/poster-review" element={<EventPosterTools inline slug="fixture-event" title="Life sciences, in motion"/>}/>
 <Route path="/settings" element={<UserSettingsPage/>}/>
 <Route path="/organization-personnel" element={<OrganizationBoard organization={{id:'fixture-org',slug:'fixture-org',name:'Harbor Care Team'}} memberType="team" canManage={new URLSearchParams(location.search).has('admin')}/>}/>

 <Route path="/organization-branding" element={<OrganizationBranding organization={{id:'fixture-org',slug:'fixture-org',name:'Anchor Advance Care'}} canManage={!new URLSearchParams(location.search).has('readonly')}/>}/>
 <Route path="/presentation-form" element={<EventPresentations eventId="fixture-event"/>}/>

 <Route path="/event-apply-options" element={<section className="panel public-event-main"><h1>LifeTech Demo Day</h1><section className="public-event-applications"><div className="presentation-settings"><label><input type="checkbox" defaultChecked/>Enable presentation applications</label></div><EventApplyButtons eventId="fixture-event" eventSlug="lifetech-demo-day-3" gold="#D4AF37"/></section><div className="public-event-tabs" role="tablist" aria-label="Event sections"><button role="tab" aria-selected="true">Info</button><button role="tab" aria-selected="false">Poster</button><button role="tab" aria-selected="false">Submissions</button></div><section className="portal-card public-event-description"><div className="public-event-card-heading"><p className="public-event-eyebrow">About the event</p><h2>What to expect</h2></div><p>Baltimore’s Life Sciences in Action</p></section></section>}/>
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
