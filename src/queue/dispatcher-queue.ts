/**
 * @file src/queue/dispatcher-queue.ts
 * @description Priority-based outbound rate limiter and dispatcher queue.
 */

export interface QueueTask<T = unknown> {
  id: string
  platform: string
  priority: number
  execute: () => Promise<T>
  retries: number
  maxRetries: number
  resolve: (value: T | PromiseLike<T>) => void
  reject: (reason?: unknown) => void
}

export interface DispatcherOptions {
  rates: Record<string, { intervalMs: number; maxConcurrent: number }>
}

export class PlatformDispatcherQueue {
  private queues = new Map<string, QueueTask[]>()
  private running = new Map<string, number>()
  private rates: Record<string, { intervalMs: number; maxConcurrent: number }>

  constructor(options?: DispatcherOptions) {
    this.rates = options?.rates ?? {
      discord: { intervalMs: 250, maxConcurrent: 5 },
      telegram: { intervalMs: 50, maxConcurrent: 30 },
      whatsapp: { intervalMs: 1200, maxConcurrent: 1 }
    }
  }

  public enqueue<T>(platform: string, execute: () => Promise<T>, priority = 0, maxRetries = 3): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const task: QueueTask<T> = {
        id: `${platform}:${Date.now()}:${Math.random().toString(36).slice(2, 7)}`,
        platform,
        priority,
        execute,
        retries: 0,
        maxRetries,
        resolve: resolve as (val: unknown) => void,
        reject
      }

      if (!this.queues.has(platform)) {
        this.queues.set(platform, [])
      }

      const q = this.queues.get(platform)!
      q.push(task as QueueTask)
      q.sort((a, b) => b.priority - a.priority)

      this.process(platform)
    })
  }

  private async process(platform: string): Promise<void> {
    const config = this.rates[platform] ?? { intervalMs: 200, maxConcurrent: 2 }
    const active = this.running.get(platform) ?? 0

    if (active >= config.maxConcurrent) return

    const q = this.queues.get(platform)
    if (!q || q.length === 0) return

    const task = q.shift()!
    this.running.set(platform, active + 1)

    try {
      const result = await task.execute()
      task.resolve(result)
    } catch (err) {
      if (task.retries < task.maxRetries) {
        task.retries++
        const backoff = Math.pow(2, task.retries) * config.intervalMs
        setTimeout(() => {
          q.unshift(task)
          this.process(platform)
        }, backoff)
      } else {
        task.reject(err)
      }
    } finally {
      setTimeout(() => {
        const currentActive = this.running.get(platform) ?? 1
        this.running.set(platform, Math.max(0, currentActive - 1))
        this.process(platform)
      }, config.intervalMs)
    }
  }
}
