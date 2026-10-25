export const organizationPageSections = [
  { id: 'about', label: 'About' },
  { id: 'personnel', label: 'People' },
  { id: 'events', label: 'Events' },
  { id: 'community', label: 'Community' },
  { id: 'branding', label: 'Branding' },
  { id: 'poster', label: 'Poster' },
  { id: 'settings', label: 'Settings' },
] as const
export type OrganizationPageTab = typeof organizationPageSections[number]['id']
export function organizationPageTabs(manager: boolean) {
  return organizationPageSections.filter(tab => manager || tab.id !== 'settings')
}
export function resolveOrganizationPageTab(requested: string | null, manager: boolean): OrganizationPageTab {
  return organizationPageTabs(manager).find(tab => tab.id === requested)?.id || 'about'
}
