import { resolveAndroidApkUrl } from '../../infrastructure/platform/androidApp'

export function AndroidInstallPage() {
  const apkUrl = resolveAndroidApkUrl()

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
        <a href={apkUrl} className="btn-primary" target="_blank" rel="noreferrer">
          Download APK
        </a>
        <span className="muted" style={{ fontSize: '0.9rem' }}>
          Source: {apkUrl}
        </span>
      </div>
    </section>
  )
}
