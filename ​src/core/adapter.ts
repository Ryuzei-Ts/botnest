import type { MessageContext, ErrorListener, SentResult, ReplyOptions } from './types.js'

export interface AdapterLifecycle {
  readonly platform: string
  start(): Promise<void>
  stop(): Promise<void>
  send(channelId: string, content: string | ReplyOptions): Promise<SentResult>
  onDispatch(dispatcher: (ctx: MessageContext) => Promise<void>): void
  onError(listener: ErrorListener): void
}
