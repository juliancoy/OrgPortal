type ErrorPayload = {
  errcode?: string
  error?: string
  detail?: unknown
  retry_after_ms?: number
  status?: number
  statusCode?: number
  httpStatus?: number
}

function parseJsonSafe(value: string): unknown {
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

function extractPayload(value: unknown): ErrorPayload {
  if (!value || typeof value !== 'object') return {}
  const payload = value as ErrorPayload
  if (typeof payload.detail === 'string') {
    const detailJson = parseJsonSafe(payload.detail)
    if (detailJson && typeof detailJson === 'object') {
      return { ...payload, ...(detailJson as ErrorPayload) }
    }
  } else if (payload.detail && typeof payload.detail === 'object') {
    return { ...payload, ...(payload.detail as ErrorPayload) }
  }
  return payload
}

function retryAfterFromText(text: string): number {
  const match = text.match(/retry_after_ms["']?\s*[:=]\s*(\d+)/i)
  if (!match) return 0
  const value = Number(match[1] || 0)
  return Number.isFinite(value) ? value : 0
}

function matrixRateLimitText(retryAfterMs: number): string {
  if (retryAfterMs > 0) {
    const seconds = Math.max(1, Math.ceil(retryAfterMs / 1000))
    return `Chat is busy right now. Please retry in about ${seconds}s.`
  }
  return 'Chat is busy right now. Please try again shortly.'
}

export function toUserFacingErrorMessage(err: unknown, fallback: string): string {
  if (!err) return fallback

  const topLevel = extractPayload(err)
  const errMessage = typeof (err as { message?: unknown })?.message === 'string' ? String((err as { message: string }).message) : ''
  const parsedMessage = errMessage ? parseJsonSafe(errMessage) : null
  const merged = extractPayload({ ...topLevel, ...(parsedMessage && typeof parsedMessage === 'object' ? parsedMessage : {}) })

  const errcode = String(merged.errcode || '').trim()
  const status = Number(merged.httpStatus || merged.statusCode || merged.status || 0)
  const retryAfterMs = Number(merged.retry_after_ms || retryAfterFromText(errMessage) || 0)

  if (errcode === 'M_LIMIT_EXCEEDED' || status === 429 || /M_LIMIT_EXCEEDED/i.test(errMessage)) {
    return matrixRateLimitText(retryAfterMs)
  }

  const explicitDetail = merged.detail
  if (typeof explicitDetail === 'string' && explicitDetail.trim()) return explicitDetail.trim()
  if (typeof merged.error === 'string' && merged.error.trim()) return merged.error.trim()

  if (errMessage.trim()) {
    // Avoid surfacing raw JSON payloads directly in UI.
    if (errMessage.trim().startsWith('{') || errMessage.trim().startsWith('[')) return fallback
    return errMessage.trim()
  }

  return fallback
}
