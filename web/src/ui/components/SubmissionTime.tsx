type Props={value?:string|null;source?:string|null}
export function SubmissionTime({value,source}:Props){
 const date=value?new Date(value):null
 if(!date||!Number.isFinite(date.getTime()))return <span className="submission-time">Submission time unavailable</span>
 const label=source==='first_recorded'?'First recorded':'Submitted'
 return <span className="submission-time" title={source==='first_recorded'?'The original submission time was not retained. This is the earliest surviving record.':undefined}>{label} <time dateTime={date.toISOString()}>{date.toLocaleString(undefined,{year:'numeric',month:'short',day:'numeric',hour:'numeric',minute:'2-digit',second:'2-digit',timeZoneName:'short'})}</time></span>
}
