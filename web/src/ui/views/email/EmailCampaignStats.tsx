export type Engagement = { sent: number; tracked: number; opened: number; clicked: number; unsubscribed: number }
export function EmailCampaignStats({stats}: {stats: Engagement}) {
  return <section className="email-engagement" aria-label="Campaign engagement">
    <h3>Campaign engagement</h3>
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
