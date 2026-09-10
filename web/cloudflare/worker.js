function trimTrailingSlash(value) {
  return (value || "").replace(/\/+$/, "");
}

function buildTargetUrl(requestUrl, targetOrigin, stripPrefix = "") {
  const url = new URL(requestUrl);
  const normalizedPrefix = stripPrefix && url.pathname.startsWith(stripPrefix)
    ? url.pathname.slice(stripPrefix.length) || "/"
    : url.pathname;
  return `${trimTrailingSlash(targetOrigin)}${normalizedPrefix}${url.search}`;
}

function htmlEscape(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function textSummary(value) {
  return String(value || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 220) || "Event details on OrgPortal.";
}

function eventSlugFromPath(pathname) {
  const match = /^\/(?:p\/)?events\/([^/]+)\/?$/.exec(pathname);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

async function fetchPublicEvent(request, env, slug) {
  const origin = trimTrailingSlash(env.ORG_API_ORIGIN);
  if (!origin) return null;
  const url = new URL(`${origin}/api/network/events/public/${encodeURIComponent(slug)}`);
  const headers = new Headers({ accept: "application/json" });
  headers.set("x-forwarded-host", new URL(request.url).host);
  headers.set("x-forwarded-proto", "https");
  const response = await fetch(url.toString(), {
    method: "GET",
    headers,
    redirect: "manual",
    cf: { cacheTtl: 60, cacheEverything: true },
  });
  if (!response.ok) return null;
  const event = await response.json().catch(() => null);
  return event && typeof event === "object" ? event : null;
}

function injectSocialPreview(html, event, requestUrl) {
  const request = new URL(requestUrl);
  const title = htmlEscape(`${event.title || "Event"} | OrgPortal`);
  const description = htmlEscape(textSummary(event.description));
  const canonicalUrl = htmlEscape(event.public_url || `${request.origin}${request.pathname}`);
  const imageUrl = typeof event.image_url === "string" && /^https?:\/\//i.test(event.image_url)
    ? event.image_url
    : "";
  const imageTags = imageUrl ? `
    <meta property="og:image" content="${htmlEscape(imageUrl)}" />
    <meta property="og:image:secure_url" content="${htmlEscape(imageUrl)}" />
    <meta name="twitter:image" content="${htmlEscape(imageUrl)}" />` : "";
  const tags = `
    <meta name="description" content="${description}" />
    <link rel="canonical" href="${canonicalUrl}" />
    <meta property="og:type" content="article" />
    <meta property="og:title" content="${title}" />
    <meta property="og:description" content="${description}" />
    <meta property="og:url" content="${canonicalUrl}" />${imageTags}
    <meta name="twitter:card" content="${imageUrl ? "summary_large_image" : "summary"}" />
    <meta name="twitter:title" content="${title}" />
    <meta name="twitter:description" content="${description}" />
  `;
  const withTitle = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${title}</title>`);
  return withTitle.replace(/<\/head>/i, `${tags}\n  </head>`);
}

async function proxyRequest(request, targetOrigin, env, options = {}) {
  const origin = trimTrailingSlash(targetOrigin);
  if (!origin) {
    return new Response("Upstream origin is not configured", { status: 502 });
  }

  const targetUrl = buildTargetUrl(request.url, origin, options.stripPrefix || "");
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-forwarded-host", new URL(request.url).host);
  requestHeaders.set("x-forwarded-proto", "https");

  const proxied = await fetch(targetUrl, {
    method: request.method,
    headers: requestHeaders,
    body: request.body,
    redirect: "manual",
    cf: { cacheEverything: false },
  });

  const responseHeaders = new Headers(proxied.headers);
  responseHeaders.set("access-control-allow-origin", "*");
  responseHeaders.set("access-control-allow-methods", "GET,HEAD,POST,PUT,PATCH,DELETE,OPTIONS");
  responseHeaders.set("access-control-allow-headers", "authorization,content-type,x-requested-with");

  return new Response(proxied.body, {
    status: proxied.status,
    statusText: proxied.statusText,
    headers: responseHeaders,
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS" && (url.pathname.startsWith("/api/governance") || url.pathname.startsWith("/api/org/") || url.pathname.startsWith("/pidp"))) {
      return new Response(null, {
        status: 204,
        headers: {
          "access-control-allow-origin": "*",
          "access-control-allow-methods": "GET,HEAD,POST,PUT,PATCH,DELETE,OPTIONS",
          "access-control-allow-headers": "authorization,content-type,x-requested-with",
        },
      });
    }

    // The PIdP origin intentionally has no document at `/`. Give visitors who
    // follow the public proxy root a useful entry point instead of a 404.
    if (request.method === "GET" && (url.pathname === "/pidp" || url.pathname === "/pidp/")) {
      url.pathname = "/pidp/app/login";
      if (!url.searchParams.has("owner")) url.searchParams.set("owner", "1");
      return Response.redirect(url.toString(), 302);
    }

    if (url.pathname.startsWith("/api/governance")) {
      return proxyRequest(request, env.GOVERNANCE_API_ORIGIN, env);
    }

    if (url.pathname === "/api/org" || url.pathname.startsWith("/api/org/")) {
      return proxyRequest(request, env.ORG_API_ORIGIN, env, { stripPrefix: "/api/org" });
    }

    if (url.pathname.startsWith("/pidp")) {
      return proxyRequest(request, env.PIDP_API_ORIGIN, env, { stripPrefix: "/pidp" });
    }

    const assetResponse = await env.ASSETS.fetch(request);
    if (assetResponse.status !== 404) {
      return assetResponse;
    }

    const acceptsHtml = request.headers.get("accept")?.includes("text/html");
    if (request.method === "GET" && acceptsHtml) {
      const indexResponse = await env.ASSETS.fetch(new Request(`${url.origin}/index.html`, request));
      const eventSlug = eventSlugFromPath(url.pathname);
      if (!eventSlug || !indexResponse.ok) return indexResponse;
      const event = await fetchPublicEvent(request, env, eventSlug).catch(() => null);
      if (!event) return indexResponse;
      const headers = new Headers(indexResponse.headers);
      headers.set("content-type", "text/html; charset=utf-8");
      headers.delete("content-length");
      headers.set("cache-control", "public, max-age=60");
      return new Response(injectSocialPreview(await indexResponse.text(), event, request.url), {
        status: indexResponse.status,
        statusText: indexResponse.statusText,
        headers,
      });
    }

    return assetResponse;
  },
};
