/**
 * @file src/core/plugin.ts
 * @description Extensibility contracts for kernel lifecycle plugins.
 */

import type { MessageContext, NextFunction } from './types.js'

export interface BotNestPlugin {
  name: string
  version?: string
  install: (kernel: PluginKernelAccess) => void | Promise<void>
}

export interface PluginKernelAccess {
  use: (middleware: (ctx: MessageContext, next: NextFunction) => Promise<void> | void) => void
  onStart: (hook: () => Promise<void> | void) => void
  onStop: (hook: () => Promise<void> | void) => void
}
