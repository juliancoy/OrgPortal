export function isNativeCapacitorRuntime(): boolean {
  if (typeof window === 'undefined') return false
  const maybeCapacitor = (window as Window & { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor
  return Boolean(maybeCapacitor?.isNativePlatform?.())
}

export function getNativeAuthCallbackUrl(): string {
  const env = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env
  const configured = env?.VITE_NATIVE_AUTH_CALLBACK_URL?.trim()
  if (configured) return configured
  return 'org.arkavo.portal://auth/callback'
}

