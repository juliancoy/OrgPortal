export type AvailabilityObservation = {slot:string;available:number};

/** Median of explicit observations for the same local weekday and half-hour.
 * Suggestions never become history until the user explicitly saves them.
 */
export function accountSelection(slots:string[], history:AvailabilityObservation[], timezone:string) {
 const format=new Intl.DateTimeFormat('en-US',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit',weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
 const weekdays=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
 function local(slot:string){
  const parts=Object.fromEntries(format.formatToParts(new Date(slot)).map(p=>[p.type,p.value]));
  const day=`${parts.year}-${parts.month}-${parts.day}`;
  const monday=new Date(`${day}T00:00:00Z`);monday.setUTCDate(monday.getUTCDate()-weekdays.indexOf(parts.weekday));
  return {week:monday.toISOString().slice(0,10),pattern:`${parts.weekday}-${parts.hour}:${parts.minute}`};
 }
 const observations=history.map(row=>({...row,...local(row.slot)}));
 const explicit=new Map(history.map(row=>[row.slot,row.available]));
 const filledWeeks=new Set(observations.map(row=>row.week));
 const patterns=new Map<string,typeof observations>();
 for(const row of observations){const entries=patterns.get(row.pattern)||[];entries.push(row);patterns.set(row.pattern,entries);}
 const selected:string[]=[],suggested:string[]=[];
 for(const slot of slots){
  if(explicit.has(slot)){if(explicit.get(slot))selected.push(slot);continue;}
  const target=local(slot);
  if(filledWeeks.has(target.week))continue;
  const past=(patterns.get(target.pattern)||[]).filter(row=>row.week<target.week);
  // A binary median of 0.5 is a tie, so do not claim availability.
  if(past.length && past.reduce((sum,row)=>sum+row.available,0)>past.length/2){selected.push(slot);suggested.push(slot);}
 }
 return {slots:selected,suggested_slots:suggested};
}
