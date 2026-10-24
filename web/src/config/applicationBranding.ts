import type {CSSProperties} from 'react'
import {resolveBrandPalette} from '../../../shared/brandPalette'
import {getGroupSite} from './timebankCommunity'
import {getActivePortalProfileConfig} from './portalFeatures'

export function applicationBrandStyle(): CSSProperties {
 const tenant=getGroupSite(),brand=getActivePortalProfileConfig()
 const palette=resolveBrandPalette({...tenant,profile:brand.id,theme_color:brand.themeColor})
 return {
  '--application-paper':palette.find(color=>color.label==='MedTech OffWhite')?.value||'#F4F5F0',
  '--application-gold':palette.find(color=>color.label==='BioTech Gold')?.value||'#D4AF37',
 } as CSSProperties
}
