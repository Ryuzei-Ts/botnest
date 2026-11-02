/**
 * @file src/security/sanitizer.ts
 * @description Inbound payload deduplication and output sanitization guards.
 */

export class SecurityGuard {
  private deduplicationWindow = new Set<string>()
  private maxRingSize = 10000

  public isDuplicate(eventId: string): boolean {
    if (this.deduplicationWindow.has(eventId)) {
      return true
    }

    if (this.deduplicationWindow.size >= this.maxRingSize) {
      const first = this.deduplicationWindow.values().next().value
      if (first) this.deduplicationWindow.delete(first)
    }

    this.deduplicationWindow.add(eventId)
    return false
  }

  public sanitizeInput(raw: string): string {
    return raw
      .replace(/[\u200B-\u200D\uFEFF]/g, '')
      .replace(/\r\n/g, '\n')
      .trim()
  }

  public sanitizeOutput(raw: string): string {
    return raw.replace(/@everyone/g, '@\u200beveryone').replace(/@here/g, '@\u200bhere')
  }
}
