import {
  Client,
  GatewayIntentBits,
  Partials,
  type TextBasedChannel,
  type Message,
  type Attachment
} from 'discord.js'
import type {
  AdapterLifecycle,
  MessageContext,
  ErrorListener,
  SentResult,
  ReplyOptions,
  UserAuthor
} from '#core'

export interface DiscordConfig {
  token: string
  allowBots?: boolean
  onConnect?: string | ((client: Client) => void | Promise<void>)
  clientOptions?: {
    intents?: GatewayIntentBits[]
    partials?: Partials[]
  }
}

function resolveMimeType(contentType?: string | null, filename?: string): 'image' | 'video' | 'audio' | 'document' {
  if (contentType) {
    if (contentType.startsWith('image/')) return 'image'
    if (contentType.startsWith('video/')) return 'video'
    if (contentType.startsWith('audio/')) return 'audio'
  }

  if (filename) {
    const ext = filename.split('.').pop()?.toLowerCase()
    if (ext && ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) return 'image'
    if (ext && ['mp4', 'mkv', 'webm', 'mov'].includes(ext)) return 'video'
    if (ext && ['mp3', 'wav', 'ogg', 'm4a', 'flac'].includes(ext)) return 'audio'
  }

  return 'document'
}

export class DiscordAdapter implements AdapterLifecycle {
  readonly platform = 'discord'
  private client: Client
  private dispatch: ((ctx: MessageContext) => Promise<void>) | null = null
  private errorListener: ErrorListener = (err) => console.error('[Discord Error]', err)

  constructor(private config: DiscordConfig) {
    const defaultIntents = [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.DirectMessages,
      GatewayIntentBits.MessageContent
    ]

    const defaultPartials = [
      Partials.Channel,
      Partials.Message,
      Partials.User
    ]

    this.client = new Client({
      intents: this.config.clientOptions?.intents ?? defaultIntents,
      partials: this.config.clientOptions?.partials ?? defaultPartials
    })

    this.client.once('ready', async (c) => {
      if (typeof this.config.onConnect === 'function') {
        await this.config.onConnect(c)
      } else if (typeof this.config.onConnect === 'string') {
        console.log(this.config.onConnect)
      } else {
        console.log(`[Discord] Conectado exitosamente como ${c.user.tag}`)
      }
    })

    this.client.on('messageCreate', async (raw: Message) => {
      if (!this.dispatch) return
      if (raw.author.bot && !this.config.allowBots) return

      const isDirectMessage = !raw.guildId
      const channelName = 'name' in raw.channel ? (raw.channel.name as string) : undefined

      const authorData: UserAuthor = {
        id: raw.author.id,
        name: raw.author.displayName || raw.author.username,
        username: raw.author.username,
        isBot: raw.author.bot
      }

      const attachments = raw.attachments.map((att: Attachment) => ({
        type: resolveMimeType(att.contentType, att.name),
        url: att.url,
        filename: att.name,
        mimeType: att.contentType || undefined,
        size: att.size
      }))

      const ctx: MessageContext = {
        id: raw.id,
        platform: this.platform,
        text: (raw.content || '').trim(),
        timestamp: raw.createdTimestamp,
        user: authorData,
        author: authorData,
        channel: {
          id: raw.channelId,
          name: channelName,
          isDirectMessage
        },
        attachments,
        raw,
        reply: async (content: string | ReplyOptions) => {
          const payload = typeof content === 'string' ? content : content.text
          const res = await raw.reply(payload)
          return {
            id: res.id,
            platform: this.platform,
            timestamp: res.createdTimestamp
          }
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

  public getClient(): Client {
    return this.client
  }

  async send(channelId: string, content: string | ReplyOptions): Promise<SentResult> {
    const channel = await this.client.channels.fetch(channelId).catch(() => null)
    if (!channel || !channel.isTextBased()) {
      throw new Error(`[Discord] Canal de destino ${channelId} no es accesible o no admite texto.`)
    }

    const payload = typeof content === 'string' ? content : content.text
    const sent = await (channel as TextBasedChannel).send(payload)
    return {
      id: sent.id,
      platform: this.platform,
      timestamp: sent.createdTimestamp
    }
  }

  onDispatch(dispatcher: (ctx: MessageContext) => Promise<void>): void {
    this.dispatch = dispatcher
  }

  onError(listener: ErrorListener): void {
    this.errorListener = listener
  }
}

export function discord(config: DiscordConfig): DiscordAdapter {
  return new DiscordAdapter(config)
}
