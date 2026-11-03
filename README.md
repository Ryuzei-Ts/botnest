<div align="center">

# 🪺 BotNest

**Universal multi-platform bot core & messaging orchestrator**

Write your application logic once. Run simultaneously across Discord, Telegram, and WhatsApp with low-latency IPC sidecars.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6+-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Python](https://img.shields.io/badge/Python-3.10+-3776AB?logo=python&logoColor=white)](https://www.python.org/)
[![Rust](https://img.shields.io/badge/Rust-Native-black?logo=rust&logoColor=white)](https://www.rust-lang.org/)

</div>

---

## ⚡ Overview

Today, writing bots across multiple services means duplicating your entire business logic across separate APIs (`discord.js`, `telegraf`, `baileys`). When scaling, high throughput causes IP bans, memory leaks, and fragmented state management.

**BotNest** solves this by decoupling transport adapters from your domain code:
- **Universal Context (`ctx`):** Identical abstraction for authors, messages, attachments, and replies.
- **Outbound Dispatcher Queue:** Priority queue with token-leaky rate limiting per platform to prevent bans.
- **Polyglot Acceleration:** Offload heavy sentiment/NLP tasks to a low-latency Python IPC worker and memory-intensive deduplication to Rust.
- **Native Subpath Imports:** Clean module resolution via `#core`, `#adapters`, `#engine`, `#storage`, `#queue`, and `#telemetry`.

---

## 📦 Architecture

```text
                        ┌───────────────────┐
                        │   User Messages   │
                        └─────────┬─────────┘
                                  ▼
      ┌────────────────────────────────────────────────────────┐
      │                   Transport Layer                      │
      │   [Discord.js]        [Telegraf]        [Baileys]      │
      └───────────────────────────┬────────────────────────────┘
                                  ▼
      ┌────────────────────────────────────────────────────────┐
      │                   BotNest Engine                       │
      │   • Deduplication Ring      • Token-Bucket Limiter     │
      │   • Output Sanitizer        • Telemetry (p50/p90/p99)  │
      │   • Session Store (TTL)     • Priority Outbound Queue  │
      └─────────────┬────────────────────────────┬─────────────┘
                    │                            │
                    ▼                            ▼
      ┌──────────────────────────┐  ┌──────────────────────────┐
      │   TypeScript Pipelines   │  │   Python IPC Worker      │
      │   (/ping, /hola, events) │  │   (Unix Domain Sockets)  │
      └──────────────────────────┘  └──────────────────────────┘
