# AI-SDK-LANGGRAPH

[![AI-SDK Ecosystem](https://img.shields.io/badge/AI--SDK-ECOSYSTEM-part%20of-blue)](https://github.com/mk-knight23/AI-SDK-ECOSYSTEM)
[![LangGraph](https://img.shields.io/badge/LangGraph-0.2-red)](https://github.com/langchain-ai/langgraph)
[![SvelteKit](https://img.shields.io/badge/SvelteKit-2.0-orange)](https://kit.svelte.dev/)
[![Node.js](https://img.shields.io/badge/Node.js-20-green)](https://nodejs.org/)

> **Framework**: LangGraph (Stateful Agent Workflows)
> **Stack**: SvelteKit 2 + Node.js

---

## 🎯 Project Overview

**AI-SDK-LANGGRAPH** showcases stateful agent workflows using LangGraph. It demonstrates cyclic graph topology, persistent state management, checkpointing, and human-in-the-loop approval patterns for building production AI agent systems.

### Key Features

- 🕸️ **Cyclic Graph Workflows** - Non-linear agent conversation flows
- 💾 **State Persistence** - Long-term memory across sessions
- 🔄 **Checkpointing System** - Save and restore agent state
- 🤖 **Multi-Agent Systems** - Multiple agents coordinating via LangGraph
- 📡 **Real-time Updates** - WebSocket streaming of agent execution

---

## 🛠 Tech Stack

| Technology | Purpose |
|-------------|---------|
| SvelteKit 2 | Full-stack framework |
| Node.js 20 | Runtime |
| LangGraph | Agent orchestration |
| WebSocket | Real-time communication |
| Skeleton UI | Loading states |

---

## 🚀 Quick Start

```bash
npm install
npm run dev
```

---

## 🔌 API Integrations

| Provider | Usage |
|----------|-------|
| OpenAI | Primary LLM |
| Anthropic | Fallback LLM |

---

## 📦 Deployment

**Fly.io**

```bash
fly deploy
```

---

## 📁 Project Structure

```
AI-SDK-LANGGRAPH/
├── src/              # SvelteKit source
│   ├── routes/      # API routes + agent endpoints
│   └── lib/         # LangGraph graphs
└── README.md
```

---

## 📝 License

MIT License - see [LICENSE](LICENSE) for details.

---

**Part of the [AI-SDK Ecosystem](https://github.com/mk-knight23/AI-SDK-ECOSYSTEM)**
