import { isNativeCapacitorRuntime } from './runtimePlatform'

export type RuntimeUpdateTarget = 'native' | 'web'

export type RuntimeBuildInfo = {
  target: RuntimeUpdateTarget
  versionName: string
  buildNumber: number
}

export type UpdateManifest = {
  version: number
  publishedAt: string
  android?: {
    versionName: string
    buildNumber: number
    apkUrl: string
    notes?: string
    minSupportedBuildNumber?: number
  }
  web?: {
    versionName: string
    buildNumber: number
    notes?: string
  }
}

export type AvailableUpdate = {
  target: RuntimeUpdateTarget
  current: RuntimeBuildInfo
  latestVersionName: string
  latestBuildNumber: number
  notes: string
  mandatory: boolean
  actionLabel: string
  actionUrl: string | null
}

type UpdateCheckResult = {
  available: AvailableUpdate | null
  manifest: UpdateManifest | null
}

const DEFAULT_STATIC_MANIFEST_PATH = '/mobile-update.json'
const DEFAULT_NATIVE_PORTAL_BASE = 'https://dev.portal.arkavo.org'

function getCompileTimeVersionName(): string {
  const runtimeValue = (globalThis as { __APP_VERSION__?: unknown }).__APP_VERSION__
  if (typeof runtimeValue === 'string' && runtimeValue.trim()) return runtimeValue.trim()
  if (typeof __APP_VERSION__ !== 'undefined' && String(__APP_VERSION__).trim()) {
    return String(__APP_VERSION__).trim()
  }
  return '0.0.0'
}

function getCompileTimeBuildNumber(): number {
  const runtimeValue = (globalThis as { __APP_BUILD_NUMBER__?: unknown }).__APP_BUILD_NUMBER__
  if (runtimeValue != null) return parseBuildNumber(runtimeValue, 0)
  if (typeof __APP_BUILD_NUMBER__ !== 'undefined') return parseBuildNumber(__APP_BUILD_NUMBER__, 0)
  return 0
}

function parseBuildNumber(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, Math.floor(value))
  const parsed = Number.parseInt(String(value ?? '').trim(), 10)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(0, parsed)
}

function deriveStaticHost(hostname: string): string | null {
  const normalized = hostname.trim().toLowerCase()
  if (!normalized) return null
  if (normalized === 'localhost' || normalized === '127.0.0.1') return normalized
  const portalMatch = normalized.match(/^(?:dev\.)?portal\.(.+)$/)
  if (portalMatch?.[1]) return `static.${portalMatch[1]}`
  return null
}

function manifestUrlFromPortalBase(portalBase: string): string | null {
  try {
    const parsed = new URL(portalBase)
    const staticHost = deriveStaticHost(parsed.hostname)
    if (!staticHost) return null
    if (staticHost === 'localhost' || staticHost === '127.0.0.1') {
      return `${parsed.protocol}//${staticHost}:8080${DEFAULT_STATIC_MANIFEST_PATH}`
    }
    return `https://${staticHost}${DEFAULT_STATIC_MANIFEST_PATH}`
  } catch {
    return null
  }
}

export function resolveUpdateManifestUrl(): string {
  const env = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env
  const explicit = env?.VITE_UPDATE_MANIFEST_URL?.trim()
  if (explicit) return explicit

  if (typeof window !== 'undefined') {
    const staticHost = deriveStaticHost(window.location.hostname)
    if (staticHost) {
      if (staticHost === 'localhost' || staticHost === '127.0.0.1') {
        return `${window.location.protocol}//${staticHost}:8080${DEFAULT_STATIC_MANIFEST_PATH}`
      }
      return `https://${staticHost}${DEFAULT_STATIC_MANIFEST_PATH}`
    }
  }

  const nativePortalBase = env?.VITE_NATIVE_PORTAL_BASE_URL?.trim() || DEFAULT_NATIVE_PORTAL_BASE
  return manifestUrlFromPortalBase(nativePortalBase) ?? 'https://static.arkavo.org/mobile-update.json'
}

function parseManifest(raw: unknown): UpdateManifest | null {
  if (!raw || typeof raw !== 'object') return null
  const data = raw as Record<string, unknown>
  const version = parseBuildNumber(data.version, 1)
  const publishedAt = typeof data.publishedAt === 'string' ? data.publishedAt : new Date(0).toISOString()

  const androidRaw = data.android as Record<string, unknown> | undefined
  const webRaw = data.web as Record<string, unknown> | undefined

  const android = androidRaw
    ? {
        versionName: String(androidRaw.versionName ?? '0.0.0'),
        buildNumber: parseBuildNumber(androidRaw.buildNumber, 0),
        apkUrl: String(androidRaw.apkUrl ?? '').trim(),
        notes: String(androidRaw.notes ?? '').trim(),
        minSupportedBuildNumber:
          androidRaw.minSupportedBuildNumber == null
            ? undefined
            : parseBuildNumber(androidRaw.minSupportedBuildNumber, 0),
      }
    : undefined

  const web = webRaw
    ? {
        versionName: String(webRaw.versionName ?? '0.0.0'),
        buildNumber: parseBuildNumber(webRaw.buildNumber, 0),
        notes: String(webRaw.notes ?? '').trim(),
      }
    : undefined

  return {
    version,
    publishedAt,
    android,
    web,
  }
}

async function getCurrentRuntimeBuildInfo(): Promise<RuntimeBuildInfo> {
  if (!isNativeCapacitorRuntime()) {
    return {
      target: 'web',
      versionName: getCompileTimeVersionName(),
      buildNumber: getCompileTimeBuildNumber(),
    }
  }

  try {
    const { App } = await import('@capacitor/app')
    const info = await App.getInfo()
    return {
      target: 'native',
      versionName: info.version || getCompileTimeVersionName(),
      buildNumber: parseBuildNumber(info.build, getCompileTimeBuildNumber()),
    }
  } catch {
    return {
      target: 'native',
      versionName: getCompileTimeVersionName(),
      buildNumber: getCompileTimeBuildNumber(),
    }
  }
}

export async function loadUpdateManifest(signal?: AbortSignal): Promise<UpdateManifest | null> {
  const manifestUrl = resolveUpdateManifestUrl()
  try {
    const response = await fetch(manifestUrl, {
      method: 'GET',
      cache: 'no-store',
      signal,
    })
    if (!response.ok) return null
    const raw = (await response.json().catch(() => null)) as unknown
    return parseManifest(raw)
  } catch {
    return null
  }
}

function buildAvailableUpdate(manifest: UpdateManifest, current: RuntimeBuildInfo): AvailableUpdate | null {
  if (current.target === 'native') {
    const android = manifest.android
    if (!android?.apkUrl || android.buildNumber <= current.buildNumber) return null

    const requiredMin = android.minSupportedBuildNumber ?? 0
    return {
      target: 'native',
      current,
      latestVersionName: android.versionName,
      latestBuildNumber: android.buildNumber,
      notes: android.notes || '',
      mandatory: current.buildNumber < requiredMin,
      actionLabel: 'Download update',
      actionUrl: android.apkUrl,
    }
  }

  const web = manifest.web
  if (!web || web.buildNumber <= current.buildNumber) return null
  return {
    target: 'web',
    current,
    latestVersionName: web.versionName,
    latestBuildNumber: web.buildNumber,
    notes: web.notes || '',
    mandatory: false,
    actionLabel: 'Reload app',
    actionUrl: null,
  }
}

export async function checkForAvailableUpdate(signal?: AbortSignal): Promise<UpdateCheckResult> {
  const [manifest, current] = await Promise.all([loadUpdateManifest(signal), getCurrentRuntimeBuildInfo()])
  if (!manifest) return { available: null, manifest: null }
  const available = buildAvailableUpdate(manifest, current)
  return { available, manifest }
}

export async function performUpdateAction(update: AvailableUpdate): Promise<void> {
  if (update.target === 'web') {
    window.location.reload()
    return
  }

  if (!update.actionUrl) return
  const opened = window.open(update.actionUrl, '_blank', 'noopener,noreferrer')
  if (!opened) {
    window.location.assign(update.actionUrl)
  }
}
