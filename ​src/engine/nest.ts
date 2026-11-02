/**
 * @file src/engine/nest.ts
 * @description Kernel runtime orchestrator with fluent chaining and message handlers.
 */

import type {
  AdapterLifecycle,
  MessageContext,
  MiddlewareHandler,
  ErrorListener,
  BotNestPlugin
} from '#core'

export class BotNest {
  private adapters: Map<string, AdapterLifecycle> = new Map()
  private middlewares: MiddlewareHandler[] = []
  private startHooks: (() => Promise<void> | void)[] = []
  private stopHooks: (() => Promise<void> | void)[] = []
  private errorHandler: ErrorListener = (err, platform) => {
    console.error(`[BotNest Error] [${platform}]:`, err)
  }

  adapter(adapterInstance: AdapterLifecycle): this {
    return this.mount(adapterInstance)
  }

  mount(adapterInstance: AdapterLifecycle): this {
    if (this.adapters.has(adapterInstance.platform)) {
      throw new Error(`Adapter for platform "${adapterInstance.platform}" is already mounted.`)
    }
    this.adapters.set(adapterInstance.platform, adapterInstance)
    return this
  }

  onMessage(handler: (ctx: MessageContext) => Promise<void> | void): this {
    this.middlewares.push(async (ctx, next) => {
      await handler(ctx)
      await next()
    })
    return this
  }

  use(middleware: MiddlewareHandler): this {
    this.middlewares.push(middleware)
    return this
  }

  registerPlugin(plugin: BotNestPlugin): this {
    plugin.install({
      use: (mw) => this.use(mw),
      onStart: (hook) => this.startHooks.push(hook),
      onStop: (hook) => this.stopHooks.push(hook)
    })
    return this
  }

  onError(handler: ErrorListener): this {
    this.errorHandler = handler
    return this
  }

  private async executePipeline(ctx: MessageContext): Promise<void> {
    let index = -1

    const runner = async (i: number): Promise<void> => {
      if (i <= index) throw new Error('next() called multiple times')
      index = i
      const fn = this.middlewares[i]
      if (fn) {
        await fn(ctx, () => runner(i + 1))
      }
    }

    await runner(0)
  }

  async start(): Promise<void> {
    for (const hook of this.startHooks) {
      await hook()
    }

    for (const [platform, adapterInstance] of this.adapters.entries()) {
      adapterInstance.onError((err, p, ctx) => this.errorHandler(err, p, ctx))
      adapterInstance.onDispatch(async (ctx) => {
        await this.executePipeline(ctx)
      })

      await adapterInstance.start()
    }
  }

  async stop(): Promise<void> {
    for (const hook of this.stopHooks) {
      await hook()
    }

    for (const adapterInstance of this.adapters.values()) {
      await adapterInstance.stop()
    }
  }
}

export function createNest(): BotNest {
  return new BotNest()
}
