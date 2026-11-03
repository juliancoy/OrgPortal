export { isLifeTechMedicalEvent, lifeTechEventCategory } from '../../../../shared/eventRelevance'

export function eventCalendarDateKey(value: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date)
  const part = (type: string) => parts.find(part => part.type === type)?.value
  return `${part('year')}-${part('month')}-${part('day')}`
}
