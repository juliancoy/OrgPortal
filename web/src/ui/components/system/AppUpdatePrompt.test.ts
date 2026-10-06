import { describe, it, expect } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { AppUpdatePrompt } from './AppUpdatePrompt'
import type { AvailableUpdate } from '../../../infrastructure/platform/updateManifest'

const update: AvailableUpdate = { target: 'web', current: { target: 'web', versionName: '1', buildNumber: 1 }, latestVersionName: '2', latestBuildNumber: 2, notes: '', mandatory: false, actionLabel: 'Reload app', actionUrl: null }
const render = (value: AvailableUpdate) => renderToStaticMarkup(createElement(AppUpdatePrompt, { update: value, checking: false, onUpdate() {}, onDismiss() {} }))

describe('AppUpdatePrompt accessibility', () => {
  it('offers an optional update without claiming a modal or blocking edits', () => {
    const html = render(update)
    expect(html).toContain('app-update-banner')
    expect(html).toContain('role="status"')
    expect(html).not.toContain('aria-modal')
    expect(html).toContain('Later')
    expect(html).toContain('Save any changes first')
  })
  it('keeps required native updates in a modal without a dismiss action', () => {
    const html = render({ ...update, target: 'native', mandatory: true })
    expect(html).toContain('role="dialog"')
    expect(html).toContain('aria-modal="true"')
    expect(html).toContain('Update required')
    expect(html).not.toContain('Later')
  })
})
