// Canonical identity requests retain the public origin through a service binding.
// Tenant proxies retain their origin separately for the browser-bound SSO handoff.
export async function identityRequest(request, env, path) {
  const incoming = new URL(request.url);
  const canonical = incoming.hostname === 'orgportal.cc';
  const url = new URL(canonical ? 'https://orgportal.cc' : env.PIDP_PROXY_ORIGIN || 'https://pidp-codecollective.jcloiacon.workers.dev');
  url.pathname = path;
  url.search = incoming.search;
  const headers = new Headers(request.headers);
  for (const key of ['host','forwarded','x-forwarded-host','x-forwarded-proto','x-forwarded-prefix']) headers.delete(key);
  if (!canonical) {
    headers.set('x-forwarded-host',incoming.host);
    headers.set('x-forwarded-proto',incoming.protocol.slice(0,-1));
  }
  headers.set('x-forwarded-prefix','/pidp');
  if(canonical && !env.PIDP) return new Response('Identity service binding is unavailable.',{status:503,headers:{'cache-control':'no-store'}});
  const init = {method:request.method,headers,body:request.body,redirect:'manual'};
  const response=await (env.PIDP ? env.PIDP.fetch(url.toString(),init) : fetch(url.toString(),init));
  const responseHeaders=new Headers(response.headers);
  const cookies=response.headers.getSetCookie?.() || [];
  if(cookies.length && !['codecollective.us','www.codecollective.us'].includes(incoming.hostname)) {
    responseHeaders.delete('set-cookie');
    for(const cookie of cookies) responseHeaders.append('set-cookie',cookie.replace(/;\s*Domain=[^;]*/gi,''));
  }
  responseHeaders.set('cache-control','no-store');
  return new Response(response.body,{status:response.status,headers:responseHeaders});
}

export function isResearchPage(path) {
  const normalized=path.replace(/^\/__portal_root(?=\/)/,'');
  return normalized==='/ecosystem/network' || normalized.startsWith('/ecosystem/network/');
}
export async function researchAccess(request,env) {
  const headers={'cache-control':'private, no-store','vary':'Cookie, Authorization'};
  if(!request.headers.has('cookie') && !request.headers.has('authorization')) return login();
  try {
    const url=new URL(request.url);url.pathname='/pidp/auth/session';url.search='';
    const result=await identityRequest(new Request(url,{headers:request.headers}),env,'/auth/session');
    if(result.status===401 || result.status===403) return login();
    if(!result.ok) return new Response('Sign-in verification is temporarily unavailable.',{status:503,headers});
    const session=await result.json();
    if(session.authenticated!==true) return new Response('Sign-in verification is temporarily unavailable.',{status:503,headers});
    return null;
  } catch {return new Response('Sign-in verification is temporarily unavailable.',{status:503,headers})}
  function login() {
    const url=new URL(request.url);
    const next=url.pathname.replace(/^\/__portal_root(?=\/)/,'')+url.search;
    url.pathname='/users/login';url.search=new URLSearchParams({next}).toString();
    return new Response(null,{status:303,headers:{...headers,location:url.toString()}});
  }
}
