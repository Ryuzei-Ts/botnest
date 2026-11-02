/**
 * @file src/storage/session-store.ts
 * @description Key-value conversational session storage with TTL invalidation.
 */

export interface SessionData {
  state?: string
  data: Record<string, unknown>
  lastActivity: number
  expiresAt: number
}

export interface SessionDriver {
  get(key: string): Promise<SessionData | null>
  set(key: string, data: SessionData, ttlMs: number): Promise<void>
  delete(key: string): Promise<boolean>
  clear(): Promise<void>
}

export class MemorySessionDriver implements SessionDriver {
  private cache = new Map<string, SessionData>()

  constructor(reapIntervalMs = 60000) {
    const timer = setInterval(() => this.reap(), reapIntervalMs)
    timer.unref()
  }

  public async get(key: string): Promise<SessionData | null> {
    const record = this.cache.get(key)
    if (!record) return null
    if (Date.now() > record.expiresAt) {
      this.cache.delete(key)
      return null
    }
    return record
  }

  public async set(key: string, data: SessionData, ttlMs: number): Promise<void> {
    const now = Date.now()
    data.lastActivity = now
    data.expiresAt = now + ttlMs
    this.cache.set(key, data)
  }

  public async delete(key: string): Promise<boolean> {
    return this.cache.delete(key)
  }

  public async clear(): Promise<void> {
    this.cache.clear()
  }

  private reap(): void {
    const now = Date.now()
    for (const [k, v] of this.cache.entries()) {
      if (now > v.expiresAt) {
        this.cache.delete(k)
      }
    }
  }
}

export class SessionManager {
  constructor(
    private driver: SessionDriver = new MemorySessionDriver(),
    private defaultTtlMs: number = 1800000
  ) {}

  public getSessionKey(platform: string, userId: string, channelId?: string): string {
    return `${platform}:${userId}:${channelId ?? 'direct'}`
  }

  public async get<T = unknown>(key: string): Promise<T | null> {
    const session = await this.driver.get(key)
    return session ? (session.data as T) : null
  }

  public async update(key: string, patch: Record<string, unknown>, state?: string): Promise<void> {
    const existing = (await this.driver.get(key)) ?? {
      data: {},
      lastActivity: Date.now(),
      expiresAt: Date.now() + this.defaultTtlMs
    }

    existing.data = { ...existing.data, ...patch }
    if (state !== undefined) {
      existing.state = state
    }

    await this.driver.set(key, existing, this.defaultTtlMs)
  }

  public async getState(key: string): Promise<string | undefined> {
    const session = await this.driver.get(key)
    return session?.state
  }

  public async clear(key: string): Promise<void> {
    await this.driver.delete(key)
  }
}
