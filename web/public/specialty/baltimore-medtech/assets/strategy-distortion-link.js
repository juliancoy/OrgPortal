import { calculateNeedAvailabilityMetrics } from './need-availability-metrics.js'
import { element, formatInteger } from './strategy-utils.js'

const FIELD_URLS = [
  '/specialty/baltimore-medtech/strategy-neurology.json',
  '/specialty/baltimore-medtech/strategy-oncology.json',
  '/specialty/baltimore-medtech/strategy-radiology.json',
  '/specialty/baltimore-medtech/strategy-genomics.json',
]

function injectCallout() {
  const dashboard = document.getElementById('strategy-dashboard')
  const heading = dashboard?.querySelector('.strategy-dashboard-heading')
  if (!dashboard || !heading || dashboard.querySelector('.strategy-distortion-callout')) return null

  const link = element('a', 'strategy-distortion-callout')
  link.href = '/specialty/baltimore-medtech/need-availability-distortions.html'
  link.innerHTML = `
    <span class="strategy-distortion-callout-kicker">Need ↔ availability</span>
    <div class="strategy-distortion-callout-copy">
      <strong>Where patient need outruns service capacity</strong>
      <p>Open the physician-pressure ranking plus the new allied-care-team context, raw ratios, capacity gap chart, and interpretation guardrails.</p>
    </div>
    <div class="strategy-distortion-callout-result">
      <small>Largest current physician signal</small>
      <strong id="strategy-distortion-leader">Calculating…</strong>
      <span id="strategy-distortion-detail">Directional four-field comparison</span>
    </div>
    <span class="strategy-distortion-callout-action">Open distortion view →</span>
  `
  heading.insertAdjacentElement('afterend', link)

  const jumps = document.querySelector('.global-flow-jumps')
  if (jumps && !jumps.querySelector('[href="/specialty/baltimore-medtech/need-availability-distortions.html"]')) {
    const jump = element('a', '', 'Need–availability gaps')
    jump.href = '/specialty/baltimore-medtech/need-availability-distortions.html'
    jumps.prepend(jump)
  }

  const primaryNav = document.querySelector('.taxonomy-site-header nav')
  if (primaryNav && !primaryNav.querySelector('[href="/specialty/baltimore-medtech/need-availability-distortions.html"]')) {
    const navLink = element('a', '', 'Need gaps')
    navLink.href = '/specialty/baltimore-medtech/need-availability-distortions.html'
    primaryNav.insertBefore(navLink, primaryNav.querySelector('.theme-control'))
  }
  return link
}

async function populateCallout(link) {
  if (!link) return
  try {
    const responses = await Promise.all(FIELD_URLS.map((url) => fetch(url)))
    if (responses.some((response) => !response.ok)) throw new Error('Metric fetch failed')
    const fields = await Promise.all(responses.map((response) => response.json()))
    const { leader } = calculateNeedAvailabilityMetrics(fields)
    link.querySelector('#strategy-distortion-leader').textContent = `${leader.name} · ${leader.distortionIndex.toFixed(1)}`
    link.querySelector('#strategy-distortion-detail').textContent = `${formatInteger(leader.peoplePerSpecialist)} need-proxy people per physician proxy · allied team shown separately`
  } catch {
    link.querySelector('#strategy-distortion-leader').textContent = 'Open ranked comparison'
  }
}

const callout = injectCallout()
populateCallout(callout)
