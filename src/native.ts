import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)

export interface ParsedCommand {
  isCommand: boolean
  prefix: string
  command: string
  payload: string
}

let nativeModule: {
  parseMessage: (text: string, prefixes: string[]) => ParsedCommand
  cleanPhoneNumber: (num: string) => string
} | null = null

try {
  nativeModule = require('../native.node')
} catch {
  nativeModule = null
}

export function parseMessage(text: string, prefixes: string[]): ParsedCommand {
  if (nativeModule) {
    return nativeModule.parseMessage(text, prefixes)
  }
  
  const trimmed = text.trim()
  if (!trimmed) {
    return { isCommand: false, prefix: '', command: '', payload: '' }
  }

  for (const p of prefixes) {
    if (trimmed.startsWith(p)) {
      const withoutPrefix = trimmed.slice(p.len ?? p.length).trimStart()
      const parts = withoutPrefix.split(/\s+/)
      const command = (parts.shift() || '').toLowerCase()
      const payload = parts.join(' ').trim()

      return {
        isCommand: command.length > 0,
        prefix: p,
        command,
        payload
      }
    }
  }

  return { isCommand: false, prefix: '', command: '', payload: '' }
}

export function cleanPhoneNumber(num: string): string {
  if (nativeModule) {
    return nativeModule.cleanPhoneNumber(num)
  }

  let cleaned = String(num).replace(/[^0-9]/g, '')
  if (cleaned.startsWith('521') && cleaned.length === 13) {
    cleaned = '52' + cleaned.slice(3)
  }
  return cleaned
}
