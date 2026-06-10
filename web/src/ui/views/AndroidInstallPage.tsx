import { useEffect, useState } from 'react'
import { resolveAndroidApkUrl } from '../../infrastructure/platform/androidApp'
import { isAndroidApkUrlReachable } from '../../infrastructure/platform/androidApp'
import { loadUpdateManifest } from '../../infrastructure/platform/updateManifest'

type ApkStatus = 'checking' | 'available' | 'unavailable'

export function AndroidInstallPage() {
  const [apkUrl, setApkUrl] = useState(() => resolveAndroidApkUrl())
  const [apkStatus, setApkStatus] = useState<ApkStatus>('checking')
  const [releaseLabel, setReleaseLabel] = useState('latest release')

  useEffect(() => {
    const controller = new AbortController()

    async function resolveDownload() {
      setApkStatus('checking')
      const fallbackUrl = resolveAndroidApkUrl()
      const manifest = await loadUpdateManifest(controller.signal)
      if (controller.signal.aborted) return

      const manifestUrl = manifest?.android?.apkUrl?.trim()
      const nextUrl = manifestUrl || fallbackUrl
      setApkUrl(nextUrl)
      if (manifest?.android?.versionName) {
        setReleaseLabel(`version ${manifest.android.versionName} (${manifest.android.buildNumber})`)
      }

      const reachable = await isAndroidApkUrlReachable(nextUrl, controller.signal)
      if (!controller.signal.aborted) setApkStatus(reachable ? 'available' : 'unavailable')
    }

    void resolveDownload()

    return () => {
      controller.abort()
    }
  }, [])

  return (
    <section className="panel">
      <h1 style={{ marginTop: 0 }}>Install OrgPortal Android App</h1>
      <p className="muted" style={{ marginTop: 0 }}>
        Follow these steps to install the latest Android APK.
      </p>

      <ol style={{ display: 'grid', gap: '0.75rem', paddingLeft: '1.2rem', margin: '0 0 1rem' }}>
        <li>Tap Download APK below.</li>
        <li>When prompted, allow installs from this browser (one-time Android setting).</li>
        <li>Open the downloaded file named similar to `orgportal-android-release.apk`.</li>
        <li>Confirm Install, then open OrgPortal.</li>
      </ol>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem', alignItems: 'center' }}>
        {apkStatus === 'available' ? (
          <a href={apkUrl} className="btn-primary" target="_blank" rel="noreferrer">
            Download APK
          </a>
        ) : (
          <button type="button" className="btn-primary" disabled>
            {apkStatus === 'checking' ? 'Checking APK...' : 'APK unavailable'}
          </button>
        )}
        <span className="muted" style={{ fontSize: '0.9rem' }}>
          Source: {apkUrl}
        </span>
      </div>
      {apkStatus === 'unavailable' ? (
        <p className="muted" style={{ margin: '0.9rem 0 0' }}>
          The Android {releaseLabel} is not published at the update URL yet. Run the signed Android release
          workflow with static deployment enabled before sharing this installer.
        </p>
      ) : null}
    </section>
  )
}
