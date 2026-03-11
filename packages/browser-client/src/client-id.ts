const CLIENT_ID_STORAGE_PREFIX = '__webcli_browser_client_id__'

function createClientId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `wcli_${Math.random().toString(36).slice(2)}`
}

export function getOrCreateClientId(appId: string): string {
  const key = `${CLIENT_ID_STORAGE_PREFIX}:${appId}`
  try {
    const existing = window.sessionStorage?.getItem(key)
    if (existing && existing.trim()) {
      return existing.trim()
    }
  } catch {
    // ignore sessionStorage access errors
  }

  const generated = createClientId()
  try {
    window.sessionStorage?.setItem(key, generated)
  } catch {
    // ignore sessionStorage access errors
  }
  return generated
}
