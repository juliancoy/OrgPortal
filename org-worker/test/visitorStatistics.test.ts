import assert from 'node:assert/strict';
import test from 'node:test';
import { HTTPException } from 'hono/http-exception';
import { visitorStatisticsRoutes } from '../src/visitorStatistics';

const env = {
  CLOUDFLARE_ANALYTICS_ACCOUNT_ID: 'account',
  CLOUDFLARE_ANALYTICS_HOSTS: 'orgportal.cc,lifetech.fyi',
  CLOUDFLARE_ANALYTICS_API_TOKEN: 'private-analytics-token',
} as Env;
const routes = visitorStatisticsRoutes(async (_env, request) => {
  if (!request.headers.has('authorization')) throw new HTTPException(401);
  return { is_sysadmin: request.headers.get('authorization') === 'admin' };
});
const request = (query = '', auth = 'admin', bindings = env) => routes.fetch(new Request(`https://org-api.orgportal.cc/${query}`, { headers: auth ? { authorization: auth } : {} }), bindings);

test('visitor statistics enforce system admin authority before any provider call', async () => {
  assert.equal((await request('', '')).status, 401);
  assert.equal((await request('', 'member')).status, 403);
});

test('missing analytics configuration is not presented as zero traffic', async () => {
  const response = await request('', 'admin', { ...env, CLOUDFLARE_ANALYTICS_API_TOKEN: undefined });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const body = await response.json() as Record<string, unknown>;
  assert.equal(body.status, 'not_configured');
  assert.equal(body.page_views, undefined);
});

test('visitor statistics reject arbitrary hosts, previews, and unbounded periods', async () => {
  for (const query of ['?days=365', '?days=0', '?host=evil.example', '?host=localhost']) assert.equal((await request(query)).status, 400);
  const preview = await request('', 'admin', { ...env, CLOUDFLARE_ANALYTICS_HOSTS: 'preview.workers.dev' });
  assert.equal((await preview.json() as { status: string }).status, 'not_configured');
});

test('Cloudflare aggregates use complete UTC days, production host filters, and exclude known bots', async t => {
  const fetchMock = t.mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
    assert.equal(url, 'https://api.cloudflare.com/client/v4/graphql');
    assert.equal((init.headers as Record<string, string>).Authorization, `Bearer ${env.CLOUDFLARE_ANALYTICS_API_TOKEN}`);
    const { query, variables } = JSON.parse(String(init.body));
    assert.ok(query.includes('rumPageloadEventsAdaptiveGroups'));
    assert.deepEqual(variables.filter.requestHost_in, ['lifetech.fyi']);
    assert.equal(variables.filter.bot, 0);
    assert.ok(variables.filter.datetime_geq.endsWith('T00:00:00.000Z'));
    assert.equal(Date.parse(variables.filter.datetime_lt) - Date.parse(variables.filter.datetime_geq), 30 * 86400000);
    return Response.json({ data: { viewer: { accounts: [{
      daily: [
        { count: 9, sum: { visits: 4 }, dimensions: { date: '2026-10-14', requestHost: 'lifetech.fyi' } },
        { count: 3, sum: { visits: 2 }, dimensions: { date: '2026-10-15', requestHost: 'lifetech.fyi' } },
      ],
      pages: [{ count: 12, sum: { visits: 6 }, dimensions: { requestHost: 'lifetech.fyi', requestPath: '/events' } }],
    }] } }, errors: null });
  });
  try {
    const response = await request('?days=30&host=lifetech.fyi');
    assert.equal(response.status, 200);
    const body = await response.json() as Record<string, any>;
    assert.equal(body.page_views, 12);
    assert.equal(body.visits, 6);
    assert.equal(body.daily.length, 2);
    assert.equal(body.top_pages[0].path, '/events');
    assert.equal(JSON.stringify(body).includes(env.CLOUDFLARE_ANALYTICS_API_TOKEN!), false);
  } finally { fetchMock.mock.restore(); }
});

test('provider failures and GraphQL errors remain unavailable, without leaking credentials or false zeros', async t => {
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => Response.json({ errors: [{ message: env.CLOUDFLARE_ANALYTICS_API_TOKEN }] }));
  try {
    const response = await request();
    assert.equal(response.status, 503);
    const body = await response.json() as Record<string, unknown>;
    assert.equal(body.status, 'unavailable');
    assert.equal(body.page_views, undefined);
    assert.equal(JSON.stringify(body).includes(env.CLOUDFLARE_ANALYTICS_API_TOKEN!), false);
  } finally { fetchMock.mock.restore(); }
});
