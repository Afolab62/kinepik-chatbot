# KINEPIK

An AI-powered chat interface for kinase identification and phosphoproteomics analysis, built with Next.js and powered by OpenAI-compatible APIs.

---

## Features

- **AI Chat** — Conversational interface backed by an OpenAI-compatible endpoint, grounded in tool calls against the live KINEPIK database
- **Kinase & Motif Analysis** — Kinase-substrate/phosphosite lookups and phosphopeptide motif matching against known kinase families
- **KSEA Ranking** — Rank kinases by KSEA activity for a perturbation/cell line, compare multiple perturbations, or estimate combination-therapy effects
- **Network Visualisation** — Interactive Cytoscape kinase-interaction network panel
- **Chart Generation** — Bar/heatmap/radar chart rendering from KINEPIK tool results
- **Chain-of-Thought** — Toggle visible reasoning/tool-call steps during analysis
- **Multi-conversation History** — Persisted chat sessions with per-conversation network state (Zustand + localStorage)

---

## Prerequisites

| Tool    | Version |
| ------- | ------- |
| Node.js | ≥ 18    |
| pnpm    | ≥ 9     |

---

## Setup

### 1. Install dependencies

```bash
pnpm install
```

### 2. Configure environment variables

Copy the example file and fill in your values:

```bash
cp .env.local.example .env.local
```

Edit `.env.local`:

```env
# Required — your OpenAI API key
OPENAI_API_KEY=sk-...

# Optional — point to a self-hosted OpenAI-compatible server
# OPENAI_BASE_URL=http://localhost:8000/v1
# OPENAI_MODEL=gpt-4o
```

### 3. Start the development server

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Project Structure

```
.
├── app/
│   ├── layout.tsx                     # Root layout (fonts, theme)
│   ├── page.tsx                       # Home — renders the chat interface
│   ├── help/page.tsx                  # Help page
│   ├── kinases/page.tsx               # Kinase browser page
│   └── api/
│       ├── chat/route.ts              # AI streaming endpoint (thin orchestrator)
│       └── ops/health/route.ts        # Gated ops/metrics health check
│
├── components/
│   ├── chat/
│   │   ├── chat-interface.tsx         # Main chat UI (input, messages, sidebar)
│   │   ├── chat-message.tsx           # Individual message renderer
│   │   └── chat-sidebar.tsx           # Sidebar with conversation history, theme toggle
│   ├── kinase/
│   │   └── kinase-result-card.tsx     # Kinase candidate cards and grid
│   ├── layout/
│   │   ├── animated-background.tsx    # Canvas particle animation
│   │   ├── theme-provider.tsx         # next-themes wrapper
│   │   └── thinking-panel.tsx         # Chain-of-thought display
│   ├── network/
│   │   └── network-panel.tsx          # Cytoscape kinase network visualisation panel
│   └── ui/                            # shadcn/ui primitives
│
├── lib/
│   ├── types/
│   │   └── kinepik.ts                 # Shared TypeScript interfaces
│   ├── server/                        # Server-only code (never imported by client)
│   │   ├── openai.ts                  # AI provider client & configuration
│   │   ├── kinepik-engine.ts          # Kinase family/motif knowledge constants
│   │   ├── prompts.ts                 # SYSTEM_PROMPT constant
│   │   ├── security/                 # Rate limiting, log sanitisation
│   │   ├── ops/monitoring.ts          # Request tracing & error/ops metrics
│   │   ├── eval/                      # Benchmarks and runtime safety checks
│   │   └── tools/                     # AI SDK tools called by the chat model
│   │       ├── analyze-kinase.ts          # analyzeKinase — KSEA/substrate lookups
│   │       ├── analyze-motif.ts           # analyzeMotif tool
│   │       ├── get-kinase-family.ts       # getKinaseFamily tool
│   │       ├── list-perturbations.ts      # listPerturbations tool
│   │       ├── get-kinase-network.ts      # getKinaseNetwork tool (Cytoscape data)
│   │       ├── top-kinase-connectivity.ts # getTopKinaseConnectivity tool
│   │       ├── top-affected-kinases.ts    # getTopAffectedKinases (KSEA ranking) tool
│   │       ├── batch-rank-kinases.ts      # batchRankKinases tool
│   │       ├── compare-perturbations.ts   # comparePerturbations tool
│   │       ├── combination-therapy.ts     # analyzeCombinationTherapy tool
│   │       ├── generate-visualization.ts  # generateVisualization tool (SVG charts)
│   │       └── index.ts                   # chatTools barrel export
│   ├── client/
│   │   └── chat-store.ts              # Zustand client state (conversations, persistence)
│   └── utils.ts                       # cn() and other utilities
│
└── .env.local.example                 # Environment variable template
```

---

## API Reference

### `POST /api/chat`

Streams an AI response using the Vercel AI SDK. The model calls the tools in `lib/server/tools/` (kinase lookups, KSEA ranking, network/chart generation) as needed, and the route streams incremental text/tool results back as a UI message stream.

**Request body:**

```json
{
  "messages": [{ "role": "user", "content": "Why does mTOR activity change when MCF7 is treated with AZD3759?" }]
}
```

**Response:** Server-sent event stream (UI message stream format)

Set `DEMO_MODE=true` to stream a canned response without an API key configured. Requests are rate-limited per client IP (`CHAT_RATE_LIMIT_WINDOW_MS` / `CHAT_RATE_LIMIT_MAX_REQUESTS`, defaults 60s / 30 requests).

---

### `GET /api/ops/health`

Returns request/error metrics for the chat route (`lib/server/ops/monitoring.ts`). Disabled by default in production; enable with `OPS_HEALTH_ENABLED=true` and protect it with `OPS_HEALTH_TOKEN` (sent as `Authorization: Bearer <token>` or `X-Ops-Token`).

```bash
curl -H "X-Ops-Token: <token>" "http://localhost:3000/api/ops/health"
```

---

## Environment Variables

| Variable                      | Default                        | Description                                                |
| ------------------------------ | ------------------------------- | ------------------------------------------------------------ |
| `OPENAI_API_KEY`               | —                               | OpenAI (or compatible provider) API key                      |
| `OPENAI_BASE_URL`              | `https://api.openai.com/v1`     | Base URL for an OpenAI-compatible server                     |
| `OPENAI_MODEL`                 | `gpt-4.1-mini`                  | Model ID to use                                               |
| `DEMO_MODE`                    | `false`                         | Stream a canned response without calling the model at all    |
| `ENABLE_WEB_SEARCH`            | `false`                         | Allow the model to use OpenAI's native `web_search` tool      |
| `WEB_SEARCH_ALLOWED_DOMAINS`   | curated biomedical domain list  | Comma-separated domain allowlist for web search                |
| `CHAT_RATE_LIMIT_WINDOW_MS`    | `60000`                         | Rate-limit window (ms) per client IP for `/api/chat`          |
| `CHAT_RATE_LIMIT_MAX_REQUESTS` | `30`                            | Max requests per window per client IP                          |
| `OPS_HEALTH_ENABLED`           | `true` outside production       | Enables `/api/ops/health`                                      |
| `OPS_HEALTH_TOKEN`             | —                               | Bearer/`X-Ops-Token` required to read `/api/ops/health`         |

---

## Development

```bash
pnpm dev          # Start dev server
pnpm build        # Production build
pnpm lint         # Lint
pnpm typecheck    # TypeScript check (tsc --noEmit)
pnpm eval:runtime-safety   # Run runtime safety checks (parsing/error-mapping)
pnpm eval:benchmarks       # Run intent-routing / tool-calling benchmark suite
```

---

## KINEPIK API

All kinase, KSEA, network, and perturbation data is fetched live from the KINEPIK database at `https://kinepik.org/api/0`. The chat tools in `lib/server/tools/` call the following endpoints:

| Endpoint                    | Used by                                    | Returns                                          |
| ---------------------------- | ------------------------------------------- | ------------------------------------------------- |
| `GET /kinases/specific`      | `analyzeKinase`                             | Kinase metadata + target phosphosites by UniProt ID |
| `GET /perturbation/KSEA`     | `analyzeKinase`, `topAffectedKinases`, `comparePerturbations`, `analyzeCombinationTherapy` | KSEA activity scores for a perturbation/cell line |
| `GET /perturbation/all`      | `listPerturbations`                         | Catalog of available drugs/inhibitors and gene knockouts |
| `GET /sif/all`, `/sif/specific` | `getKinaseNetwork`, `getTopKinaseConnectivity` | Kinase-interaction network in SIF (source/interaction/target) format |
| `GET /sif/attributes`        | `getKinaseNetwork`, `getTopKinaseConnectivity` | Human-readable labels for network node IDs        |

No local kinase database is bundled — results reflect whatever is currently published by the KINEPIK API. Set `KINEPIK_LOG_REQUESTS=true` to log outgoing requests for debugging.
