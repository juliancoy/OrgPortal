import { loadDomainTenant } from './config/timebankCommunity'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import './index.css'
import './medtech.css'
import { applyPortalBranding } from './config/portalBranding'
import { AppProviders } from './app/AppProviders'
import { createServices } from './composition/createServices'
import { applyThemeMode, readThemeMode } from './config/theme'
import { createAppRouter } from './ui/router/createAppRouter'

applyThemeMode(readThemeMode())

const services = createServices()

async function start() {
  await loadDomainTenant().catch(() => undefined)
  const router = createAppRouter()
  applyPortalBranding()
  createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppProviders services={services}>
      <RouterProvider router={router} />
    </AppProviders>
  </StrictMode>,
)

}
void start()
