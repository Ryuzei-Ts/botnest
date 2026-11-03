/**
 * @file src/telemetry/metrics.ts
 * @description Metric collector with sliding-window quantile calculation.
 */

export class MetricsCollector {
  private latencies: number[] = []
  private maxBufferSize = 5000
  private counters = new Map<string, number>()

  public recordLatency(ms: number): void {
    if (this.latencies.length >= this.maxBufferSize) {
      this.latencies.shift()
    }
    this.latencies.push(ms)
  }

  public increment(counter: string, step = 1): void {
    this.counters.set(counter, (this.counters.get(counter) ?? 0) + step)
  }

  public getQuantiles(): { p50: number; p90: number; p99: number; samples: number } {
    if (this.latencies.length === 0) {
      return { p50: 0, p90: 0, p99: 0, samples: 0 }
    }

    const sorted = [...this.latencies].sort((a, b) => a - b)
    const getPercentile = (p: number) => {
      const idx = Math.min(Math.floor((p / 100) * sorted.length), sorted.length - 1)
      return Number(sorted[idx].toFixed(2))
    }

    return {
      p50: getPercentile(50),
      p90: getPercentile(90),
      p99: getPercentile(99),
      samples: sorted.length
    }
  }

  public snapshot(): Record<string, unknown> {
    return {
      quantiles: this.getQuantiles(),
      counters: Object.fromEntries(this.counters.entries()),
      memory: process.memoryUsage(),
      uptimeSeconds: Math.floor(process.uptime())
    }
  }
}
