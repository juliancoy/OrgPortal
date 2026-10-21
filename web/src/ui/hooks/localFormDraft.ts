export const FORM_DRAFT_TTL = 30 * 86400000
export function formDraftKey(accountId: string | null | undefined, scope: string) {
  return accountId ? `orgportal.form-draft.v1:${encodeURIComponent(accountId)}:${scope}` : null
}
export function readFormDraft<T>(storage: Pick<Storage, 'getItem' | 'removeItem'>, key: string, initial: T, now = Date.now()): T {
  try {
    const raw = storage.getItem(key)
    if (!raw) return initial
    const entry = JSON.parse(raw)
    if (entry.version !== 1 || !Number.isFinite(entry.savedAt) || entry.savedAt + FORM_DRAFT_TTL <= now
      || !entry.value || typeof entry.value !== 'object' || Array.isArray(entry.value)) {
      storage.removeItem(key); return initial
    }
    // Copy only known fields with the expected primitive types; never restore receipts or tokens.
    const result = { ...initial }
    for (const field of Object.keys(initial as object)) {
      const name = field as keyof T
      if (typeof entry.value[field] === typeof initial[name]) result[name] = entry.value[field]
    }
    return result
  } catch {
    try { storage.removeItem(key) } catch { /* Storage may be unavailable. */ }
    return initial
  }
}
export function writeFormDraft<T>(storage: Pick<Storage, 'setItem' | 'getItem'>, key: string, value: T, now = Date.now()): boolean {
  try {
    const raw = JSON.stringify({ version: 1, savedAt: now, value })
    storage.setItem(key, raw)
    return storage.getItem(key) === raw
  } catch { return false }
}
