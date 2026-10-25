import {createRoot} from 'react-dom/client'
import {BrowserRouter} from 'react-router-dom'
import {EcosystemOverviewPage} from '../src/ui/views/EcosystemOverviewPage'
import {EcosystemNetworkViews} from '../src/ui/views/EcosystemNetworkViews'
import {EcosystemNetworkPage} from '../src/ui/views/EcosystemNetworkPage'
import {NonprofitNetworkPage} from '../src/ui/views/NonprofitNetworkPage'
import {SeriesAFundingGapPage} from '../src/ui/views/SeriesAFundingGapPage'
import {PublicFundingPerformancePage} from '../src/ui/views/PublicFundingPerformancePage'
const view=new URLSearchParams(location.search).get('view')
const page=view==='overview'?<EcosystemOverviewPage/>:view==='relationships'||view==='events'?<EcosystemNetworkViews view={view}/>:view==='nonprofits'?<NonprofitNetworkPage/>:view==='funding'?<SeriesAFundingGapPage/>:view==='performance'?<PublicFundingPerformancePage/>:<EcosystemNetworkPage renderer={view==='graph3d'?'webgpu3d':view==='graph4d'?'webgpu4d':'canvas'}/>
createRoot(document.querySelector('#root')!).render(<BrowserRouter>{page}</BrowserRouter>)
