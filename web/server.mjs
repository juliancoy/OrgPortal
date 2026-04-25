import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const distDir = path.join(__dirname, 'dist')
const indexPath = path.join(distDir, 'index.html')

const PORT = Number(process.env.PORT || 8080)
const EVENTS_API_BASE = (process.env.ORGPORTAL_ORG_API_BASE || 'http://org:8001').replace(/\/$/, '')
const CACHE_TTL_SECONDS = 120

/** @type {Map<string, {at:number, value:unknown}>} */
const cache = new Map()

function escapeHtml(input) {
  return String(input ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function escapeJsonForHtml(data) {
  return JSON.stringify(data).replaceAll('</script', '<\\/script')
}

function contentTypeFor(filePath) {
  const ext = path.extname(filePath).toLowerCase()
  switch (ext) {
    case '.html':
      return 'text/html; charset=utf-8'
    case '.js':
      return 'application/javascript; charset=utf-8'
    case '.css':
      return 'text/css; charset=utf-8'
    case '.json':
      return 'application/json; charset=utf-8'
    case '.svg':
      return 'image/svg+xml'
    case '.png':
      return 'image/png'
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg'
    case '.webp':
      return 'image/webp'
    case '.ico':
      return 'image/x-icon'
    case '.woff':
      return 'font/woff'
    case '.woff2':
      return 'font/woff2'
    default:
      return 'application/octet-stream'
  }
}

function isSafeStaticPath(filePath) {
  const rel = path.relative(distDir, filePath)
  return rel && !rel.startsWith('..') && !path.isAbsolute(rel)
}

function getCanonicalBase(req) {
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'portal.arkavo.org'
  const proto = req.headers['x-forwarded-proto'] || 'https'
  return `${proto}://${host}`
}

function getCached(key) {
  const entry = cache.get(key)
  if (!entry) return null
  if (Date.now() - entry.at > CACHE_TTL_SECONDS * 1000) {
    cache.delete(key)
    return null
  }
  return entry.value
}

function setCached(key, value) {
  cache.set(key, { at: Date.now(), value })
}

async function fetchJsonWithCache(url, cacheKey) {
  const existing = getCached(cacheKey)
  if (existing) return existing
  const resp = await fetch(url, { headers: { accept: 'application/json' } })
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
  const data = await resp.json()
  setCached(cacheKey, data)
  return data
}

function buildSeoHead(input) {
  const tags = []
  tags.push(`<title>${escapeHtml(input.title)}</title>`)
  tags.push(`<meta name="description" content="${escapeHtml(input.description)}">`)
  tags.push(`<link rel="canonical" href="${escapeHtml(input.canonicalUrl)}">`)
  tags.push(`<meta property="og:type" content="${escapeHtml(input.type || 'website')}">`)
  tags.push(`<meta property="og:title" content="${escapeHtml(input.title)}">`)
  tags.push(`<meta property="og:description" content="${escapeHtml(input.description)}">`)
  tags.push(`<meta property="og:url" content="${escapeHtml(input.canonicalUrl)}">`)
  if (input.imageUrl) tags.push(`<meta property="og:image" content="${escapeHtml(input.imageUrl)}">`)
  tags.push(`<meta name="twitter:card" content="${input.imageUrl ? 'summary_large_image' : 'summary'}">`)
  tags.push(`<meta name="twitter:title" content="${escapeHtml(input.title)}">`)
  tags.push(`<meta name="twitter:description" content="${escapeHtml(input.description)}">`)
  if (input.imageUrl) tags.push(`<meta name="twitter:image" content="${escapeHtml(input.imageUrl)}">`)
  for (const jsonLd of input.jsonLd || []) {
    tags.push(`<script type="application/ld+json">${escapeJsonForHtml(jsonLd)}</script>`)
  }
  return tags.join('\n')
}

function applySeo(html, seo) {
  const cleaned = html
    .replace(/<title>[\s\S]*?<\/title>/i, '')
    .replace(/<meta\s+name=["']description["'][^>]*>/gi, '')
    .replace(/<link\s+rel=["']canonical["'][^>]*>/gi, '')
    .replace(/<meta\s+property=["']og:[^"']+["'][^>]*>/gi, '')
    .replace(/<meta\s+name=["']twitter:[^"']+["'][^>]*>/gi, '')
    .replace(/<script\s+type=["']application\/ld\+json["'][\s\S]*?<\/script>/gi, '')
  return cleaned.replace('</head>', `${buildSeoHead(seo)}\n</head>`)
}

function summary(text, fallback = 'Event details and schedule on Org Portal.') {
  const clean = String(text || '').replace(/\s+/g, ' ').trim()
  if (!clean) return fallback
  return clean.length > 280 ? `${clean.slice(0, 277)}...` : clean
}

async function buildEventsListSeo(base) {
  let events = []
  try {
    const data = await fetchJsonWithCache(
      `${EVENTS_API_BASE}/api/network/events/public?upcoming_only=true&limit=60`,
      'events-list',
    )
    if (Array.isArray(data)) events = data
  } catch {
    // degrade gracefully to generic SEO if backend unavailable
  }
  return {
    title: 'Upcoming Events • Org Portal',
    description: 'Browse upcoming events from users and organizations in the Org network.',
    canonicalUrl: `${base}/events`,
    type: 'website',
    jsonLd: [
      {
        '@context': 'https://schema.org',
        '@type': 'ItemList',
        name: 'Upcoming Events',
        itemListElement: events.slice(0, 50).map((event, idx) => ({
          '@type': 'ListItem',
          position: idx + 1,
          url: `${base}/events/${encodeURIComponent(event.slug)}`,
          name: event.title,
        })),
      },
    ],
  }
}

async function buildEventSeo(base, slug) {
  const canonicalUrl = `${base}/events/${encodeURIComponent(slug)}`
  try {
    const event = await fetchJsonWithCache(
      `${EVENTS_API_BASE}/api/network/events/public/${encodeURIComponent(slug)}`,
      `event:${slug}`,
    )
    const seo = {
      title: `${event.title} • Org Portal`,
      description: summary(event.description),
      canonicalUrl,
      imageUrl: event.image_url || undefined,
      type: 'article',
      jsonLd: [
        {
          '@context': 'https://schema.org',
          '@type': 'Event',
          name: event.title,
          description: summary(event.description),
          startDate: event.starts_at || undefined,
          endDate: event.ends_at || undefined,
          eventAttendanceMode: 'https://schema.org/MixedEventAttendanceMode',
          eventStatus: 'https://schema.org/EventScheduled',
          image: event.image_url ? [event.image_url] : undefined,
          url: canonicalUrl,
          location: event.location
            ? {
                '@type': 'Place',
                name: event.location,
              }
            : undefined,
          organizer: {
            '@type': 'Organization',
            name: 'Org Portal',
          },
        },
      ],
    }
    return { statusCode: 200, seo }
  } catch {
    return {
      statusCode: 404,
      seo: {
        title: 'Event Not Found • Org Portal',
        description: 'The requested event could not be found.',
        canonicalUrl,
        type: 'website',
        jsonLd: [],
      },
    }
  }
}

async function serveStatic(req, res, pathname) {
  const rawPath = pathname === '/' ? '/index.html' : pathname
  const decoded = decodeURIComponent(rawPath)
  const target = path.normalize(path.join(distDir, decoded))
  if (!isSafeStaticPath(target)) return false
  try {
    const info = await stat(target)
    if (!info.isFile()) return false
    const data = await readFile(target)
    res.writeHead(200, { 'content-type': contentTypeFor(target) })
    res.end(data)
    return true
  } catch {
    return false
  }
}

async function serveSpa(req, res, pathname) {
  const base = getCanonicalBase(req)
  const template = await readFile(indexPath, 'utf8')

  if (pathname === '/events') {
    const seo = await buildEventsListSeo(base)
    const html = applySeo(template, seo)
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    res.end(html)
    return
  }

  const eventMatch = pathname.match(/^\/events\/([^/]+)$/)
  if (eventMatch) {
    const slug = decodeURIComponent(eventMatch[1])
    const { statusCode, seo } = await buildEventSeo(base, slug)
    const html = applySeo(template, seo)
    res.writeHead(statusCode, { 'content-type': 'text/html; charset=utf-8' })
    res.end(html)
    return
  }

  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
  res.end(template)
}

createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', 'http://localhost')
    const pathname = url.pathname

    if (pathname === '/healthz') {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end('{"ok":true}')
      return
    }

    if (pathname === '/robots.txt') {
      const base = getCanonicalBase(req)
      res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' })
      res.end(`User-agent: *\nAllow: /\nSitemap: ${base}/sitemap.xml\n`)
      return
    }

    if (pathname === '/sitemap.xml') {
      const base = getCanonicalBase(req)
      let events = []
      try {
        const data = await fetchJsonWithCache(
          `${EVENTS_API_BASE}/api/network/events/public?upcoming_only=true&limit=500`,
          'events-sitemap',
        )
        if (Array.isArray(data)) events = data
      } catch {
        events = []
      }
      const urls = [
        `${base}/`,
        `${base}/events`,
        ...events
          .filter((event) => event && event.slug)
          .map((event) => `${base}/events/${encodeURIComponent(event.slug)}`),
      ]
      const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
        .map((u) => `  <url><loc>${escapeHtml(u)}</loc></url>`)
        .join('\n')}\n</urlset>\n`
      res.writeHead(200, { 'content-type': 'application/xml; charset=utf-8' })
      res.end(xml)
      return
    }

    const servedStatic = await serveStatic(req, res, pathname)
    if (servedStatic) return

    await serveSpa(req, res, pathname)
  } catch (err) {
    res.writeHead(500, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ error: 'portal_render_error', detail: String(err) }))
  }
}).listen(PORT, '0.0.0.0', () => {
  console.log(`OrgPortal renderer listening on :${PORT}`)
})
