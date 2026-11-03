import {
  default as makeWASocket,
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  lidToJid,
  resolveJid,
  resolveAll,
  normalizeJid,
  validateJid,
  getSenderInfo,
  sharedLidPhoneCache,
  isLidUser,
  isPnUser,
  getBotJid,
  setBotMap,
  resolveUsername,
  isUsername,
  type WASocket,
  type proto
} from '@whiskeysockets/baileys'
import pino from 'pino'
import qrcode from 'qrcode-terminal'
import path from 'node:path'
import fs from 'node:fs'
import type {
  AdapterLifecycle,
  MessageContext,
  ErrorListener,
  SentResult,
  ReplyOptions,
  UserAuthor
} from '#core'

const originalStdoutWrite = process.stdout.write.bind(process.stdout)
const originalStderrWrite = process.stderr.write.bind(process.stderr)

const filterNoise = (chunk: any, encoding?: any, callback?: any) => {
  const str = typeof chunk === 'string' ? chunk : chunk?.toString?.('utf8') || ''

  if (
    str.includes('Closing open session') ||
    str.includes('Closing session') ||
    str.includes('SessionEntry') ||
    str.includes('ephemeralKeyPair') ||
    str.includes('currentRatchet') ||
    str.includes('prekey bundle') ||
    str.includes('chainKey') ||
    str.includes('registrationId') ||
    str.includes('bad-mac') ||
    str.includes('Bad MAC') ||
    str.includes('Failed to decrypt') ||
    str.includes('Session error') ||
    str.includes('Session error:') ||
    str.includes('Error: bad-mac')
  ) {
    if (typeof callback === 'function') callback()
    return true
  }

  return originalStdoutWrite(chunk, encoding, callback)
}

process.stdout.write = filterNoise as any
process.stderr.write = filterNoise as any

process.on('uncaughtException', () => {})
process.on('unhandledRejection', () => {})
process.on('uncaughtExceptionMonitor', () => {})

export interface WhatsAppSessionOptions {
  botId?: string
  isSubbot?: boolean
  sessionPath?: string
  printQR?: boolean
  usePairingCode?: boolean
  phoneNumber?: string
  phoneNumberProvider?: () => Promise<string>
  onPairingCode?: (code: string) => void
  browser?: [string, string, string]
  allowFromMe?: boolean
  onConnect?: string | ((socket: WASocket, botId: string) => void | Promise<void>)
}

export interface WhatsAppConfig extends WhatsAppSessionOptions {
  baseSessionsDir?: string
  resolveSessionPath?: (botId: string, isSubbot: boolean) => string
}

interface ActiveSessionInstance {
  botId: string
  isSubbot: boolean
  sessionPath: string
  socket: WASocket
  status: 'connecting' | 'open' | 'closed'
  watchdog?: NodeJS.Timeout
}

export function cleanDeviceJid(rawJid?: string | null): string {
  if (!rawJid) return ''
  return rawJid.replace(/:\d+(?=@)/, '').trim()
}

export function cleanPhoneNumber(num: string): string {
  let cleaned = String(num).replace(/[^0-9]/g, '')
  if (cleaned.startsWith('521') && cleaned.length === 13) {
    cleaned = '52' + cleaned.slice(3)
  }
  return cleaned
}

export async function resolveTargetJid(target: string, sock?: WASocket): Promise<string> {
  const cleanTarget = target.trim()
  if (!cleanTarget) return ''

  if (isUsername(cleanTarget) && sock && typeof sock.onWhatsApp === 'function') {
    try {
      const resolved = await resolveUsername(cleanTarget, sock.onWhatsApp.bind(sock))
      if (resolved) return cleanDeviceJid(resolved)
    } catch (_) {}
  }

  const sanitized = cleanDeviceJid(cleanTarget)

  if (isLidUser(sanitized)) {
    const cachedPhone = sharedLidPhoneCache.getPhoneForLid(sanitized)
    if (cachedPhone) return cleanDeviceJid(cachedPhone)

    try {
      const directJid = lidToJid(sanitized)
      if (directJid) return cleanDeviceJid(directJid)
    } catch (_) {}

    return sanitized
  }

  if (isPnUser(sanitized)) {
    return cleanDeviceJid(normalizeJid(sanitized))
  }

  const numericOnly = cleanPhoneNumber(sanitized)
  if (numericOnly) {
    return `${numericOnly}@s.whatsapp.net`
  }

  return sanitized
}

function extractText(message: proto.IMessage | null | undefined): string {
  if (!message) return ''

  let m: any = message
  if (m.ephemeralMessage?.message) m = m.ephemeralMessage.message
  if (m.viewOnceMessage?.message) m = m.viewOnceMessage.message
  if (m.viewOnceMessageV2?.message) m = m.viewOnceMessageV2.message
  if (m.documentWithCaptionMessage?.message) m = m.documentWithCaptionMessage.message

  return (
    m.conversation ||
    m.extendedTextMessage?.text ||
    m.imageMessage?.caption ||
    m.videoMessage?.caption ||
    m.documentMessage?.caption ||
    m.buttonsResponseMessage?.selectedButtonId ||
    m.listResponseMessage?.singleSelectReply?.selectedRowId ||
    m.templateButtonReplyMessage?.selectedId ||
    m.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson ||
    ''
  ).trim()
}

export class WhatsAppAdapter implements AdapterLifecycle {
  readonly platform = 'whatsapp'
  private sessions = new Map<string, ActiveSessionInstance>()
  private dispatch: ((ctx: MessageContext) => Promise<void>) | null = null
  private errorListener: ErrorListener = (err, platform, ctx) =>
    console.error(`[WhatsApp Error] [${platform}]:`, err)

  constructor(private config: WhatsAppConfig = {}) {}

  public resolvePath(botId = 'main', isSubbot = false): string {
    if (this.config.resolveSessionPath) {
      return this.config.resolveSessionPath(botId, isSubbot)
    }
    if (this.config.sessionPath && botId === 'main') {
      return this.config.sessionPath
    }
    const base = this.config.baseSessionsDir ?? './sessions'
    const subfolder = isSubbot ? 'subbots' : 'core'
    return path.join(base, subfolder, botId)
  }

  async start(): Promise<void> {
    const mainBotId = this.config.botId ?? 'main'
    await this.spawnSession({
      ...this.config,
      botId: mainBotId,
      isSubbot: false
    })
  }

  public async requestSubbot(rawTarget: string): Promise<{ botId: string; code: string; number: string }> {
    const mainSock = this.getSession('main')
    let resolvedIdentifier = rawTarget.trim()

    if (isUsername(resolvedIdentifier) && mainSock) {
      const resolved = await resolveUsername(resolvedIdentifier, mainSock.onWhatsApp.bind(mainSock))
      if (!resolved) {
        throw new Error(`No se pudo resolver el username: ${resolvedIdentifier}`)
      }
      resolvedIdentifier = resolved
    }

    const cleanNum = cleanPhoneNumber(resolvedIdentifier)
    if (!cleanNum || cleanNum.length < 8) {
      throw new Error('Número de teléfono inválido.')
    }

    const botId = `sub_${cleanNum}`
    const targetSessionPath = this.resolvePath(botId, true)

    if (this.sessions.has(botId)) {
      await this.stopSession(botId)
    }

    return new Promise(async (resolve, reject) => {
      let resolved = false
      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true
          reject(new Error('Timeout de 60s esperando el código de WhatsApp.'))
        }
      }, 60000)

      try {
        await this.spawnSession({
          botId,
          isSubbot: true,
          sessionPath: targetSessionPath,
          usePairingCode: true,
          phoneNumber: cleanNum,
          onPairingCode: (code) => {
            if (!resolved) {
              resolved = true
              clearTimeout(timeout)
              resolve({ botId, code, number: cleanNum })
            }
          }
        })
      } catch (err) {
        if (!resolved) {
          resolved = true
          clearTimeout(timeout)
          reject(err)
        }
      }
    })
  }

  public async spawnSession(options: WhatsAppSessionOptions): Promise<WASocket> {
    const botId = options.botId ?? `sub_${Date.now()}`
    const isSubbot = Boolean(options.isSubbot)
    const targetSessionPath = options.sessionPath ?? this.resolvePath(botId, isSubbot)

    if (!fs.existsSync(targetSessionPath)) {
      fs.mkdirSync(targetSessionPath, { recursive: true })
    }

    const { state, saveCreds } = await useMultiFileAuthState(targetSessionPath)
    const { version } = await fetchLatestBaileysVersion().catch(() => ({
      version: [2, 3000, 1015901307] as [number, number, number]
    }))

    const sock = makeWASocket({
      version,
      logger: pino({ level: 'silent' }),
      printQRInTerminal: false,
      auth: state,
      browser: options.browser ?? this.config.browser ?? ['Ubuntu', 'Chrome', '20.0.04'],
      generateHighQualityLinkPreview: false,
      syncFullHistory: false,
      shouldSyncHistoryMessage: () => false,
      markOnlineOnConnect: false,
      connectTimeoutMs: 60000,
      defaultQueryTimeoutMs: 60000,
      keepAliveIntervalMs: 25000,
      emitOwnEvents: false,
      transactionOpts: { maxCommitRetries: 2, delayBetweenTriesMs: 50 }
    })

    const sessionRecord: ActiveSessionInstance = {
      botId,
      isSubbot,
      sessionPath: targetSessionPath,
      socket: sock,
      status: 'connecting'
    }

    this.sessions.set(botId, sessionRecord)

    let lastMsgTime = Date.now()
    const watchdog = setInterval(async () => {
      const inactiveSec = Math.floor((Date.now() - lastMsgTime) / 1000)
      if (inactiveSec < 600) return

      if (sock.ws?.readyState !== 1) {
        clearInterval(watchdog)
        if (this.sessions.has(botId)) {
          await this.spawnSession(options).catch(() => {})
        }
        return
      }

      try {
        await sock.sendPresenceUpdate('available')
        lastMsgTime = Date.now()
      } catch {
        clearInterval(watchdog)
        if (this.sessions.has(botId)) {
          await this.spawnSession(options).catch(() => {})
        }
      }
    }, 120000)

    sessionRecord.watchdog = watchdog

    sock.ev.on('creds.update', saveCreds)

    if (!sock.authState.creds.registered && options.usePairingCode) {
      setTimeout(async () => {
        try {
          let number = options.phoneNumber
          if (!number && options.phoneNumberProvider) {
            number = await options.phoneNumberProvider()
          }
          if (number && !sock.authState.creds.registered) {
            const clean = cleanPhoneNumber(number)
            const code = await sock.requestPairingCode(clean)
            if (options.onPairingCode) {
              options.onPairingCode(code)
            }
          }
        } catch (err) {
          this.errorListener(err as Error, this.platform, { botId })
        }
      }, 3000)
    }

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update

      if (qr && options.printQR) {
        qrcode.generate(qr, { small: true })
      }

      if (connection === 'open') {
        sessionRecord.status = 'open'

        const botPnJid = cleanDeviceJid(sock.user?.id)
        const botLidJid = cleanDeviceJid(sock.user?.lid)

        if (botPnJid && botLidJid) {
          sharedLidPhoneCache.set(botLidJid, botPnJid)
          sharedLidPhoneCache.set(botPnJid, botLidJid)
        }

        try {
          if (typeof setBotMap === 'function') {
            setBotMap(botPnJid, botLidJid)
          }
        } catch (_) {}

        if (!isSubbot) {
          const hook = options.onConnect ?? this.config.onConnect
          if (typeof hook === 'function') {
            await hook(sock, botId)
          } else if (typeof hook === 'string') {
            console.log(hook)
          } else {
            console.log(`[WhatsApp] Sesión principal "${botId}" conectada.`)
          }
        }
      }

      if (connection === 'close') {
        sessionRecord.status = 'closed'
        if (sessionRecord.watchdog) clearInterval(sessionRecord.watchdog)

        const statusCode = (lastDisconnect?.error as { output?: { statusCode?: number } })?.output?.statusCode

        if (statusCode === DisconnectReason.loggedOut || statusCode === 401 || statusCode === DisconnectReason.forbidden || statusCode === 403) {
          try {
            fs.rmSync(targetSessionPath, { recursive: true, force: true })
          } catch (_) {}
          this.sessions.delete(botId)
          return
        }

        if (statusCode === DisconnectReason.connectionReplaced) {
          this.sessions.delete(botId)
          return
        }

        if (statusCode === 405) {
          await new Promise((r) => setTimeout(r, 60000))
          if (this.sessions.has(botId)) {
            await this.spawnSession(options).catch((err) => this.errorListener(err, this.platform, { botId }))
          }
          return
        }

        if (statusCode === DisconnectReason.restartRequired || statusCode === 515) {
          if (this.sessions.has(botId)) {
            await this.spawnSession(options).catch((err) => this.errorListener(err, this.platform, { botId }))
          }
          return
        }

        if (!isSubbot) {
          await new Promise((r) => setTimeout(r, 5000))
          if (this.sessions.has(botId)) {
            await this.spawnSession(options).catch((err) => this.errorListener(err, this.platform, { botId }))
          }
        } else {
          this.sessions.delete(botId)
        }
      }
    })

    sock.ev.on('messages.upsert', async (chatUpdate) => {
      lastMsgTime = Date.now()
      if (chatUpdate.type !== 'notify' || !this.dispatch) return

      for (const raw of chatUpdate.messages) {
        if (!raw.message) continue

        const botPnJid = cleanDeviceJid(sock.user?.id)
        const botLidJid = cleanDeviceJid(sock.user?.lid)

        const senderInfo = typeof getSenderInfo === 'function'
          ? getSenderInfo(raw)
          : { jid: raw.key.participant || raw.key.remoteJid, lid: undefined, isGroup: raw.key.remoteJid?.endsWith('@g.us') }

        let rawSenderJid = cleanDeviceJid(senderInfo.jid || raw.key.participant || raw.key.remoteJid)
        let rawSenderLid = cleanDeviceJid(senderInfo.lid)

        if (rawSenderLid && rawSenderJid && rawSenderJid.endsWith('@s.whatsapp.net')) {
          sharedLidPhoneCache.set(rawSenderLid, rawSenderJid)
          sharedLidPhoneCache.set(rawSenderJid, rawSenderLid)
        }

        if (isLidUser(rawSenderJid) && !rawSenderLid) {
          rawSenderLid = rawSenderJid
          const cached = sharedLidPhoneCache.getPhoneForLid(rawSenderLid)
          if (cached) {
            rawSenderJid = cleanDeviceJid(cached)
          } else {
            try {
              const direct = lidToJid(rawSenderLid)
              if (direct) rawSenderJid = cleanDeviceJid(direct)
            } catch (_) {}
          }
        }

        const isSelf = Boolean(
          raw.key.fromMe ||
          (botPnJid && rawSenderJid === botPnJid) ||
          (botLidJid && rawSenderLid && rawSenderLid === botLidJid) ||
          (botLidJid && rawSenderJid === botLidJid)
        )

        const allowSelf = options.allowFromMe ?? this.config.allowFromMe ?? false
        if (isSelf && !allowSelf) continue

        const remoteJid = cleanDeviceJid(raw.key.remoteJid)
        if (!remoteJid || remoteJid === 'status@broadcast') continue

        const text = extractText(raw.message)
        const isGroup = Boolean(senderInfo.isGroup || remoteJid.endsWith('@g.us'))

        const authorData: UserAuthor & { lid?: string | null } = {
          id: rawSenderJid,
          name: raw.pushName || rawSenderJid.split('@')[0],
          isBot: isSelf,
          lid: rawSenderLid || null
        }

        const ctx: MessageContext = {
          id: raw.key.id ?? Date.now().toString(),
          platform: this.platform,
          text,
          timestamp: typeof raw.messageTimestamp === 'number' ? raw.messageTimestamp * 1000 : Date.now(),
          user: authorData,
          author: authorData,
          channel: {
            id: remoteJid,
            isDirectMessage: !isGroup
          },
          attachments: [],
          raw: {
            ...raw,
            botId,
            isSubbot,
            resolvedJid: rawSenderJid,
            resolvedLid: rawSenderLid || null,
            senderInfo
          },
          reply: async (content) => {
            const payload = typeof content === 'string' ? content : content.text
            const sent = await sock.sendMessage(remoteJid, { text: payload }, { quoted: raw })
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

    return sock
  }

  public async stopSession(botId: string): Promise<boolean> {
    const session = this.sessions.get(botId)
    if (!session) return false
    if (session.watchdog) clearInterval(session.watchdog)
    try {
      session.socket.end(undefined)
    } catch (_) {}
    this.sessions.delete(botId)
    return true
  }

  public getSession(botId = 'main'): WASocket | undefined {
    return this.sessions.get(botId)?.socket
  }

  public listSessions(): Array<{ botId: string; isSubbot: boolean; status: string; sessionPath: string }> {
    return Array.from(this.sessions.values()).map((s) => ({
      botId: s.botId,
      isSubbot: s.isSubbot,
      status: s.status,
      sessionPath: s.sessionPath
    }))
  }

  async stop(): Promise<void> {
    for (const [botId] of this.sessions) {
      await this.stopSession(botId)
    }
  }

  async send(channelId: string, content: string | ReplyOptions, botId = 'main'): Promise<SentResult> {
    const socket = this.getSession(botId)
    if (!socket) {
      throw new Error(`[WhatsApp] Socket session "${botId}" is not active or initialized.`)
    }
    const resolvedTarget = await resolveTargetJid(channelId, socket)
    const payload = typeof content === 'string' ? content : content.text
    const sent = await socket.sendMessage(resolvedTarget, { text: payload })
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

export function whatsapp(config: WhatsAppConfig = {}): WhatsAppAdapter {
  return new WhatsAppAdapter(config)
}
