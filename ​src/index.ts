// @file: src/index.ts
// @author: Ryuzei-Ts
// @package: @ryuzei/botnest
// @changelog:
//   - Refactor entrypoint to robust enterprise-grade runtime architecture.
//   - Implement typed command bus with argument lexing and prefix validation.
//   - Add token-bucket rate limiter middleware per unique user-platform vector.
//   - Mount dynamic stateful context storage with memory reclamation.
//   - Integrate POSIX process signal management (SIGINT, SIGTERM, uncaughtException).

import { createNest } from '#engine'
import { DiscordAdapter, TelegramAdapter, WhatsAppAdapter } from '#adapters'
import { loadEnvironment } from '#loader'
import type { MessageContext, NextFunction } from '#core'

interface CommandPayload {
  command: string
  args: string[]
  flags: Record<string, string | boolean>
}

interface UserRateLimitState {
  tokens: number
  lastRefill: number
}

class TokenBucketLimiter {
  private buckets = new Map<string, UserRateLimitState>()

  constructor(
    private readonly capacity: number = 5,
    private readonly refillRatePerSecond: number = 1
  ) {
    const sweepInterval = setInterval(() => this.sweep(), 60000)
    sweepInterval.unref()
  }

  public consume(key: string): boolean {
    const now = Date.now()
    const state = this.buckets.get(key) || { tokens: this.capacity, lastRefill: now }
    const delta = (now - state.lastRefill) / 1000
    state.tokens = Math.min(this.capacity, state.tokens + delta * this.refillRatePerSecond)
    state.lastRefill = now

    if (state.tokens >= 1) {
      state.tokens -= 1
      this.buckets.set(key, state)
      return true
    }

    this.buckets.set(key, state)
    return false
  }

  private sweep(): void {
    const horizon = Date.now() - 300000
    for (const [key, state] of this.buckets.entries()) {
      if (state.lastRefill < horizon) {
        this.buckets.delete(key)
      }
    }
  }
}

class CommandDispatcher {
  private handlers = new Map<string, (ctx: MessageContext, payload: CommandPayload) => Promise<void>>()

  public register(cmd: string, handler: (ctx: MessageContext, payload: CommandPayload) => Promise<void>): this {
    this.handlers.set(cmd.toLowerCase(), handler)
    return this
  }

  public parse(input: string, prefix: string = '!'): CommandPayload | null {
    if (!input.startsWith(prefix)) return null
    const rawTokens = input.slice(prefix.length).trim().split(/\s+/)
    const command = rawTokens.shift()?.toLowerCase()
    if (!command) return null

    const args: string[] = []
    const flags: Record<string, string | boolean> = {}

    for (const token of rawTokens) {
      if (token.startsWith('--')) {
        const [k, v] = token.slice(2).split('=')
        flags[k] = v !== undefined ? v : true
      } else {
        args.push(token)
      }
    }

    return { command, args, flags }
  }

  public async dispatch(ctx: MessageContext, prefix: string = '!'): Promise<boolean> {
    const parsed = this.parse(ctx.text, prefix)
    if (!parsed) return false

    const handler = this.handlers.get(parsed.command)
    if (!handler) return false

    await handler(ctx, parsed)
    return true
  }
}

const env = loadEnvironment()
const nest = createNest()
const limiter = new TokenBucketLimiter(5, 1)
const dispatcher = new CommandDispatcher()

dispatcher
  .register('ping', async (ctx) => {
    const latency = Date.now() - ctx.timestamp
    await ctx.reply(`[${ctx.platform.toUpperCase()}] pong [${latency}ms]`)
  })
  .register('info', async (ctx) => {
    const mem = process.memoryUsage()
    const mb = (bytes: number) => (bytes / 1024 / 1024).toFixed(2)
    const report = [
      `User: ${ctx.user.name} (${ctx.user.id})`,
      `Platform: ${ctx.platform}`,
      `Scope: ${ctx.channel.isDirectMessage ? 'DirectMessage' : 'Channel/Group'}`,
      `Heap: ${mb(mem.heapUsed)}MB / ${mb(mem.heapTotal)}MB`,
      `RSS: ${mb(mem.rss)}MB`
    ].join('\n')
    await ctx.reply(report)
  })
  .register('echo', async (ctx, payload) => {
    const raw = payload.args.join(' ')
    if (!raw) {
      await ctx.reply('Error: Missing arguments for echo.')
      return
    }
    await ctx.reply(raw)
  })

nest.use(async (ctx: MessageContext, next: NextFunction) => {
  const start = performance.now()
  try {
    await next()
  } finally {
    const duration = (performance.now() - start).toFixed(2)
    process.stdout.write(
      JSON.stringify({
        level: 'info',
        time: new Date(ctx.timestamp).toISOString(),
        platform: ctx.platform,
        user: ctx.user.id,
        duration: `${duration}ms`,
        length: ctx.text.length
      }) + '\n'
    )
  }
})

nest.use(async (ctx: MessageContext, next: NextFunction) => {
  const key = `${ctx.platform}:${ctx.user.id}`
  if (!limiter.consume(key)) {
    await ctx.reply('Rate limit exceeded. Throttled.')
    return
  }
  await next()
})

nest.use(async (ctx: MessageContext, next: NextFunction) => {
  const handled = await dispatcher.dispatch(ctx, '!')
  if (!handled) {
    await next()
  }
})

if (env.DISCORD_TOKEN) {
  nest.mount(new DiscordAdapter({ token: env.DISCORD_TOKEN }))
}

if (env.TELEGRAM_TOKEN) {
  nest.mount(new TelegramAdapter({ token: env.TELEGRAM_TOKEN }))
}

if (env.WHATSAPP_ENABLED) {
  nest.mount(
    new WhatsAppAdapter({
      sessionPath: env.WHATSAPP_AUTH_DIR,
      printQR: true
    })
  )
}

async function terminate(signal: string): Promise<void> {
  process.stdout.write(
    JSON.stringify({ level: 'warn', message: `Signal ${signal} received. Initiating graceful shutdown.` }) + '\n'
  )
  try {
    await nest.stop()
    process.exit(0)
  } catch (err) {
    process.stderr.write(
      JSON.stringify({ level: 'fatal', message: 'Graceful shutdown failure', error: (err as Error).stack }) + '\n'
    )
    process.exit(1)
  }
}

process.on('SIGINT', () => void terminate('SIGINT'))
process.on('SIGTERM', () => void terminate('SIGTERM'))

process.on('uncaughtException', (err: Error) => {
  process.stderr.write(
    JSON.stringify({ level: 'fatal', type: 'uncaughtException', stack: err.stack }) + '\n'
  )
  void terminate('uncaughtException')
})

process.on('unhandledRejection', (reason: unknown) => {
  process.stderr.write(
    JSON.stringify({ level: 'error', type: 'unhandledRejection', detail: String(reason) }) + '\n'
  )
})

async function bootstrap(): Promise<void> {
  try {
    await nest.start()
    process.stdout.write(
      JSON.stringify({ level: 'info', message: 'BotNest runtime deployed and active.' }) + '\n'
    )
  } catch (error) {
    process.stderr.write(
      JSON.stringify({ level: 'fatal', message: 'Bootstrap sequence failed', error: (error as Error).stack }) + '\n'
    )
    process.exit(1)
  }
}

void bootstrap()
