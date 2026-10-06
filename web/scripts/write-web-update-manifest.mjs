import { readFileSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

export function webReleaseManifest(source, buildNumber, versionName, notes = '') {
  if (!Number.isSafeInteger(buildNumber) || buildNumber <= 0) throw new Error('A positive web build number is required')
  return { ...source, version: 1, publishedAt: new Date().toISOString(),
    web: { versionName, buildNumber, notes: notes || 'A new version is available. Save your work and reload when you’re ready.' },
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [, , sourcePath, outputPath, build, versionName, notes] = process.argv
  const source = JSON.parse(readFileSync(sourcePath, 'utf8'))
  writeFileSync(outputPath, JSON.stringify(webReleaseManifest(source, Number(build), versionName, notes), null, 2) + '\n')
}
