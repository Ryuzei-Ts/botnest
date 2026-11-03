import { Telegraf } from 'telegraf'
import { message } from 'telegraf/filters'
import type {
  AdapterLifecycle,
  MessageContext,
  ErrorListener,
  SentResult,
  ReplyOptions,
  UserAuthor
} from '#core'

export interface TelegramConfig {
  token: string
  allowBots?: boolean
  onConnect?: string | ((botInfo: any) => void | Promise<void>)
}

export class TelegramAdapter implements AdapterLifecycle {
  readonly platform = 'telegram'
  private bot: Telegraf
  private dispatch: ((ctx: MessageContext) => Promise<void>) | null = null
  private errorListener: ErrorListener = (err) => console.error('[Telegram Error]', err)

  constructor(private config: TelegramConfig) {
    this.bot = new Telegraf(this.config.token)

    this.bot.on(message('text'), async (telegramCtx) => {
      if (!this.dispatch) return

      const from = telegramCtx.message.from
      if (from.is_bot && !this.config.allowBots) return

      const authorData: UserAuthor = {
        id: from.id.toString(),
        name: [from.first_name, from.last_name].filter(Boolean).join(' '),
        username: from.username,
        isBot: from.is_bot
      }

      const ctx: MessageContext = {
        id: telegramCtx.message.message_id.toString(),
        platform: this.platform,
        text: telegramCtx.message.text,
        timestamp: telegramCtx.message.date * 1000,
        user: authorData,
        author: authorData,
        channel: {
          id: telegramCtx.chat.id.toString(),
          name: 'title' in telegramCtx.chat ? telegramCtx.chat.title : undefined,
          isDirectMessage: telegramCtx.chat.type === 'private'
        },
        attachments: [],
        raw: telegramCtx,
        reply: async (content) => {
          const payload = typeof content === 'string' ? content : content.text
          const res = await telegramCtx.reply(payload)
          return { id: res.message_id.toString(), platform: this.platform, timestamp: res.date * 1000 }
        }
      }

      await this.dispatch(ctx).catch((err) => this.errorListener(err, this.platform, telegramCtx))
    })

    this.bot.catch((err) => this.errorListener(err as Error, this.platform))
  }

  async start(): Promise<void> {
    try {
      const me = await this.bot.telegram.getMe()
      await this.bot.telegram.deleteWebhook({ drop_pending_updates: true })

      if (typeof this.config.onConnect === 'function') {
        await this.config.onConnect(me)
      } else if (typeof this.config.onConnect === 'string') {
        console.log(this.config.onConnect)
      } else {
        console.log(`[Telegram] Conectado exitosamente como @${me.username}`)
      }

      this.bot.launch({ dropPendingUpdates: true }).catch((err) => {
        this.errorListener(err, this.platform)
      })
    } catch (err) {
      this.errorListener(err as Error, this.platform)
    }
  }

  async stop(): Promise<void> {
    this.bot.stop('SIGTERM')
  }

  async send(channelId: string, content: string | ReplyOptions): Promise<SentResult> {
    const payload = typeof content === 'string' ? content : content.text
    const res = await this.bot.telegram.sendMessage(channelId, payload)
    return { id: res.message_id.toString(), platform: this.platform, timestamp: res.date * 1000 }
  }

  onDispatch(dispatcher: (ctx: MessageContext) => Promise<void>): void {
    this.dispatch = dispatcher
  }

  onError(listener: ErrorListener): void {
    this.errorListener = listener
  }
}

export function telegram(config: TelegramConfig): TelegramAdapter {
  return new TelegramAdapter(config)
}
