import { wrapPosterText, type PosterEvent, type PosterFormat } from './eventPoster';

// Host ownership, rather than calendar association, defines an org's poster list.
export async function organizationPosterEvents(db: D1Database, organizationId: string) {
  const result = await db.prepare(`SELECT title, starts_at, ends_at, event_date, location FROM events
    WHERE host_org_id = ? AND ((starts_at IS NOT NULL AND julianday(COALESCE(ends_at, starts_at)) >= julianday('now'))
      OR (starts_at IS NULL AND event_date >= date('now')))
    ORDER BY COALESCE(starts_at, event_date, created_at) ASC, id ASC`).bind(organizationId).all<PosterEvent & { event_date?: string }>();
  return result.results || [];
}

export function organizationPosterPages(events: (PosterEvent & { event_date?: string })[], format: PosterFormat) {
  const small = format === 'postcard', social = format === 'social';
  const width = small ? 344 : social ? 830 : 738;
  const size = small ? 12 : social ? 19 : 22;
  const capacity = small ? 12 : social ? 7 : 12;
  const pages: string[][] = [[]];
  const date = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
  for (const event of events) {
    const start = new Date(event.starts_at || `${event.event_date}T12:00:00`);
    const when = Number.isNaN(start.getTime()) ? 'Date to be announced' : event.starts_at ? date.format(start) : event.event_date!;
    const lines = [...wrapPosterText(event.title, width, size), ...wrapPosterText(`${when}${event.location ? ` · ${event.location}` : ''}`, width, size)];
    // Keep each event together where it fits; even an unusually long event is
    // continued rather than truncated. Page count grows with the complete list.
    let page = pages[pages.length - 1];
    if (page.length && page.length + lines.length + 1 > capacity) { page = []; pages.push(page); }
    else if (page.length) page.push('');
    for (const line of lines) {
      if (page.length === capacity) { page = []; pages.push(page); }
      page.push(line);
    }
  }
  if (!events.length) pages[0].push('No upcoming hosted events are listed.');
  return pages;
}
