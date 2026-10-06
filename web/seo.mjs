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

export function buildSeoHead(input) {
  const tags = []
  if (input.iconUrl) {
    tags.push(`<link rel="icon" href="${escapeHtml(input.iconUrl)}">`)
    tags.push(`<link rel="apple-touch-icon" href="${escapeHtml(input.iconUrl)}">`)
  }
  if (input.themeColor) tags.push(`<meta name="theme-color" content="${escapeHtml(input.themeColor)}">`)
  tags.push(`<title>${escapeHtml(input.title)}</title>`)
  tags.push(`<meta name="description" content="${escapeHtml(input.description)}">`)
  if (input.robots) tags.push(`<meta name="robots" content="${escapeHtml(input.robots)}">`)
  tags.push(`<link rel="canonical" href="${escapeHtml(input.canonicalUrl)}">`)
  tags.push(`<meta property="og:type" content="${escapeHtml(input.type || 'website')}">`)
  tags.push(`<meta property="og:title" content="${escapeHtml(input.title)}">`)
  tags.push(`<meta property="og:description" content="${escapeHtml(input.description)}">`)
  tags.push(`<meta property="og:url" content="${escapeHtml(input.canonicalUrl)}">`)
  if (input.siteName) tags.push(`<meta property="og:site_name" content="${escapeHtml(input.siteName)}">`)
  if (input.imageUrl) {
    tags.push(`<meta property="og:image" content="${escapeHtml(input.imageUrl)}">`)
    tags.push(`<meta property="og:image:secure_url" content="${escapeHtml(input.imageUrl)}">`)
    for (const [key, value] of Object.entries({ width: input.imageWidth, height: input.imageHeight, type: input.imageType, alt: input.imageAlt })) {
      if (value) tags.push(`<meta property="og:image:${key}" content="${escapeHtml(value)}">`)
    }
    if (input.imageAlt) tags.push(`<meta name="twitter:image:alt" content="${escapeHtml(input.imageAlt)}">`)
  }
  tags.push(`<meta name="twitter:card" content="${input.imageUrl ? 'summary_large_image' : 'summary'}">`)
  tags.push(`<meta name="twitter:title" content="${escapeHtml(input.title)}">`)
  tags.push(`<meta name="twitter:description" content="${escapeHtml(input.description)}">`)
  if (input.imageUrl) tags.push(`<meta name="twitter:image" content="${escapeHtml(input.imageUrl)}">`)
  for (const jsonLd of input.jsonLd || []) {
    tags.push(`<script type="application/ld+json">${escapeJsonForHtml(jsonLd)}</script>`)
  }
  return tags.join('\n')
}

export function applySeo(html, seo) {
  const cleaned = html
    .replace(/<title>[\s\S]*?<\/title>/i, '')
    .replace(/<meta\s+name=["'](?:description|robots|theme-color)["'][^>]*>/gi, '')
    .replace(/<link\s+rel=["']canonical["'][^>]*>/gi, '')
    .replace(/<meta\s+property=["']og:[^"']+["'][^>]*>/gi, '')
    .replace(/<meta\s+name=["']twitter:[^"']+["'][^>]*>/gi, '')

  const structured = seo.jsonLd ? cleaned.replace(/<script\s+type=["']application\/ld\+json["'][\s\S]*?<\/script>/gi, '') : cleaned
  const result = seo.iconUrl ? structured.replace(/<link\s+rel=["'](?:icon|apple-touch-icon|manifest)["'][^>]*>/gi, '') : structured
  return result.replace('</head>', `${buildSeoHead(seo)}\n</head>`)
}


export function canonicalPath(pathname) {
  const path = pathname.replace(/\/index\.html$/, '/').replace(/\.html$/, '').replace(/\/+$/, '')
  return path || '/'
}

export function pageStructuredData({ title, description, canonicalUrl, type = 'WebPage', siteName, origin, logoUrl }) {
  const organizationId = `${origin}/#organization`
  const websiteId = `${origin}/#website`
  const graph = [
    { '@type': 'Organization', '@id': organizationId, name: siteName, url: `${origin}/`, logo: logoUrl },
    { '@type': 'WebSite', '@id': websiteId, name: siteName, url: `${origin}/`, publisher: { '@id': organizationId } },
    { '@type': type, '@id': `${canonicalUrl}#webpage`, name: title, description, url: canonicalUrl, isPartOf: { '@id': websiteId }, about: { '@id': organizationId } },
  ]
  if (canonicalUrl !== `${origin}/`) {
    graph.push({ '@type': 'BreadcrumbList', itemListElement: [
      { '@type': 'ListItem', position: 1, name: siteName, item: `${origin}/` },
      { '@type': 'ListItem', position: 2, name: title, item: canonicalUrl },
    ] })
  }
  return [{ '@context': 'https://schema.org', '@graph': graph }]
}

export function buildSitemap(origin, paths) {
  const urls = [...new Set(paths.map(path => new URL(canonicalPath(path), origin).href))]
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(url => `  <url><loc>${escapeHtml(url)}</loc></url>`).join('\n')}\n</urlset>`
}
