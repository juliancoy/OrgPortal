import { test } from '@playwright/test'

test.describe('Code Collective UI and UX coverage backlog', () => {
  test('mobile chat has a dedicated list-to-thread navigation pattern', async () => {
    test.fixme(true, 'Native chat currently renders the same sidebar/timeline structure on mobile; add a focused mobile list/thread flow.')
  })

  test('native chat exposes offline and reconnecting states', async () => {
    test.fixme(true, 'Native chat keeps polling after transient failures, but the UI does not yet show an explicit offline/reconnecting state.')
  })

  test('native chat has a first-class retry action for failed optimistic messages', async () => {
    test.fixme(true, 'Failed messages currently instruct the user to send again; add a direct retry control that reuses the same client_message_id.')
  })

  test('group, organization, and event rooms can be created and joined through the UI', async () => {
    test.fixme(true, 'The current native chat slice covers DMs; org/event room creation and membership policy UI still need implementation.')
  })

  test('attachments can be uploaded, previewed, sent, downloaded, and rejected when oversized', async () => {
    test.fixme(true, 'Attachment endpoints and R2-backed UI are still future work in the Cloudflare chat plan.')
  })

  test('Matrix fallback can still be selected and reached when the native backend is disabled', async () => {
    test.fixme(true, 'Matrix fallback is controlled by build-time env; add a separate E2E build/profile or component seam to verify it in CI.')
  })

  test('full user registration can create a fresh account entirely through the UI', async () => {
    test.fixme(true, 'Live account creation needs a disposable test mailbox or guarded test endpoint before it can run safely in CI.')
  })

  test('cross-browser UI coverage runs in Chromium, Firefox, and WebKit', async () => {
    test.fixme(true, 'The current Playwright config intentionally runs Chromium desktop/mobile; add Firefox/WebKit once CI browser install time is acceptable.')
  })

  test('visual regression snapshots are reviewed for ID, profile, public profile, and chat', async () => {
    test.fixme(true, 'The suite currently asserts layout invariants; add approved Playwright screenshots once the UI has stable baselines.')
  })
})
