/**
 * @file tests/botnest.test.ts
 * @description Unit and integration test suite for BotNest core and fluent chaining.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { BotNest } from '#engine'
import type { AdapterLifecycle, MessageContext, ErrorListener, SentResult, ReplyOptions } from '#core'

class MockAdapter implements AdapterLifecycle {
  private dispatch: ((ctx: MessageContext) => Promise<void>) | null = null
  public started = false
  public stopped = false
  public sentMessages: { channelId: string; content: string }[] = []

  constructor(readonly platform: string) {}

  async start(): Promise<void> {
    this.started = true
  }

  async stop(): Promise<void> {
    this.stopped = true
  }

  async send(channelId: string, content: string | ReplyOptions): Promise<SentResult> {
    const text = typeof content === 'string' ? content : content.text
    this.sentMessages.push({ channelId, content: text })
    return { id: 'mock_sent_id', platform: this.platform, timestamp: Date.now() }
  }

  onDispatch(dispatcher: (ctx: MessageContext) => Promise<void>): void {
    this.dispatch = dispatcher
  }

  onError(_listener: ErrorListener): void {}

  async emitMockMessage(text: string, userName = 'Tester'): Promise<string[]> {
    const replies: string[] = []
    if (!this.dispatch) throw new Error('Dispatcher not mounted')

    const mockCtx: MessageContext = {
      id: `msg_${Date.now()}`,
      platform: this.platform,
      text,
      timestamp: Date.now(),
      user: { id: 'usr_1', name: userName, isBot: false },
      author: { id: 'usr_1', name: userName, isBot: false },
      channel: { id: 'chan_1', isDirectMessage: false },
      attachments: [],
      raw: {},
      reply: async (content) => {
        const payload = typeof content === 'string' ? content : content.text
        replies.push(payload)
        return { id: `rep_${Date.now()}`, platform: this.platform, timestamp: Date.now() }
      }
    }

    await this.dispatch(mockCtx)
    return replies
  }
}

test('BotNest - Fluent chaining and adapter mounting', async () => {
  const discordMock = new MockAdapter('discord')
  const telegramMock = new MockAdapter('telegram')

  const nest = new BotNest()
    .adapter(discordMock)
    .adapter(telegramMock)

  await nest.start()

  assert.equal(discordMock.started, true)
  assert.equal(telegramMock.started, true)

  await nest.stop()
  assert.equal(discordMock.stopped, true)
  assert.equal(telegramMock.stopped, true)
})

test('BotNest - onMessage handler with commands and author access', async () => {
  const mock = new MockAdapter('discord')
  const repliesReceived: string[] = []

  const nest = new BotNest()
    .adapter(mock)
    .onMessage(async (ctx) => {
      if (ctx.text === '/ping') {
        const res = await ctx.reply('pong')
        repliesReceived.push(res.id)
      }
      if (ctx.text === '/hola') {
        await ctx.reply(`Hola ${ctx.author.name}`)
      }
    })

  await nest.start()

  const pingReplies = await mock.emitMockMessage('/ping')
  assert.deepEqual(pingReplies, ['pong'])

  const holaReplies = await mock.emitMockMessage('/hola', 'Speed')
  assert.deepEqual(holaReplies, ['Hola Speed'])

  await nest.stop()
})
