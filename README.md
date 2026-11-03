<div align="center">

# 🪺 BotNest

**Universal Multi-Platform Bot Engine & Polyglot Runtime Orchestrator**

*One unified core. Every messaging platform. Zero boilerplate duplication.*

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-22.x-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6+-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Python](https://img.shields.io/badge/Python-3.10+-3776AB?logo=python&logoColor=white)](https://www.python.org/)
[![Rust](https://img.shields.io/badge/Rust-Native%20CDylib-DEA584?logo=rust&logoColor=black)](https://www.rust-lang.org/)

</div>

---

## 📋 Table of Contents

- [The Core Problem](#-the-core-problem)
- [System Architecture](#-system-architecture)
- [Key Features](#-key-features)
- [Subpath Imports Layout](#-subpath-imports-layout)
- [Quick Start](#-quick-start)
- [Core API Reference](#-core-api-reference)
  - [Universal MessageContext](#universal-messagecontext)
  - [Fluent Chaining API](#fluent-chaining-api)
  - [Middleware Pipeline](#middleware-pipeline)
- [Enterprise Subsystems](#-enterprise-subsystems)
  - [Platform Dispatcher Queue](#platform-dispatcher-queue)
  - [State & Session Management](#state--session-management)
  - [Telemetry & Quantile Metrics](#telemetry--quantile-metrics)
  - [Zero-Network Contract Validator](#zero-network-contract-validator)
- [Polyglot Sidecars](#-polyglot-sidecars)
  - [Python AI Worker (IPC Socket)](#python-ai-worker-ipc-socket)
  - [Rust Native Accelerator](#rust-native-accelerator)
- [Benchmarks](#-benchmarks)
- [Roadmap](#-roadmap)
- [Contributing](#-contributing)
- [License](#-license)

---

## 💥 The Core Problem

When deploying conversational bots across multiple platforms (Discord, Telegram, WhatsApp), developers face structural obstacles:

1. **API Fragmentation**: `discord.js`, `telegraf`, and `@whiskeysockets/baileys` expose radically different interfaces for the same primitives (users, channels, messages, attachments).
2. **Duplicated Business Logic**: Handlers, validation, and AI calls are rewritten 3 times.
3. **Throttling & IP Bans**: Blasting messages without platform-specific leaky-bucket queues causes account suspensions (especially on WhatsApp via Baileys and Telegram rate limits).
4. **V8 Garbage Collection Overhead**: Handling high-throughput string sanitization and message deduplication in Node.js creates memory pressure and event-loop lag.

**BotNest** abstracts away the transport layer, providing an enterprise runtime with strict contracts, automated queue throttling, and zero-overhead native sidecars.

---

## 🏛 System Architecture

```text
                                  ┌───────────────────────────┐
                                  │   Inbound Chat Traffic    │
                                  │ (Discord / TG / WhatsApp) │
                                  └─────────────┬─────────────┘
                                                │
                                                ▼
┌───────────────────────────────────────────────────────────────────────────────────────────┐
│                                 Transport Layer Adapters                                  │
│                                                                                           │
│   ┌───────────────────────┐   ┌───────────────────────┐   ┌───────────────────────────┐   │
│   │    DiscordAdapter     │   │    TelegramAdapter    │   │      WhatsAppAdapter      │   │
│   │    (discord.js v14)   │   │     (telegraf v4)     │   │  (@whiskeysockets/baileys)│   │
│   └───────────┬───────────┘   └───────────┬───────────┘   └─────────────┬─────────────┘   │
└───────────────┼───────────────────────────┼─────────────────────────────┼─────────────────┘
                └───────────────────────────┼─────────────────────────────┘
                                            ▼
┌───────────────────────────────────────────────────────────────────────────────────────────┐
│                                  BotNest Kernel Engine                                    │
│                                                                                           │
│  ┌───────────────────────┐   ┌───────────────────────┐   ┌─────────────────────────────┐  │
│  │ Security Deduplicator │──▶│  Contract Validator   │──▶│    Session Manager (TTL)    │  │
│  │ (Ring Buffer / Rust)  │   │   (Zero-Network JSON) │   │     (In-Memory / Driver)    │  │
│  └───────────────────────┘   └───────────────────────┘   └──────────────┬──────────────┘  │
│                                                                         │                 │
│                                      ┌──────────────────────────────────┘                 │
│                                      ▼                                                    │
│  ┌─────────────────────────────────────────────────────────────────────────────────────┐  │
│  │                               Koa-Style Middleware Onion                            │  │
│  │   [Logging] ──▶ [Rate-Limiter] ──▶ [Command Router] ──▶ [Polyglot Bridge Worker]   │  │
│  └─────────────────────────────────────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────┬───────────────────────────────────────────────┘
                                            ▼
┌───────────────────────────────────────────────────────────────────────────────────────────┐
│                                Outbound Dispatch Pipeline                                 │
│                                                                                           │
│  ┌─────────────────────────────────────────────────────────────────────────────────────┐  │
│  │                       PlatformDispatcherQueue (Priority FIFO)                       │  │
│  │    • Discord: 250ms interval, 5 concurrent workers                                  │  │
│  │    • Telegram: 50ms interval, 30 concurrent workers                                 │  │
│  │    • WhatsApp: 1200ms interval, 1 concurrent worker (Anti-Ban Protection)           │  │
│  └────────────────────────────────────────┬────────────────────────────────────────────┘  │
└───────────────────────────────────────────┼───────────────────────────────────────────────┘
                                            │
                                            ▼
                                ┌───────────────────────┐
                                │   Delivered Message   │
                                └───────────────────────┘
