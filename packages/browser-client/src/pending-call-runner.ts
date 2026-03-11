import {
  createCommandError,
  type CommandResult,
  type CommandRequest,
} from '@webcli-dom/core'
import type { PageRuntimeLike } from './types'

export type CompletedCommandBuffer = {
  push: (command: CommandResult) => void
  snapshot: () => CommandResult[]
  commit: (count: number) => void
  hasEntries: () => boolean
}

export function createCompletedCommandBuffer(): CompletedCommandBuffer {
  const queue: CommandResult[] = []

  return {
    push(command) {
      queue.push(command)
    },
    snapshot() {
      return queue.slice()
    },
    commit(count) {
      if (count <= 0) return
      queue.splice(0, count)
    },
    hasEntries() {
      return queue.length > 0
    },
  }
}

export async function processPendingCommands(
  commands: CommandRequest[],
  runtime: PageRuntimeLike,
  completedCommands: CompletedCommandBuffer,
): Promise<void> {
  for (const command of commands) {
    try {
      const result =
        command.kind === 'act'
          ? await runtime.act({
              commandId: command.commandId,
              targetId: command.targetId,
              expectedVersion: command.expectedVersion,
              config: command.config,
            })
          : command.kind === 'fill'
            ? await runtime.fill({
                commandId: command.commandId,
                targetId: command.targetId,
                value: command.value,
                expectedVersion: command.expectedVersion,
                config: command.config,
              })
            : await runtime.wait({
                commandId: command.commandId,
                targetId: command.targetId,
                state: command.state,
                timeoutMs: command.timeoutMs,
              })

      completedCommands.push(result)
    } catch (error) {
      completedCommands.push({
        commandId: command.commandId,
        ok: false,
        error: createCommandError(
          'INVALID_COMMAND',
          error instanceof Error ? error.message : String(error),
        ),
      })
    }
  }
}
