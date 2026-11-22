import {expect,it} from 'vitest'
import {organizationSourceBrand,withOrganizationBrandDefaults} from './organizationBrandDefaults'
import {isThemeImage,parseOrganizationThemes} from '../../../shared/organizationThemes'
import {resolveBrandPalette} from '../../../shared/brandPalette'
import {organizationPageLogo,organizationPageTheme} from './organizationThemes'
const maryland={id:'md-budget:state-of-maryland',name:'State of Maryland',slug:'state-of-maryland'}
it('attaches sourced logo, flag and palette through the existing brand model',()=>{
 const site=withOrganizationBrandDefaults(maryland,null)!
 const theme=parseOrganizationThemes(site.feature_config?.brandThemes)!
 expect(theme.defaultTheme).toBe('maryland')
 expect(organizationPageLogo(site)).toBe('/images/organization-themes/maryland-logo.svg')
 expect(theme.themes[0].imagery?.background).toBe('/images/organization-themes/maryland-flag.gif')
 expect(resolveBrandPalette(site).map(color=>color.value)).toEqual(['#C8122C','#FFC838','#231F20','#FFFFFF'])
 expect(organizationPageTheme(site)).toContain('--primary:#C8122C')
 expect(organizationPageTheme(site)).toContain('--primary:#FFC838')
})
it('never guesses identity from names or slugs, and preserves saved branding',()=>{
 expect(withOrganizationBrandDefaults({...maryland,id:'unrelated'},null)).toBeNull()
 expect(organizationSourceBrand('__proto__')).toBeNull()
 const saved={...withOrganizationBrandDefaults(maryland,null)!,accent_color:'#123456'}
 expect(withOrganizationBrandDefaults(maryland,saved)).toBe(saved)
})
it('allows bundled raster assets only in the bounded image namespace',()=>{
 expect(isThemeImage('/images/organization-themes/maryland-flag.gif')).toBe(true)
 for(const invalid of ['/images/organization-themes/../secret.gif','/uploads/flag.gif','/images/organization-themes/flag.gif?script=1','javascript:alert(1)'])expect(isThemeImage(invalid)).toBe(false)
})
