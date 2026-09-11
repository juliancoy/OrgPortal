const THEME_STORAGE_KEY = 'bmore-medtech.theme';
const VALID_MODES = new Set(['system', 'light', 'dark']);

function normalizeThemeMode(value) {
  return VALID_MODES.has(value) ? value : 'system';
}

function readThemeMode() {
  try {
    return normalizeThemeMode(localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return 'system';
  }
}

function resolveTheme(mode) {
  if (mode === 'light' || mode === 'dark') return mode;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyThemeMode(mode) {
  const normalized = normalizeThemeMode(mode);
  const resolved = resolveTheme(normalized);
  document.documentElement.dataset.themeMode = normalized;
  document.documentElement.dataset.theme = resolved;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, normalized);
  } catch {
    // Storage can be unavailable in private or embedded contexts.
  }
  return { mode: normalized, resolved };
}

function setupThemeControls() {
  const controls = [...document.querySelectorAll('.theme-option[data-theme-mode]')];
  const state = applyThemeMode(readThemeMode());

  function updateControls(mode) {
    controls.forEach((control) => {
      control.setAttribute('aria-pressed', String(control.dataset.themeMode === mode));
    });
  }

  updateControls(state.mode);
  controls.forEach((control) => {
    control.addEventListener('click', () => {
      const nextState = applyThemeMode(control.dataset.themeMode);
      updateControls(nextState.mode);
    });
  });

  const media = window.matchMedia?.('(prefers-color-scheme: dark)');
  media?.addEventListener?.('change', () => {
    const mode = readThemeMode();
    if (mode === 'system') {
      applyThemeMode(mode);
      updateControls(mode);
    }
  });

  window.__bmoreMedTechTheme = {
    storageKey: THEME_STORAGE_KEY,
    readThemeMode,
    applyThemeMode,
  };
}

function ensureDatasetNavigation() {
  const nav = document.querySelector('.site-header nav')
  if (!nav || nav.querySelector('a[href="/specialty/baltimore-medtech/datasets.html"]')) return
  const link = document.createElement('a')
  link.href = '/datasets.html'
  link.textContent = 'Data sheets'
  const insertionPoint = nav.querySelector('.theme-control, .nav-cta')
  nav.insertBefore(link, insertionPoint || null)
}

function ensureMedTechEventsNavigation() {
  const header = document.querySelector('.site-header')
  const nav = header?.querySelector('nav[aria-label="Primary navigation"]')
  if (!header || !nav) return
  const orphan = [...header.querySelectorAll(':scope a[href*="/medtech-events"]')]
    .find((link) => !nav.contains(link))
  if (nav.querySelector('a[href*="/medtech-events"]')) {
    orphan?.remove()
    return
  }
  const link = orphan || document.createElement('a')
  link.href = link.getAttribute('href') || 'https://medtech.social/medtech-events'
  link.textContent = link.textContent.trim() || 'MedTech Events'
  const insertionPoint = nav.querySelector('a[href="/specialty/baltimore-medtech/map.html"]') || nav.querySelector('.theme-control, .nav-cta')
  nav.insertBefore(link, insertionPoint || null)
}

function ensureStartNavigation() {
  const nav = document.querySelector('.site-header nav')
  if (!nav || nav.querySelector('a[href="/"]')) return
  const link = document.createElement('a')
  link.href = '/start.html'
  link.textContent = 'Start Here'
  const insertionPoint = nav.querySelector('a[href="/specialty/baltimore-medtech/map.html"]') || nav.querySelector('.theme-control, .nav-cta')
  nav.insertBefore(link, insertionPoint || null)
}

function setupPrimaryNavigation() {
  const header = document.querySelector('.site-header')
  const nav = header?.querySelector('nav[aria-label="Primary navigation"]')
  if (!header || !nav) return

  let toggle = header.querySelector('.nav-toggle')
  if (!nav.id) nav.id = 'primary-nav'
  if (!toggle) {
    toggle = document.createElement('button')
    toggle.className = 'nav-toggle'
    toggle.type = 'button'
    toggle.setAttribute('aria-expanded', 'false')
    toggle.setAttribute('aria-controls', nav.id)
    toggle.innerHTML = '<span>Menu</span><span class="nav-toggle-lines" aria-hidden="true"></span>'
    nav.parentElement?.insertBefore(toggle, nav)
  }

  document.documentElement.classList.add('nav-enhanced')

  const setNavOpen = (open, { moveFocus = false } = {}) => {
    toggle.setAttribute('aria-expanded', String(open))
    toggle.classList.toggle('is-open', open)
    nav.classList.toggle('is-open', open)
    document.body.classList.toggle('nav-open', open)
    if (open && moveFocus) {
      requestAnimationFrame(() => nav.querySelector('a, button')?.focus())
    }
  }

  setNavOpen(false)
  requestAnimationFrame(() => nav.classList.add('nav-interactive'))

  toggle.addEventListener('click', () => {
    setNavOpen(toggle.getAttribute('aria-expanded') !== 'true', { moveFocus: true })
  })

  nav.addEventListener('click', (event) => {
    if (event.target.closest('a')) setNavOpen(false)
  })

  document.addEventListener('click', (event) => {
    if (!event.target.closest('.site-header')) setNavOpen(false)
  })

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && nav.classList.contains('is-open')) {
      setNavOpen(false)
      toggle.focus()
    }
  })

  window.matchMedia?.('(min-width: 721px)').addEventListener?.('change', (event) => {
    if (event.matches) setNavOpen(false)
  })
}

setupThemeControls();
ensureDatasetNavigation();
ensureMedTechEventsNavigation();
ensureStartNavigation();
setupPrimaryNavigation();

if (document.querySelector('.taxonomy-page')) {
  import('./semantic-flow.js')
    .then(() => import('./strategy-dashboard.js'))
    .then(() => import('./strategy-distortion-link.js'))
    .catch((error) => {
      console.error('Unable to initialize the medical atlas enhancements.', error);
    });
}
