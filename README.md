# KINEPIK

An AI-powered chat interface for kinase identification and phosphoproteomics analysis, built with Next.js and powered by OpenAI-compatible APIs.

---

## Features

- **AI Chat** — Conversational interface backed by an OpenAI-compatible endpoint
- **KINEPIK Analysis** — Identify candidate kinases from phosphorylation site sequences
- **Motif Analysis** — Pattern-match phosphopeptide sequences against known kinase motifs
- **Kinase Family Browser** — Explore AGC, CAMK, CK1, CMGC, STE, TK, and TKL families
- **Chain-of-Thought** — Toggle visible reasoning steps during analysis
- **Inhibition Fingerprinting** — Structured inhibitor selectivity profiles for candidate kinases

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
│   ├── layout.tsx                   # Root layout (fonts, theme)
│   ├── page.tsx                     # Home — renders the chat interface
│   ├── help/page.tsx                # Help page
│   ├── kinases/page.tsx             # Kinase browser page
│   └── api/
│       ├── chat/route.ts            # AI streaming endpoint (thin orchestrator)
│       └── kinepik/route.ts         # REST analysis endpoint
│
├── components/
│   ├── chat/
│   │   ├── chat-interface.tsx       # Main chat UI (input, messages, sidebar)
│   │   ├── chat-message.tsx         # Individual message renderer
│   │   └── chat-sidebar.tsx         # Sidebar with stats, kinase families, settings
│   ├── kinase/
│   │   └── kinase-result-card.tsx   # Kinase candidate cards and grid
│   ├── layout/
│   │   ├── animated-background.tsx  # Canvas particle animation
│   │   ├── theme-provider.tsx       # next-themes wrapper
│   │   └── thinking-panel.tsx       # Chain-of-thought display
│   └── ui/                          # shadcn/ui primitives
│
├── lib/
│   ├── types/
│   │   └── kinepik.ts               # Shared TypeScript interfaces
│   ├── server/                      # Server-only code (never imported by client)
│   │   ├── openai.ts                # AI provider client & configuration
│   │   ├── kinepik-engine.ts        # Kinase analysis logic & data
│   │   ├── prompts.ts               # SYSTEM_PROMPT constant
│   │   └── tools/
│   │       ├── analyze-kinase.ts    # analyzeKinase tool
│   │       ├── analyze-motif.ts     # analyzeMotif tool
│   │       ├── get-kinase-family.ts # getKinaseFamily tool
│   │       ├── generate-image.ts    # generateImage tool
│   │       └── index.ts             # chatTools barrel export
│   ├── client/
│   │   └── chat-store.ts            # Zustand client state
│   └── utils.ts                     # cn() and other utilities
│
└── .env.local.example               # Environment variable template
```

---

## API Reference

### `POST /api/chat`

Streams an AI response using the Vercel AI SDK.

**Request body:**

```json
{
  "messages": [{ "role": "user", "content": "Identify kinases for RRxS motif" }]
}
```

**Response:** Server-sent event stream (UI message stream format)

---

### `POST /api/kinepik`

Runs a direct kinase analysis without the AI layer.

**Request body:**

```json
{
  "query": "insulin signaling phosphorylation",
  "sequence": "RRxS",
  "cellType": "HeLa",
  "tissueType": "liver",
  "experimentalConditions": "serum-stimulated"
}
```

| Field                    | Type   | Required | Description                                     |
| ------------------------ | ------ | -------- | ----------------------------------------------- |
| `query`                  | string | ✅       | Free-text description of the biological context |
| `sequence`               | string | —        | Phosphopeptide sequence for motif matching      |
| `cellType`               | string | —        | Cell line context                               |
| `tissueType`             | string | —        | Tissue context                                  |
| `experimentalConditions` | string | —        | Experimental context                            |

**Response:**

```json
{
  "requestId": "uuid",
  "timestamp": "ISO-8601",
  "phosphoSite": { "sequence": "...", "residue": "S", ... },
  "candidates": [
    {
      "kinaseName": "AKT1",
      "family": "AGC",
      "score": 0.92,
      "confidence": "high",
      "pValue": 1.2e-5,
      "knownInhibitors": [...],
      ...
    }
  ],
  "inhibitionFingerprint": { ... },
  "suggestedExperiments": [...],
  "motifAnalysis": [...]
}
```

---

### `GET /api/kinepik?query=<text>`

Quick analysis for a single free-text query.

```bash
curl "http://localhost:3000/api/kinepik?query=CDK+substrate"
```

---

## Environment Variables

| Variable             | Default                        | Description                               |
| -------------------- | ------------------------------ | ----------------------------------------- |
| `OPENAI_API_KEY`     | —                              | OpenAI API key                            |
| `OPENAI_BASE_URL`    | OpenAI default                 | Base URL for an OpenAI-compatible server  |
| `OPENAI_MODEL`       | `gpt-5.1-turbo`                | Model ID to use                           |

---

## Development

```bash
pnpm dev          # Start dev server
pnpm build        # Production build
pnpm lint         # Lint
pnpm type-check   # TypeScript check (tsc --noEmit)
```

---

## Supported Kinase Families

| Family | Description                                            |
| ------ | ------------------------------------------------------ |
| AGC    | PKA, PKG, PKC — basophilic, second-messenger regulated |
| CAMK   | Calcium/calmodulin-dependent kinases                   |
| CK1    | Casein kinase 1 — acidophilic, constitutively active   |
| CMGC   | CDKs, MAPKs, GSKs — proline-directed                   |
| STE    | MAP kinase cascade components                          |
| TK     | Tyrosine kinases — receptor and non-receptor           |
| TKL    | Tyrosine kinase-like serine/threonine kinases          |
