import { getBooleanFlag, getDaemonEndpoint, getStringFlag, parseArgs } from './args.js'
import { startDaemon } from './daemon.js'
import { asCliError } from './errors.js'
import { requestJson } from './http-client.js'
import { formatSnapshot } from '@agrune/backend'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { WebSocket } from 'ws'
import type {
  AriaSnapshotResponse,
  CliIo,
  CloseTabResponse,
  ConsoleMessagesResponse,
  DaemonHealth,
  DialogHandleResponse,
  DialogsResponse,
  EvaluateResponse,
  EventsResponse,
  FileChoosersResponse,
  FileUploadResponse,
  NavigationResponse,
  NetworkRequestDetailResponse,
  NetworkRequestPartResponse,
  NetworkRequestsResponse,
  OpenTabResponse,
  ReadResponse,
  ResizeResponse,
  RunCodeUnsafeResponse,
  ScreenshotResponse,
  SnapshotResponse,
  TabsResponse,
} from './types.js'

export async function runCli(argv: string[], io: CliIo): Promise<number> {
  try {
    return await runCliOrThrow(argv, io)
  } catch (error) {
    const err = asCliError(error)
    write(io.stderr, `${err.code}: ${err.message}\n`)
    return exitCodeFor(err.code)
  }
}

async function runCliOrThrow(argv: string[], io: CliIo): Promise<number> {
  const parsed = parseArgs(argv)
  if (parsed.command.length === 0 || getBooleanFlag(parsed.flags, 'help')) {
    write(io.stdout, helpText())
    return 0
  }

  const [primary, secondary] = parsed.command
  if (primary === 'daemon' && secondary === 'start') {
    return runDaemonStart(parsed.flags, io)
  }
  if (primary === 'daemon' && secondary === 'status') {
    return runDaemonStatus(parsed.flags, io)
  }
  if (primary === 'daemon' && secondary === 'events') {
    return runEvents(parsed.flags, io)
  }
  if (primary === 'open') {
    return runOpen(parsed.flags, parsed.positionals, io)
  }
  if (primary === 'navigate' || primary === 'goto') {
    return runNavigate(parsed.flags, parsed.positionals, io)
  }
  if (primary === 'back') {
    return runPageNavigation('back', parsed.flags, io)
  }
  if (primary === 'forward') {
    return runPageNavigation('forward', parsed.flags, io)
  }
  if (primary === 'reload') {
    return runPageNavigation('reload', parsed.flags, io)
  }
  if (primary === 'resize') {
    return runResize(parsed.flags, parsed.positionals, io)
  }
  if (primary === 'evaluate' || primary === 'eval') {
    return runEvaluate(parsed.flags, parsed.positionals, io)
  }
  if (primary === 'run-code-unsafe' || primary === 'run-code') {
    return runCodeUnsafe(parsed.flags, parsed.positionals, io)
  }
  if (primary === 'console' || primary === 'console-messages') {
    return runConsole(parsed.flags, io)
  }
  if ((primary === 'network' && secondary === undefined) || primary === 'network-requests') {
    return runNetwork(parsed.flags, io)
  }
  if ((primary === 'network' && secondary === 'request') || primary === 'network-request') {
    return runNetworkRequest(parsed.flags, parsed.positionals, io)
  }
  if (primary === 'dialogs') {
    return runDialogs(parsed.flags, io)
  }
  if (primary === 'file-choosers' || primary === 'filechoosers') {
    return runFileChoosers(parsed.flags, io)
  }
  if (primary === 'handle-dialog' || primary === 'dialog') {
    return runHandleDialog(secondary, parsed.flags, io)
  }
  if (primary === 'file-upload') {
    return runFileUpload(parsed.flags, parsed.positionals, io)
  }
  if ((primary === 'tabs' && (secondary === undefined || secondary === 'list')) || (primary === 'tab' && secondary === 'list')) {
    return runTabs(parsed.flags, io)
  }
  if ((primary === 'tab' || primary === 'tabs') && secondary === 'new') {
    return runTabNew(parsed.flags, parsed.positionals, io)
  }
  if ((primary === 'tab' || primary === 'tabs') && (secondary === 'focus' || secondary === 'select')) {
    return runTabFocus(parsed.flags, parsed.positionals, io)
  }
  if (((primary === 'tab' || primary === 'tabs') && secondary === 'close') || primary === 'close') {
    return runTabClose(parsed.flags, parsed.positionals, io)
  }
  if (primary === 'events') {
    return runEvents(parsed.flags, io)
  }
  if (primary === 'targets') {
    return runTargets(parsed.flags, io)
  }
  if (primary === 'snapshot' || primary === 'aria-snapshot') {
    return runAriaSnapshot(parsed.flags, io)
  }
  if (primary === 'click') {
    return runAction('click', parsed.flags, parsed.positionals, io)
  }
  if (primary === 'dblclick' || primary === 'double-click') {
    return runAction('dblclick', parsed.flags, parsed.positionals, io)
  }
  if (primary === 'right-click') {
    return runAction('contextmenu', parsed.flags, parsed.positionals, io)
  }
  if (primary === 'hover') {
    return runAction('hover', parsed.flags, parsed.positionals, io)
  }
  if (primary === 'fill') {
    return runFill(parsed.flags, parsed.positionals, io)
  }
  if (primary === 'fill-form' || primary === 'fill_form') {
    return runFillForm(parsed.flags, io)
  }
  if (primary === 'type') {
    return runType(parsed.flags, parsed.positionals, io)
  }
  if (primary === 'press' || primary === 'press-key') {
    return runPress(parsed.flags, parsed.positionals, io)
  }
  if (primary === 'select' || primary === 'select-option') {
    return runSelect(parsed.flags, parsed.positionals, io)
  }
  if (primary === 'upload') {
    return runUpload(parsed.flags, parsed.positionals, io)
  }
  if (primary === 'drop') {
    return runDrop(parsed.flags, parsed.positionals, io)
  }
  if (primary === 'drag') {
    return runDrag(parsed.flags, parsed.positionals, io)
  }
  if (primary === 'read') {
    return runRead(parsed.flags, io)
  }
  if (primary === 'wait') {
    return runWait(parsed.flags, parsed.positionals, io)
  }
  if (primary === 'screenshot') {
    return runScreenshot(parsed.flags, io)
  }

  write(io.stderr, `Unknown command: ${parsed.command.join(' ')}\n`)
  return 1
}

async function runDaemonStart(
  flags: Record<string, string | boolean>,
  io: CliIo,
): Promise<number> {
  const { host, port } = getDaemonEndpoint(flags)
  const daemon = await startDaemon({
    host,
    port,
    headless: getBooleanFlag(flags, 'headless'),
  })
  write(io.stdout, `Agrune daemon listening on ${daemon.url}\n`)

  await new Promise<void>((resolve) => {
    const stop = () => {
      void daemon.close().finally(resolve)
    }
    process.once('SIGINT', stop)
    process.once('SIGTERM', stop)
  })
  return 0
}

async function runDaemonStatus(
  flags: Record<string, string | boolean>,
  io: CliIo,
): Promise<number> {
  const { baseUrl } = getDaemonEndpoint(flags)
  const health = await requestJson<DaemonHealth>(baseUrl, '/health')
  writeResult(io.stdout, health, flags)
  return 0
}

async function runOpen(
  flags: Record<string, string | boolean>,
  positionals: string[],
  io: CliIo,
): Promise<number> {
  const url = positionals[0]
  if (!url) throw new Error('Usage: agrune open <url>')
  const { baseUrl } = getDaemonEndpoint(flags)
  const opened = await requestJson<OpenTabResponse>(baseUrl, '/open', {
    method: 'POST',
    body: JSON.stringify({ url }),
  })
  writeResult(io.stdout, opened, flags)
  return 0
}

async function runTabNew(
  flags: Record<string, string | boolean>,
  positionals: string[],
  io: CliIo,
): Promise<number> {
  const url = positionals[0]
  if (!url) throw new Error('Usage: agrune tabs new <url>')
  const { baseUrl } = getDaemonEndpoint(flags)
  const opened = await requestJson<OpenTabResponse>(baseUrl, '/tabs/new', {
    method: 'POST',
    body: JSON.stringify({ url }),
  })
  writeResult(io.stdout, opened, flags)
  return 0
}

async function runNavigate(
  flags: Record<string, string | boolean>,
  positionals: string[],
  io: CliIo,
): Promise<number> {
  const url = positionals[0]
  if (!url) throw new Error('Usage: agrune navigate <url>')
  const { baseUrl } = getDaemonEndpoint(flags)
  const navigated = await requestJson<NavigationResponse>(baseUrl, '/navigate', {
    method: 'POST',
    body: JSON.stringify({
      url,
      tabId: optionalNumberFlag(flags, 'tab'),
    }),
  })
  writeResult(io.stdout, navigated, flags)
  return 0
}

async function runPageNavigation(
  action: 'back' | 'forward' | 'reload',
  flags: Record<string, string | boolean>,
  io: CliIo,
): Promise<number> {
  const { baseUrl } = getDaemonEndpoint(flags)
  const response = await requestJson<NavigationResponse>(baseUrl, `/${action}`, {
    method: 'POST',
    body: JSON.stringify({
      tabId: optionalNumberFlag(flags, 'tab'),
    }),
  })
  writeResult(io.stdout, response, flags)
  return 0
}

async function runResize(
  flags: Record<string, string | boolean>,
  positionals: string[],
  io: CliIo,
): Promise<number> {
  const width = positiveIntegerArg(positionals[0] ?? getStringFlag(flags, 'width'), 'width')
  const height = positiveIntegerArg(positionals[1] ?? getStringFlag(flags, 'height'), 'height')
  const { baseUrl } = getDaemonEndpoint(flags)
  const response = await requestJson<ResizeResponse>(baseUrl, '/resize', {
    method: 'POST',
    body: JSON.stringify({
      width,
      height,
      tabId: optionalNumberFlag(flags, 'tab'),
    }),
  })
  writeResult(io.stdout, response, flags)
  return 0
}

async function runEvaluate(
  flags: Record<string, string | boolean>,
  positionals: string[],
  io: CliIo,
): Promise<number> {
  const source = getStringFlag(flags, 'expression') ?? getStringFlag(flags, 'function') ?? positionals.join(' ')
  if (source.trim().length === 0) {
    throw new Error('Usage: agrune evaluate <js> [--target <target-ref>] [--arg json]')
  }
  const { baseUrl } = getDaemonEndpoint(flags)
  const filename = outputFilenameFromFlags(flags)
  const response = await requestJson<EvaluateResponse>(baseUrl, '/evaluate', {
    method: 'POST',
    body: JSON.stringify({
      source,
      arg: jsonArgFromFlags(flags),
      target: getStringFlag(flags, 'target'),
      ...(filename ? { filename } : {}),
      tabId: optionalNumberFlag(flags, 'tab'),
    }),
  })
  writeResult(io.stdout, response, flags)
  return 0
}

async function runCodeUnsafe(
  flags: Record<string, string | boolean>,
  positionals: string[],
  io: CliIo,
): Promise<number> {
  const filename = getStringFlag(flags, 'file') ?? getStringFlag(flags, 'filename')
  const code = filename ? undefined : (getStringFlag(flags, 'code') ?? positionals.join(' '))
  if (!filename && (!code || code.trim().length === 0)) {
    throw new Error('Usage: agrune run-code-unsafe <js>|--code <js>|--file <path>')
  }

  const { baseUrl } = getDaemonEndpoint(flags)
  const response = await requestJson<RunCodeUnsafeResponse>(baseUrl, '/run-code-unsafe', {
    method: 'POST',
    body: JSON.stringify({
      ...(filename ? { filename } : { code }),
      tabId: optionalNumberFlag(flags, 'tab'),
    }),
  })
  writeResult(io.stdout, response, flags)
  return 0
}

async function runConsole(
  flags: Record<string, string | boolean>,
  io: CliIo,
): Promise<number> {
  const { baseUrl } = getDaemonEndpoint(flags)
  const params = new URLSearchParams()
  const tabId = optionalNumberFlag(flags, 'tab')
  if (typeof tabId === 'number') params.set('tabId', String(tabId))
  const level = getStringFlag(flags, 'level')
  if (level) params.set('level', level)
  if (getBooleanFlag(flags, 'all')) params.set('all', 'true')
  const filename = outputFilenameFromFlags(flags)
  if (filename) params.set('filename', filename)
  const response = await requestJson<ConsoleMessagesResponse>(
    baseUrl,
    `/console${params.size > 0 ? `?${params.toString()}` : ''}`,
  )
  if (getBooleanFlag(flags, 'json')) {
    writeJson(io.stdout, response)
  } else if (response.path) {
    write(io.stdout, `${response.path}\n`)
  } else {
    for (const message of response.messages) {
      write(io.stdout, `${formatConsoleLine(message)}\n`)
    }
  }
  return 0
}

async function runNetwork(
  flags: Record<string, string | boolean>,
  io: CliIo,
): Promise<number> {
  const { baseUrl } = getDaemonEndpoint(flags)
  const params = new URLSearchParams()
  appendCommonNetworkParams(params, flags)
  const filename = outputFilenameFromFlags(flags)
  if (filename) params.set('filename', filename)
  const response = await requestJson<NetworkRequestsResponse>(
    baseUrl,
    `/network${params.size > 0 ? `?${params.toString()}` : ''}`,
  )
  if (getBooleanFlag(flags, 'json')) {
    writeJson(io.stdout, response)
  } else if (response.path) {
    write(io.stdout, `${response.path}\n`)
  } else {
    for (const request of response.requests) {
      write(io.stdout, `${formatNetworkLine(request)}\n`)
    }
  }
  return 0
}

async function runNetworkRequest(
  flags: Record<string, string | boolean>,
  positionals: string[],
  io: CliIo,
): Promise<number> {
  const index = positiveIntegerArg(positionals[0] ?? getStringFlag(flags, 'index'), 'index')
  const { baseUrl } = getDaemonEndpoint(flags)
  const params = new URLSearchParams()
  const tabId = optionalNumberFlag(flags, 'tab')
  if (typeof tabId === 'number') params.set('tabId', String(tabId))
  params.set('index', String(index))
  const part = getStringFlag(flags, 'part')
  if (part) params.set('part', part)
  const filename = outputFilenameFromFlags(flags)
  if (filename) params.set('filename', filename)
  const response = await requestJson<NetworkRequestDetailResponse | NetworkRequestPartResponse>(
    baseUrl,
    `/network/request?${params.toString()}`,
  )
  writeResult(io.stdout, response, flags)
  return 0
}

async function runDialogs(
  flags: Record<string, string | boolean>,
  io: CliIo,
): Promise<number> {
  const { baseUrl } = getDaemonEndpoint(flags)
  const params = new URLSearchParams()
  const tabId = optionalNumberFlag(flags, 'tab')
  if (typeof tabId === 'number') params.set('tabId', String(tabId))
  const response = await requestJson<DialogsResponse>(
    baseUrl,
    `/dialogs${params.size > 0 ? `?${params.toString()}` : ''}`,
  )
  if (getBooleanFlag(flags, 'json')) {
    writeJson(io.stdout, response)
  } else {
    for (const dialog of response.dialogs) {
      write(io.stdout, `${formatDialogLine(dialog)}\n`)
    }
  }
  return 0
}

async function runHandleDialog(
  subcommand: string | undefined,
  flags: Record<string, string | boolean>,
  io: CliIo,
): Promise<number> {
  const accept = dialogAcceptValue(subcommand, flags)
  const { baseUrl } = getDaemonEndpoint(flags)
  const response = await requestJson<DialogHandleResponse>(baseUrl, '/dialog/handle', {
    method: 'POST',
    body: JSON.stringify({
      accept,
      promptText: getStringFlag(flags, 'prompt-text') ?? getStringFlag(flags, 'promptText'),
      tabId: optionalNumberFlag(flags, 'tab'),
    }),
  })
  writeResult(io.stdout, response, flags)
  return 0
}

async function runFileChoosers(
  flags: Record<string, string | boolean>,
  io: CliIo,
): Promise<number> {
  const { baseUrl } = getDaemonEndpoint(flags)
  const params = new URLSearchParams()
  const tabId = optionalNumberFlag(flags, 'tab')
  if (typeof tabId === 'number') params.set('tabId', String(tabId))
  const response = await requestJson<FileChoosersResponse>(
    baseUrl,
    `/file-choosers${params.size > 0 ? `?${params.toString()}` : ''}`,
  )
  if (getBooleanFlag(flags, 'json')) {
    writeJson(io.stdout, response)
  } else {
    for (const fileChooser of response.fileChoosers) {
      write(io.stdout, `${formatFileChooserLine(fileChooser)}\n`)
    }
  }
  return 0
}

async function runFileUpload(
  flags: Record<string, string | boolean>,
  positionals: string[],
  io: CliIo,
): Promise<number> {
  const { baseUrl } = getDaemonEndpoint(flags)
  const response = await requestJson<FileUploadResponse>(baseUrl, '/file-upload', {
    method: 'POST',
    body: JSON.stringify({
      paths: positionals,
      tabId: optionalNumberFlag(flags, 'tab'),
    }),
  })
  writeResult(io.stdout, response, flags)
  return 0
}

async function runTabs(
  flags: Record<string, string | boolean>,
  io: CliIo,
): Promise<number> {
  const { baseUrl } = getDaemonEndpoint(flags)
  const tabs = await requestJson<TabsResponse>(baseUrl, '/tabs')
  writeResult(io.stdout, tabs, flags)
  return 0
}

async function runTabFocus(
  flags: Record<string, string | boolean>,
  positionals: string[],
  io: CliIo,
): Promise<number> {
  const selector = tabSelectorBody(flags, positionals, true)
  const { baseUrl } = getDaemonEndpoint(flags)
  const focused = await requestJson<OpenTabResponse>(baseUrl, '/tabs/select', {
    method: 'POST',
    body: JSON.stringify(selector),
  })
  writeResult(io.stdout, focused, flags)
  return 0
}

async function runTabClose(
  flags: Record<string, string | boolean>,
  positionals: string[],
  io: CliIo,
): Promise<number> {
  const selector = tabSelectorBody(flags, positionals, false)
  const { baseUrl } = getDaemonEndpoint(flags)
  const closed = await requestJson<CloseTabResponse>(baseUrl, '/close', {
    method: 'POST',
    body: JSON.stringify(selector),
  })
  writeResult(io.stdout, closed, flags)
  return 0
}

async function runEvents(
  flags: Record<string, string | boolean>,
  io: CliIo,
): Promise<number> {
  const { baseUrl } = getDaemonEndpoint(flags)
  if (getBooleanFlag(flags, 'follow')) {
    await followEvents(baseUrl, io, {
      replay: !getBooleanFlag(flags, 'no-replay'),
    })
    return 0
  }

  const events = await requestJson<EventsResponse>(baseUrl, '/events/history')
  if (getBooleanFlag(flags, 'json')) {
    writeJson(io.stdout, events)
  } else {
    for (const event of events.events) {
      write(io.stdout, `${formatEventLine(event)}\n`)
    }
  }
  return 0
}

async function runTargets(
  flags: Record<string, string | boolean>,
  io: CliIo,
): Promise<number> {
  const { baseUrl } = getDaemonEndpoint(flags)
  const params = new URLSearchParams()
  const tabId = optionalNumberFlag(flags, 'tab')
  const groupId = optionalStringFlag(flags, 'group')
  const groupIds = groupIdsFromFlags(flags)
  const targetRef = optionalStringFlag(flags, 'target')
  if (typeof tabId === 'number') params.set('tabId', String(tabId))
  if (groupId) params.set('groupId', groupId)
  for (const id of groupIds ?? []) params.append('groupIds', id)
  if (targetRef) params.set('target', targetRef)
  const response = await requestJson<SnapshotResponse>(
    baseUrl,
    `/targets${params.size > 0 ? `?${params.toString()}` : ''}`,
  )
  const snapshotText = formatSnapshot(response.snapshot, {
    full: getBooleanFlag(flags, 'full') || optionalTargetsModeFlag(flags) === 'full',
    groupId,
    groupIds,
    targetRef,
    includeTextContent: snapshotIncludeTextContentFlag(flags),
  })
  const filename = outputFilenameFromFlags(flags)
  const path = filename ? await writeTextOutputFile(filename, snapshotText) : undefined
  if (getBooleanFlag(flags, 'json')) {
    writeJson(io.stdout, path ? { ...response, path } : response)
  } else if (path) {
    write(io.stdout, `${path}\n`)
  } else {
    write(io.stdout, `${snapshotText}\n`)
  }
  return 0
}

async function runAriaSnapshot(
  flags: Record<string, string | boolean>,
  io: CliIo,
): Promise<number> {
  const { baseUrl } = getDaemonEndpoint(flags)
  const params = new URLSearchParams()
  const tabId = optionalNumberFlag(flags, 'tab')
  if (typeof tabId === 'number') params.set('tabId', String(tabId))
  const target = optionalStringFlag(flags, 'target')
  if (target) params.set('target', target)
  const depth = optionalNumberFlag(flags, 'depth')
  if (typeof depth === 'number') {
    if (!Number.isInteger(depth) || depth <= 0) {
      throw new Error('depth must be a positive integer')
    }
    params.set('depth', String(depth))
  }
  const mode = optionalAriaSnapshotModeFlag(flags)
  if (mode) params.set('mode', mode)
  const filename = outputFilenameFromFlags(flags)
  if (filename) params.set('filename', filename)
  if (getBooleanFlag(flags, 'boxes')) params.set('boxes', 'true')
  if (snapshotIncludeTextContentFlag(flags)) params.set('includeTextContent', 'true')
  const response = await requestJson<AriaSnapshotResponse>(
    baseUrl,
    `/snapshot${params.size > 0 ? `?${params.toString()}` : ''}`,
  )
  if (getBooleanFlag(flags, 'json')) {
    writeJson(io.stdout, response)
  } else if (response.path) {
    write(io.stdout, `${response.path}\n`)
  } else {
    write(io.stdout, `${response.text}\n`)
  }
  return 0
}

async function runAction(
  action: string,
  flags: Record<string, string | boolean>,
  positionals: string[],
  io: CliIo,
): Promise<number> {
  const target = positionals[0]
  if (!target) throw new Error(`Usage: agrune ${action} <target-ref>`)
  const { baseUrl } = getDaemonEndpoint(flags)
  const response = await requestJson<unknown>(baseUrl, '/click', {
    method: 'POST',
    body: JSON.stringify({
      target,
      action,
      button: clickButtonFromFlags(flags, action),
      modifiers: clickModifiersFromFlags(flags),
      doubleClick: getBooleanFlag(flags, 'double-click') || getBooleanFlag(flags, 'doubleClick'),
      tabId: optionalNumberFlag(flags, 'tab'),
    }),
  })
  writeResult(io.stdout, response, flags)
  return 0
}

async function runFill(
  flags: Record<string, string | boolean>,
  positionals: string[],
  io: CliIo,
): Promise<number> {
  const [target, ...valueParts] = positionals
  const value = valueParts.join(' ')
  if (!target || value.length === 0) throw new Error('Usage: agrune fill <target-ref> <value>')
  const { baseUrl } = getDaemonEndpoint(flags)
  const response = await requestJson<unknown>(baseUrl, '/fill', {
    method: 'POST',
    body: JSON.stringify({
      target,
      value,
      clear: !getBooleanFlag(flags, 'append'),
      strategy: optionalFillStrategyFlag(flags),
      tabId: optionalNumberFlag(flags, 'tab'),
    }),
  })
  writeResult(io.stdout, response, flags)
  return 0
}

async function runFillForm(
  flags: Record<string, string | boolean>,
  io: CliIo,
): Promise<number> {
  const fields = await fillFormFieldsFromFlags(flags)
  const { baseUrl } = getDaemonEndpoint(flags)
  const response = await requestJson<unknown>(baseUrl, '/fill-form', {
    method: 'POST',
    body: JSON.stringify({
      fields,
      tabId: optionalNumberFlag(flags, 'tab'),
    }),
  })
  writeResult(io.stdout, response, flags)
  return 0
}

async function runType(
  flags: Record<string, string | boolean>,
  positionals: string[],
  io: CliIo,
): Promise<number> {
  const [target, ...textParts] = positionals
  const text = textParts.join(' ')
  if (!target || text.length === 0) throw new Error('Usage: agrune type <target-ref> <text>')
  const { baseUrl } = getDaemonEndpoint(flags)
  const response = await requestJson<unknown>(baseUrl, '/type', {
    method: 'POST',
    body: JSON.stringify({
      target,
      text,
      submit: getBooleanFlag(flags, 'submit'),
      delayMs: optionalNumberFlag(flags, 'delay'),
      tabId: optionalNumberFlag(flags, 'tab'),
    }),
  })
  writeResult(io.stdout, response, flags)
  return 0
}

async function runPress(
  flags: Record<string, string | boolean>,
  positionals: string[],
  io: CliIo,
): Promise<number> {
  const explicitTarget = getStringFlag(flags, 'target')
  const target = explicitTarget ?? (positionals.length >= 2 ? positionals[0] : undefined)
  const key = getStringFlag(flags, 'key') ?? (positionals.length >= 2 ? positionals[1] : positionals[0])
  if (!key) throw new Error('Usage: agrune press [target-ref] <key>')
  const { baseUrl } = getDaemonEndpoint(flags)
  const response = await requestJson<unknown>(baseUrl, '/press', {
    method: 'POST',
    body: JSON.stringify({
      key,
      ...(target ? { target } : {}),
      delayMs: optionalNumberFlag(flags, 'delay'),
      tabId: optionalNumberFlag(flags, 'tab'),
    }),
  })
  writeResult(io.stdout, response, flags)
  return 0
}

async function runSelect(
  flags: Record<string, string | boolean>,
  positionals: string[],
  io: CliIo,
): Promise<number> {
  const [target, ...values] = positionals
  if (!target || values.length === 0) throw new Error('Usage: agrune select <target-ref> <value...>')
  const { baseUrl } = getDaemonEndpoint(flags)
  const response = await requestJson<unknown>(baseUrl, '/select', {
    method: 'POST',
    body: JSON.stringify({
      target,
      values,
      mode: selectModeFromFlags(flags),
      tabId: optionalNumberFlag(flags, 'tab'),
    }),
  })
  writeResult(io.stdout, response, flags)
  return 0
}

async function runUpload(
  flags: Record<string, string | boolean>,
  positionals: string[],
  io: CliIo,
): Promise<number> {
  const [target, ...paths] = positionals
  if (!target || paths.length === 0) throw new Error('Usage: agrune upload <target-ref> <path...>')
  const { baseUrl } = getDaemonEndpoint(flags)
  const response = await requestJson<unknown>(baseUrl, '/upload', {
    method: 'POST',
    body: JSON.stringify({
      target,
      paths,
      tabId: optionalNumberFlag(flags, 'tab'),
    }),
  })
  writeResult(io.stdout, response, flags)
  return 0
}

async function runDrop(
  flags: Record<string, string | boolean>,
  positionals: string[],
  io: CliIo,
): Promise<number> {
  const [target, ...paths] = positionals
  const data = dropDataFromFlags(flags)
  if (!target || (paths.length === 0 && Object.keys(data).length === 0)) {
    throw new Error('Usage: agrune drop <target-ref> [path...] [--data json|--text value]')
  }
  const { baseUrl } = getDaemonEndpoint(flags)
  const response = await requestJson<unknown>(baseUrl, '/drop', {
    method: 'POST',
    body: JSON.stringify({
      target,
      paths,
      data,
      tabId: optionalNumberFlag(flags, 'tab'),
    }),
  })
  writeResult(io.stdout, response, flags)
  return 0
}

async function runDrag(
  flags: Record<string, string | boolean>,
  positionals: string[],
  io: CliIo,
): Promise<number> {
  const startTarget = positionals[0]
  const endTarget = getStringFlag(flags, 'to') ?? positionals[1]
  if (!startTarget || !endTarget) throw new Error('Usage: agrune drag <start-ref> --to <end-ref>')
  const { baseUrl } = getDaemonEndpoint(flags)
  const response = await requestJson<unknown>(baseUrl, '/drag', {
    method: 'POST',
    body: JSON.stringify({
      startTarget,
      endTarget,
      tabId: optionalNumberFlag(flags, 'tab'),
    }),
  })
  writeResult(io.stdout, response, flags)
  return 0
}

async function runRead(
  flags: Record<string, string | boolean>,
  io: CliIo,
): Promise<number> {
  const { baseUrl } = getDaemonEndpoint(flags)
  const params = new URLSearchParams()
  const tabId = optionalNumberFlag(flags, 'tab')
  if (typeof tabId === 'number') params.set('tabId', String(tabId))
  const response = await requestJson<ReadResponse>(
    baseUrl,
    `/read${params.size > 0 ? `?${params.toString()}` : ''}`,
  )
  if (getBooleanFlag(flags, 'json')) {
    writeJson(io.stdout, response)
  } else {
    write(io.stdout, `${response.text}\n`)
  }
  return 0
}

async function runWait(
  flags: Record<string, string | boolean>,
  positionals: string[],
  io: CliIo,
): Promise<number> {
  const target = positionals[0]
  const text = getStringFlag(flags, 'text')
  const textGone = getStringFlag(flags, 'text-gone') ?? getStringFlag(flags, 'textGone')
  const timeMs = waitTimeMsFromFlags(flags)
  if (!target && !text && !textGone && typeof timeMs !== 'number') {
    throw new Error('Usage: agrune wait <target-ref>|--text <text>|--text-gone <text>|--time <seconds>')
  }
  const state = getStringFlag(flags, 'state') ?? 'visible'
  const timeoutMs = optionalNumberFlag(flags, 'timeout')
  const { baseUrl } = getDaemonEndpoint(flags)
  const response = await requestJson<unknown>(baseUrl, '/wait', {
    method: 'POST',
    body: JSON.stringify({
      ...(target ? { target, state } : {}),
      ...(text ? { text } : {}),
      ...(textGone ? { textGone } : {}),
      ...(typeof timeMs === 'number' ? { timeMs } : {}),
      ...(typeof timeoutMs === 'number' ? { timeoutMs } : {}),
      tabId: optionalNumberFlag(flags, 'tab'),
    }),
  })
  writeResult(io.stdout, response, flags)
  return 0
}

async function runScreenshot(
  flags: Record<string, string | boolean>,
  io: CliIo,
): Promise<number> {
  const type = screenshotTypeFlag(flags)
  const output = optionalStringFlag(flags, 'output') ?? defaultScreenshotOutput(type)
  const target = optionalStringFlag(flags, 'target')
  const { baseUrl } = getDaemonEndpoint(flags)
  const response = await requestJson<ScreenshotResponse>(baseUrl, '/screenshot', {
    method: 'POST',
    body: JSON.stringify({
      path: output,
      fullPage: getBooleanFlag(flags, 'full-page'),
      target,
      type,
      tabId: optionalNumberFlag(flags, 'tab'),
    }),
  })
  if (getBooleanFlag(flags, 'json')) {
    writeJson(io.stdout, response)
  } else {
    write(io.stdout, `${response.path}\n`)
  }
  return 0
}

function writeResult(
  stream: Pick<NodeJS.WriteStream, 'write'>,
  value: unknown,
  flags: Record<string, string | boolean>,
): void {
  if (getBooleanFlag(flags, 'json')) {
    writeJson(stream, value)
    return
  }
  write(stream, `${JSON.stringify(value, null, 2)}\n`)
}

function writeJson(stream: Pick<NodeJS.WriteStream, 'write'>, value: unknown): void {
  write(stream, `${JSON.stringify(value, null, 2)}\n`)
}

function write(stream: Pick<NodeJS.WriteStream, 'write'>, text: string): void {
  stream.write(text)
}

async function writeTextOutputFile(filename: string, text: string): Promise<string> {
  const path = resolve(filename)
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, text, 'utf-8')
  return path
}

function outputFilenameFromFlags(flags: Record<string, string | boolean>): string | undefined {
  return optionalStringFlag(flags, 'filename') ?? optionalStringFlag(flags, 'output')
}

function optionalStringFlag(
  flags: Record<string, string | boolean>,
  name: string,
): string | undefined {
  if (!(name in flags)) return undefined
  const value = flags[name]
  if (typeof value === 'string' && value.trim().length > 0) return value
  throw new Error(`--${name} requires a value`)
}

function screenshotTypeFlag(flags: Record<string, string | boolean>): 'png' | 'jpeg' | undefined {
  const value = optionalStringFlag(flags, 'type')
  if (value === undefined || value === 'png' || value === 'jpeg') return value
  throw new Error('screenshot type must be one of: png, jpeg')
}

function optionalAriaSnapshotModeFlag(flags: Record<string, string | boolean>): 'ai' | 'default' | undefined {
  const value = optionalStringFlag(flags, 'mode')
  if (value === undefined || value === 'ai' || value === 'default') return value
  throw new Error('snapshot mode must be one of: ai, default')
}

function optionalFillStrategyFlag(flags: Record<string, string | boolean>): 'insert' | 'keystroke' | 'auto' | undefined {
  const value = optionalStringFlag(flags, 'strategy')
  if (value === undefined || value === 'insert' || value === 'keystroke' || value === 'auto') return value
  throw new Error('fill strategy must be one of: insert, keystroke, auto')
}

function optionalTargetsModeFlag(flags: Record<string, string | boolean>): 'outline' | 'full' | undefined {
  const value = optionalStringFlag(flags, 'mode')
  if (value === undefined || value === 'outline' || value === 'full') return value
  throw new Error('targets mode must be one of: outline, full')
}

function clickButtonFromFlags(
  flags: Record<string, string | boolean>,
  action: string,
): 'left' | 'right' | 'middle' | undefined {
  const value = optionalStringFlag(flags, 'button')
  if (action === 'contextmenu') {
    if (value !== undefined && value !== 'right') {
      throw new Error('right-click only supports --button right')
    }
    return 'right'
  }
  if (value === undefined || value === 'left' || value === 'right' || value === 'middle') return value
  throw new Error('click button must be one of: left, right, middle')
}

function clickModifiersFromFlags(flags: Record<string, string | boolean>): Array<'Alt' | 'Control' | 'ControlOrMeta' | 'Meta' | 'Shift'> | undefined {
  const raw = optionalStringFlag(flags, 'modifiers')
  if (raw === undefined) return undefined
  if (raw.trim().length === 0) return []
  return raw.split(',').map(item => {
    const modifier = item.trim()
    if (
      modifier === 'Alt'
      || modifier === 'Control'
      || modifier === 'ControlOrMeta'
      || modifier === 'Meta'
      || modifier === 'Shift'
    ) {
      return modifier
    }
    throw new Error('click modifiers must be one of: Alt, Control, ControlOrMeta, Meta, Shift')
  })
}

function defaultScreenshotOutput(type?: 'png' | 'jpeg'): string {
  const suffix = type === 'jpeg' ? 'jpg' : 'png'
  return `.agrune/runs/${new Date().toISOString().replace(/[:.]/g, '-')}/screenshot.${suffix}`
}

function optionalNumberFlag(
  flags: Record<string, string | boolean>,
  name: string,
): number | undefined {
  const value = getStringFlag(flags, name)
  if (!value) return undefined
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    throw new Error(`${name} must be a number`)
  }
  if (name === 'tab' && (!Number.isInteger(parsed) || parsed <= 0)) {
    throw new Error('tabId must be a positive integer')
  }
  return parsed
}

function parseTabId(value: string | undefined): number {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error('tabId must be a positive integer')
  }
  return parsed
}

function tabSelectorBody(
  flags: Record<string, string | boolean>,
  positionals: string[],
  required: boolean,
): { tabId?: number; index?: number } {
  const index = optionalIndexFlag(flags)
  const rawTabId = getStringFlag(flags, 'tab') ?? (index === undefined ? positionals[0] : undefined)
  if (index !== undefined && (getStringFlag(flags, 'tab') !== undefined || positionals[0] !== undefined)) {
    throw new Error('Use either --index or tabId, not both')
  }
  if (index !== undefined) return { index }
  if (rawTabId) return { tabId: parseTabId(rawTabId) }
  if (required) throw new Error('Usage: agrune tabs focus|select <tabId>|--index <index>')
  return {}
}

function optionalIndexFlag(flags: Record<string, string | boolean>): number | undefined {
  const value = getStringFlag(flags, 'index')
  if (value === undefined) return undefined
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error('index must be a zero-based integer')
  }
  return parsed
}

function snapshotIncludeTextContentFlag(flags: Record<string, string | boolean>): boolean {
  return getBooleanFlag(flags, 'include-text-content')
    || getBooleanFlag(flags, 'includeTextContent')
    || getBooleanFlag(flags, 'text')
}

function groupIdsFromFlags(flags: Record<string, string | boolean>): string[] | undefined {
  const raw = optionalStringFlag(flags, 'groupIds') ?? optionalStringFlag(flags, 'group-ids')
  if (raw === undefined) return undefined
  const groupIds = raw.split(',').map(groupId => groupId.trim()).filter(Boolean)
  if (groupIds.length === 0) {
    throw new Error('--group-ids requires at least one group id')
  }
  return groupIds
}

function positiveIntegerArg(value: string | undefined, name: string): number {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`)
  }
  return parsed
}

function jsonArgFromFlags(flags: Record<string, string | boolean>): unknown {
  const raw = getStringFlag(flags, 'arg')
  if (raw === undefined) return undefined
  try {
    return JSON.parse(raw) as unknown
  } catch {
    throw new Error('--arg must be valid JSON')
  }
}

function dropDataFromFlags(flags: Record<string, string | boolean>): Record<string, string> {
  const data = stringRecordJsonFlag(flags, 'data') ?? {}
  const text = getStringFlag(flags, 'text')
  if (text !== undefined) data['text/plain'] = text
  const uri = getStringFlag(flags, 'uri')
  if (uri !== undefined) data['text/uri-list'] = uri
  return data
}

function stringRecordJsonFlag(
  flags: Record<string, string | boolean>,
  name: string,
): Record<string, string> | undefined {
  const raw = getStringFlag(flags, name)
  if (raw === undefined) return undefined
  let parsed: unknown
  try {
    parsed = JSON.parse(raw) as unknown
  } catch {
    throw new Error(`--${name} must be valid JSON`)
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`--${name} must be a JSON object`)
  }
  const result: Record<string, string> = {}
  for (const [key, value] of Object.entries(parsed)) {
    if (typeof value !== 'string') {
      throw new Error(`--${name} values must be strings`)
    }
    result[key] = value
  }
  return result
}

async function fillFormFieldsFromFlags(flags: Record<string, string | boolean>): Promise<unknown> {
  const raw = getStringFlag(flags, 'fields') ?? await fillFormJsonFromFile(flags)
  if (raw === undefined) {
    throw new Error('Usage: agrune fill-form --fields json|--file path')
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw) as unknown
  } catch {
    throw new Error('--fields/--file must contain valid fill-form JSON')
  }
  if (Array.isArray(parsed)) return parsed
  if (parsed && typeof parsed === 'object' && Array.isArray((parsed as { fields?: unknown }).fields)) {
    return (parsed as { fields: unknown[] }).fields
  }
  throw new Error('--fields must be a JSON array or an object with a fields array')
}

async function fillFormJsonFromFile(flags: Record<string, string | boolean>): Promise<string | undefined> {
  const file = getStringFlag(flags, 'file')
  if (!file) return undefined
  return readFile(file, 'utf-8')
}

function selectModeFromFlags(flags: Record<string, string | boolean>): 'value' | 'label' | 'index' {
  const mode = getStringFlag(flags, 'mode')
  if (mode === 'label' || getBooleanFlag(flags, 'label')) return 'label'
  if (mode === 'index' || getBooleanFlag(flags, 'index')) return 'index'
  if (mode === undefined || mode === 'value') return 'value'
  throw new Error('select mode must be one of: value, label, index')
}

function waitTimeMsFromFlags(flags: Record<string, string | boolean>): number | undefined {
  const timeMs = optionalNumberFlag(flags, 'time-ms')
  if (typeof timeMs === 'number') return timeMs
  const seconds = optionalNumberFlag(flags, 'time')
  return typeof seconds === 'number' ? seconds * 1000 : undefined
}

function appendCommonNetworkParams(params: URLSearchParams, flags: Record<string, string | boolean>): void {
  const tabId = optionalNumberFlag(flags, 'tab')
  if (typeof tabId === 'number') params.set('tabId', String(tabId))
  const filter = getStringFlag(flags, 'filter')
  if (filter) params.set('filter', filter)
  if (getBooleanFlag(flags, 'static')) params.set('static', 'true')
  if (getBooleanFlag(flags, 'all')) params.set('all', 'true')
}

function dialogAcceptValue(subcommand: string | undefined, flags: Record<string, string | boolean>): boolean {
  if (subcommand === 'accept') return true
  if (subcommand === 'dismiss') return false
  if (getBooleanFlag(flags, 'accept')) return true
  if (getBooleanFlag(flags, 'dismiss')) return false
  throw new Error('Usage: agrune handle-dialog --accept|--dismiss [--prompt-text text]')
}

function followEvents(
  baseUrl: string,
  io: CliIo,
  opts: { replay: boolean },
): Promise<void> {
  const replay = opts.replay ? '' : '?replay=false'
  const wsUrl = `${baseUrl.replace(/^http:/, 'ws:').replace(/^https:/, 'wss:')}/events${replay}`
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl)
    const close = () => ws.close()
    process.once('SIGINT', close)
    process.once('SIGTERM', close)
    ws.on('message', data => {
      write(io.stdout, `${data.toString()}\n`)
    })
    ws.on('error', reject)
    ws.on('close', () => {
      process.off('SIGINT', close)
      process.off('SIGTERM', close)
      resolve()
    })
  })
}

function formatEventLine(event: {
  phase: string
  command: string
  durationMs?: number
  error?: { code: string; message: string }
}): string {
  const duration = typeof event.durationMs === 'number' ? ` ${event.durationMs}ms` : ''
  const error = event.error ? ` ${event.error.code}: ${event.error.message}` : ''
  return `${event.phase} ${event.command}${duration}${error}`
}

function formatConsoleLine(message: {
  level: string
  type: string
  text: string
  location?: { url: string; lineNumber: number; columnNumber: number }
}): string {
  const location = message.location?.url
    ? ` ${message.location.url}:${message.location.lineNumber}:${message.location.columnNumber}`
    : ''
  const type = message.type === message.level ? message.level : `${message.level}/${message.type}`
  return `[${type}]${location} ${message.text.replace(/\n/g, '\n    ')}`
}

function formatNetworkLine(request: {
  index: number
  method: string
  url: string
  resourceType: string
  status?: number
  failureText?: string
}): string {
  const status = request.failureText ? `failed ${request.failureText}` : (typeof request.status === 'number' ? String(request.status) : 'pending')
  return `${request.index}. ${request.method} ${status} ${request.resourceType} ${request.url}`
}

function formatDialogLine(dialog: {
  id: number
  type: string
  message: string
  handled: boolean
  accepted?: boolean
}): string {
  const state = dialog.handled ? (dialog.accepted ? 'accepted' : 'dismissed') : 'pending'
  return `${dialog.id}. ${state} ${dialog.type} ${JSON.stringify(dialog.message)}`
}

function formatFileChooserLine(fileChooser: {
  id: number
  multiple: boolean
  handled: boolean
  paths?: string[]
  cancelled?: boolean
}): string {
  const state = fileChooser.handled
    ? (fileChooser.cancelled ? 'cancelled' : `uploaded ${(fileChooser.paths ?? []).length}`)
    : 'pending'
  return `${fileChooser.id}. ${state} ${fileChooser.multiple ? 'multiple' : 'single'}`
}

function exitCodeFor(code: string): number {
  if (code === 'DAEMON_UNAVAILABLE' || code === 'SESSION_NOT_ACTIVE') return 4
  if (code === 'TARGET_NOT_FOUND' || code === 'INVALID_MANIFEST') return 3
  return 1
}

function helpText(): string {
  return [
    'agrune CLI',
    '',
    'Usage:',
    '  agrune daemon start [--headless] [--port 47654]',
    '  agrune daemon status',
    '  agrune daemon events [--json|--follow|--no-replay]',
    '  agrune open <url>',
    '  agrune navigate <url>',
    '  agrune back | forward | reload',
    '  agrune resize <width> <height>',
    '  agrune evaluate <js> [--target <target-ref>] [--arg json] [--filename path]',
    '  agrune run-code-unsafe <js>|--code <js>|--file <path>',
    '  agrune console [--level debug|info|warning|error] [--all] [--filename path] [--json]',
    '  agrune network [--filter regexp] [--static] [--all] [--filename path] [--json]',
    '  agrune network request <index> [--part request-headers|request-body|response-headers|response-body] [--filename path]',
    '  agrune dialogs [--json]',
    '  agrune handle-dialog --accept|--dismiss [--prompt-text text]',
    '  agrune dialog accept|dismiss [--prompt-text text]',
    '  agrune file-choosers [--json]',
    '  agrune file-upload [path...]   # no paths cancels the pending chooser',
    '  agrune tabs',
    '  agrune tabs list',
    '  agrune tabs new <url>',
    '  agrune tabs focus <tabId>|--index <index>',
    '  agrune tabs select <tabId>|--index <index>',
    '  agrune tabs close [tabId|--index <index>]',
    '  agrune close [tabId|--index <index>]',
    '  agrune events [--json|--follow]',
    '  agrune targets [--mode outline|full] [--full] [--group <groupId>] [--group-ids csv] [--target <target-ref>] [--text] [--filename path] [--json]',
    '  agrune snapshot [--target <target-ref>] [--depth n] [--mode ai|default] [--boxes] [--include-text-content] [--filename path] [--json]',
    '  agrune click <target-ref> [--button left|right|middle] [--double-click] [--modifiers Alt,Shift]',
    '  agrune fill <target-ref> <value> [--strategy insert|keystroke|auto]',
    '  agrune fill-form --fields json|--file path',
    '  agrune type <target-ref> <text> [--submit] [--delay ms]',
    '  agrune press [target-ref] <key> [--target <target-ref>]',
    '  agrune select <target-ref> <value...> [--label|--index]',
    '  agrune upload <target-ref> <path...>',
    '  agrune drop <target-ref> [path...] [--data json|--text value|--uri value]',
    '  agrune drag <start-ref> --to <end-ref>',
    '  agrune wait <target-ref> [--state visible|hidden|enabled|disabled]',
    '  agrune wait --text <text> | --text-gone <text> | --time <seconds>',
    '  agrune screenshot [--output path] [--full-page] [--target <target-ref>] [--type png|jpeg]',
    '  agrune read',
    '',
  ].join('\n')
}
