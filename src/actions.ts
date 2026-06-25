// Action helpers: Locator-operating fill strategies + pure in-page functions (drop dispatch,
// evaluate shims) + console/network helpers. SPEC §5.3, §5.6, §5.7. Public API only.

import type { Locator } from 'playwright'
import { readFile } from 'node:fs/promises'
import { basename, extname } from 'node:path'
import type { ConsoleLevel, DropData, FillFormField } from './types.js'

export type FillStrategy = 'insert' | 'keystroke' | 'auto'

// ---- fill strategies (§5.3) ------------------------------------------------

export async function shouldUseKeystrokeFill(locator: Locator): Promise<boolean> {
  return locator
    .evaluate((element) => {
      if (!(element instanceof HTMLInputElement)) return false
      const type = element.type.toLowerCase()
      if (type === 'password') return true
      if (element.inputMode === 'numeric' || element.inputMode === 'decimal' || element.inputMode === 'tel') {
        return true
      }
      const autocomplete = element.autocomplete.toLowerCase()
      return autocomplete.startsWith('cc-') || autocomplete === 'one-time-code'
    })
    .catch(() => false)
}

export async function fillWithKeystrokes(locator: Locator, value: string, clear: boolean): Promise<void> {
  await locator.click()
  if (clear) {
    await locator.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A')
    await locator.press('Backspace')
  }
  await locator.pressSequentially(value)
}

// ---- fill-form (§5.3) ------------------------------------------------------

export async function applyFillFormField(locator: Locator, field: FillFormField): Promise<void> {
  switch (field.type) {
    case 'textbox':
      await locator.fill(String(field.value))
      return
    case 'checkbox':
    case 'radio':
      await locator.setChecked(booleanFillFormValue(field.value))
      return
    case 'combobox':
      await locator.selectOption(String(field.value))
      return
    case 'slider':
      await locator.fill(String(field.value))
      await locator.dispatchEvent('input')
      await locator.dispatchEvent('change')
      return
  }
}

function booleanFillFormValue(value: string | boolean | number): boolean {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  const normalized = value.trim().toLowerCase()
  if (['1', 'true', 'yes', 'on', 'checked'].includes(normalized)) return true
  if (['0', 'false', 'no', 'off', 'unchecked'].includes(normalized)) return false
  throw new Error('checkbox/radio values must be boolean-like')
}

// ---- drop (§5.3) -----------------------------------------------------------

export interface DropFilePayload {
  name: string
  type: string
  base64: string
}

export async function filePayloadFromPath(path: string): Promise<DropFilePayload> {
  const buffer = await readFile(path)
  return { name: basename(path), type: mimeTypeForPath(path), base64: buffer.toString('base64') }
}

function mimeTypeForPath(path: string): string {
  switch (extname(path).toLowerCase()) {
    case '.css':
      return 'text/css'
    case '.csv':
      return 'text/csv'
    case '.gif':
      return 'image/gif'
    case '.htm':
    case '.html':
      return 'text/html'
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg'
    case '.js':
    case '.mjs':
      return 'text/javascript'
    case '.json':
      return 'application/json'
    case '.pdf':
      return 'application/pdf'
    case '.png':
      return 'image/png'
    case '.svg':
      return 'image/svg+xml'
    case '.txt':
      return 'text/plain'
    case '.webp':
      return 'image/webp'
    default:
      return 'application/octet-stream'
  }
}

/** In-page synthetic HTML5 drop (no public equivalent). Serialized by Playwright. */
export function dispatchDropInBrowser(el: Element, payload: { data: DropData; files: DropFilePayload[] }): void {
  const base64ToArrayBuffer = (base64: string): ArrayBuffer => {
    const binary = atob(base64)
    const bytes = new Uint8Array(binary.length)
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
    return bytes.buffer
  }
  const dataTransfer = new DataTransfer()
  for (const [type, value] of Object.entries(payload.data)) dataTransfer.setData(type, value)
  for (const file of payload.files) {
    dataTransfer.items.add(new File([base64ToArrayBuffer(file.base64)], file.name, { type: file.type }))
  }
  const options = { bubbles: true, cancelable: true, dataTransfer }
  el.dispatchEvent(new DragEvent('dragenter', options))
  el.dispatchEvent(new DragEvent('dragover', options))
  el.dispatchEvent(new DragEvent('drop', options))
}

// ---- evaluate shims (§5.7) -------------------------------------------------

export function evaluatePageInBrowser(payload: { source: string; arg: unknown }): unknown {
  const source = payload.source.trim()
  try {
    const candidate = new Function(`return (${source})`)()
    if (typeof candidate === 'function') return candidate(payload.arg)
  } catch {
    /* fall back to expression mode */
  }
  return new Function('arg', `return (${payload.source})`)(payload.arg)
}

export function evaluateTargetInBrowser(el: Element, payload: { source: string; arg: unknown }): unknown {
  const source = payload.source.trim()
  try {
    const candidate = new Function(`return (${source})`)()
    if (typeof candidate === 'function') return candidate(el, payload.arg)
  } catch {
    /* fall back to expression mode */
  }
  return new Function('el', 'arg', `return (${payload.source})`)(el, payload.arg)
}

export function compileRunCodeUnsafeFunction(source: string): (...args: unknown[]) => unknown {
  let candidate: unknown
  try {
    candidate = new Function(`return (${source});`)()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`run-code-unsafe code must be a JavaScript function: ${message}`)
  }
  if (typeof candidate !== 'function') {
    throw new Error('run-code-unsafe code must evaluate to a function.')
  }
  return candidate as (...args: unknown[]) => unknown
}

export function toJsonCompatible(value: unknown): unknown {
  const seen = new WeakSet<object>()
  const serialized = JSON.stringify(value, (_key, nested) => {
    if (typeof nested === 'bigint') return nested.toString()
    if (typeof nested === 'function') return `[Function ${nested.name || 'anonymous'}]`
    if (typeof nested === 'symbol') return String(nested)
    if (nested && typeof nested === 'object') {
      if (seen.has(nested)) return '[Circular]'
      seen.add(nested)
    }
    return nested
  })
  if (serialized === undefined) return String(value)
  return JSON.parse(serialized)
}

// ---- console helpers (§5.6) ------------------------------------------------

export function normalizeConsoleLevel(type: string): ConsoleLevel {
  if (type === 'debug') return 'debug'
  if (type === 'warning') return 'warning'
  if (type === 'error' || type === 'assert') return 'error'
  return 'info'
}

export function severityForConsoleLevel(level: ConsoleLevel): number {
  switch (level) {
    case 'debug':
      return 10
    case 'info':
      return 20
    case 'warning':
      return 30
    case 'error':
      return 40
  }
}

export const STATIC_RESOURCE_TYPES = new Set(['font', 'image', 'media', 'script', 'stylesheet'])
