import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';

type Actor = { is_admin?: boolean; is_sysadmin?: boolean };
type Group = { count: number; sum: { visits: number }; dimensions: { date?: string; requestHost: string; requestPath?: string } };
type AnalyticsData = { daily: Group[]; pages: Group[] };

// These are browser page loads, not edge requests or distinct people. Filtering
// to explicit production hosts also excludes localhost and Worker previews.
export const visitorQuery = `query VisitorStatistics($account: string!, $filter: AccountRumPageloadEventsAdaptiveGroupsFilter_InputObject!) {
  viewer { accounts(filter: {accountTag: $account}) {
    daily: rumPageloadEventsAdaptiveGroups(limit: 1000, filter: $filter, orderBy: [date_ASC]) {
      count sum { visits } dimensions { date requestHost }
    }
    pages: rumPageloadEventsAdaptiveGroups(limit: 20, filter: $filter, orderBy: [count_DESC]) {
      count sum { visits } dimensions { requestHost requestPath }
    }
  } }
}`;

export function visitorStatisticsRoutes(getUser: (env: Env, request: Request) => Promise<Actor>) {
  const routes = new Hono<{ Bindings: Env }>();
  routes.use('*', async (c, next) => {
    c.header('Cache-Control', 'no-store');
    await next();
  });
  routes.get('/', async c => {
    const user = await getUser(c.env, c.req.raw);
    if (user.is_admin !== true && user.is_sysadmin !== true) throw new HTTPException(403, { message: 'Admin access required' });
    const days = c.req.query('days') || '7';
    if (!['7', '30'].includes(days)) throw new HTTPException(400, { message: 'Choose 7 or 30 days.' });
    const hosts = (c.env.CLOUDFLARE_ANALYTICS_HOSTS || '').split(',').map(host => host.trim()).filter(Boolean);
    if (!hosts.length || hosts.length > 30 || hosts.some(host => !/^(?:[a-z0-9-]+\.)+[a-z]{2,}$/.test(host) || host.endsWith('.workers.dev') || host.endsWith('.pages.dev'))) {
      return c.json({ status: 'not_configured', message: 'Visitor statistics need a production hostname configuration.' });
    }
    if (!c.env.CLOUDFLARE_ANALYTICS_ACCOUNT_ID || !c.env.CLOUDFLARE_ANALYTICS_API_TOKEN) {
      return c.json({ status: 'not_configured', message: 'Visitor statistics need a Cloudflare Analytics read credential.' });
    }
    const selectedHost = c.req.query('host');
    if (selectedHost && !hosts.includes(selectedHost)) throw new HTTPException(400, { message: 'Choose a configured production hostname.' });
    // Complete UTC calendar days: no misleading partial day and a stable range.
    const end = new Date();
    end.setUTCHours(0, 0, 0, 0);
    const start = new Date(end.getTime() - Number(days) * 86_400_000);
    try {
      const response = await fetch('https://api.cloudflare.com/client/v4/graphql', {
        method: 'POST',
        headers: { Authorization: `Bearer ${c.env.CLOUDFLARE_ANALYTICS_API_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: visitorQuery, variables: {
          account: c.env.CLOUDFLARE_ANALYTICS_ACCOUNT_ID,
          filter: { datetime_geq: start.toISOString(), datetime_lt: end.toISOString(), requestHost_in: selectedHost ? [selectedHost] : hosts, bot: 0 },
        } }),
        signal: AbortSignal.timeout(15_000),
      });
      const result = await response.json() as { data?: { viewer?: { accounts?: AnalyticsData[] } }; errors?: unknown[] };
      const account = result.data?.viewer?.accounts?.[0];
      if (!response.ok || result.errors?.length || !account || !Array.isArray(account.daily) || !Array.isArray(account.pages)) throw new Error('Analytics unavailable');
      const daily = account.daily.map(row => ({ date: row.dimensions.date!, host: row.dimensions.requestHost, page_views: row.count, visits: row.sum.visits }));
      return c.json({
        status: 'ready', source: 'Cloudflare Web Analytics', timezone: 'UTC',
        start: start.toISOString(), end: end.toISOString(), hosts, selected_host: selectedHost || null,
        page_views: daily.reduce((sum, row) => sum + row.page_views, 0),
        visits: daily.reduce((sum, row) => sum + row.visits, 0),
        daily,
        top_pages: account.pages.map(row => ({ host: row.dimensions.requestHost, path: row.dimensions.requestPath, page_views: row.count, visits: row.sum.visits })),
      });
    } catch {
      // Never return provider errors, credentials, or a fabricated zero count.
      return c.json({ status: 'unavailable', message: 'Cloudflare visitor statistics are temporarily unavailable. Try again later.' }, 503);
    }
  });
  return routes;
}
