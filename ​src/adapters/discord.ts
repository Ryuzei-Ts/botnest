import {
  Client,
  GatewayIntentBits,
  Partials,
  type TextBasedChannel
} from 'discord.js'
import type {
  AdapterLifecycle,
  MessageContext,
  ErrorListener,
  SentResult,
  ReplyOptions
} from '#core'

export interface DiscordConfig {
  token: string
}

export class DiscordAdapter implements AdapterLifecycle {
  readonly platform = 'discord'
  private client: Client
  private dispatch: ((ctx: MessageContext) => Promise<void>) | null = null
  private errorListener: ErrorListener = (err) => console.error('[Discord Error]', err)

  constructor(private config: DiscordConfig) {
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.MessageContent
      ],
      partials: [Partials.Channel, Partials.Message]
    })

    this.client.on('messageCreate', async (raw) => {
      if (raw.author.bot || !this.dispatch) return

      const ctx: MessageContext = {
        id: raw.id,
        platform: this.platform,
        text: raw.content || '',
        timestamp: raw.createdTimestamp,
        user: {
          id: raw.author.id,
          name: raw.author.displayName || raw.author.username,
          username: raw.author.username,
          isBot: raw.author.bot
        },
        channel: {
          id: raw.channelId,
          name: 'name' in raw.channel ? (raw.channel.name as string) : undefined,
          isDirectMessage: !raw.guildId
        },
        attachments: raw.attachments.map((att) => ({
          type: 'document',
          url: att.url,
          filename: att.name
        })),
        raw,
        reply: async (content) => {
          const payload = typeof content === 'string' ? content : content.text
          const res = await raw.reply(payload)
          return { id: res.id, platform: this.platform, timestamp: res.createdTimestamp }
        }
      }

      await this.dispatch(ctx).catch((err) => this.errorListener(err, this.platform, raw))
    })

    this.client.on('error', (err) => this.errorListener(err, this.platform))
  }

  async start(): Promise<void> {
    await this.client.login(this.config.token)
  }

  async stop(): Promise<void> {
    await this.client.destroy()
  }

  async send(channelId: string, content: string | ReplyOptions): Promise<SentResult> {
    const channel = await this.client.channels.fetch(channelId)
    if (!channel || !channel.isTextBased()) {
      throw new Error(`[Discord] Destination channel ${channelId} is invalid or non-text.`)
    }
    const payload = typeof content === 'string' ? content : content.text
    const sent = await (channel as TextBasedChannel).send(payload)
    return { id: sent.id, platform: this.platform, timestamp: sent.createdTimestamp }
  }

  onDispatch(dispatcher: (ctx: MessageContext) => Promise<void>): void {
    this.dispatch = dispatcher
  }

  onError(listener: ErrorListener): void {
    this.errorListener = listener
  }
}
