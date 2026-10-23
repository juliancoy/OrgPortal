import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import product from '../../shared/mcp-product.json' with { type: 'json' };

export async function accountCommand(command, account, action = command.action) {
  const tool = product.accountTools[action];
  if (!tool) throw Error('Unknown account inspection command.');
  const client = new Client({ name: 'OrgPortal CLI', version: product.version });
  const transport = new StreamableHTTPClientTransport(new URL(command.resource), { fetch: async (url, init) => {
    const headers = new Headers(init?.headers); headers.set('Authorization', `Bearer ${await account.accessToken()}`);
    return fetch(url, { ...init, headers, redirect: 'error', signal: AbortSignal.timeout(15000) });
  } });
  try {
    await client.connect(transport);
    const result = await client.callTool({ name: tool, arguments: {} });
    if (result.isError) {
      const code = result.structuredContent?.error?.code;
      const messages = { insufficient_scope: 'Authorize org:portal.read for this connection.', connection_check_unavailable: 'Connection checks are unavailable. Retry this read-only command.' };
      throw Object.assign(Error(messages[code] || 'Account inspection failed. Check your connection and server version.'), { code: Object.hasOwn(messages,code) ? code : 'mcp_request_failed' });
    }
    if (!result.structuredContent) throw Error('Server did not return structured account information. Update the server or client.');
    return result.structuredContent;
  } catch (error) {
    if (['insufficient_scope','connection_check_unavailable','mcp_request_failed'].includes(error.code)) throw error;
    throw Object.assign(Error('Could not inspect this account. Check the endpoint, saved login and server version; run orgportal doctor.'),{code:'mcp_request_failed'});
  } finally { await client.close(); }
}

export async function discoveryChecks(command, request = fetch) {
  const checks = [];
  const check = async (code, url, validate, message) => {
    try {
      const response = await request(url, { redirect: 'error', signal: AbortSignal.timeout(10000), headers: { accept: 'application/json' } });
      if (!response.ok || !validate(await response.json())) throw Error();
      checks.push({ code, status: 'pass', message });
    } catch { checks.push({ code, status: 'fail', message: `${message} Check DNS, connectivity and the configured endpoint.` }); }
  };
  const resource = new URL(command.resource);
  await check('resource_discovery', new URL(`/.well-known/oauth-protected-resource${resource.pathname}`, resource.origin), data => data.resource === command.resource && data.authorization_servers?.includes(command.issuer), 'MCP resource and issuer discovery match.');
  await check('issuer_discovery', `${command.issuer}/.well-known/oauth-authorization-server`, data => data.issuer === command.issuer && data.code_challenge_methods_supported?.includes('S256') && data.token_endpoint_auth_methods_supported?.includes('none'), 'PIdP supports browser authorization with PKCE for this CLI.');
  return checks;
}
