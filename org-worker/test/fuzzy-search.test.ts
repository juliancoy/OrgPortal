import { compareOrganizationActivity } from '../src/organizationSearchActivity';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSearchScorer, rankSearchResults, scoreSearchCandidate } from '../src/fuzzySearch';

test('fuzzy search tolerates swapped letters and misspelled prefixes while ranking exact matches first', () => {
  const rows = ['Code','Codex','Code Collective','Garden Club'].map(name=>({name}));
  const search = (q:string) => rankSearchResults(rows,q,row=>[row.name],20).map(row=>row.name);
  assert.deepEqual(search('cdo'),['Code','Codex','Code Collective']);
  assert.equal(search('cod')[0],'Code');
  assert.equal(search('code')[0],'Code');
  assert.deepEqual(search('zz'),[]);
  const titleRows = [{name:'AI Collective',description:'CDO collective meetup'}, {name:'Code Collective',description:'Community'}];
  assert.equal(rankSearchResults(titleRows,'cdo colectiv',row=>[row.name,row.description],5)[0].name,'Code Collective');
  assert.deepEqual(search('co garden'),[]);
  assert.deepEqual(rankSearchResults([{name:'Julian'},{name:'Julia'}],'juli',row=>[row.name],1).length,1);
  assert.deepEqual(rankSearchResults([{name:'Café Santé'}],'cafe sante',row=>[row.name],5),[{name:'Café Santé'}]);
  assert.deepEqual(rankSearchResults([{name:'BlueHealer'}],'bule',row=>[row.name],5),[{name:'BlueHealer'}]);
});

test('organization activity breaks equal relevance ties without displacing a better name match', () => {
  for (const field of ['feedback_count','upcoming_events_count','membership_count']) {
    const rows = [{name:'Club',id:'quiet'}, {name:'Club',id:'active',[field]:20}];
    assert.deepEqual(rankSearchResults(rows,'club',row=>[row.name],5,compareOrganizationActivity).map(row=>row.id),['active','quiet']);
  }
  const rows = [{name:'Club',id:'exact'}, {name:'Clubs',id:'popular',feedback_count:10000,membership_count:10000}];
  assert.equal(rankSearchResults(rows,'club',row=>[row.name],5,compareOrganizationActivity)[0].id,'exact');
  assert.equal(compareOrganizationActivity({feedback_count:null},{feedback_count:undefined}),0);
});


test('compiled scoring preserves relevance with duplicate tokens, empty fields and separate queries', () => {
 const cases: [string, unknown[], number][] = [
  ['code',['Code'],270],
  ['cafe sante',['Café Santé'],340],
  ['code code',['Code'],140],
  ['code code',['Code Code'],340],
  ['code',[null,'Code'],210],
  ['zz',['Code'],0],
  ['', ['Code'],0],
 ];
 for(const [query,fields,expected] of cases){
  const scorer=createSearchScorer(query);
  assert.equal(scorer(fields),expected);
  scorer(['Other words and repeated repeated descriptions']);
  assert.equal(scorer(fields),expected);
  assert.equal(scoreSearchCandidate(query,fields),expected);
 }
 const code=createSearchScorer('code'), garden=createSearchScorer('garden');
 assert.equal(code(['Code']),270);
 assert.equal(garden(['Code']),0);
});
