import dotenv from 'dotenv'

export interface BotNestEnv {
  DISCORD_TOKEN?: string
  TELEGRAM_TOKEN?: string
  WHATSAPP_ENABLED?: boolean
  WHATSAPP_AUTH_DIR?: string
}

export function loadEnvironment(): BotNestEnv {
  dotenv.config()

  return {
    DISCORD_TOKEN: process.env.DISCORD_TOKEN,
    TELEGRAM_TOKEN: process.env.TELEGRAM_TOKEN,
    WHATSAPP_ENABLED: process.env.WHATSAPP_ENABLED === 'true',
    WHATSAPP_AUTH_DIR: process.env.WHATSAPP_AUTH_DIR || './storage/whatsapp_auth'
  }
}
