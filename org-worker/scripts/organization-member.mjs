#!/usr/bin/env node
import {readFile} from 'node:fs/promises';
import {parseArgs} from 'node:util';
const {values} = parseArgs({options: {
  base: {type: 'string'}, organization: {type: 'string'}, user: {type: 'string'},
  name: {type: 'string'}, email: {type: 'string'}, role: {type: 'string', default: 'administrator'},
  'env-file': {type: 'string'}, 'preview-id': {type: 'string'}, apply: {type: 'boolean'},
}});
if (!values.base || !values.organization || !values.user || !values['env-file'] ||
    (values.apply && !values['preview-id'])) {
  throw new Error('Provide --base HTTPS_ORIGIN --organization ID --user VERIFIED_ACCOUNT_ID --env-file PATH; apply requires --apply --preview-id REVIEWED_ID');
}
const base = new URL(values.base);
if (base.protocol !== 'https:' || base.username || base.password || base.pathname !== '/' || base.search || base.hash) throw new Error('Use an HTTPS portal origin');
const entries = Object.fromEntries((await readFile(values['env-file'], 'utf8')).split('\n')
  .filter(line => !line.trim().startsWith('#') && line.includes('='))
  .map(line => {const i=line.indexOf('=');return [line.slice(0,i).trim(),line.slice(i+1).trim().replace(/^['"]|['"]$/g,'')];}));
// This endpoint accepts a PIdP session credential. A service PAT does not become
// a website login; authentication and organization authority remain separate.
const token = entries.PIDP_ORG_PORTAL_TOKEN || entries.PIDP_PAT;
if (!token) throw new Error('No PIdP credential in env file');
const payload = {user_id: values.user, role: values.role,
  ...(values.name ? {user_name:values.name} : {}), ...(values.email ? {user_email:values.email} : {}),
  ...(values.apply ? {previewId:values['preview-id']} : {}),
};
const path = `/api/org/api/network/orgs/${encodeURIComponent(values.organization)}/members/${values.apply ? 'apply' : 'preview'}`;
const response = await fetch(new URL(path,base), {method:'POST',redirect:'error',
  headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify(payload)});
const result=await response.json();
console.log(JSON.stringify({status:response.status,...result},null,2));
if(!response.ok) process.exitCode=1;
