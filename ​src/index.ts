/**
 * @file src/index.ts
 * @package @ryuzei/botnest
 * @description High-throughput multi-platform orchestrator entrypoint with Python IPC worker.
 */

import { BotNest, createNest, PythonBridge } from '#engine'
import { DiscordAdapter, TelegramAdapter, WhatsAppAdapter, discord, telegram, whatsapp } from '#adapters'
import { loadEnvironment } from '#loader'
import { PlatformDispatcherQueue } from '#queue'
import { SessionManager } from '#storage'
import { MetricsCollector } from '#telemetry'
import { SecurityGuard } from '#security'
import type { MessageContext, NextFunction } from '#core'

export * from '#core'
export * from '#engine'
export * from '#adapters'
export * from '#storage'
export * from '#queue'
export * from '#telemetry'
export * from '#security'
export * from '#loader'

const env = loadEnvironment()
const nest = createNest()
const queue = new PlatformDispatcherQueue()
const sessions = new SessionManager()
const metrics = new MetricsCollector()
const security = new SecurityGuard()
const python = new PythonBridge()

nest.use(async (ctx: MessageContext, next: NextFunction) => {
  if (security.isDuplicate(`${ctx.platform}:${ctx.id}`)) {
    return
  }

  ctx.text = security.sanitizeInput(ctx.text)
  const startTime = performance.now()

  try {
    metrics.increment(`messages.in.${ctx.platform}`)
    await next()
  } finally {
    const elapsed = performance.now() - startTime
    metrics.recordLatency(elapsed)
  }
})

nest.use(async (ctx: MessageContext, next: NextFunction) => {
  const sessionKey = sessions.getSessionKey(ctx.platform, ctx.user.id, ctx.channel.id)
  await sessions.update(sessionKey, { lastInteraction: Date.now() })

  const command = ctx.text.trim().toLowerCase()

  if (command === '!ping' || command === '/ping') {
    const start = ctx.timestamp
    const latency = Date.now() - start

    await queue.enqueue(ctx.platform, async () => {
      const content = security.sanitizeOutput(`[${ctx.platform.toUpperCase()}] pong [${latency}ms]`)
      await ctx.reply(content)
    })
    return
  }

  if (command === '!hola' || command === '/hola') {
    await queue.enqueue(ctx.platform, async () => {
      const targetName = ctx.author?.name || ctx.user.name
      await ctx.reply(security.sanitizeOutput(`Hola ${targetName}`))
    })
    return
  }

  if (command.startsWith('!nlp ')) {
    const targetText = ctx.text.slice(5).trim()
    try {
      const pyRes = await python.execute({
        command: 'sentiment',
        text: targetText,
        platform: ctx.platform
      })

      const replyContent = `[NLP Worker ${pyRes.runtime}] Sentiment: ${JSON.stringify(pyRes.result)} (${pyRes.latency_ms}ms)`
      await queue.enqueue(ctx.platform, async () => {
        await ctx.reply(security.sanitizeOutput(replyContent))
      })
    } catch (err) {
      await ctx.reply(`[Worker Error] Failed to connect to Python IPC: ${(err as Error).message}`)
    }
    return
  }

  if (command === '!metrics') {
    const snap = metrics.snapshot() as {
      quantiles: { p50: number; p90: number; p99: number; samples: number }
      uptimeSeconds: number
    }
    const mem = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)

    const response = [
      '=== BOTNEST TELEMETRY ===',
      `Uptime: ${snap.uptimeSeconds}s`,
      `Heap: ${mem} MB`,
      `Samples: ${snap.quantiles.samples}`,
      `Latencies: p50: ${snap.quantiles.p50}ms | p90: ${snap.quantiles.p90}ms | p99: ${snap.quantiles.p99}ms`
    ].join('\n')

    await queue.enqueue(ctx.platform, async () => {
      await ctx.reply(security.sanitizeOutput(response))
    })
    return
  }

  await next()
})

if (env.DISCORD_TOKEN) {
  nest.adapter(discord({ token: env.DISCORD_TOKEN }))
}

if (env.TELEGRAM_TOKEN) {
  nest.adapter(telegram({ token: env.TELEGRAM_TOKEN }))
}

if (env.WHATSAPP_ENABLED) {
  nest.adapter(
    whatsapp({
      sessionPath: env.WHATSAPP_AUTH_DIR,
      printQR: true
    })
  )
}

async function terminate(signal: string): Promise<void> {
  process.stdout.write(
    JSON.stringify({ level: 'warn', message: `Shutdown signal ${signal} caught.` }) + '\n'
  )
  try {
    await nest.stop()
    process.exit(0)
  } catch (err) {
    process.stderr.write(
      JSON.stringify({ level: 'fatal', message: 'Fault during teardown', error: (err as Error).stack }) + '\n'
    )
    process.exit(1)
  }
}

process.on('SIGINT', () => void terminate('SIGINT'))
process.on('SIGTERM', () => void terminate('SIGTERM'))

async function bootstrap(): Promise<void> {
  try {
    await nest.start()
    process.stdout.write(
      JSON.stringify({ level: 'info', message: 'BotNest enterprise runtime booted.' }) + '\n'
    )
  } catch (err) {
    process.stderr.write(
      JSON.stringify({ level: 'fatal', message: 'Bootstrap failed', error: (err as Error).stack }) + '\n'
    )
    process.exit(1)
  }
}

void bootstrap()
