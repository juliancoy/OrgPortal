import type {GroupSite} from './timebankCommunity'
import type {OrganizationTheme} from '../../../shared/organizationThemes'

// Reviewed public identities only. Names and slugs never establish brand ownership.
const marylandTheme:OrganizationTheme={
 id:'maryland',name:'Maryland',
 light:{primary:'#C8122C','on-primary':'#FFFFFF',surface:'#FFFFFF',panel:'#FFFFFF','panel-2':'#FFF6DC','text-primary':'#231F20','text-secondary':'#585052',border:'#968B8E','brand-red':'#C8122C','brand-gold':'#FFC838'},
 dark:{primary:'#FFC838','on-primary':'#231F20',surface:'#181617',panel:'#231F20','panel-2':'#332D2F','text-primary':'#FFFFFF','text-secondary':'#D9D1D3',border:'#968B8E','brand-red':'#C8122C','brand-gold':'#FFC838'},
 imagery:{icon:'/images/organization-themes/maryland-logo.svg',avatar:'/images/organization-themes/maryland-logo.svg',background:'/images/organization-themes/maryland-flag.gif'},
 logoAppearance:{background:'solid',color:'#FFFFFF',secondaryColor:'#FFFFFF',shape:'rounded'},
}
type SourceBrand={theme:OrganizationTheme;flag:{url:string;label:string;source:string};sources:{label:string;url:string}[];palette:{label:string;value:string}[]}
const sourceBrands:Record<string,SourceBrand>={
 'md-budget:state-of-maryland':{
  theme:marylandTheme,
  flag:{url:marylandTheme.imagery!.background,label:'Maryland state flag',source:'https://sos.maryland.gov/Pages/Services/MdFlag.aspx'},
  sources:[{label:'Maryland brand guidelines',url:'https://digital.maryland.gov/media/151/download?inline='},{label:'Official Maryland logo files',url:'https://digital.maryland.gov/principles/brand-pillars'},{label:'Maryland state flag',url:'https://sos.maryland.gov/Pages/Services/MdFlag.aspx'}],
  palette:[{label:'Maryland Red',value:'#C8122C'},{label:'Maryland Gold',value:'#FFC838'},{label:'Black',value:'#231F20'},{label:'White',value:'#FFFFFF'}],
 },
}
export function organizationSourceBrand(organizationId:string){return Object.hasOwn(sourceBrands,organizationId)?sourceBrands[organizationId]:null}
/** Presentation fallback only; saved organization settings always take precedence. */
export function withOrganizationBrandDefaults(organization:{id:string;slug:string;name:string},site:GroupSite|null):GroupSite|null{
 if(site)return site
 const brand=organizationSourceBrand(organization.id)
 if(!brand)return null
 return {id:organization.id,organization_id:organization.id,slug:organization.slug,hostname:'',name:organization.name,tagline:'',accent_color:brand.theme.light.primary,
  brand_image_path:brand.theme.imagery!.icon,home_image_url:brand.flag.url,
  feature_config:{brandThemes:{defaultTheme:brand.theme.id,themes:[brand.theme]},brandPalette:brand.palette},
 }
}
