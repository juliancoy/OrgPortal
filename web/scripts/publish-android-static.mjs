import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const webDir = path.resolve(__dirname, '..')
const repoRoot = path.resolve(webDir, '..', '..')
const staticDir = path.join(repoRoot, 'static')
const webPublicDir = path.join(webDir, 'public')

const releaseCandidates = [
  path.join(webDir, 'android', 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk'),
  path.join(webDir, 'android', 'app', 'build', 'outputs', 'apk', 'release', 'app-arm64-v8a-release.apk'),
  path.join(staticDir, 'app-release.apk'),
]

const targetApkName = 'orgportal-android-release.apk'
const targetApkPath = path.join(staticDir, targetApkName)
const targetWebPublicApkPath = path.join(webPublicDir, targetApkName)
const sourceManifestPath = path.join(webDir, 'public', 'mobile-update.json')
const targetManifestPath = path.join(staticDir, 'mobile-update.json')

async function exists(filePath) {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

async function main() {
  await fs.mkdir(staticDir, { recursive: true })
  await fs.mkdir(webPublicDir, { recursive: true })

  const sourceApk = (await Promise.all(releaseCandidates.map(async (candidate) => ((await exists(candidate)) ? candidate : null))))
    .find(Boolean)

  if (!sourceApk) {
    throw new Error(
      `No release APK found. Expected one of:\n${releaseCandidates.map((c) => `- ${c}`).join('\n')}`,
    )
  }

  await fs.copyFile(sourceApk, targetApkPath)
  await fs.copyFile(sourceApk, targetWebPublicApkPath)

  if (await exists(sourceManifestPath)) {
    await fs.copyFile(sourceManifestPath, targetManifestPath)
  }

  console.log(`Published APK to ${targetApkPath}`)
  console.log(`Published APK to ${targetWebPublicApkPath}`)
  if (await exists(targetManifestPath)) {
    console.log(`Published manifest to ${targetManifestPath}`)
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err))
  process.exit(1)
})
