/**
 * @file src/adapters/whatsapp.ts
 * @description Advanced Baileys WhatsApp adapter with dynamic session routing, subbot pooling & multi-session isolation.
 */

import {
  default as makeWASocket,
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  type WASocket,
  type proto
} from '@whiskeysockets/baileys';
import pino from 'pino';
import qrcode from 'qrcode-terminal';
import path from 'node:path';
import fs from 'node:fs';
import type {
  AdapterLifecycle,
  MessageContext,
  ErrorListener,
  SentResult,
  ReplyOptions,
  UserAuthor
} from '#core';

export interface WhatsAppSessionOptions {
  botId?: string;
  isSubbot?: boolean;
  sessionPath?: string;
  printQR?: boolean;
  usePairingCode?: boolean;
  phoneNumber?: string;
  phoneNumberProvider?: () => Promise<string>;
  onPairingCode?: (code: string) => void;
  browser?: [string, string, string];
}

export interface WhatsAppConfig extends WhatsAppSessionOptions {
  baseSessionsDir?: string;
  resolveSessionPath?: (botId: string, isSubbot: boolean) => string;
}

interface ActiveSessionInstance {
  botId: string;
  isSubbot: boolean;
  sessionPath: string;
  socket: WASocket;
  status: 'connecting' | 'open' | 'closed';
}

export class WhatsAppAdapter implements AdapterLifecycle {
  readonly platform = 'whatsapp';
  private sessions = new Map<string, ActiveSessionInstance>();
  private dispatch: ((ctx: MessageContext) => Promise<void>) | null = null;
  private errorListener: ErrorListener = (err, platform, ctx) => console.error(`[WhatsApp Error] [${platform}]:`, err);

  constructor(private config: WhatsAppConfig = {}) {}

  public resolvePath(botId = 'main', isSubbot = false): string {
    if (this.config.resolveSessionPath) {
      return this.config.resolveSessionPath(botId, isSubbot);
    }
    if (this.config.sessionPath && botId === 'main') {
      return this.config.sessionPath;
    }
    const base = this.config.baseSessionsDir ?? './sessions';
    const subfolder = isSubbot ? 'subbots' : 'core';
    return path.join(base, subfolder, botId);
  }

  async start(): Promise<void> {
    const mainBotId = this.config.botId ?? 'main';
    await this.spawnSession({
      ...this.config,
      botId: mainBotId,
      isSubbot: false
    });
  }

  public async spawnSession(options: WhatsAppSessionOptions): Promise<WASocket> {
    const botId = options.botId ?? `sub_${Date.now()}`;
    const isSubbot = Boolean(options.isSubbot);
    const targetSessionPath = options.sessionPath ?? this.resolvePath(botId, isSubbot);

    if (!fs.existsSync(targetSessionPath)) {
      fs.mkdirSync(targetSessionPath, { recursive: true });
    }

    const { state, saveCreds } = await useMultiFileAuthState(targetSessionPath);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
      version,
      logger: pino({ level: 'silent' }),
      printQRInTerminal: false,
      auth: state,
      browser: options.browser ?? this.config.browser ?? ['Ubuntu', 'Chrome', '20.0.04'],
      generateHighQualityLinkPreview: false,
      syncFullHistory: false,
      markOnlineOnConnect: false,
      connectTimeoutMs: 30000,
      defaultQueryTimeoutMs: 0,
      keepAliveIntervalMs: 15000,
      emitOwnEvents: false,
      fireInitQueries: false,
      transactionOpts: { maxCommitRetries: 1, delayBetweenTriesMs: 10 }
    });

    const sessionRecord: ActiveSessionInstance = {
      botId,
      isSubbot,
      sessionPath: targetSessionPath,
      socket: sock,
      status: 'connecting'
    };

    this.sessions.set(botId, sessionRecord);

    sock.ev.on('creds.update', saveCreds);

    if (!sock.authState.creds.registered && options.usePairingCode) {
      setTimeout(async () => {
        try {
          let number = options.phoneNumber;
          if (!number && options.phoneNumberProvider) {
            number = await options.phoneNumberProvider();
          }
          if (number) {
            const clean = number.replace(/[^0-9]/g, '');
            const code = await sock.requestPairingCode(clean);
            if (options.onPairingCode) {
              options.onPairingCode(code);
            }
          }
        } catch (err) {
          this.errorListener(err as Error, this.platform, { botId });
        }
      }, 3000);
    }

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr && options.printQR) {
        qrcode.generate(qr, { small: true });
      }

      if (connection === 'open') {
        sessionRecord.status = 'open';
      }

      if (connection === 'close') {
        sessionRecord.status = 'closed';
        const statusCode = (lastDisconnect?.error as { output?: { statusCode?: number } })?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

        if (shouldReconnect) {
          await this.spawnSession(options).catch((err) => this.errorListener(err, this.platform, { botId }));
        } else {
          this.sessions.delete(botId);
        }
      }
    });

    sock.ev.on('messages.upsert', async (chatUpdate) => {
      if (chatUpdate.type !== 'notify' || !this.dispatch) return;

      for (const raw of chatUpdate.messages) {
        if (!raw.message || raw.key.fromMe) continue;

        const remoteJid = raw.key.remoteJid;
        if (!remoteJid) continue;

        const text =
          raw.message.conversation ||
          raw.message.extendedTextMessage?.text ||
          raw.message.imageMessage?.caption ||
          raw.message.videoMessage?.caption ||
          '';

        const senderJid = raw.key.participant || remoteJid;
        const isGroup = remoteJid.endsWith('@g.us');

        const authorData: UserAuthor = {
          id: senderJid,
          name: raw.pushName || senderJid.split('@')[0],
          isBot: false
        };

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
          raw: { ...raw, botId, isSubbot },
          reply: async (content) => {
            const payload = typeof content === 'string' ? content : content.text;
            const sent = await sock.sendMessage(remoteJid, { text: payload }, { quoted: raw });
            return {
              id: sent?.key.id ?? Date.now().toString(),
              platform: this.platform,
              timestamp: Date.now()
            };
          }
        };

        await this.dispatch(ctx).catch((err) => this.errorListener(err, this.platform, raw));
      }
    });

    return sock;
  }

  public async stopSession(botId: string): Promise<boolean> {
    const session = this.sessions.get(botId);
    if (!session) return false;
    session.socket.end(new Error(`Session ${botId} manually terminated.`));
    this.sessions.delete(botId);
    return true;
  }

  public getSession(botId = 'main'): WASocket | undefined {
    return this.sessions.get(botId)?.socket;
  }

  public listSessions(): Array<{ botId: string; isSubbot: boolean; status: string; sessionPath: string }> {
    return Array.from(this.sessions.values()).map((s) => ({
      botId: s.botId,
      isSubbot: s.isSubbot,
      status: s.status,
      sessionPath: s.sessionPath
    }));
  }

  async stop(): Promise<void> {
    for (const [botId] of this.sessions) {
      await this.stopSession(botId);
    }
  }

  async send(channelId: string, content: string | ReplyOptions, botId = 'main'): Promise<SentResult> {
    const socket = this.getSession(botId);
    if (!socket) {
      throw new Error(`[WhatsApp] Socket session "${botId}" is not active or initialized.`);
    }
    const payload = typeof content === 'string' ? content : content.text;
    const sent = await socket.sendMessage(channelId, { text: payload });
    return {
      id: sent?.key.id ?? Date.now().toString(),
      platform: this.platform,
      timestamp: Date.now()
    };
  }

  onDispatch(dispatcher: (ctx: MessageContext) => Promise<void>): void {
    this.dispatch = dispatcher;
  }

  onError(listener: ErrorListener): void {
    this.errorListener = listener;
  }
}

export function whatsapp(config: WhatsAppConfig = {}): WhatsAppAdapter {
  return new WhatsAppAdapter(config);
}
