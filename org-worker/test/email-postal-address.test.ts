import test from 'node:test';
import assert from 'node:assert/strict';
import { renderCampaign } from '../src/emailTemplate';
import { emailContent } from '../src/emailContent';
import { renderSupportEmail } from '../src/supportEmailTemplate';
import type { EmailCampaign } from '../src/emailShared';
const address='1110 W Cross St Baltimore MD';
test('campaign footers override stale saved addresses and runtime secrets in both formats',()=>{
 const env={EMAIL_POSTAL_ADDRESS:'3963 White old address',PUBLIC_PORTAL_BASE_URL:'https://orgportal.cc'} as Env;
 const campaign={subject:'Organization update',body:'Hello members.',organization_id:'org',event_id:'',event_json:JSON.stringify({title:'Update',slug:'org',organization_name:'Organization'}),content_json:JSON.stringify({postal_address:'101 W. Dickman Street, Baltimore, MD 21230'})} as EmailCampaign;
 const rendered=renderCampaign(env,campaign,'Member','https://orgportal.cc/unsubscribe');
 for(const content of [rendered.text,rendered.html]){assert.ok(content.includes(address));assert.doesNotMatch(content,/3963|Dickman/);assert.ok(content.includes('https://orgportal.cc/unsubscribe'));}
 assert.equal(emailContent(campaign.content_json).postal_address,address);assert.equal(emailContent().postal_address,address);
});
test('manual and automatic service email footers share the exact approved address',()=>{
 const mailbox={address:'service@example.org',senderAddress:'service@example.org',organizationId:'org',senderName:'Organization service',organizationName:'Organization',imageUrl:null,ticketPrefix:'OP'};
 for(const automatic of [false,true]){const rendered=renderSupportEmail(mailbox,'Your request has been received.','abc123',automatic);assert.ok(rendered.text.includes(address));assert.ok(rendered.html.includes(address));}
});
