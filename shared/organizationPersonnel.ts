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
