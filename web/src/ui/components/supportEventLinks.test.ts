import {expect,it} from 'vitest';
import {supportEventLinks} from './supportEventLinks';
it('links canonical first-class events, preserving source-only provenance',()=>{
 const event={eventId:'event',eventUrl:'https://lifetech.fyi/events/pitch',eventTitle:'Pitch Competition'};
 expect(supportEventLinks(JSON.stringify([{eventUrl:'https://www.amplifymedtech.com/'},event,event]))).toEqual([{id:'event',url:event.eventUrl,title:event.eventTitle}]);
});
it('rejects unsafe links and malformed provenance',()=>{
 for(const eventUrl of ['javascript:alert(1)','https://user:pass@example.com/events/pitch','https://example.com/'])expect(supportEventLinks(JSON.stringify([{eventId:'event',eventUrl,eventTitle:'Event'}]))).toEqual([]);
 expect(supportEventLinks('invalid')).toEqual([]);
});
