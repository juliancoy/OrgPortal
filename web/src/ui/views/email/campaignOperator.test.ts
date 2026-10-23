import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { campaignOperator, deliveryState, gmailSentSearch, type Delivery } from './campaignOperator'
import { CampaignOperatorPanel, DeliveryRecovery } from './CampaignOperatorPanel'
import type { CampaignPreview, EmailSender } from './emailApi'
const sender: EmailSender = {configured:true,setup_issues:[],from_email:'sender@example.test',email:'sender@example.test',connected:true,status:'connected',sending_enabled:true,daily_limit:250,used_today:2,cooldown_until:0}
const row = (id:string, extra:Partial<Delivery> = {}):Delivery => ({id,email:`${id}@example.test`,name:id,kind:'campaign',status:'queued',error:null,gmail_message_id:null,review_status:'approved',subscription_status:'subscribed',...extra})
const campaign = (deliveries:Delivery[],extra:Partial<CampaignPreview> = {}):CampaignPreview => ({id:'campaign',subject:'Invitation',status:'paused',created_at:1,scheduled_at:0,recipient_count:10,sent_count:0,self_test_sent:true,sender_email:sender.email,from_email:sender.email,audience:'organization',body:'Join us',event_id:'event',fingerprint:'fingerprint',preview:{subject:'Invitation',html:'<p>Join us</p>',text:'Join us'},counts:{},deliveries,engagement:{sent:0,tracked:0,opened:0,clicked:0,unsubscribed:0},...extra})
describe('campaign operator decisions', () => {
  it('counts disjoint outcomes and excludes review copies from campaign totals', () => {
    const state=campaignOperator(campaign([row('waiting'),row('accepted',{status:'sent'}),row('bounce',{status:'sent',bounced_at:1}),row('held',{review_status:'held'}),row('optout',{suppressed:1}),row('failed',{status:'failed'}),row('review',{kind:'test',status:'uncertain'})]),sender)
    expect(state).toMatchObject({remaining:1,waiting:1,accepted:1,bounced:1,excluded:2,failed:1,uncertain:1})
    expect(state.notice).toContain('need review')
  })
  it('requires current consent or reviewed mail routing for bulk eligibility', () => {
    expect(campaignOperator(campaign([row('old',{subscription_status:'unsubscribed'}),row('bad',{known_bounced:1})]),sender).remaining).toBe(0)
    expect(campaignOperator(campaign([row('ok',{dns_status:'mx_present'}),row('held',{dns_status:'pending'})],{audience_mode:'outreach'}),sender).remaining).toBe(1)
    expect(deliveryState(row('old',{subscription_status:'unsubscribed'}))).toBe('excluded')
  })
  it('prioritizes uncertainty over cooldown, and detects wrong connected accounts', () => {
    const cooling={...sender,cooldown_until:10_000}
    expect(campaignOperator(campaign([row('waiting')]),cooling,1).notice).toContain('Google paused')
    expect(campaignOperator(campaign([row('uncertain',{status:'uncertain'})]),cooling,1).notice).toContain('need review')
    expect(campaignOperator(campaign([row('waiting')]),{...sender,email:'other@example.test'}).blockers.join(' ')).toContain('owns this campaign')
  })
  it('shows historical aggregates without treating bounced acceptance as a second success', () => {
    expect(campaignOperator(campaign([],{report_only:1,delivery_stats:{total:10,accepted:8,bounced:2,failed:1,uncertain:0,skipped:1,pending:0}}),sender)).toMatchObject({accepted:6,bounced:2,failed:1,excluded:1})
  })
  it('renders actionable readiness and account-specific Gmail recovery without resending', () => {
    const c=campaign([row('uncertain',{status:'uncertain'})])
    const panel=renderToStaticMarkup(createElement(CampaignOperatorPanel,{campaign:c,sender}))
    expect(panel).toContain('Gmail acceptance does not confirm inbox delivery')
    expect(panel).toContain('Readiness checks')
    const recovery=renderToStaticMarkup(createElement(DeliveryRecovery,{campaign:c,delivery:c.deliveries[0],busy:false,onSave:async()=>{}}))
    expect(recovery).toContain('Check Gmail Sent')
    const link=gmailSentSearch(sender.email,c.deliveries[0],c.from_email)
    expect(link).toContain('authuser=sender%40example.test')
    expect(decodeURIComponent(link)).toContain('in:sent rfc822msgid:uncertain@example.test')
  })
})
