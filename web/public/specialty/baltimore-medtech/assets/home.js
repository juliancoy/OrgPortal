import {
  MEDTECH_ORG_EVENTS_SOURCE_URL,
  eventImageUrl,
  medtechEventUrl,
  normalizeMedTechPortalEvent,
  parseEventDate,
} from './medical-events.js'

const revealItems = [...document.querySelectorAll('[data-reveal]')]
const nextEventEl = document.getElementById('next-medtech-event')
const EVENT_TIME_ZONE = 'America/New_York'

function cleanText(value) {
  const div = document.createElement('div')
  div.innerHTML = String(value || '')
  return div.textContent || div.innerText || ''
}

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function formatHeroEventDate(date) {
  return date.toLocaleString(undefined, {
    timeZone: EVENT_TIME_ZONE,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

async function showNextMedTechEvent() {
  if (!nextEventEl) return
  try {
    const response = await fetch(MEDTECH_ORG_EVENTS_SOURCE_URL, { cache: 'no-store' })
    if (!response.ok) throw new Error(`MedTech events returned ${response.status}`)
    const events = await response.json()
    const now = new Date()
    const next = (Array.isArray(events) ? events : [])
      .map(normalizeMedTechPortalEvent)
      .map((event) => ({ event, date: parseEventDate(event) }))
      .filter((item) => item.date && item.date >= now)
      .sort((a, b) => a.date.getTime() - b.date.getTime())[0]
    if (!next) return

    const imageUrl = eventImageUrl(next.event)
    const location = typeof next.event.location === 'object'
      ? [next.event.location.name, next.event.location.address].filter(Boolean)[0]
      : ''
    const eventName = cleanText(next.event.name)
    nextEventEl.innerHTML = `
      <a class="hero-event-card${imageUrl ? ' has-image' : ''}" href="${escapeHtml(medtechEventUrl(next.event))}" aria-label="Open ${escapeHtml(eventName)}">
        ${imageUrl ? `<img src="${escapeHtml(imageUrl)}" alt="" loading="eager" decoding="async" />` : ''}
        <span class="hero-event-copy">
          <span class="hero-event-label">Next Baltimore MedTech event</span>
          <span class="hero-event-title">${escapeHtml(eventName)}</span>
          <span class="hero-event-meta">${escapeHtml(formatHeroEventDate(next.date))}${location ? ` | ${escapeHtml(cleanText(location))}` : ''}</span>
        </span>
        <span class="hero-event-cue">View event <span aria-hidden="true">&rarr;</span></span>
      </a>
    `
    nextEventEl.hidden = false
    nextEventEl.querySelector('img')?.addEventListener('error', (event) => {
      event.currentTarget.remove()
    }, { once: true })
  } catch (error) {
    console.warn('Next Baltimore MedTech event could not be loaded for the hero.', error)
  }
}

if (revealItems.length && 'IntersectionObserver' in window) {
  document.documentElement.classList.add('reveal-enabled')

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue
        entry.target.classList.add('is-visible')
        observer.unobserve(entry.target)
      }
    },
    {
      rootMargin: '0px 0px -12% 0px',
      threshold: 0.12,
    },
  )

  requestAnimationFrame(() => {
    revealItems.forEach((item) => observer.observe(item))
  })
}

showNextMedTechEvent()
