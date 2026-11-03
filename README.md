<div align="center">

# 🪺 BotNest

<div align="center">
  <img src="https://cdn.nexylight.xyz/files/kt70td2z.jpeg" alt="Arte ASCII de BotNest" width="100%" />
</div>

**Universal Multi-Platform Bot Engine & Polyglot Runtime Orchestrator**

*One unified core. Every messaging platform. Zero boilerplate duplication.*

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-22.x%20--%2024.x-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6+-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![WhatsApp](https://img.shields.io/badge/WhatsApp-Baileys-25D366?logo=whatsapp&logoColor=white)](https://github.com/WhiskeySockets/Baileys)
[![Discord](https://img.shields.io/badge/Discord-Discord.js-5865F2?logo=discord&logoColor=white)](https://discord.js.org/)
[![Telegram](https://img.shields.io/badge/Telegram-Telegraf-26A5E4?logo=telegram&logoColor=white)](https://telegraf.js.org/)

</div>

---

## 📋 Table of Contents

- [Overview](#-overview)
- [System Architecture](#-system-architecture)
- [Installation](#-installation)
  - [Option A: via npm install (Command Line)](#option-a-via-npm-install-command-line)
  - [Option B: via package.json](#option-b-via-packagejson)
- [Platform Setup Modes](#-platform-setup-modes)
  - [Mode 1: Unified Multi-Platform (WhatsApp + Discord + Telegram)](#mode-1-unified-multi-platform-whatsapp--discord--telegram)
  - [Mode 2: WhatsApp Standalone (Pairing Code)](#mode-2-whatsapp-standalone-pairing-code)
  - [Mode 3: Discord Standalone](#mode-3-discord-standalone)
  - [Mode 4: Telegram Standalone](#mode-4-telegram-standalone)
- [Command Architecture Guide](#-command-architecture-guide)
  - [1. Flexible Dynamic Prefixes](#1-flexible-dynamic-prefixes)
  - [2. Cross-Platform Global Commands](#2-cross-platform-global-commands)
  - [3. Platform-Isolated Commands](#3-platform-isolated-commands)
  - [4. Dynamic Context-Aware Menu](#4-dynamic-context-aware-menu)
- [Enterprise Resilience & Handshake Protection](#-enterprise-resilience--handshake-protection)
- [Universal MessageContext API](#-universal-messagecontext-api)
- [License](#-license)

---

## 💥 Overview

When building production bots across WhatsApp, Discord, and Telegram, developers typically face:

1. **Protocol Fragmentation**: Incompatible abstractions between Baileys, Discord.js, and Telegraf.
2. **Duplicated Business Logic**: Re-implementing command routing, permissions, and media fetchers for every network.
3. **Stream Instability & Crash Loops**: Unfiltered pre-key handshake ratchets and socket collisions causing rate-bans or memory leak terminations.

**BotNest** solves this by normalizing input events into a uniform pipeline, featuring self-healing connection wrappers and modular routing out of the box.

---

## 🏗 System Architecture

```text
       ┌────────────────────────────────────────────────────────┐
       │                       User Input                       │
       │    WhatsApp (Baileys) │ Discord.js │ Telegraf (TG)     │
       └───────────────────────────┬────────────────────────────┘
                                   │
                                   ▼
       ┌────────────────────────────────────────────────────────┐
       │          Platform Transport Layer (Adapters)           │
       │    - Signal Ratchet Noise Filter & Anti-Crash Guard    │
       │    - Flexible Multi-Prefix Parser (: / ! . # $)        │
       │    - Self-Message Execution (allowFromMe / Bot bots)   │
       └───────────────────────────┬────────────────────────────┘
                                   │
                                   ▼
       ┌────────────────────────────────────────────────────────┐
       │             Unified BotNest Core Engine                │
       │         Universal MessageContext Normalized Flow       │
       └───────────────────────────┬────────────────────────────┘
                                   │
              ┌────────────────────┴────────────────────┐
              ▼                                         ▼
   ┌──────────────────────┐                  ┌──────────────────────┐
   │   Global Commands    │                  │  Platform-Isolated   │
   │  :ping, :echo, :play │                  │  WA / Discord / TG   │
   └──────────────────────┘                  └──────────────────────┘
```

---

## 📦 Installation

### Option A: via npm install (Command Line)

Run the following command in your project directory:

```bash
npm install github:Ryuzei-Ts/botnest @whiskeysockets/baileys chalk discord.js dotenv pino telegraf tsx
```

### Option B: via package.json

Declare the dependencies in your `package.json` file:

```json
{
  "name": "botnest-runner",
  "version": "1.0.0",
  "type": "module",
  "main": "index.js",
  "scripts": {
    "start": "tsx index.js",
    "dev": "tsx watch index.js"
  },
  "dependencies": {
    "@ryuzei/botnest": "github:Ryuzei-Ts/botnest",
    "@whiskeysockets/baileys": "*",
    "chalk": "^5.3.0",
    "discord.js": "^14.16.3",
    "dotenv": "^16.4.5",
    "pino": "^9.5.0",
    "telegraf": "^4.16.3",
    "tsx": "^4.19.2"
  }
}
```

Then install dependencies and start your application:

```bash
npm install
npm start
```

---

## 🧩 Platform Setup Modes

### Mode 1: Unified Multi-Platform (WhatsApp + Discord + Telegram)

```javascript
import { BotNest, discord, whatsapp, telegram } from '@ryuzei/botnest';
import chalk from 'chalk';

const nest = new BotNest()
  .adapter(
    whatsapp({
      sessionPath: './auth_info_baileys',
      usePairingCode: true,
      allowFromMe: true,
      phoneNumber: '521XXXXXXXXXX',
      onConnect: chalk.green('✓ [WhatsApp] Conectado y escuchando.')
    })
  )
  .adapter(
    discord({
      token: process.env.DISCORD_TOKEN,
      allowBots: true,
      onConnect: chalk.blue('✓ [Discord] Gateway activo.')
    })
  )
  .adapter(
    telegram({
      token: process.env.TELEGRAM_TOKEN,
      allowBots: true,
      onConnect: chalk.cyan('✓ [Telegram] Polling en línea.')
    })
  );

nest.onMessage(async (ctx) => {
  if (ctx.text === ':ping') {
    await ctx.reply(`Pong desde ${ctx.platform.toUpperCase()}!`);
  }
});

await nest.start();
```

---

### Mode 2: WhatsApp Standalone (Pairing Code)

Run a resilient WhatsApp bot using an interactive terminal prompt to request pairing codes:

```javascript
import { BotNest, whatsapp } from '@ryuzei/botnest';
import readline from 'node:readline';

function ask(query) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((res) => rl.question(query, (a) => { rl.close(); res(a); }));
}

const nest = new BotNest().adapter(
  whatsapp({
    sessionPath: './auth_info_baileys',
    usePairingCode: true,
    allowFromMe: true,
    phoneNumberProvider: async () => {
      const num = await ask('Ingresa tu número de WhatsApp con código de país (ej. 5244XXXXXXC): ');
      return num.replace(/[^0-9]/g, '');
    },
    onPairingCode: (code) => {
      const formatted = code?.match(/.{1,4}/g)?.join('-') || code;
      console.log(`\nTu código de vinculación es: ${formatted}\n`);
    },
    onConnect: '✓ [WhatsApp] Conectado exitosamente.'
  })
);

nest.onMessage(async (ctx) => {
  if (ctx.text === ':hola') {
    await ctx.reply(`Hola ${ctx.author.name}, recibido en WhatsApp.`);
  }
});

await nest.start();
```

---

### Mode 3: Discord Standalone

```javascript
import { BotNest, discord } from '@ryuzei/botnest';

const nest = new BotNest().adapter(
  discord({
    token: process.env.DISCORD_TOKEN,
    allowBots: false,
    onConnect: (client) => console.log(`✓ Discord conectado como ${client.user.tag}`)
  })
);

nest.onMessage(async (ctx) => {
  if (ctx.text === ':server') {
    await ctx.reply(`Canal actual: ${ctx.channel.name || ctx.channel.id}`);
  }
});

await nest.start();
```

---

### Mode 4: Telegram Standalone

```javascript
import { BotNest, telegram } from '@ryuzei/botnest';

const nest = new BotNest().adapter(
  telegram({
    token: process.env.TELEGRAM_TOKEN,
    allowBots: true,
    onConnect: (botInfo) => console.log(`✓ Telegram activo como @${botInfo.username}`)
  })
);

nest.onMessage(async (ctx) => {
  if (ctx.text === ':id') {
    await ctx.reply(`Tu Telegram User ID es: ${ctx.user.id}`);
  }
});

await nest.start();
```

---

## ⚡ Command Architecture Guide

### 1. Flexible Dynamic Prefixes

BotNest features a zero-allocation regex tokenizer that identifies multiple prefixes (`:`, `!`, `/`, `.`, `#`, `$`) or natural command inputs without prefixes:

```javascript
nest.onMessage(async (ctx) => {
  const rawText = ctx.text?.trim();
  if (!rawText) return;

  const prefixRegex = /^([:!/.#$])?([a-zA-Z0-9_-]+)(?:\s+([\s\S]*))?$/;
  const match = rawText.match(prefixRegex);
  if (!match) return;

  const prefix = match[1] || ':';
  const command = match[2].toLowerCase();
  const textPayload = (match[3] || '').trim();
  const args = textPayload ? textPayload.split(/\s+/) : [];
  const authorName = ctx.author?.name || ctx.user?.name || 'Usuario';
});
```

---

### 2. Platform-Specific Prefixes

You can restrict and customize command triggers per ecosystem (for example, allowing only `!` and `:` on WhatsApp, `/` and `!` on Discord, and strictly `/` on Telegram):

```javascript
const PLATFORM_PREFIXES = {
  whatsapp: ['!', ':'],
  discord: ['/', '!'],
  telegram: ['/']
};

nest.onMessage(async (ctx) => {
  const rawText = ctx.text?.trim();
  if (!rawText) return;

  const allowedPrefixes = PLATFORM_PREFIXES[ctx.platform] || ['!'];
  const matchedPrefix = allowedPrefixes.find((p) => rawText.startsWith(p));
  if (!matchedPrefix) return;

  const withoutPrefix = rawText.slice(matchedPrefix.length).trim();
  if (!withoutPrefix) return;

  const [rawCommand, ...args] = withoutPrefix.split(/\s+/);
  const command = rawCommand.toLowerCase();
  const textPayload = args.join(' ');
  const authorName = ctx.author?.name || ctx.user?.name || 'Usuario';
  const prefix = matchedPrefix;
});
```

### 3. Cross-Platform Global Commands

Write commands once in a single handler. They run natively across WhatsApp, Discord, and Telegram:

```javascript
switch (command) {
  case 'ping': {
    const latency = Date.now() - ctx.timestamp;
    await ctx.reply(`🏓 pong [${latency}ms] | plataforma: ${ctx.platform.toUpperCase()}`);
    return;
  }

  case 'echo': {
    if (!textPayload) {
      await ctx.reply(`Uso: ${prefix}${command} <texto>`);
      return;
    }
    await ctx.reply(textPayload);
    return;
  }

  case 'play': {
    if (!textPayload) {
      await ctx.reply(`Uso: ${prefix}${command} <url youtube>`);
      return;
    }
    await ctx.reply(`🔍 Procesando audio: ${textPayload}...`);
    return;
  }
}
```

---

### 4. Platform-Isolated Commands

Differentiate commands intended only for specific platforms using `if (ctx.platform === '...')`:

```javascript
// Exclusivo de WhatsApp
if (ctx.platform === 'whatsapp') {
  switch (command) {
    case 'subbot': {
      if (!textPayload) {
        await ctx.reply(`Uso: ${prefix}subbot <numero>`);
        return;
      }
      await ctx.reply(`Iniciando subbot para ${textPayload}...`);
      return;
    }
    case 'wainfo': {
      await ctx.reply(`JID: ${ctx.channel.id} | Es Grupo: ${!ctx.channel.isDirectMessage}`);
      return;
    }
  }
}

// Exclusivo de Discord
if (ctx.platform === 'discord') {
  switch (command) {
    case 'server': {
      await ctx.reply(`Servidor: ${ctx.channel.name} (${ctx.channel.id})`);
      return;
    }
  }
}

// Exclusivo de Telegram
if (ctx.platform === 'telegram') {
  switch (command) {
    case 'tghandle': {
      await ctx.reply(`Usuario: @${ctx.author.username || 'sin_alias'}`);
      return;
    }
  }
}
```

---

### 5. Dynamic Context-Aware Menu

Present a menu that dynamically displays only the commands relevant to the platform the user is chatting from:

```javascript
if (command === 'help' || command === 'menu') {
  const menu = [
    '=== COMANDOS GLOBALES ===',
    `• ${prefix}ping`,
    `• ${prefix}echo <texto>`,
    `• ${prefix}play <url youtube>`,
    `• ${prefix}info`
  ];

  if (ctx.platform === 'whatsapp') {
    menu.push('', '=== EXCLUSIVOS WHATSAPP ===', `• ${prefix}subbot <numero>`, `• ${prefix}wainfo`);
  } else if (ctx.platform === 'discord') {
    menu.push('', '=== EXCLUSIVOS DISCORD ===', `• ${prefix}server`);
  } else if (ctx.platform === 'telegram') {
    menu.push('', '=== EXCLUSIVOS TELEGRAM ===', `• ${prefix}tghandle`);
  }

  await ctx.reply(menu.join('\n'));
}
```

---

## 🛡️ Enterprise Resilience & Handshake Protection

BotNest includes low-level optimizations for Baileys, Discord.js, and Telegraf:

- **Signal Noise Suppression**: Built-in `process.stdout`/`stderr` filters block routine Baileys cryptographic logs (`SessionEntry`, `prekey bundle`, `bad-mac`, `Key used already or never filled`) from polluting the process stream.
- **E.164 Mexican Mobile Normalization**: Automatic transformation from `521XXXXXXXXXX` to `52XXXXXXXXXX` prevents WhatsApp key desynchronization and `MessageCounterError`.
- **Zero Socket Leakage**: Reconnection procedures clean stale event listeners prior to spawning replacement sockets.
- **Self-Triggering Flag**: Set `allowFromMe: true` in `whatsapp(...)` to allow bots to react to messages sent from their own primary device.

---

## 📖 Universal MessageContext API

Inbound messages from any platform are normalized into this structured format:

| Field | Type | Description |
| :--- | :--- | :--- |
| `ctx.id` | `string` | Unique message identifier across networks |
| `ctx.platform` | `'whatsapp' \| 'discord' \| 'telegram'` | Source network identifier |
| `ctx.text` | `string` | Unnested body text, image/video caption, or button payload |
| `ctx.timestamp` | `number` | Message creation time in milliseconds |
| `ctx.user.id` | `string` | Sender identifier or phone JID |
| `ctx.user.name` | `string` | Sender display name or pushName |
| `ctx.channel.id` | `string` | Chat, channel, or group ID |
| `ctx.channel.isDirectMessage` | `boolean` | `true` if private DM, `false` if group/guild |
| `ctx.reply(content)` | `Promise<SentResult>` | Quoted reply dispatched directly to the origin channel |
| `ctx.raw` | `any` | Underlying native event (`proto.IWebMessageInfo`, `Message`, `Context`) |

---

## 📄 License

Distributed under the **MIT License**. See `LICENSE` for details.
