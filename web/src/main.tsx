import { loadDomainTenant } from './config/timebankCommunity'
import { installChunkRecovery } from './infrastructure/platform/chunkRecovery'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import './index.css'
import './styles/theme-foundation.css'
import './styles/themes/orgportal.css'
import './styles/themes/code-collective.css'
import './styles/themes/lifetech.css'
import './styles/themes/baltimore-medtech.css'
import './styles/themes/deism.css'
import './tenantBranding.css'
import './styles/layout.css'
import { applyPortalBranding } from './config/portalBranding'
import { AppProviders } from './app/AppProviders'
import { createServices } from './composition/createServices'
import { applyThemeMode, readThemeMode } from './config/theme'
import { createAppRouter } from './ui/router/createAppRouter'

applyThemeMode(readThemeMode())
installChunkRecovery(window, import.meta.env.VITE_APP_BUILD_NUMBER || 'development')

const services = createServices()

async function start() {
  await loadDomainTenant().catch(() => undefined)
  const router = createAppRouter()
  applyPortalBranding()
  applyThemeMode(readThemeMode())
  createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppProviders services={services}>
      <RouterProvider router={router} />
    </AppProviders>
  </StrictMode>,
)

}
void start()
