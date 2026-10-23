#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const path=resolve(root,'web/src/data/test-status-catalog.json');
const previous=JSON.parse(readFileSync(path,'utf8'));
const old=new Map(previous.groups.filter(group=>group.source&&group.kind==='node'&&group.cases[0]?.id!=='suite').map(group=>[group.source,group]));
const files=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{cwd:root,encoding:'utf8'}).split('\0').filter(Boolean);
export function category(source){
 if(/presentation|submission|company[-_]?votes|team-form|recognition|five-over-five/i.test(source))return 'Submission and voting';
 if(/retention|privacy|journal|replication|abuse|security|consent/i.test(source))return 'Privacy and security';
 if(/email|newsletter|mailing|chat|messag|matrix/i.test(source))return 'Messaging and email';
 if(/timebank|time-bank/i.test(source))return 'Timebank';
 if(/ecosystem|network|fund|government|physics|frame-budget|graph|particle|nonprofit|force-law|sphere|pca|projection/i.test(source))return 'Ecosystem and data';
 if(/auth|identity|session|oauth|login|pidp|token|onboarding|invitation/i.test(source))return 'Identity and access';
 if(/event|calendar|venue|availability|insurance|volunteer/i.test(source))return 'Events and services';
 if(/organi[sz]ation|membership|personnel|profile|governance|board|directory/i.test(source))return 'Organizations and membership';
 if(/cloudflare|release|deployment|domain|proxy|startup|backend|manifest|collect|health/i.test(source))return 'Deployment and infrastructure';
 return 'User interface and integrations';
}
const isTest=source=>(/\.(test|spec)\.[cm]?[jt]sx?$/.test(source)||/(^|\/)test[_-][^/]+\.py$/.test(source)||/^web\/scripts\/(test-|selenium-)[^/]+\.(mjs|sh)$/.test(source)||/^web\/scripts\/accessibility\/(audit\.mjs|run-orca\.sh)$/.test(source)||source==='scripts/run-local-mcp-test.py'||source==='testbackend.sh');
const browserSources=new Set(previous.groups.filter(group=>group.kind==='browser').map(group=>group.source));
const groups=[...new Set(files.filter(source=>isTest(source)&&!browserSources.has(source)))].sort().map(source=>{
 const known=old.get(source);
 let kind='external',cwd='.';
 if(/^(org-worker|chat-worker)\/test\/.*\.test\.ts$/.test(source)){kind='node';cwd=source.split('/')[0];}
 else if(/\.(test|spec)\.mjs$/.test(source)){kind='node';cwd=source.startsWith('web/')?'web':'.';}
 else if(/^web\/src\/.*\.test\.tsx?$/.test(source)){kind='vitest';cwd='web';}
 else if(/^web\/tests\/.*\.(spec|test)\.tsx?$/.test(source)){kind='playwright';cwd='web';}
 const cases=known?[...readFileSync(resolve(root,source),'utf8').matchAll(/\btest\(\s*'((?:\\.|[^'\\])*)'/g)].map(match=>{const label=match[1].replace(/\\(['\\])/g,'$1');return {id:label,label};}):[{id:'suite',label:source.split('/').at(-1)}];
 return {...(known||{}),id:known?.id||'suite-'+source.replace(/[^a-z0-9]+/gi,'-'),label:known?.label||source,category:category(source),source,kind,cwd,cases};
});
for(const group of previous.groups.filter(group=>group.kind==='browser'))groups.push({...group,category:'Submission and voting'});
groups.push({...previous.groups.find(group=>group.kind==='checks'),category:'Build and type checks'});
writeFileSync(path,JSON.stringify({version:1,title:'OrgPortal tests',groups},null,2)+'\n');
console.log(`Catalogued ${groups.length} suites in ${new Set(groups.map(group=>group.category)).size} categories.`);
