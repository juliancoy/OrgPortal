import test from 'node:test'
import assert from 'node:assert/strict'
import {assessOutcome,reviewUserTask,userModel} from './review.mjs'
const task=userModel.tasks.find(t=>t.id==='apply-guest')
function page({count=1,href='/events/event%2Fone/apply/guest',visible=true}={}){
 const control={count:async()=>count,isVisible:async()=>visible,isEnabled:async()=>true,getAttribute:async()=>href}
 return {url:()=> 'http://127.0.0.1/event',locator:()=>({getByRole:()=>control})}
}
test('correct visible link does not prove task completion or human review',async()=>{
 const r=await reviewUserTask(page(),'apply-guest',{eventSlug:'event/one'})
 assert.equal(r.status,'affordance-verified');assert.equal(r.outcome.status,'destination-unverified');assert(r.humanReview.every(x=>x.status==='pending'))
 assert.equal(assessOutcome(task,task.requiredEvidence).status,'verified')
})
test('ambiguous, hidden, wrong-origin and wrong-event links fail',async()=>{
 for(const config of [{count:2},{visible:false},{href:'https://evil.invalid/events/event%2Fone/apply/guest'},{href:'/wrong-event'}]) {
  assert.equal((await reviewUserTask(page(config),'apply-guest',{eventSlug:'event/one'})).status,'failed')
 }
})
test('unsupported tasks stay unassessed and invalid input is explicit',async()=>{
 assert.equal((await reviewUserTask(page(),'understand-event',{})).status,'not-assessed')
 await assert.rejects(reviewUserTask(page(),'missing',{}),/Unknown user task/)
 await assert.rejects(reviewUserTask(page(),'apply-guest',{}),/Missing task parameter/)
})
