export interface UserAuthor {
  id: string
  name: string
  username?: string
  isBot: boolean
}

export interface ChannelDestination {
  id: string
  name?: string
  isDirectMessage: boolean
}

export interface AttachmentItem {
  type: 'image' | 'video' | 'audio' | 'document'
  url?: string
  buffer?: Buffer
  mimetype?: string
  filename?: string
}

export interface MessageContext {
  id: string
  platform: 'discord' | 'telegram' | 'whatsapp' | string
  text: string
  user: UserAuthor
  channel: ChannelDestination
  attachments: AttachmentItem[]
  raw: unknown
  timestamp: number
  reply: (content: string | ReplyOptions) => Promise<SentResult>
}

export interface ReplyOptions {
  text: string
  attachments?: AttachmentItem[]
}

export interface SentResult {
  id: string
  platform: string
  timestamp: number
}

export type NextFunction = () => Promise<void>
export type MiddlewareHandler = (ctx: MessageContext, next: NextFunction) => Promise<void> | void
export type ErrorListener = (error: Error, platform: string, context?: unknown) => void
