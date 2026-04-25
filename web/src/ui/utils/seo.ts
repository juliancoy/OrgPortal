function upsertMetaByName(name: string, content: string) {
  let tag = document.head.querySelector(`meta[name="${name}"]`) as HTMLMetaElement | null
  if (!tag) {
    tag = document.createElement('meta')
    tag.setAttribute('name', name)
    document.head.appendChild(tag)
  }
  tag.setAttribute('content', content)
}

function upsertMetaByProperty(property: string, content: string) {
  let tag = document.head.querySelector(`meta[property="${property}"]`) as HTMLMetaElement | null
  if (!tag) {
    tag = document.createElement('meta')
    tag.setAttribute('property', property)
    document.head.appendChild(tag)
  }
  tag.setAttribute('content', content)
}

export function setCanonicalUrl(url: string) {
  let link = document.head.querySelector('link[rel="canonical"]') as HTMLLinkElement | null
  if (!link) {
    link = document.createElement('link')
    link.setAttribute('rel', 'canonical')
    document.head.appendChild(link)
  }
  link.setAttribute('href', url)
}

export function setSeoMeta(input: {
  title: string
  description: string
  canonicalUrl: string
  imageUrl?: string | null
  type?: 'website' | 'article'
  robots?: string
}) {
  const type = input.type ?? 'website'
  document.title = input.title
  setCanonicalUrl(input.canonicalUrl)
  upsertMetaByName('description', input.description)
  if (input.robots) {
    upsertMetaByName('robots', input.robots)
  }
  upsertMetaByProperty('og:title', input.title)
  upsertMetaByProperty('og:description', input.description)
  upsertMetaByProperty('og:url', input.canonicalUrl)
  upsertMetaByProperty('og:type', type)
  upsertMetaByName('twitter:card', input.imageUrl ? 'summary_large_image' : 'summary')
  upsertMetaByName('twitter:title', input.title)
  upsertMetaByName('twitter:description', input.description)
  if (input.imageUrl) {
    upsertMetaByProperty('og:image', input.imageUrl)
    upsertMetaByName('twitter:image', input.imageUrl)
  }
}

export function upsertJsonLd(id: string, data: unknown) {
  const scriptId = `jsonld-${id}`
  let script = document.getElementById(scriptId) as HTMLScriptElement | null
  if (!script) {
    script = document.createElement('script')
    script.id = scriptId
    script.type = 'application/ld+json'
    document.head.appendChild(script)
  }
  script.textContent = JSON.stringify(data)
}
