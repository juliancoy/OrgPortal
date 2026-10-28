import {parseOrganizationThemes,portalThemeColors} from '../../../shared/organizationThemes'
import type {GroupSite} from './timebankCommunity'
/** A bounded, expiring cache of public brand colors for the document's first paint. */
export function rememberBrandingPaint(site:GroupSite|null,profile:string,themeId:string,storage?:Pick<Storage,'setItem'>,now=Date.now()){
 const config=parseOrganizationThemes(site?.feature_config?.brandThemes)
 const theme=config?.themes.find(t=>t.id===themeId)||config?.themes.find(t=>t.id===config.defaultTheme)
 try{(storage||window.localStorage).setItem('orgportal.brand-paint.v1',JSON.stringify({savedAt:now,profile,tenant:site?.id||'',theme:theme?.id||'',light:theme?portalThemeColors(theme.light):{},dark:theme?portalThemeColors(theme.dark):{}}))}catch{/* Public branding remains usable when storage is unavailable. */}
}
