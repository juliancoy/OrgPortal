/** Title II personnel diagram in https://codecollective.us/constitution.
 * Classes describe participation in one organization, never authentication rights.
 */
export const personnelClasses = {
  public: { label: 'Public', color: '#ffffff' },
  attendee: { label: 'Attendee', color: '#351c75' },
  volunteer: { label: 'Volunteer', color: '#000000' },
  member: { label: 'Member', color: '#ff0000' },
  organizer: { label: 'Organizer', color: '#1155cc' },
  stakeholder: { label: 'Stakeholder', color: '#9900ff' },
  persona_non_grata: { label: 'Persona Non Grata', color: '#38761d' },
} as const
export type PersonnelClass = keyof typeof personnelClasses
export function isPersonnelClass(value: unknown): value is PersonnelClass {
  return typeof value === 'string' && Object.hasOwn(personnelClasses, value)
}
export function personnelClassForMembership(member: { role?: string | null; status?: string | null; personnel_class?: string | null }): PersonnelClass {
  if (isPersonnelClass(member.personnel_class)) return member.personnel_class
  if (member.status && member.status !== 'active') return 'public'
  if (member.role === 'owner' || member.role === 'administrator') return 'organizer'
  return member.role === 'member' ? 'member' : 'public'
}

/** Participation labels are independent of portal access roles. */
export const nonprofitPersonnelClasses = {
  board: { label: 'Board member', color: '#1155cc', description: 'Provides governance, mission oversight, and accountability.' },
  executive: { label: 'Executive leadership', color: '#351c75', description: 'Leads operations and carries out the board-approved strategy.' },
  staff: { label: 'Staff', color: '#00796b', description: 'Delivers programs and manages day-to-day work.' },
  volunteer: { label: 'Volunteer', color: '#000000', description: 'Contributes time and skills to the mission.' },
  advisor: { label: 'Advisor', color: '#9900ff', description: 'Offers specialist guidance without board authority.' },
  member: { label: 'Member', color: '#c62828', description: 'Participates in the organization’s membership community.' },
  donor: { label: 'Donor / supporter', color: '#996c00', description: 'Contributes resources to support the mission.' },
  participant: { label: 'Program participant', color: '#546e7a', description: 'Takes part in the organization’s programs or services.' },
} as const
export const corporationPersonnelClasses = {
  board: { label: 'Board member', color: '#1155cc', description: 'Provides corporate governance and oversight.' },
  executive: { label: 'Executive leadership', color: '#351c75', description: 'Sets strategy and leads company operations.' },
  manager: { label: 'Manager', color: '#00796b', description: 'Leads a team, function, or business unit.' },
  employee: { label: 'Employee', color: '#c62828', description: 'Works within the company as a staff member.' },
  contractor: { label: 'Contractor', color: '#546e7a', description: 'Provides services under a contract.' },
  advisor: { label: 'Advisor', color: '#9900ff', description: 'Provides specialist guidance.' },
  shareholder: { label: 'Shareholder', color: '#996c00', description: 'Holds an ownership interest in the corporation.' },
  partner: { label: 'Business partner', color: '#000000', description: 'Collaborates through a business relationship.' },
} as const
export const personnelSchemes = {
  meetup: { label: 'Meetup Classes', classes: personnelClasses },
  nonprofit: { label: 'Nonprofit Classes', classes: nonprofitPersonnelClasses },
  corporation: { label: 'Corporation Classes', classes: corporationPersonnelClasses },
} as const
export type PersonnelScheme = keyof typeof personnelSchemes
