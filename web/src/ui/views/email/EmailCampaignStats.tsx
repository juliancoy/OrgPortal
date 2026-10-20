export type DeliveryStats={total:number;accepted:number;bounced:number;failed:number;uncertain:number;skipped:number;pending:number}
export type Engagement = { sent: number; tracked: number; opened: number; clicked: number; unsubscribed: number }
export function EmailCampaignStats({stats,delivery,reportOnly=false}: {stats: Engagement;delivery?:DeliveryStats;reportOnly?:boolean}) {
  return <section className="email-engagement" aria-label="Campaign engagement">
    <h3>Campaign analytics</h3>
    {delivery&&delivery.total>0&&<DeliveryPie stats={delivery}/>}
    {reportOnly&&<p>This is an imported Gmail campaign. Open, click and campaign-specific unsubscribe measurements were not collected and cannot be recovered. Delivery results below use the imported receipts and failure notices.</p>}
    <h4>Engagement</h4>
    <p>{stats.sent} emails accepted by Gmail · {stats.tracked} with current tracking data. Test emails excluded.</p>
    {stats.tracked === 0 ? <p>No tracking data yet. Older emails and data past the 90-day retention period are not tracked.</p> : <div className="email-pies">
      {([{label:'Opened (estimated)',value:stats.opened,color:'#155e59'}, {label:'Clicked (estimated)',value:stats.clicked,color:'#255ac7'}, {label:'Unsubscribed',value:stats.unsubscribed,color:'#a33d12'}]).map(({label,value,color}) => {
        const percent=value/stats.tracked*100
        return <figure key={label}><div role="img" aria-label={`${label}: ${value} of ${stats.tracked}, ${percent.toFixed(1)} percent; ${stats.tracked-value} without a recorded action.`} className="email-pie" style={{background:`conic-gradient(${color} 0% ${percent}%, #e1e7ec ${percent}% 100%)`}} />
          <figcaption><strong>{label}</strong><span><i style={{background:color}} />{value} recorded ({percent.toFixed(1)}%)</span><span><i style={{background:'#e1e7ec'}} />{stats.tracked-value} without a recorded action</span></figcaption></figure>
      })}
    </div>}
    {stats.sent>stats.tracked && <p>{stats.sent-stats.tracked} emails have no current tracking data and are excluded from these charts.</p>}
    <p className="muted">Each chart counts a recipient once. Actions overlap across charts. Image blocking, privacy proxies, link scanners and forwarded emails affect estimates; no recorded action does not mean unread. Unsubscribe counts reflect opt-outs through this campaign’s link. Refresh status to update.</p>
  </section>
}

function DeliveryPie({stats}:{stats:DeliveryStats}){
 const slices=[{label:'Gmail accepted; no failure reported',value:Math.max(0,stats.accepted-stats.bounced),color:'#155e59'},{label:'Bounced after acceptance',value:stats.bounced,color:'#b42318'},{label:'Submission failed',value:stats.failed,color:'#d97706'},{label:'Uncertain submission',value:stats.uncertain,color:'#7c3aed'},{label:'Held or skipped',value:stats.skipped,color:'#667085'},{label:'Pending',value:stats.pending,color:'#cbd5e1'}];let cursor=0;const gradient=slices.map(s=>{const start=cursor;cursor+=s.value/stats.total*100;return `${s.color} ${start}% ${cursor}%`}).join(',')
 return <div className="email-pies"><figure><div role="img" className="email-pie" aria-label={`Delivery outcomes for ${stats.total} recipients: ${slices.map(s=>`${s.value} ${s.label}`).join('; ')}. Gmail acceptance is not proof of delivery.`} style={{background:`conic-gradient(${gradient})`}}/><figcaption><strong>Delivery outcomes</strong>{slices.filter(s=>s.value>0).map(s=><span key={s.label}><i style={{background:s.color}}/>{s.value} {s.label} ({(s.value/stats.total*100).toFixed(1)}%)</span>)}</figcaption></figure></div>
}
