import QRCode from 'qrcode';

export type PosterFormat = 'letter' | 'letter-4up' | 'postcard' | 'social';
export type PosterTheme = 'light' | 'dark';
type PosterEvent = { title: string; social_title?: string | null; description?: string | null; social_description?: string | null;
  starts_at?: string | null; ends_at?: string | null; location?: string | null };
export type PosterBrand = { name: string; tagline?: string | null; logo?: string };
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

function posterPalette(theme: PosterTheme) {
  return theme === 'dark'
    ? { paper: '#101820', accent: '#33c6d4', brand: '#7de0e8', text: '#f7fbfc', muted: '#c7d6dc', rule: '#33545d', qrDark: '#101820', qrLight: '#ffffff' }
    : { paper: '#ffffff', accent: '#087f8c', brand: '#075e68', text: '#172033', muted: '#435362', rule: '#c8d9dc', qrDark: '#101820', qrLight: '#ffffff' };
}

export async function renderEventPoster(event: PosterEvent, publicUrl: string, format: PosterFormat, brand: PosterBrand, theme: PosterTheme = 'light') {
  const { width, height } = posterGeometry(format);
  const social = format === 'social', small = format === 'postcard';
  const palette = posterPalette(theme);
  const margin = small ? 28 : 56;
  const contentWidth = width - margin * 2;
  const textArea = social ? 830 : contentWidth;
  const title = clean(event.social_title || event.title || 'Community event');
  const parts: string[] = [];
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
  parts.push(`<rect width="${width}" height="${height}" fill="${palette.paper}"/><rect width="${width}" height="${small ? 8 : 12}" fill="${palette.accent}"/>`);
  const logoSize = small ? 42 : 68, brandY = small ? 27 : 40;
  if (brand.logo) parts.push(`<image href="${escape(brand.logo)}" x="${margin}" y="${brandY}" width="${logoSize}" height="${logoSize}" preserveAspectRatio="xMidYMid meet"/>`);
  const brandX = margin + (brand.logo ? logoSize + (small ? 12 : 20) : 0);
  const brandWidth = width - margin - brandX;
  block(clean(brand.name), brandX, brandY + (small ? 17 : 26), brandWidth, small ? 13 : 22, 1, palette.brand, 700);
  if (brand.tagline) block(clean(brand.tagline), brandX, brandY + (small ? 35 : 52), brandWidth, small ? 10 : 15, 1, palette.muted);
  const titleY = small ? 119 : social ? 181 : 232;
  const titleHeight = small ? 121 : social ? 146 : 242;
  let titleSize = small ? 35 : social ? 64 : 70;
  while (titleSize > (small ? 19 : 30) && wrap(title, textArea, titleSize).length * titleSize * 1.25 > titleHeight) titleSize--;
  const titleBottom = block(title, margin, titleY, textArea, titleSize, Math.floor(titleHeight / (titleSize * 1.25)), palette.text, 800);
  let y = Math.max(titleBottom + (small ? 14 : 22), small ? 217 : social ? 323 : 450);
  const start = event.starts_at ? new Date(event.starts_at) : null;
  const valid = start && !Number.isNaN(start.getTime());
  const date = valid ? new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).format(start) : 'Date to be announced';
  const timeFormat = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
  const end = event.ends_at ? new Date(event.ends_at) : null;
  const time = valid ? `${timeFormat.format(start)}${end && !Number.isNaN(end.getTime()) ? ` - ${timeFormat.format(end)}` : ''}` : '';
  const detailSize = small ? 15 : social ? 25 : 28;
  y = block(date, margin, y, textArea, detailSize, 2, palette.brand, 700);
  if (time) y = block(time, margin, y + 3, textArea, detailSize, 1, palette.brand, 700);
  y = block(clean(event.location) || 'Location to be announced', margin, y + (small ? 14 : 22), textArea, small ? 14 : 24, small ? 3 : 2, palette.text, 500);
  const footerTop = small ? 444 : social ? 553 : 854;
  const descriptionSize = small ? 13 : social ? 20 : 23;
  y += small ? 15 : 26;
  const descLines = Math.min(social ? 2 : 5, Math.floor((footerTop - 25 - y) / (descriptionSize * 1.25)));
  if (descLines > 0) block(clean(event.social_description || event.description), margin, y, textArea, descriptionSize, descLines, palette.muted);
  const qrSize = small ? 100 : social ? 168 : 168;
  const qrX = width - margin - qrSize;
  const qrY = social ? 380 : footerTop + (small ? 17 : 28);
  const qr = await QRCode.toString(publicUrl, { type: 'svg', margin: 4, errorCorrectionLevel: 'M', color: { dark: palette.qrDark, light: palette.qrLight } });
  parts.push(`<path d="M${margin} ${footerTop}H${social ? 876 : width - margin}" stroke="${palette.rule}" stroke-width="2"/>`);
  parts.push(qr.replace('<svg ', `<svg x="${qrX}" y="${qrY}" width="${qrSize}" height="${qrSize}" `));
  parts.push(`<text x="${qrX + qrSize / 2}" y="${qrY + qrSize + (small ? 15 : 24)}" text-anchor="middle" fill="${palette.brand}" font-size="${small ? 11 : 16}" font-weight="700">Scan to RSVP</text>`);
  block('Join us', margin, footerTop + (small ? 40 : social ? 33 : 55), social ? 800 : qrX - margin - 16, small ? 23 : social ? 26 : 34, 1, palette.brand, 700);
  block(new URL(publicUrl).hostname, margin, footerTop + (small ? 65 : social ? 64 : 89), social ? 800 : qrX - margin - 16, small ? 12 : 19, social ? 1 : 2, palette.muted);
  if (format === 'letter-4up') {
    // 100 units per inch: quarter-inch outer margins and a fifth-inch gutter.
    const scale = 390 / width;
    const insetY = (515 - height * scale) / 2;
    const copies = [0, 1].flatMap(row => [0, 1].map(column =>
      `<use href="#poster-art" transform="translate(${25 + column * 410} ${25 + row * 535 + insetY}) scale(${scale})"/>`));
    return `<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg" width="8.5in" height="11in" viewBox="0 0 850 1100" role="img" aria-labelledby="title desc" font-family="Arial, Helvetica, sans-serif" letter-spacing="0"><title id="title">${escape(title)} - four posters</title><desc id="desc">Four identical ${theme} event posters in a 2 by 2 grid on US Letter paper.</desc><rect width="850" height="1100" fill="${palette.paper}"/><defs><g id="poster-art">${parts.join('')}</g></defs>${copies.join('')}</svg>`;
  }
  const physical = format === 'letter' ? 'width="8.5in" height="11in"' : format === 'postcard' ? 'width="4in" height="6in"' : `width="${width}" height="${height}"`;
  return `<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg" ${physical} viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title desc" font-family="Arial, Helvetica, sans-serif" letter-spacing="0"><title id="title">${escape(title)} flyer</title><desc id="desc">${escape(`${brand.name}. ${date}. ${time}. ${event.location || ''}. ${theme} ${format === 'postcard' ? '4×6' : format === 'letter' ? '8.5×11' : 'Social'} event poster.`)}</desc>${parts.join('')}</svg>`;
}

export async function posterLogo(url: URL): Promise<string | undefined> {
  try {
    const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(5000) });
    const mime = response.headers.get('content-type')?.split(';')[0];
    if (!response.ok || !['image/png', 'image/jpeg', 'image/webp'].includes(mime || '') || !response.body) return;
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = []; let length = 0;
    while (true) {
      const chunk = await reader.read(); if (chunk.done) break;
      length += chunk.value.length;
      if (length > 512000) { await reader.cancel(); return; }
      chunks.push(chunk.value);
    }
    let binary = '';
    for (const chunk of chunks) for (const byte of chunk) binary += String.fromCharCode(byte);
    return `data:${mime};base64,${btoa(binary)}`;
  } catch { return; }
}
