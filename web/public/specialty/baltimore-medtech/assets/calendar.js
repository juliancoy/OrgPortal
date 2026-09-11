import {
  MEDICAL_EVENTS_SOURCE_URL,
  MEDTECH_ORG_EVENTS_SOURCE_URL,
  eventImageUrl,
  isMedicalEvent,
  isMedTechOwnedEvent,
  mergeEventSources,
  normalizeMedTechPortalEvent,
  parseEventDate,
} from './medical-events.js'

const PORTAL_URL = 'https://medtech.social/users/login'
const EVENT_TIME_ZONE = 'America/New_York'

const state = {
  events: [],
  visibleDate: new Date(),
}

const statusEl = document.getElementById('status')
const gridEl = document.getElementById('calendar-grid')
const listEl = document.getElementById('event-list')
const monthLabelEl = document.getElementById('month-label')
const countEl = document.getElementById('event-count')
const prevButton = document.getElementById('prev-month')
const nextButton = document.getElementById('next-month')

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

function safeUrl(value) {
  try {
    const url = new URL(String(value || ''), window.location.href)
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : PORTAL_URL
  } catch {
    return PORTAL_URL
  }
}

function monthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function dayKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function formatTime(date) {
  return date.toLocaleString(undefined, {
    timeZone: EVENT_TIME_ZONE,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function formatEventMeta(event, date) {
  const locationParts = typeof event.location === 'object'
    ? [event.location.name, event.location.address, event.location.city].filter(Boolean)
    : []
  const location = locationParts
    .filter((part, index, parts) => !parts.slice(0, index).some((previous) => previous === part || previous.includes(part)))
    .join(', ')
  return [formatTime(date), event.source_group || event.org_name, location].filter(Boolean).join(' | ')
}

function loadJson(url) {
  return fetch(url, { cache: 'no-store' }).then((response) => {
    if (!response.ok) throw new Error(`Calendar source returned ${response.status}`)
    return response.json()
  })
}

function monthEvents() {
  const visibleKey = monthKey(state.visibleDate)
  return state.events.filter(({ date }) => monthKey(date) === visibleKey)
}

function renderCalendar() {
  const monthStart = new Date(state.visibleDate.getFullYear(), state.visibleDate.getMonth(), 1)
  const firstGridDate = new Date(monthStart)
  firstGridDate.setDate(monthStart.getDate() - monthStart.getDay())
  const eventsByDay = new Map()

  for (const item of monthEvents()) {
    const key = dayKey(item.date)
    eventsByDay.set(key, [...(eventsByDay.get(key) || []), item])
  }

  monthLabelEl.textContent = monthStart.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
  gridEl.innerHTML = ''
  for (const label of ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']) {
    const weekday = document.createElement('div')
    weekday.className = 'weekday'
    weekday.textContent = label
    gridEl.appendChild(weekday)
  }

  for (let i = 0; i < 42; i += 1) {
    const date = new Date(firstGridDate)
    date.setDate(firstGridDate.getDate() + i)
    const key = dayKey(date)
    const day = document.createElement('div')
    day.className = `day${date.getMonth() === monthStart.getMonth() ? '' : ' outside'}`

    const number = document.createElement('span')
    number.className = 'day-number'
    number.textContent = String(date.getDate())
    day.appendChild(number)

    for (const item of (eventsByDay.get(key) || []).slice(0, 3)) {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = `day-event${isMedTechOwnedEvent(item.event) ? ' medtech-owned' : ''}`
      button.textContent = item.event.name
      button.addEventListener('click', () => {
        document.getElementById(item.id)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      })
      day.appendChild(button)
    }

    const overflow = (eventsByDay.get(key) || []).length - 3
    if (overflow > 0) {
      const more = document.createElement('span')
      more.className = 'status'
      more.textContent = `+${overflow} more`
      day.appendChild(more)
    }

    gridEl.appendChild(day)
  }

  gridEl.hidden = false
}

function renderList() {
  const now = new Date()
  const allUpcoming = state.events.filter(({ date }) => date >= now)
  const medtechUpcoming = allUpcoming.filter((item) => isMedTechOwnedEvent(item.event))
  const regionalUpcoming = allUpcoming.filter((item) => !isMedTechOwnedEvent(item.event)).slice(0, Math.max(0, 40 - medtechUpcoming.length))
  const upcoming = [...medtechUpcoming, ...regionalUpcoming]
  countEl.textContent = `${upcoming.length} shown`
  listEl.innerHTML = ''

  if (upcoming.length === 0) {
    listEl.innerHTML = '<p class="status">No upcoming medical events are published right now.</p>'
    return
  }

  for (const item of upcoming) {
    const article = document.createElement('article')
    article.className = 'event-card'
    article.id = item.id

    const month = item.date.toLocaleDateString(undefined, { month: 'short' })
    const day = item.date.toLocaleDateString(undefined, { day: 'numeric' })
    const description = cleanText(item.event.description).replace(/\s+/g, ' ').trim()
    const eventUrl = safeUrl(item.event.url)
    const imageUrl = eventImageUrl(item.event)
    const medtechOwned = isMedTechOwnedEvent(item.event)
    if (medtechOwned) article.classList.add('medtech-owned')
    if (imageUrl) article.classList.add('has-image')

    article.innerHTML = `
      <div class="event-date">${month}<span>${day}</span></div>
      <div class="event-details">
        ${medtechOwned ? '<p class="event-feature-label">Baltimore MedTech hosted</p>' : ''}
        <h3>${escapeHtml(cleanText(item.event.name))}</h3>
        <p>${escapeHtml(formatEventMeta(item.event, item.date))}</p>
        ${description ? `<p>${escapeHtml(description.slice(0, 180))}${description.length > 180 ? '...' : ''}</p>` : ''}
        <a href="${escapeHtml(eventUrl)}" target="_blank" rel="noopener noreferrer">${medtechOwned ? 'Register for this event' : 'Open event'}</a>
      </div>
      ${imageUrl ? `<a class="event-image-link" href="${escapeHtml(eventUrl)}" target="_blank" rel="noopener noreferrer" aria-label="Open ${escapeHtml(cleanText(item.event.name))}"><img class="event-image" src="${escapeHtml(imageUrl)}" alt="" loading="lazy" decoding="async" /></a>` : ''}
    `
    article.querySelector('.event-image')?.addEventListener('error', () => {
      article.querySelector('.event-image-link')?.remove()
      article.classList.remove('has-image')
    }, { once: true })
    listEl.appendChild(article)
  }
}

async function loadEvents() {
  try {
    const [regionalEvents, medtechEventsResult] = await Promise.all([
      loadJson(MEDICAL_EVENTS_SOURCE_URL),
      loadJson(MEDTECH_ORG_EVENTS_SOURCE_URL).catch((error) => {
        console.warn('Baltimore MedTech events could not be loaded for the general calendar.', error)
        return []
      }),
    ])
    const medtechEvents = Array.isArray(medtechEventsResult) ? medtechEventsResult.map(normalizeMedTechPortalEvent) : []
    const sourceEvents = mergeEventSources(medtechEvents, regionalEvents)
    state.events = sourceEvents
      .filter(isMedicalEvent)
      .map((event, index) => ({ event, date: parseEventDate(event), id: `event-${index}` }))
      .filter((item) => item.date)
      .sort((a, b) => a.date.getTime() - b.date.getTime())

    const firstUpcoming = state.events.find((item) => item.date >= new Date())
    if (firstUpcoming) state.visibleDate = new Date(firstUpcoming.date)
    statusEl.hidden = true
    renderCalendar()
    renderList()
  } catch (error) {
    statusEl.innerHTML = `
      The published calendar source could not be loaded here.
      <a href="https://codecollective.us/calendar.html?city=baltimore&lm=individual_tags&lt=health.science" target="_blank" rel="noopener noreferrer">
        Open the published Code Collective calendar.
      </a>
    `
    console.error(error)
  }
}

prevButton.addEventListener('click', () => {
  state.visibleDate = new Date(state.visibleDate.getFullYear(), state.visibleDate.getMonth() - 1, 1)
  renderCalendar()
})

nextButton.addEventListener('click', () => {
  state.visibleDate = new Date(state.visibleDate.getFullYear(), state.visibleDate.getMonth() + 1, 1)
  renderCalendar()
})

loadEvents()
