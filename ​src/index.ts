/**
 * @file src/index.ts
 * @package @ryuzei/botnest
 * @description High-throughput multi-platform orchestrator entrypoint without inline commands.
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
