#!/usr/bin/env bash
# @file bench/stress-benchmark.sh
# @description High-volume throughput benchmark across deduplication, sanitization and storage.

set -euo pipefail

echo "=========================================="
echo "    BOTNEST ENGINE BENCHMARK HARNESS      "
echo "=========================================="

tsx -e "
import { SecurityGuard } from '#security';
import { MemorySessionDriver, SessionManager } from '#storage';
import { PlatformDispatcherQueue } from '#queue';

async function run() {
  const guard = new SecurityGuard();
  const sessions = new SessionManager(new MemorySessionDriver());
  const queue = new PlatformDispatcherQueue();

  const ITERATIONS = 200_000;
  console.log('[Bench] Running ' + ITERATIONS.toLocaleString() + ' deduplication & sanitization passes...');

  const t0 = performance.now();
  for (let i = 0; i < ITERATIONS; i++) {
    const rawId = 'evt_' + (i % 5000);
    guard.isDuplicate(rawId);
    guard.sanitizeInput('Hello \u200B World \r\n test payload ' + i);
  }
  const t1 = performance.now();
  const sec = (t1 - t0) / 1000;
  const ops = Math.round(ITERATIONS / sec);

  console.log('[Bench] Done in ' + (t1 - t0).toFixed(2) + 'ms (' + ops.toLocaleString() + ' ops/sec)');

  console.log('[Bench] Testing storage state transitions...');
  const t2 = performance.now();
  for (let i = 0; i < 20_000; i++) {
    await sessions.update('discord:user_' + (i % 500), { score: i });
  }
  const t3 = performance.now();
  console.log('[Bench] 20k state updates completed in ' + (t3 - t2).toFixed(2) + 'ms');
}

run();
"
