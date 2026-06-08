import { spawnSync } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const webDir = path.resolve(__dirname, '..')
const androidDir = path.join(webDir, 'android')
const appBuildGradlePath = path.join(androidDir, 'app', 'build.gradle')
const updateManifestPath = path.join(webDir, 'public', 'mobile-update.json')

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: webDir,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    ...options,
  })

  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed with status ${result.status ?? 'unknown'}`)
  }
}

async function exists(filePath) {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

async function readAndroidVersion() {
  const rawManifest = await fs.readFile(updateManifestPath, 'utf8')
  const manifest = JSON.parse(rawManifest)
  const buildNumber = Number(manifest?.android?.buildNumber)
  const versionName = String(manifest?.android?.versionName ?? '').trim()

  if (!Number.isInteger(buildNumber) || buildNumber < 1) {
    throw new Error(`Invalid android.buildNumber in ${updateManifestPath}`)
  }

  if (!versionName) {
    throw new Error(`Invalid android.versionName in ${updateManifestPath}`)
  }

  return { buildNumber, versionName }
}

function hasSigningEnv() {
  return Boolean(
    process.env.ANDROID_KEYSTORE_BASE64
      && process.env.ANDROID_KEYSTORE_PASSWORD
      && process.env.ANDROID_KEY_ALIAS
      && process.env.ANDROID_KEY_PASSWORD,
  )
}

async function writeReleaseKeystore() {
  if (!hasSigningEnv()) {
    return false
  }

  const keystorePath = path.join(androidDir, 'app', 'release.keystore')
  await fs.writeFile(keystorePath, Buffer.from(process.env.ANDROID_KEYSTORE_BASE64, 'base64'))
  return true
}

function escapeGradleString(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

function configureSigning(buildGradle, signingEnabled) {
  let nextBuildGradle = buildGradle
    .replace(/\n\s*\/\/ Code Collective CI signing config start[\s\S]*?\/\/ Code Collective CI signing config end\n/, '\n')
    .replace(/\n\s*signingConfig signingConfigs\.release/, '')

  if (!signingEnabled) {
    return nextBuildGradle
  }

  nextBuildGradle = nextBuildGradle.replace(
    /(\n\s*)buildTypes\s*\{/,
    `
    // Code Collective CI signing config start
    signingConfigs {
        release {
            storeFile file("release.keystore")
            storePassword "${escapeGradleString(process.env.ANDROID_KEYSTORE_PASSWORD)}"
            keyAlias "${escapeGradleString(process.env.ANDROID_KEY_ALIAS)}"
            keyPassword "${escapeGradleString(process.env.ANDROID_KEY_PASSWORD)}"
        }
    }
    // Code Collective CI signing config end
$1buildTypes {`,
  )

  if (!nextBuildGradle.includes('signingConfig signingConfigs.release')) {
    nextBuildGradle = nextBuildGradle.replace(
      /(buildTypes\s*\{\s*release\s*\{)/,
      '$1\n            signingConfig signingConfigs.release',
    )
  }

  return nextBuildGradle
}

async function configureAndroidProject() {
  const { buildNumber, versionName } = await readAndroidVersion()
  const signingEnabled = await writeReleaseKeystore()

  let buildGradle = await fs.readFile(appBuildGradlePath, 'utf8')
  buildGradle = buildGradle.replace(/versionCode\s+\d+/, `versionCode ${buildNumber}`)
  buildGradle = buildGradle.replace(/versionName\s+"[^"]*"/, `versionName "${escapeGradleString(versionName)}"`)
  buildGradle = configureSigning(buildGradle, signingEnabled)

  await fs.writeFile(appBuildGradlePath, buildGradle)

  console.log(`[android] versionCode ${buildNumber}`)
  console.log(`[android] versionName ${versionName}`)
  console.log(`[android] release signing ${signingEnabled ? 'enabled' : 'not configured'}`)
}

async function main() {
  if (await exists(androidDir)) {
    run('npx', ['cap', 'sync', 'android'])
  } else {
    run('npx', ['cap', 'add', 'android'])
  }

  await configureAndroidProject()
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err))
  process.exit(1)
})
