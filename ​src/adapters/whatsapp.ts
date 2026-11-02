import {
  default as makeWASocket,
  DisconnectReason,
  useMultiFileAuthState,
  type WASocket,
  type proto
} from '@whiskeysockets/baileys'
import pino from 'pino'
import qrcode from 'qrcode-terminal'
import type {
  AdapterLifecycle,
  MessageContext,
  ErrorListener,
  SentResult,
  ReplyOptions
} from '#core'

export interface WhatsAppConfig {
  sessionPath?: string
  printQR?: boolean
}

export class WhatsAppAdapter implements AdapterLifecycle {
  readonly platform = 'whatsapp'
  private socket: WASocket | null = null
  private dispatch: ((ctx: MessageContext) => Promise<void>) | null = null
  private errorListener: ErrorListener = (err) => console.error('[WhatsApp Error]', err)

  constructor(private config: WhatsAppConfig = {}) {}

  async start(): Promise<void> {
    const authPath = this.config.sessionPath ?? './auth_info_baileys'
    const { state, saveCreds } = await useMultiFileAuthState(authPath)

    this.socket = makeWASocket({
      auth: state,
      logger: pino({ level: 'silent' }),
      printQRInTerminal: false
    })

    this.socket.ev.on('creds.update', saveCreds)

    this.socket.ev.on('connection.update', (update) => {
      const { connection, lastDisconnect, qr } = update

      if (qr && this.config.printQR !== false) {
        console.log('ꕤ✰ [WhatsApp] Escanea el código QR para conectar:')
        qrcode.generate(qr, { small: true })
      }

      if (connection === 'close') {
        const statusCode = (lastDisconnect?.error as { output?: { statusCode?: number } })?.output?.statusCode
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut

        if (shouldReconnect) {
          console.log('ꕤ✰ [WhatsApp] Reconectando sesión...')
          this.start().catch((err) => this.errorListener(err, this.platform))
        } else {
          console.log('ꕤ✰ [WhatsApp] Sesión cerrada permanentemente.')
        }
      }
    })

    this.socket.ev.on('messages.upsert', async (chatUpdate) => {
      if (chatUpdate.type !== 'notify' || !this.dispatch || !this.socket) return

      for (const raw of chatUpdate.messages) {
        if (!raw.message || raw.key.fromMe) continue

        const remoteJid = raw.key.remoteJid
        if (!remoteJid) continue

        const text =
          raw.message.conversation ||
          raw.message.extendedTextMessage?.text ||
          raw.message.imageMessage?.caption ||
          ''

        const senderJid = raw.key.participant || remoteJid
        const isGroup = remoteJid.endsWith('@g.us')

        const ctx: MessageContext = {
          id: raw.key.id ?? Date.now().toString(),
          platform: this.platform,
          text,
          timestamp: typeof raw.messageTimestamp === 'number' ? raw.messageTimestamp * 1000 : Date.now(),
          user: {
            id: senderJid,
            name: raw.pushName || senderJid.split('@')[0],
            isBot: false
          },
          channel: {
            id: remoteJid,
            isDirectMessage: !isGroup
          },
          attachments: [],
          raw,
          reply: async (content) => {
            const payload = typeof content === 'string' ? content : content.text
            const sent = await this.socket!.sendMessage(remoteJid, { text: payload }, { quoted: raw })
            return {
              id: sent?.key.id ?? Date.now().toString(),
              platform: this.platform,
              timestamp: Date.now()
            }
          }
        }

        await this.dispatch(ctx).catch((err) => this.errorListener(err, this.platform, raw))
      }
    })
  }

  async stop(): Promise<void> {
    if (this.socket) {
      this.socket.end(new Error('Manual adapter shutdown'))
    }
  }

  async send(channelId: string, content: string | ReplyOptions): Promise<SentResult> {
    if (!this.socket) {
      throw new Error('[WhatsApp] Socket no está inicializado.')
    }
    const payload = typeof content === 'string' ? content : content.text
    const sent = await this.socket.sendMessage(channelId, { text: payload })
    return {
      id: sent?.key.id ?? Date.now().toString(),
      platform: this.platform,
      timestamp: Date.now()
    }
  }

  onDispatch(dispatcher: (ctx: MessageContext) => Promise<void>): void {
    this.dispatch = dispatcher
  }

  onError(listener: ErrorListener): void {
    this.errorListener = listener
  }
}
