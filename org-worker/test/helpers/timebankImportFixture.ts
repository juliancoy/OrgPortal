import { stableId } from '../../scripts/letsbmore-import.mjs';
export function importFixture() {
  const batchId=stableId('test-batch');
  const accounts=[['first','Former Member',2220,2100],['second','Other Member',-90,60],['unknown','Hidden Balance',null,null]].map(([slug,name,balance,earned])=>({
    id:stableId(String(slug)),batch_id:batchId,community_id:'bmoretimebank',source_profile_url:`https://letsbmore.timebanks.org/profile/${slug}`,source_slug:slug,name,balance_minutes:balance,earned_minutes:earned,spent_minutes:0,received_minutes:balance===2220?120:0,donated_minutes:0,profile_json:JSON.stringify({text:'A member biography.'})
  }));
  const records=[{id:stableId('offer'),batch_id:batchId,kind:'activity',title:'Imported garden lessons',source_url:'https://letsbmore.timebanks.org/activity/garden',payload_json:JSON.stringify({activity_type:'Offer',text:'Garden together',advertised:true,status:'advertised at capture',owner_name:'Former Member',image_id:null})},
    {id:stableId('request'),batch_id:batchId,kind:'activity',title:'Imported transport request',source_url:'https://letsbmore.timebanks.org/activity/transport',payload_json:JSON.stringify({activity_type:'Request',text:'Help with transport',advertised:true,status:'advertised at capture',owner_name:'Other Member',image_id:null})},
    {id:stableId('ended'),batch_id:batchId,kind:'activity',title:'Ended source listing',source_url:'https://letsbmore.timebanks.org/activity/ended',payload_json:JSON.stringify({activity_type:'Offer',text:'Old activity',advertised:false,status:'ended',owner_name:'Former Member',image_id:null})},
    {id:stableId('history'),batch_id:batchId,kind:'transaction',title:'Historical help',source_url:'https://letsbmore.timebanks.org/activity/history',payload_json:JSON.stringify({minutes:2100,status:'completed',text:'Historical record'})}];
  const links=records.map((r,i)=>({record_id:r.id,account_id:accounts[i===1?1:0].id,batch_id:batchId,relationship:i===3?'source_account':'owner'}));
  return {batch:{id:batchId,community_id:'bmoretimebank',source_key:'fixture',source_name:'LetsBMore TimeBank',source_url:'https://letsbmore.timebanks.org',source_sha256:'a'.repeat(64),captured_at:'2026-09-10T03:18:20Z',imported_at:'2026-09-10T03:30:00Z',expected_accounts:3,expected_records:4,expected_links:4,expected_assets:0},accounts,records,links,assets:[],summary:{accounts:3,known_balances:2,source_balance_minutes:2130,activities:3,transactions:1,assets:0,record_links:4}};
}
