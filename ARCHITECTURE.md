# KINEPIK Chatbot: Technical Architecture & Design

**A graduate-level guide to AI-powered phosphoproteomics analysis**

---

## Table of Contents

1. [System Overview](#system-overview)
2. [Frontend-to-Backend Communication](#frontend-to-backend-communication)
3. [Prompt Engineering & System Context](#prompt-engineering--system-context)
4. [Tool System & Function Calling](#tool-system--function-calling)
5. [Data Flow & State Management](#data-flow--state-management)
6. [Key Design Decisions](#key-design-decisions)
7. [Knowledge Integration Strategy](#knowledge-integration-strategy)

---

## System Overview

KINEPIK is a full-stack AI application that combines:

- **Frontend**: Next.js React interface with real-time streaming chat
- **Backend**: AI orchestration layer using Vercel AI SDK
- **Data Source**: Live KINEPIK API (kinepik.org/api) + OpenAI-compatible LLM
- **Optional RAG**: BioChatter server for knowledge-graph enhanced retrieval

### Core Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                     BROWSER (React Frontend)                     │
│  ┌──────────────┐  ┌─────────────────┐  ┌──────────────────┐   │
│  │  Chat Input  │→ │  Message Stream  │→ │ Chat Message    │   │
│  │  Component   │  │  Renderer        │  │ Display + Tools │   │
│  └──────────────┘  └─────────────────┘  └──────────────────┘   │
│         ↓                                                         │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Zustand Chat Store (Client State)                       │   │
│  │  - Conversations (multi-turn history)                    │   │
│  │  - lastNetworkData (from getKinaseNetwork tool)         │   │
│  │  - showThinking toggle                                   │   │
│  └──────────────────────────────────────────────────────────┘   │
│         ↓                                                         │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Vercel AI SDK: useChat() Hook (WebSocket transport)     │   │
│  │  - Streams UIMessageStream from /api/chat               │   │
│  │  - Handles tool execution flow                          │   │
│  │  - Real-time token streaming                            │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              ↑↓ (WebSocket / HTTP)
┌─────────────────────────────────────────────────────────────────┐
│                 SERVER (Node.js / Next.js)                       │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  POST /api/chat Route Handler                            │   │
│  │  - Validates API key (OpenAI / BioChatter)              │   │
│  │  - Injects SYSTEM_PROMPT + optional BioChatter context  │   │
│  │  - Calls streamText() with messages + tools             │   │
│  └──────────────────────────────────────────────────────────┘   │
│         ↓                                                         │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Vercel AI SDK: streamText()                             │   │
│  │  - model: OpenAI or BioChatter server                   │   │
│  │  - tools: [analyzeKinase, analyzeMotif, ...]           │   │
│  │  - stopWhen: stepCountIs(5) [max 5 tool calls]         │   │
│  └──────────────────────────────────────────────────────────┘   │
│         ↓                                                         │
│  ┌─────────┬──────────┬──────────┬─────────────────────────┐    │
│  │         │          │          │                         │    │
│  ↓         ↓          ↓          ↓                         ↓    │
│ LLM    analyzeKinase analyzeMotif getKinaseNetwork       listPerturbations
│ Output   (live API)  (regex/DB)   (Cytoscape panel)      (DB query)
│          queries     matching     visualizes              enum builder
│          kinase      phospho      network data            for validation
│          phospho-    site motifs  & opens panel
│          sites       against
│                      known
│                      patterns
│
│  External API Calls:
│  ├─ KINEPIK API: https://kinepik.org/api/0/...
│  ├─ OpenAI API: https://api.openai.com/v1 (or custom BioChatter URL)
│  └─ Token Usage Logging (after completion)
└─────────────────────────────────────────────────────────────────┘
```

---

## Frontend-to-Backend Communication

### 1. Message Flow: User Query → AI Response

#### Step 1: User Submission (Client)

```typescript
// components/chat/chat-interface.tsx (simplified)
const { handleSubmit, messages, isLoading } = useChat({
  api: "/api/chat", // endpoint
  experimental_throttleWaitMs: 50, // WebSocket latency
  onResponse(response) {
    // Handle tool execution results
    extractNetworkDataFromParts(messages[messages.length - 1].parts);
  },
});

// User types "Why does mTOR decrease with Rapamycin in MCF7?"
// handleSubmit({ messages: [...previousMessages, userMessage] })
```

The frontend collects:

- **Message history** — all previous user and assistant turns
- **Current message** — the user's new query
- **Connection state** — maintains persistent chat session

#### Step 2: API Request Structure

```json
POST /api/chat HTTP/1.1
Content-Type: application/json

{
  "messages": [
    {
      "role": "user",
      "content": "Why does mTOR activity decrease when MCF7 is treated with Rapamycin?"
    },
    {
      "role": "assistant",
      "content": "I'll query the KINEPIK database to show you the effect...",
      "parts": [...]  // if tools were called previously
    }
  ]
}
```

**Key insight:** The client sends the _full message history_ every request. The backend uses this for context but doesn't maintain server-side session memory. This allows stateless scaling but requires bandwidth for long conversations.

#### Step 3: Server-Side Processing (`/api/chat`)

```typescript
// app/api/chat/route.ts (simplified pipeline)
export async function POST(req: Request) {
  const { messages } = await req.json();

  // Validation
  const { valid, error } = validateApiKey(); // Check .env.local
  if (!valid) return Response.json({ error }, { status: 500 });

  // Convert client message format → AI SDK message format
  const modelMessages = await convertToModelMessages(messages);

  // Stream LLM response with tools
  const result = streamText({
    model: getBiochatterModel(), // OpenAI or BioChatter server
    system: SYSTEM_PROMPT + serverNote, // Injected context
    messages: modelMessages,
    tools: chatTools, // 5 kinase tools
    stopWhen: stepCountIs(5), // Max 5 tool calls per response
    onFinish({ totalUsage }) {
      console.log(`[tokens] ${totalUsage}`); // Usage tracking
    },
  });

  // Return UIMessageStream → client receives as event stream
  return result.toUIMessageStreamResponse();
}
```

#### Step 4: Response Streaming (Server → Client)

The server returns a **Server-Sent Event (SSE) stream** containing deltas:

```
: [SSE event stream from server]
event: 0
data: {"type":"text-start","id":"msg-123"}

event: 0
data: {"type":"text-delta","id":"msg-123","delta":"The database shows"}

event: 0
data: {"type":"text-delta","id":"msg-123","delta":" mTOR is strongly"}

event: 0
data: {"type":"tool-call","id":"tool-456","toolName":"analyzeKinase",...}

event: 0
data: {"type":"tool-result","id":"tool-456",...}

event: 0
data: {"type":"text-end","id":"msg-123"}
```

The client's `useChat()` hook:

- Buffers each delta and updates the UI in real-time
- Executes tools when `tool-call` events arrive
- Re-renders the message stream progressively

#### Step 5: Client State Update (Zustand)

```typescript
// When the response finishes
useChatStore.setState((state) => {
  const activeId = state.activeConversationId;
  return {
    conversations: state.conversations.map((c) =>
      c.id === activeId
        ? {
            ...c,
            messages: toStoredMessages(useChat.messages),
            lastNetworkData: extractNetworkDataFromParts(
              useChat.messages[useChat.messages.length - 1].parts,
            ),
            updatedAt: Date.now(),
          }
        : c,
    ),
  };
});
```

The conversation is persisted to **localStorage** with:

- Full message history
- Network visualization data (if `getKinaseNetwork` was called)
- Timestamp for recent conversation sorting

---

## Prompt Engineering & System Context

### The System Prompt as Behavioral Contract

The **SYSTEM_PROMPT** ([lib/server/prompts.ts](lib/server/prompts.ts)) is the primary mechanism for controlling AI behavior. It is not a suggestion — it is a **programmatic contract** that the LLM follows.

#### Core Components

##### 1. **Role Definition**

```
You are KINEPIK Assistant, an AI system for kinase identification
and phosphoproteomics analysis, backed by the KINEPIK database
(kinepik.org) — an integrated data resource for cell signalling
research developed at Queen Mary University of London.
```

**Purpose:** Establishes identity and authority. The AI knows it is a specialist tool, not a general chatbot.

##### 2. **Domain Knowledge Injection**

The prompt explicitly teaches the model:

- **What KINEPIK is** — a real database with specific contents

  ```
  - Kinase-phosphosite interaction networks
  - Experimental perturbation data across cell lines MCF7, NTERA2, HL60
  - KSEA (Kinase-Substrate Enrichment Analysis) scores
  ```

- **UniProt ID mappings** — because the model must know which kinase is which

  ```
  Known UniProt IDs:
  EGFR=P00533, mTOR=P42345, AKT1=P31749, ...
  ```

- **Cell lines available** — MCF7, NTERA2, HL60 (prevents hallucination of missing lines)

**Why this matters:** Without these facts, the model would hallucinate kinase names or make up UniProt IDs. By including ground truth, we anchor the LLM's outputs to reality.

##### 3. **Tool Documentation**

The prompt teaches the model when and how to use each tool:

```
Before running KSEA analysis for a specific drug, call listPerturbations
first to confirm the exact perturbation name exists in the database.
Drug names are case-sensitive and must match exactly (e.g. "AZD3759",
not "azd3759" or "AZD 3759").
```

**Pattern:** Each tool gets a clear "do this first" or "watch out for" instruction.

##### 4. **Response Style Constraints**

The prompt prohibits certain patterns:

```
Never say "the database returned", "the tool returned", "returned data",
or "API result" — present findings as scientific observations

Do not add a "Next Steps" or "Recommendations" section unless the user
explicitly asks for it
```

**Why:** This prevents the AI from breaking the fourth wall and keeps outputs professional.

##### 5. **Interpretation Protocols**

The KSEA score interpretation is taught explicitly:

```
z-score > +2: strongly activated (high statistical confidence)
z-score +1 to +2: moderately activated
z-score -1 to +1: no significant change
z-score -1 to -2: moderately inhibited
z-score < -2: strongly inhibited

n = number of substrate phosphosites used in the enrichment calculation
(higher = more reliable)
```

**Critical:** This prevents the AI from making up interpretations and ensures scientific accuracy.

##### 6. **Fallback Behavior for Missing Data**

```
If KSEA data is unavailable (n=0 substrates):
  state in one sentence it is not in the database,
  then speculate briefly prefixed with "Based on known biology:"
```

**Why:** Teaches the model to:

- Be honest about missing data (transparency)
- Still provide value by speculating from general knowledge (utility)
- Use a clear prefix so users know which information is from the database vs. speculation

### Optional: BioChatter RAG Enhancement

If `BIOCHATTER_API_URL` is configured to point to a BioChatter server (not OpenAI), the system appends:

```
## BioChatter Knowledge Sources
You have access to curated biomedical knowledge via BioChatter's RAG pipeline:
- UniProt: Protein sequences, function, disease associations
- Reactome: Signaling pathways and reaction networks
- PhosphoSitePlus: Experimentally-verified phosphorylation sites
- STRING: Protein-protein interaction networks
- KinBase: Comprehensive kinase classification database
- PhosphoELM: Phosphorylation site functional data

## RAG-Enhanced Analysis
When answering questions about specific proteins or pathways,
synthesize information from the above databases. Always indicate
which knowledge source informed your response.
```

**Impact:** This changes the LLM backend from pure generation (OpenAI) to retrieval-augmented generation (BioChatter), which reduces hallucination but requires the BioChatter infrastructure.

---

## Tool System & Function Calling

### Overview: The Agentic Loop

The Vercel AI SDK implements **function calling** — a pattern where:

1. User query → LLM decides: "I need to call a tool"
2. LLM outputs a **tool call** with parameters
3. Server **executes** that tool, gets results
4. Server sends results back to LLM: "Here's what the tool returned"
5. LLM **reasons over results** and updates its response
6. Loop repeats (up to 5 times per message)

This is different from **prompting the model with data upfront**. Instead, the LLM **actively retrieves data on demand**.

### The Five Tools

#### 1. **`analyzeKinase`** — Query KINEPIK Database

**When the AI decides to call it:**

```
User: "Which kinases phosphorylate mTOR?"
→ AI decides: "I need analyzeKinase"
```

**Parameters:**

```typescript
{
  uniprotIds: string[],      // e.g., ["P42345"]  (mTOR)
  cellType?: string,         // "MCF7"
  experimentalCondition?: string  // "rapamycin-treated"
}
```

**What it does:**

```typescript
async function fetchKinaseInfo(uniprotIds: string[]) {
  const ids = uniprotIds.join(",")
  const url =
    `https://kinepik.org/api/0/kinases/specific?kinase_ids=${ids}&phosphosites=targets`

  const res = await fetch(url, { signal, timeout: 10s })
  return res.json()  // Array of KinaseCandidate objects
}
```

**Example response:**

```json
[
  {
    "kinaseName": "AKT1",
    "uniprotId": "P31749",
    "family": "AGC",
    "phosphositeCount": 42,
    "confidence": "high",
    "substrate": "GSK3B, FOXO3, BAD, ...",
    "relatedPathways": ["PI3K/AKT/mTOR signaling"]
  },
  { ... more kinases ... }
]
```

**Key design:** The tool **maps raw API responses** into a standardized `KinaseCandidate` interface so the AI always receives consistent data structure.

---

#### 2. **`analyzeMotif`** — Pattern Matching

**When used:**

```
User: "Does EGFR phosphorylate RRxS motifs?"
→ AI calls analyzeMotif to check
```

**Parameters:**

```typescript
{
  motif: string,      // "RRxS" — regular expression or literal
  kinases?: string[]  // Filter to specific kinases
}
```

**Implementation:**

```typescript
const PHOSPHO_MOTIFS = {
  basophilic: {
    pattern: /R.{2}[ST]/, // Arg at -3 → Ser/Thr at +0
    typicalKinases: ["PKA", "PKB/Akt", "PKC"],
  },
  acidophilic: {
    pattern: /[ST].{2}[DE]/, // Ser/Thr at -3 → Asp/Glu at +0
    typicalKinases: ["CK1", "CK2", "GSK3"],
  },
  prolineDirected: {
    pattern: /[ST]P/, // Ser/Thr at -1 → Pro at 0
    typicalKinases: ["CDK", "MAPK", "GSK3"],
  },
  // ... more patterns
};
```

**Return:** Array of matching `{ motif, typicalKinases, specificity }`

**Design principle:** This is **offline analysis** — no external API call. The data is pre-computed and embedded in the server code. This keeps it fast and doesn't rely on external services.

---

#### 3. **`getKinaseFamily`** — Classification Lookup

**When used:**

```
User: "What's in the AGC family?"
→ AI calls getKinaseFamily("AGC")
```

**Parameters:**

```typescript
{
  family: string; // "AGC", "CAMK", "CK1", "CMGC", "STE", "TK", "TKL"
}
```

**Implementation:**

```typescript
const KINASE_FAMILIES = {
  AGC: ["PKA", "PKB/Akt", "PKC", "PKG", "RSK", "SGK", "PDK1"],
  CAMK: ["CaMK", "DAPK", "MLCK", "MARK", "AMPK"],
  CK1: ["CK1α", "CK1δ", "CK1ε", "CK1γ"],
  // ...
};

export function getKinaseFamilyDescription(family: string): string {
  // Returns: "Named after PKA, PKG, and PKC..."
}

export function getKinaseFamilyFeatures(family: string): string[] {
  // Returns: ["Basophilic substrate preference", "Often regulated by second messengers", ...]
}
```

**Return:**

```json
{
  "family": "AGC",
  "members": ["PKA", "PKB/Akt", "PKC", ...],
  "description": "Named after PKA, PKG, and PKC...",
  "features": ["Basophilic substrate preference", ...]
}
```

**Design:** This is **pure lookup** — no computation or external API. Enables the AI to quickly retrieve classification info.

---

#### 4. **`listPerturbations`** — Perturbation Enumeration

**When used:**

```
User: "Does KINEPIK have data for staurosporine?"
→ AI calls listPerturbations to check
```

**Parameters:**

```typescript
{
  cellType?: string,  // Filter to "MCF7", "NTERA2", or "HL60"
  limit?: number      // Default: 100
}
```

**Purpose:** Returns all perturbations (drugs, gene knockouts, conditions) available in KINEPIK for a given cell type.

**Why it matters:** The system prompt says:

```
Before running KSEA analysis for a specific drug, call listPerturbations
first to confirm the exact perturbation name exists.
```

This prevents the AI from guessing drug names and getting zero results.

---

#### 5. **`getKinaseNetwork`** — Network Visualization

**When used:**

```
User: "Visualize the EGFR signaling network"
→ AI calls getKinaseNetwork(["P00533"], ...)
```

**Parameters:**

```typescript
{
  uniprotIds: string[],    // Query kinases: ["P00533"] (EGFR)
  resolution: "kinases" | "phosphosites",  // "kinases" = high-level overview
  title: string            // "EGFR signaling network"
}
```

**What it does:**

```typescript
async function fetchNetworkData(uniprotIds: string[]) {
  // Query KINEPIK API for kinase-kinase interactions
  const res = await fetch(
    `https://kinepik.org/api/0/network?kinases=${uniprotIds.join(",")}`,
  );

  // Parse response into Cytoscape SIF format
  return {
    nodes: [
      { data: { id: "P00533", label: "EGFR", family: "TK" } },
      { data: { id: "P31749", label: "AKT1", family: "AGC" } },
      // ... more nodes
    ],
    edges: [
      {
        data: {
          source: "P00533",
          target: "P31749",
          interaction: "phosphorylates",
        },
      },
      // ... more edges
    ],
  };
}
```

**Client-side effect:** The `NetworkPanel` component (Cytoscape.js) renders an interactive graph in a side panel.

**Why this design:** Network visualization requires client-side rendering (interactive pan/zoom/click). The tool returns **structured data**, and the client handles **presentation**. This separates concerns:

- **Server:** Data retrieval logic
- **Client:** UI rendering logic

---

### Tool Execution Flow: A Concrete Example

**User query:** "Activate mTOR with EGF and see which kinases increase"

**Server processing:**

```
1. AI reads user message
   → System prompt provides context

2. AI thinks: "I need to:
     - Look up mTOR (P42345)
     - Analyze EGF-stimulated conditions
     - Call analyzeKinase to find upstream activators"

3. AI outputs first tool call:
   tool_name = "analyzeKinase"
   parameters = {
     uniprotIds: ["P42345"],
     cellType: "MCF7",
     experimentalCondition: "EGF-stimulated"
   }

4. Server executes:
   → Fetches https://kinepik.org/api/0/kinases/specific?kinase_ids=P42345&...
   → Returns: [{ kinaseName: "PI3K", ... }, { kinaseName: "PLCγ", ... }, ...]

5. AI receives tool result, incorporates into response:
   "Based on the KINEPIK database, EGF-stimulated mTOR activation
    involves PI3K and PLCγ as upstream kinases..."

6. AI may call another tool:
   tool_name = "getKinaseNetwork"
   parameters = {
     uniprotIds: ["P42336", "P31749", "P42345"],  // PI3K, AKT1, mTOR
     title: "EGF-stimulated PI3K/AKT/mTOR pathway"
   }

7. Network data is sent to client → panel opens
```

**Key insight:** Each tool call is **isolated** — the server executes it, gets results, and passes them back to the LLM. The LLM then **decides what to do next** based on those results. This is fundamentally different from the LLM just reading pre-computed docs.

---

## Data Flow & State Management

### Client-Side State: Zustand Store

```typescript
interface ChatState {
  conversations: Conversation[]; // Multi-turn histories
  activeConversationId: string | null; // Currently selected
  showThinking: boolean; // Reveal reasoning steps?

  // Actions
  createConversation(): string;
  setActiveConversation(id: string): void;
  updateConversation(id: string, messages: StoredMessage[]): void;
  saveNetworkData(id: string, data: NetworkData): void;
  deleteConversation(id: string): void;
  toggleThinking(): void;
  clearMessages(): void;
}
```

**Persistence:** Zustand's `persist` middleware automatically syncs to **localStorage**.

```
localStorage keys:
├─ kinepik-chat-store (JSON dump of entire ChatState)
│  ├─ conversations[0]
│  │  ├─ id: "conv-abc123"
│  │  ├─ title: "mTOR signaling analysis"
│  │  ├─ messages: [
│  │  │  { role: "user", content: "...", parts: [...] },
│  │  │  { role: "assistant", content: "...", parts: [...] }
│  │  │]
│  │  └─ lastNetworkData: { nodes: [...], edges: [...] }
│  │
│  └─ conversations[1]
│     └─ ...
```

**Advantages:**

- User's conversation history persists across page refreshes
- No server-side session DB needed (stateless backend)
- Full conversation context available for new API calls

**Tradeoff:** Each API request sends full history → bandwidth overhead for long conversations.

### Message Format: The Dual Representation

Messages are stored in two formats:

**1. Client storage (Zustand):**

```typescript
interface StoredMessage {
  id: string;
  role: "user" | "assistant";
  content: string; // Plain text
  parts?: { type: "text"; text: string }[]; // Tool results
}
```

**2. AI SDK format (useChat hook):**

```typescript
interface AIMessage {
  id: string
  role: "user" | "assistant"
  content: string
  parts: [
    { type: "text", text: "..." },
    { type: "tool-call", id: "...", toolName: "analyzeKinase", ... },
    { type: "tool-result", id: "...", result: {...} }
  ]
}
```

**Conversion functions:**

```typescript
// Store → AI format
function fromStoredMessages(stored: StoredMessage[]) {
  return stored.map((m) => ({
    id: m.id,
    role: m.role,
    content: m.content,
    parts: m.parts?.length ? m.parts : [{ type: "text", text: m.content }],
  }));
}

// AI format → Store
function toStoredMessages(aiMsgs: AIMessage[]) {
  return aiMsgs
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => {
      const textParts = m.parts.filter((p) => p.type === "text");
      const content = textParts.map((p) => p.text).join("");
      return { id: m.id, role: m.role, content, parts };
    });
}
```

**Why two formats?**

- **Storage format:** Minimal (just text + parts), compresses well
- **AI format:** Rich (includes tool metadata), needed for `streamText()` and rendering

---

### Network Data Flow: From API to Visualization

When `getKinaseNetwork` is called:

```
1. Tool execution (server)
   ├─ Fetch kinase interactions from KINEPIK API
   ├─ Parse response into Cytoscape nodes/edges
   └─ Return { nodes: [...], edges: [...] }

2. Tool result sent to client (via SSE stream)
   └─ Client's useChat hook captures it

3. Extract network data (client)
   ├─ extractNetworkDataFromParts(message.parts)
   └─ Find parts where type = "tool-getKinaseNetwork" && state = "output-available"

4. Save to store
   └─ useChatStore.saveNetworkData(conversationId, networkData)

5. Render (client)
   ├─ <NetworkPanel data={lastNetworkData} />
   └─ Cytoscape.js renders interactive graph in side panel
```

**Design benefit:** The network data is **decoupled** from the text message. The AI can keep talking while the visualization is being rendered. Users can interact with the network while reading the explanation.

---

## Key Design Decisions

### 1. **Stateless Backend**

**Decision:** Backend stores no session data. Full message history sent with each request.

**Rationale:**

- ✅ Scales horizontally (any server can handle any request)
- ✅ No database ops needed for chat (faster)
- ❌ Bandwidth overhead for long conversations
- ❌ User responsible for history management (localStorage)

**Alternative:** Session-based backend with Redis. Trade-off: more complex ops, but better for mobile/unreliable networks.

---

### 2. **Prompt as Law**

**Decision:** System prompt encodes all domain knowledge, validation rules, and response constraints.

**Rationale:**

- ✅ Centralized source of truth (all behavior flows from one file)
- ✅ Easy to audit (what should the AI do? Read the prompt)
- ✅ No code changes needed to adjust AI behavior
- ❌ Prompt is large (~1000 tokens) — costs $$
- ❌ LLM can ignore prompt in unpredictable ways

**Implementation:**

```typescript
// lib/server/prompts.ts — single source of truth
export const SYSTEM_PROMPT = `... entire behavioral spec ...`;

// app/api/chat/route.ts — inject it
streamText({
  system: SYSTEM_PROMPT + serverNote,
  // ... rest of config
});
```

**Best practice:** Version control the prompt like source code. Comment it extensively. Test AI behavior changes.

---

### 3. **Tool Calling Over Context Injection**

**Decision:** Use function calling (agentic loop) instead of pre-computing all data and injecting into context.

**Comparison:**

| Approach                 | Pros                                                                 | Cons                                                                         |
| ------------------------ | -------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| **Function Calling**     | AI decides what data to fetch; responsive; can handle large datasets | Latency (extra round-trips); cost per tool call                              |
| **Pre-computed Context** | Single-request latency; cheaper; predictable                         | Limited to context window; stale data; hallucination from clogging with data |

**Example:** 1000 kinases in KINEPIK.

- **Context injection:** "Here are 1000 kinases..." → 5000 tokens used → context bloat
- **Function calling:** "Query kinases by name" → LLM fetches 5 kinases on demand → 50 tokens

**Chosen:** Function calling (allows scalability).

---

### 4. **Tool Execution Limit: `stopWhen: stepCountIs(5)`**

**Decision:** Max 5 tool calls per message.

**Rationale:**

- Prevents runaway loops (AI calling tools infinitely)
- Limits cost (each tool call = API call + LLM tokens)
- Matches user expectation (messages should arrive in reasonable time)

**Example:**

```
User: "Analyze all kinases"
→ AI calls analyzeKinase 5 times, then stops
→ Returns: "Here are the first 5 kinase families. For a complete analysis..."
```

**Cost implication:** If each tool call = $0.001 and each response = 100 tokens = $0.01, then 5 tool calls = ~$0.06 per message.

---

### 5. **Cytoscape for Network Visualization**

**Decision:** Use Cytoscape.js (WebGL-based graph library) for interactive networks.

**Rationale:**

- ✅ Handles 100+ nodes at 60 FPS
- ✅ Built-in physics simulation (force-directed layout)
- ✅ Rich interactions (drag, zoom, click)
- ✅ Large plugin ecosystem
- ❌ Large bundle size (~500KB)
- ❌ Steep learning curve for styling

**Alternative:** D3.js (more flexible but slower for large graphs), Vis.js (simpler but less powerful).

**Design:** Cytoscape runs in side panel; doesn't block chat. Users can interact with network while reading text.

---

## Knowledge Integration Strategy

### Layer 1: Hardcoded Ground Truth

```typescript
// lib/server/kinepik-engine.ts
export const KINASE_FAMILIES = {
  AGC: ["PKA", "PKB/Akt", "PKC", "PKG", "RSK", "SGK", "PDK1"],
  CAMK: ["CaMK", "DAPK", "MLCK", "MARK", "AMPK"],
  // ... exact, canonical data
}

export const PHOSPHO_MOTIFS = {
  basophilic: { pattern: /R.{2}[ST]/, ... },
  // ... precompiled regex patterns
}
```

**When to use:** Stable, curated data that never changes (kinase families, motif patterns).

**Advantage:** No external API call; instant execution.

---

### Layer 2: Live API Queries

```typescript
// tools/analyze-kinase.ts
const KINEPIK_API = "https://kinepik.org/api/0";

async function fetchKinaseInfo(uniprotIds: string[]) {
  const res = await fetch(
    `${KINEPIK_API}/kinases/specific?kinase_ids=${ids}&...`,
  );
  return res.json();
}
```

**When to use:** Experimental data, KSEA scores, perturbation results (changes frequently).

**Advantage:** Always current; leverages live database.

**Disadvantage:** External dependency; network latency; data validation needed.

---

### Layer 3: LLM Knowledge (Generative)

```
User: "Is mTOR involved in muscle growth?"
→ AI answers from its training data (no tool needed)
→ Response: "Yes, mTOR is a central regulator of muscle protein synthesis..."
```

**When to use:** General biology knowledge; mechanisms; literature synthesis.

**Advantage:** Fast (no tool call); doesn't require specific data.

**Disadvantage:** Can hallucinate; may be outdated; no ground truth.

---

### Layer 4: BioChatter RAG (Optional)

If `BIOCHATTER_API_URL` is set:

```
System message includes:
"You have access to curated biomedical knowledge via BioChatter's
RAG pipeline:
- UniProt: Protein sequences, function, disease associations
- Reactome: Signaling pathways and reaction networks
- PhosphoSitePlus: Experimentally-verified phosphorylation sites
- STRING: Protein-protein interaction networks
- KinBase: Comprehensive kinase classification database
- PhosphoELM: Phosphorylation site functional data"
```

**How it works:**

1. User query → sent to BioChatter server instead of OpenAI
2. BioChatter **retrieves** relevant docs from knowledge bases
3. BioChatter **augments** the LLM's response with citations
4. User gets cited sources (e.g., "From UniProt: ...")

**Advantage:** Reduces hallucination; grounds responses in curated knowledge.

**Disadvantage:** Requires BioChatter infrastructure; slower (retrieval overhead).

---

### Conflict Resolution: Which Source Wins?

**Priority order:**

1. **Live KINEPIK API** (when called via tool) — highest authority
2. **Hardcoded ground truth** (KINASE_FAMILIES, motifs) — second
3. **BioChatter RAG** (if configured) — third
4. **LLM knowledge** (from training) — lowest

**Example:**

```
User: "Is AKT1 in the AGC family?"

Check 1: Look up AKT1 in KINASE_FAMILIES (hardcoded)
→ KINASE_FAMILIES.AGC includes "PKB/Akt" (yes!)

Check 2: If not found, call analyzeKinase tool
→ Queries live KINEPIK API
→ Gets family from API response

Check 3: If API unavailable, use LLM knowledge
→ "Based on known biology: Yes, AKT1 is AGC-family..."
```

The system **cascades** — try the most reliable source first, fall back to less reliable if unavailable.

---

### Error Handling & Fallback Responses

**Scenario 1: KINEPIK API timeout**

```typescript
if (!res.ok) {
  throw new Error(`KINEPIK /kinases/specific returned ${res.status}`);
}
// Tool error caught by Vercel AI SDK
// LLM receives: "Tool failed: KINEPIK API unreachable"
// LLM response: "Based on known biology: [speculation without data]"
```

**Scenario 2: Invalid UniProt ID**

```typescript
// User asks: "Is EGFR_WRONG a kinase?"
// LLM has typo in ID
// Tool executes: fetch(".../kinases/specific?kinase_ids=EGFR_WRONG")
// Result: [] (empty)
// LLM sees: "No kinases found"
// LLM response: "I am not certain of the UniProt ID for EGFR_WRONG"
```

**Scenario 3: Demo Mode (no API key)**

```typescript
if (DEMO_MODE === "true") {
  // Return canned response
  return createUIMessageStream({
    execute: ({ writer }) => {
      writer.write({ type: "text-start", id });
      writer.write({
        type: "text-delta",
        delta: "To enable responses, add OPENAI_API_KEY to .env.local",
      });
      writer.write({ type: "text-end", id });
    },
  });
}
```

**Design principle:** Failures are **transparent** — the system always returns a response, but may disclose uncertainty.

---

## Session Workflow: A Complete Example

### Scenario: Graduate Student Analyzing Phosphoproteomics Experiment

**Setup:**

- Student has mass spec data: phosphosites in HeLa cells treated with Erlotinib (EGFR inhibitor)
- Question: Which kinases are probably responsible?

### Message 1: Initial Query

**Student sends:**

```
"I found these phosphosites downregulated by Erlotinib in HeLa:
S123 on mTOR, T456 on AKT, Y789 on GSK3B.
Which upstream kinases might these be from?"
```

**Backend processing:**

1. System prompt injected (domain knowledge)
2. LLM analyzes query
3. LLM decides: "These are tyrosine/serine phosphosites. Erlotinib targets EGFR.
   I should analyze EGFR signaling cascades."
4. LLM calls `analyzeKinase` with:
   ```
   uniprotIds: ["P00533"],  // EGFR
   cellType: "HeLa",
   experimentalCondition: "Erlotinib-treated"
   ```
5. Tool executes, returns: `{ kinaseName: "EGFR", family: "TK", ... }`
6. LLM calls `getKinaseNetwork`:
   ```
   uniprotIds: ["P00533", "P31749", "P42345"],  // EGFR, AKT1, mTOR
   title: "EGFR/AKT/mTOR signaling"
   ```
7. Network data sent to client → Cytoscape panel opens

**LLM response:**

```
The Erlotinib-downregulated phosphosites suggest inhibition of EGFR
signaling cascade. Based on the KINEPIK database:

- mTOR S123: Likely from PI3K/AKT pathway (z-score: -3.2, p < 0.001, n=42)
- AKT T456: Direct EGFR substrate or via downstream PKA (z-score: -2.8, p < 0.01, n=35)
- GSK3B Y789: Less likely direct target; possible feedback via Wnt pathway

The network panel shows EGFR as hub. Erlotinib blocks EGFR autophosphorylation
→ reduced PI3K recruitment → decreased AKT and mTOR activity.
```

**Client-side:** Message displays with network panel on the right. Student can click nodes to explore.

### Message 2: Follow-up

**Student sends:**

```
"Can you check if Staurosporine has data on these sites in MCF7?"
```

**Backend processing:**

1. LLM decides: "User wants to compare a different drug and cell line.
   I should check what perturbations are available first."
2. Calls `listPerturbations`:
   ```
   cellType: "MCF7"
   ```
3. Tool returns: `["Rapamycin", "PD98059", "U0126", "Staurosporine", ...]`
4. LLM confirms Staurosporine exists
5. Calls `analyzeKinase`:
   ```
   uniprotIds: ["P42345", "P31749", "P00533"],  // mTOR, AKT1, EGFR
   cellType: "MCF7",
   experimentalCondition: "Staurosporine-treated"
   ```
6. Gets results → compares to Erlotinib results

**LLM response:**

```
In MCF7 cells, Staurosporine (a pan-kinase inhibitor) shows broader
effects than Erlotinib:

| Site | Erlotinib (HeLa) | Staurosporine (MCF7) |
|------|-----------------|----------------------|
| mTOR S123 | z = -3.2 | z = -4.1 (p < 0.001) |
| AKT T456 | z = -2.8 | z = -5.2 (p < 0.001) |

The stronger MCF7 response likely reflects:
1. MCF7 is estrogen-responsive (different pathway context)
2. Staurosporine's broad kinase inhibition (EGFR + off-targets)
```

### Message 3: Visualization Request

**Student sends:**

```
"Show me the entire PI3K/AKT/mTOR pathway network"
```

**Backend processing:**

1. LLM recognizes request: "Visualize, show, display" → trigger `getKinaseNetwork`
2. LLM decides on comprehensive kinase set:
   ```
   uniprotIds: [
     "P42336",  // PI3K
     "O15530",  // PDK1
     "P31749",  // AKT1
     "P31751",  // AKT2
     "Q9Y243",  // AKT3
     "P42345",  // mTOR
     "Q13541",  // 4EBP1
     "P23443",  // S6K1
     "P40763",  // STAT3
     "P00533"   // EGFR
   ],
   resolution: "kinases",  // High-level overview
   title: "PI3K/AKT/mTOR pathway"
   ```
3. Server fetches network from KINEPIK API
4. Cytoscape renders: ~10 nodes, ~15 edges, force-directed layout

**LLM response:**

```
The network panel now displays the full PI3K/AKT/mTOR signaling cascade.
Key observations:

- AKT is the hub (3 incoming edges: PDK1, PIP3, PTEN antagonism)
- mTOR branches into TORC1 (S6K → protein synthesis) and TORC2 (AKT feedback)
- GSK3B downstream of AKT (proline-directed, inhibitory)

Erlotinib blocks EGFR recruitment of PI3K → reduced AKT phosphorylation
→ disinhibition of GSK3B.
```

**Student can now:** Drag nodes, expand neighborhoods, click for details, take screenshot for presentation.

---

## Summary: The Architecture in Three Sentences

**KINEPIK is a stateless agentic system** where the frontend sends full conversation history to the backend's `/api/chat` endpoint. **The backend uses a system prompt to teach the LLM domain knowledge, then the LLM actively retrieves data on-demand via five kinase-specific tools**, each calling the KINEPIK API or computing locally. **Results are streamed back as Server-Sent Events, with message history and network data persisted to localStorage for multi-turn analysis and interactive visualization.**

---

## Further Reading

- **Vercel AI SDK Docs:** https://sdk.vercel.ai/docs/ai-core/overview
- **LLM Function Calling Pattern:** https://openai.com/blog/function-calling-and-other-api-updates
- **BioChatter Documentation:** https://biochatter.org/
- **KINEPIK Database:** https://kinepik.org
- **Cytoscape.js:** https://js.cytoscape.org/
