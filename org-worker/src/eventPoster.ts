import { publicPosterImageUrl } from './posterGallery';
import QRCode from 'qrcode';

export type PosterFormat = 'letter' | 'letter-4up' | 'postcard' | 'social';
export type PosterTheme = 'light' | 'dark';
export type PosterBackground = 'solid' | 'city' | 'gradient' | 'lifetech' | 'gallery';
type PosterEvent = { title: string; social_title?: string | null; description?: string | null; social_description?: string | null;
  starts_at?: string | null; ends_at?: string | null; location?: string | null };
export type PosterBrand = { name: string; tagline?: string | null; logo?: string };
export const posterElementIds = ['logo', 'brand', 'tagline', 'title', 'date', 'time', 'location', 'description', 'qr', 'invitation', 'website'] as const;
export type PosterElementId = typeof posterElementIds[number];
export type PosterElementLayout = Partial<Record<PosterElementId, { hidden?: boolean; scale?: number; x?: number; y?: number }>>;
export function parsePosterElements(value: string | null): PosterElementLayout {
  try {
    if (!value || value.length > 4096) return {};
    const input = JSON.parse(value), result: PosterElementLayout = {};
    const bound = (n: unknown, fallback: number, min: number, max: number) => typeof n === 'number' && Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
    for (const id of posterElementIds) {
      const item = input?.[id];
      if (item && typeof item === 'object') result[id] = { hidden: item.hidden === true, scale: bound(item.scale, 1, .25, 3), x: bound(item.x, 0, -100, 100), y: bound(item.y, 0, -100, 100) };
    }
    return result;
  } catch { return {}; }
}
export function posterLinkTarget(publicUrl: string, requested: string | null, associated: (string | null | undefined)[]) {
  if (!requested || requested === 'portal') return publicUrl;
  if (!associated.includes(requested)) return publicUrl;
  try {
    const url = new URL(requested);
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : publicUrl;
  } catch { return publicUrl; }
}
export type PosterOptions = { background?: PosterBackground; backgroundImage?: string; backgroundOnly?: boolean; zoom?: number; offsetX?: number; offsetY?: number; opacity?: number; elements?: PosterElementLayout };
const escape = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]!));
const clean = (value: unknown) => String(value || '').replace(/\s+/g, ' ').trim();

export function posterGeometry(format: PosterFormat) {
  return format === 'social' ? { width: 1200, height: 630 } : format === 'postcard' ? { width: 400, height: 600 } : { width: 850, height: 1100 };
}

// Conservative Arial character widths leave room for font substitution in print viewers.
function textWidth(text: string, size: number) {
  return Array.from(text).reduce((sum, c) => sum + (/[MW@%]/.test(c) ? 1 : /[ilI.,:;!'| ]/.test(c) ? 0.32 : /[A-Z0-9]/.test(c) ? 0.74 : 0.6), 0) * size;
}
function wrap(value: string, width: number, size: number) {
  const lines: string[] = [];
  let line = '';
  for (const word of clean(value).split(' ')) {
    if (line && textWidth(`${line} ${word}`, size) > width) { lines.push(line); line = ''; }
    for (const c of Array.from((line ? ' ' : '') + word)) {
      if (line && textWidth(line + c, size) > width) { lines.push(line); line = ''; }
      line += c;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function posterPalette(theme: PosterTheme, background: PosterBackground) {
  if (background !== 'solid') {
    return {
      paper: '#07131c',
      accent: '#33c6d4',
      brand: '#a8f7ff',
      text: '#ffffff',
      muted: '#d7e3e6',
      rule: '#77dbe5',
      qrDark: '#101820',
      qrLight: '#ffffff',
    };
  }
  return theme === 'dark'
    ? { paper: '#101820', accent: '#33c6d4', brand: '#7de0e8', text: '#f7fbfc', muted: '#c7d6dc', rule: '#33545d', qrDark: '#101820', qrLight: '#ffffff' }
    : { paper: '#ffffff', accent: '#087f8c', brand: '#075e68', text: '#172033', muted: '#435362', rule: '#c8d9dc', qrDark: '#101820', qrLight: '#ffffff' };
}

function posterBackgroundParts(width: number, height: number, palette: ReturnType<typeof posterPalette>, background: PosterBackground, backgroundImage?: string, options: PosterOptions = {}) {
  const bounded = (value: number | undefined, fallback: number, min: number, max: number) => Number.isFinite(value) ? Math.max(min, Math.min(max, value!)) : fallback;
  const zoom = bounded(options.zoom, 1, 1, 3);
  const x = width * ((1 - zoom) / 2 + bounded(options.offsetX, 0, -100, 100) / 200);
  const y = height * ((1 - zoom) / 2 + bounded(options.offsetY, 0, -100, 100) / 200);
  const image = (aspect: string) => `<svg width="${width}" height="${height}" overflow="hidden"><image href="${escape(backgroundImage)}" x="${x}" y="${y}" width="${width * zoom}" height="${height * zoom}" preserveAspectRatio="${aspect}" data-poster-background="true" data-width="${width}" data-height="${height}" opacity="${bounded(options.opacity, 1, 0, 1)}"/></svg>`;
  if (background === 'gradient') {
    return [
      `<defs><linearGradient id="poster-bg-gradient" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#061a26"/><stop offset="56%" stop-color="#087482"/><stop offset="100%" stop-color="#101820"/></linearGradient></defs>`,
      `<rect width="${width}" height="${height}" fill="url(#poster-bg-gradient)"/>`,
      `<rect width="${width}" height="${height}" fill="#000000" opacity="0.2"/>`,
    ];
  }
  if (background === 'lifetech' && backgroundImage) {
    return [
      `<rect width="${width}" height="${height}" fill="#061a26"/>`,
      image('xMidYMax meet'),
    ];
  }
  if ((background === 'city' || background === 'gallery') && backgroundImage) {
    return [
      `<rect width="${width}" height="${height}" fill="${palette.paper}"/>`,
      image('xMidYMid slice'),
      `<rect width="${width}" height="${height}" fill="#000000" opacity="0.66"/>`,
      `<rect width="${width}" height="${height}" fill="#061a26" opacity="0.26"/>`,
    ];
  }
  return [`<rect width="${width}" height="${height}" fill="${palette.paper}"/>`];
}

export async function renderEventPoster(event: PosterEvent, publicUrl: string, format: PosterFormat, brand: PosterBrand, theme: PosterTheme = 'light', options: PosterOptions = {}) {
  const { width, height } = posterGeometry(format);
  const social = format === 'social', small = format === 'postcard';
  const background = options.background || 'solid';
  const palette = posterPalette(theme, background);
  if (options.backgroundOnly) {
    const artwork = posterBackgroundParts(width, height, palette, background, options.backgroundImage, options).join('');
    const physical = format === 'postcard' ? 'width="4in" height="6in"' : format === 'social' ? `width="${width}" height="${height}"` : 'width="8.5in" height="11in"';
    const copies = [0, 1].flatMap(row => [0, 1].map(column => `<use href="#background-art" transform="translate(${25 + column * 410} ${25 + row * 535 + (515 - height * (390 / width)) / 2}) scale(${390 / width})"/>`)).join('');
    return `<svg xmlns="http://www.w3.org/2000/svg" ${physical} viewBox="0 0 ${width} ${height}" role="img" aria-label="Plain poster background"><rect width="${width}" height="${height}" fill="${palette.paper}"/>${format === 'letter-4up' ? `<defs><g id="background-art">${artwork}</g></defs>${copies}` : artwork}</svg>`;
  }
  const margin = small ? 28 : 56;
  const contentWidth = width - margin * 2;
  const textArea = social ? 830 : contentWidth;
  const title = clean(event.social_title || event.title || 'Community event');
  const parts: string[] = [];
  const layouts = parsePosterElements(JSON.stringify(options.elements || {}));
  function element<T>(id: PosterElementId, anchorX: number, anchorY: number, draw: () => T): T {
    const start = parts.length;
    const value = draw();
    const markup = parts.splice(start).join('');
    const layout = layouts[id] || {};
    if (!layout.hidden) parts.push(`<g data-poster-element="${id}" transform="translate(${(layout.x || 0) * width / 100} ${(layout.y || 0) * height / 100}) translate(${anchorX} ${anchorY}) scale(${layout.scale || 1}) translate(${-anchorX} ${-anchorY})">${markup}</g>`);
    return value;
  }
  function block(value: string, x: number, y: number, maxWidth: number, size: number, maxLines: number, color = palette.text, weight = 400) {
    let lines = wrap(value, maxWidth, size);
    if (lines.length > maxLines) {
      lines = lines.slice(0, maxLines);
      let last = lines[maxLines - 1];
      while (last && textWidth(last + '...', size) > maxWidth) last = last.slice(0, -1);
      lines[maxLines - 1] = last.trimEnd() + '...';
    }
    parts.push(`<text fill="${color}" font-size="${size}" font-weight="${weight}">${lines.map((line, i) => `<tspan x="${x}" y="${y + i * size * 1.25}">${escape(line)}</tspan>`).join('')}</text>`);
    return y + lines.length * size * 1.25;
  }
  const qrSize = small ? 100 : 168;
  const qrX = width - margin - qrSize;
  // Fit the complete artwork into a separate column; never put the RSVP code over it.
  const artworkWidth = background === 'lifetech' ? qrX - (small ? 16 : 28) : width;
  parts.push(...posterBackgroundParts(artworkWidth, height, palette, background, options.backgroundImage, options));
  if (background === 'lifetech') parts.push(`<rect x="${artworkWidth}" width="${width - artworkWidth}" height="${height}" fill="${palette.paper}"/>`);
  if (background === 'lifetech') parts.push(`<rect width="${width}" height="${height}" fill="#000000" opacity="0.66"/>`);
  parts.push(`<rect width="${width}" height="${small ? 8 : 12}" fill="${palette.accent}"/>`);
  const logoSize = small ? 42 : 68, brandY = small ? 27 : 40;
  if (brand.logo) element('logo', margin, brandY, () => parts.push(`<image href="${escape(brand.logo)}" x="${margin}" y="${brandY}" width="${logoSize}" height="${logoSize}" preserveAspectRatio="xMidYMid meet"/>`));
  const brandX = margin + (brand.logo ? logoSize + (small ? 12 : 20) : 0);
  const brandWidth = width - margin - brandX;
  element('brand', brandX, brandY, () => block(clean(brand.name), brandX, brandY + (small ? 17 : 26), brandWidth, small ? 13 : 22, 1, palette.brand, 700));
  if (brand.tagline) element('tagline', brandX, brandY, () => block(clean(brand.tagline), brandX, brandY + (small ? 35 : 52), brandWidth, small ? 10 : 15, 1, palette.muted));
  const titleY = small ? 119 : social ? 181 : 232;
  const titleHeight = small ? 121 : social ? 146 : 242;
  let titleSize = small ? 35 : social ? 64 : 70;
  while (titleSize > (small ? 19 : 30) && wrap(title, textArea, titleSize).length * titleSize * 1.25 > titleHeight) titleSize--;
  const titleBottom = element('title', margin, titleY, () => block(title, margin, titleY, textArea, titleSize, Math.floor(titleHeight / (titleSize * 1.25)), palette.text, 800));
  let y = Math.max(titleBottom + (small ? 14 : 22), small ? 217 : social ? 323 : 450);
  const start = event.starts_at ? new Date(event.starts_at) : null;
  const valid = start && !Number.isNaN(start.getTime());
  const date = valid ? new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).format(start) : 'Date to be announced';
  const timeFormat = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
  const end = event.ends_at ? new Date(event.ends_at) : null;
  const time = valid ? `${timeFormat.format(start)}${end && !Number.isNaN(end.getTime()) ? ` - ${timeFormat.format(end)}` : ''}` : '';
  const detailSize = small ? 15 : social ? 25 : 28;
  y = element('date', margin, y, () => block(date, margin, y, textArea, detailSize, 2, palette.brand, 700));
  if (time) y = element('time', margin, y + 3, () => block(time, margin, y + 3, textArea, detailSize, 1, palette.brand, 700));
  y = element('location', margin, y + (small ? 14 : 22), () => block(clean(event.location) || 'Location to be announced', margin, y + (small ? 14 : 22), textArea, small ? 14 : 24, small ? 3 : 2, palette.text, 500));
  const footerTop = small ? 444 : social ? 553 : 854;
  const descriptionSize = small ? 13 : social ? 20 : 23;
  y += small ? 15 : 26;
  const descLines = Math.min(social ? 2 : 5, Math.floor((footerTop - 25 - y) / (descriptionSize * 1.25)));
  if (descLines > 0) element('description', margin, y, () => block(clean(event.social_description || event.description), margin, y, textArea, descriptionSize, descLines, palette.muted));
  const qrY = social ? 380 : footerTop + (small ? 17 : 28);
  const qr = await QRCode.toString(publicUrl, { type: 'svg', margin: 4, errorCorrectionLevel: 'M', color: { dark: palette.qrDark, light: palette.qrLight } });
  parts.push(`<path d="M${margin} ${footerTop}H${social ? 876 : width - margin}" stroke="${palette.rule}" stroke-width="2"/>`);
  element('qr', qrX, qrY, () => {
  parts.push(qr.replace('<svg ', `<svg x="${qrX}" y="${qrY}" width="${qrSize}" height="${qrSize}" `));
  parts.push(`<text x="${qrX + qrSize / 2}" y="${qrY + qrSize + (small ? 15 : 24)}" text-anchor="middle" fill="${palette.brand}" font-size="${small ? 11 : 16}" font-weight="700">Scan to RSVP</text>`);
  });
  element('invitation', margin, footerTop, () => block('Join us', margin, footerTop + (small ? 40 : social ? 33 : 55), social ? 800 : qrX - margin - 16, small ? 23 : social ? 26 : 34, 1, palette.brand, 700));
  element('website', margin, footerTop, () => block(new URL(publicUrl).hostname, margin, footerTop + (small ? 65 : social ? 64 : 89), social ? 800 : qrX - margin - 16, small ? 12 : 19, social ? 1 : 2, palette.muted));
  if (format === 'letter-4up') {
    // 100 units per inch: quarter-inch outer margins and a fifth-inch gutter.
    const scale = 390 / width;
    const insetY = (515 - height * scale) / 2;
    const copies = [0, 1].flatMap(row => [0, 1].map(column =>
      `<use href="#poster-art" transform="translate(${25 + column * 410} ${25 + row * 535 + insetY}) scale(${scale})"/>`));
    return `<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg" width="8.5in" height="11in" viewBox="0 0 850 1100" role="img" aria-labelledby="title desc" font-family="Arial, Helvetica, sans-serif" letter-spacing="0"><title id="title">${escape(title)} - four posters</title><desc id="desc">Four identical ${theme} ${background} event posters in a 2 by 2 grid on US Letter paper. Text uses a high-contrast foreground over the selected background.</desc><rect width="850" height="1100" fill="${palette.paper}"/><defs><svg id="poster-art" width="${width}" height="${height}" overflow="hidden">${parts.join('')}</svg></defs>${copies.join('')}</svg>`;
  }
  const physical = format === 'letter' ? 'width="8.5in" height="11in"' : format === 'postcard' ? 'width="4in" height="6in"' : `width="${width}" height="${height}"`;
  return `<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg" ${physical} viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title desc" font-family="Arial, Helvetica, sans-serif" letter-spacing="0"><title id="title">${escape(title)} flyer</title><desc id="desc">${escape(`${brand.name}. ${date}. ${time}. ${event.location || ''}. ${theme} ${background} ${format === 'postcard' ? '4×6' : format === 'letter' ? '8.5×11' : 'Social'} event poster. Text uses a high-contrast foreground over the selected background.`)}</desc>${parts.join('')}</svg>`;
}

async function posterDataImage(url: URL, maxBytes: number, allowGif = false): Promise<string | undefined> {
  try {
    const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(5000) });
    const mime = response.headers.get('content-type')?.split(';')[0];
    if (!response.ok || !["image/png", "image/jpeg", "image/webp", ...(allowGif ? ["image/gif"] : [])].includes(mime || '') || !response.body) { await response.body?.cancel(); return; }
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = []; let length = 0;
    while (true) {
      const chunk = await reader.read(); if (chunk.done) break;
      length += chunk.value.length;
      if (length > maxBytes) { await reader.cancel(); return; }
      chunks.push(chunk.value);
    }
    let binary = '';
    for (const chunk of chunks) for (const byte of chunk) binary += String.fromCharCode(byte);
    return `data:${mime};base64,${btoa(binary)}`;
  } catch { return; }
}

export async function posterLogo(url: URL): Promise<string | undefined> {
  return posterDataImage(url, 512000);
}

export async function posterBackgroundImage(url: URL): Promise<string | undefined> {
  return posterDataImage(url, 3000000);
}

export async function posterGalleryImage(value: string): Promise<string | undefined> {
  const url = publicPosterImageUrl(value);
  return url ? posterDataImage(new URL(url), 8 * 1024 * 1024, true) : undefined;
}
