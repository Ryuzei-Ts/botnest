/**
 * @file src/security/validator.ts
 * @description In-memory zero-network schema validator for BotNest universal messages.
 */

import type { MessageContext } from '#core'

export interface SchemaValidationResult {
  valid: boolean
  errors: string[]
}

export class MessageSchemaValidator {
  private static readonly ALLOWED_PLATFORMS = new Set(['discord', 'telegram', 'whatsapp'])

  public static validate(payload: unknown): SchemaValidationResult {
    const errors: string[] = []

    if (!payload || typeof payload !== 'object') {
      return { valid: false, errors: ['Payload must be a non-null object'] }
    }

    const msg = payload as Partial<MessageContext>

    if (typeof msg.id !== 'string' || msg.id.length === 0) {
      errors.push('Field "id" must be a non-empty string')
    }

    if (!msg.platform || !this.ALLOWED_PLATFORMS.has(msg.platform)) {
      errors.push(`Field "platform" must be one of: discord, telegram, whatsapp`)
    }

    if (typeof msg.text !== 'string') {
      errors.push('Field "text" must be a string')
    }

    if (typeof msg.timestamp !== 'number' || Number.isNaN(msg.timestamp)) {
      errors.push('Field "timestamp" must be a valid integer')
    }

    if (!msg.user || typeof msg.user !== 'object') {
      errors.push('Field "user" must be an object')
    } else {
      if (typeof msg.user.id !== 'string') errors.push('Field "user.id" must be a string')
      if (typeof msg.user.name !== 'string') errors.push('Field "user.name" must be a string')
      if (typeof msg.user.isBot !== 'boolean') errors.push('Field "user.isBot" must be a boolean')
    }

    if (!msg.channel || typeof msg.channel !== 'object') {
      errors.push('Field "channel" must be an object')
    } else {
      if (typeof msg.channel.id !== 'string') errors.push('Field "channel.id" must be a string')
      if (typeof msg.channel.isDirectMessage !== 'boolean') {
        errors.push('Field "channel.isDirectMessage" must be a boolean')
      }
    }

    return {
      valid: errors.length === 0,
      errors
    }
  }
}
