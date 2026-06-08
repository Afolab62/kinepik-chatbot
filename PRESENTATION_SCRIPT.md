# KINEPIK Chatbot: Presentation Script

**Master's level technical presentation (15-20 minutes)**

---

## Opening Slide

**Title:** "KINEPIK: An AI-Powered Phosphoproteomics Analysis Platform"

**Presenter notes:**
"Today I'm going to walk you through how we built an AI chatbot that understands kinase biology and can query a live database in real-time. This is a full-stack system combining React, Node.js, OpenAI, and a specialized bioinformatics database. By the end, you'll understand:

1. How the frontend and backend communicate
2. How we use prompt engineering to control AI behavior
3. How the AI uses tools to retrieve live data
4. Why certain architectural decisions were made

Let's start with the big picture."

---

## Slide 1: The Problem We're Solving

**Talking points:**

- Phosphoproteomics generates thousands of phosphorylation sites from mass spectrometry
- Biologists need to identify which kinases are responsible for phosphorylating these sites
- Current workflow: manually search databases, read papers, interpret motifs — takes hours
- We automated this with AI that has live access to the KINEPIK database

**Key insight:** "We're not replacing domain expertise; we're augmenting it with AI that can reason over data at scale."

---

## Slide 2: System Architecture Overview

**Show diagram from ARCHITECTURE.md**

**Talking points:**
"This system has three main pieces:

1. **Frontend (React/Next.js)** — User types queries into a chat interface. The UI streams responses in real-time and can display interactive network visualizations.

2. **Backend (Node.js/Next.js)** — Receives messages, validates them, calls an LLM (OpenAI or BioChatter), and manages tool execution.

3. **Data Sources** — Two types:
   - Live API (kinepik.org) for experimental data
   - Hardcoded knowledge (kinase families, motif patterns) for instant lookup

The key: **the backend is stateless**. It doesn't store conversations on the server. Instead, the client sends the full message history with every request. This is stateless scaling — any server can handle any request."

---

## Slide 3: The Request-Response Cycle

**Talking points:**
"Let's trace what happens when a user types a query.

**Step 1: Client submits**

- User types: 'Why does mTOR decrease with Rapamycin?'
- React component calls the `/api/chat` endpoint
- Sends: `{ messages: [previous_messages, new_message] }`

**Step 2: Server receives**

- Validates API key (OpenAI)
- Injects system prompt into the message stream
- System prompt teaches the LLM about kinase biology, database contents, and tools

**Step 3: LLM decides**

- LLM reads the query + system prompt
- Thinks: 'I need to query the database to answer this'
- Decides which tool to call: `analyzeKinase`

**Step 4: Tool execution**

- Server executes the tool
- Makes an HTTP call to kinepik.org/api/0
- Gets back real kinase data

**Step 5: Streaming response**

- Server sends results back via Server-Sent Events (SSE)
- Frontend receives stream of deltas: 'The', ' database', ' shows...'
- UI updates in real-time without waiting for full response

**Step 6: Persistence**

- Once message finishes, it's saved to browser localStorage
- User can close tab, come back later, see full history"

---

## Slide 4: Prompt Engineering — Teaching the AI

**Talking points:**
"The system prompt is about 1000 tokens.

Here's what we teach the LLM:

**Identity:**
'You are KINEPIK Assistant, specialized in kinase identification and phosphoproteomics analysis.'

This grounds the model's identity. Without it, the LLM might act like a general chatbot.

**Domain Knowledge:**
'KINEPIK contains kinase-phosphosite interactions, KSEA scores, experimental perturbation data across MCF7, NTERA2, and HL60 cell lines.'

This teaches the LLM what data is available and where to find it.

**UniProt ID Mappings:**
'EGFR = P00533, mTOR = P42345, AKT1 = P31749, ...'

Why? Because the tools require UniProt IDs. Without this, the LLM would guess or hallucinate IDs. By pre-teaching correct mappings, we anchor it to ground truth.

**Tool Documentation:**
'Before running KSEA analysis, call listPerturbations first to confirm the drug name exists.'

This teaches the LLM _when_ and _how_ to use tools safely.

**Response Style:**
'Never say the database returned X. Present findings as scientific observations.'

This prevents the AI from breaking the fourth wall.

**KSEA Score Interpretation:**
'z-score > 2 means strongly activated (high confidence)'

This prevents the AI from misinterpreting statistics.

The result? The LLM behaves predictably and scientifically."

---

## Slide 5: The Five Tools

**Talking points:**
"The LLM has access to five tools. Each solves a different problem.

**Tool 1: analyzeKinase**

- What it does: Queries the live KINEPIK API
- Parameters: UniProt IDs, cell type, experimental condition
- Returns: Real kinase-phosphosite interactions with KSEA z-scores
- Why it matters: Gives the AI ground truth about which kinases phosphorylate what

Example:

```
LLM calls: analyzeKinase(uniprotIds=['P42345'], cellType='MCF7', condition='Rapamycin')
Result: { kinaseName: 'mTOR', phosphosites: ['AKT_S123', 'GSK3_T456'], ... }
LLM interprets: 'mTOR is inhibited by Rapamycin'
```

**Tool 2: analyzeMotif**

- What it does: Pattern-matches phospho site sequences
- Parameters: Motif (regex) like 'RRxS'
- Returns: Matching kinase families and their typical substrates
- Why it matters: Offline analysis (no API call), instant

The motif patterns are hardcoded:

- Basophilic: `R.{2}[ST]` → PKA, PKB/Akt, PKC
- Acidophilic: `[ST].{2}[DE]` → CK1, CK2, GSK3
- Proline-directed: `[ST]P` → CDK, MAPK, GSK3

**Tool 3: getKinaseFamily**

- What it does: Looks up kinase family information
- Parameters: Family name ('AGC', 'CAMK', 'TK', etc.)
- Returns: Members, description, features
- Why it matters: Answers classification questions instantly

**Tool 4: listPerturbations**

- What it does: Enumerates all available drugs/conditions in the database
- Parameters: Optional cell type filter
- Returns: List of perturbation names (case-sensitive!)
- Why it matters: Prevents the LLM from guessing drug names and getting zero results

Example workflow:

```
User: 'Is staurosporine in the database?'
LLM calls: listPerturbations(cellType='MCF7')
Result: ['Rapamycin', 'PD98059', 'Staurosporine', ...]
LLM confirms: 'Yes, Staurosporine is available in MCF7'
```

**Tool 5: getKinaseNetwork**

- What it does: Retrieves kinase interaction networks for visualization
- Parameters: UniProt IDs, resolution ('kinases' or 'phosphosites'), title
- Returns: Nodes and edges in Cytoscape format
- Why it matters: Enables interactive network visualization

This is special because it has a client-side component:

```
Server: Calls tool, gets network data
Client: Receives data → Cytoscape renders interactive graph in side panel
User: Can drag nodes, zoom, click for details, take screenshot
```

So the five tools together give the LLM:

- Real-time data access (analyzeKinase)
- Pattern matching (analyzeMotif)
- Classification (getKinaseFamily)
- Data validation (listPerturbations)
- Visualization capability (getKinaseNetwork)"

---

## Slide 6: The Agentic Loop — Function Calling

**Talking points:**
"The LLM doesn't just read data upfront. It actively decides _when_ to retrieve data, like a researcher calling a database query.

This is called the 'agentic loop' or 'function calling'.

Let's trace through a real example:

**User query:** 'Which kinases are inhibited by Erlotinib in HeLa cells?'

**LLM thinks:**

- Erlotinib is a tyrosine kinase inhibitor
- It blocks EGFR signaling
- I should query the database for EGFR (P00533) in HeLa cells

**LLM output:**

- 'I'll query the KINEPIK database for Erlotinib-treated HeLa data'
- Calls tool: `analyzeKinase(uniprotIds=['P00533'], cellType='HeLa', condition='Erlotinib')`

**Server:**

- Executes: `fetch(https://kinepik.org/api/0/kinases/specific?...)`
- Gets back: Real data (z-scores, p-values, substrate counts)

**LLM receives result:**

- Data comes back: 'EGFR phosphorylates AKT (z=-3.2), mTOR (z=-2.8), ...'
- LLM interprets: 'Erlotinib strongly inhibits the PI3K/AKT/mTOR pathway'
- LLM continues reasoning: 'Should I visualize this network?'

**LLM decides:**

- User might want to see the pathway
- Calls: `getKinaseNetwork(uniprotIds=['P00533', 'P31749', 'P42345'], title='...network')`

**Server:**

- Executes tool, returns network data
- Sends to client

**Client:**

- Cytoscape renders the network
- User sees interactive visualization

**Why this is better than pre-computing data:**

- LLM decides what data to fetch based on the query
- No token bloat (if we listed all 1000 kinases upfront = wasted context)
- Scalable (can handle arbitrarily large datasets)
- Real-time (always gets latest data)

**Constraints:**

- Max 5 tool calls per response (prevents infinite loops, controls cost)
- Timeout on each tool call (10 seconds)
- Server validates all tool calls before execution"

---

## Slide 7: Prompt vs. Data — Which is More Important?

**Talking points:**
"This is a key architectural insight: **the system prompt is the primary control mechanism.**

Why?

**With a good system prompt, the LLM behaves predictably:**

- It knows what data is available
- It knows which tool to use when
- It interprets results correctly
- It doesn't hallucinate

**Without a system prompt, the LLM would:**

- Guess about data sources
- Make up tool calls that don't exist
- Misinterpret statistics
- Confidently give wrong answers

Example: If we didn't tell the LLM that UniProt IDs exist, how would it know?

- EGFR could be 'P00533' or 'EGFR_HUMAN' or '1956 (NCBI gene ID)'
- LLM guesses and gets it wrong
- Tool returns zero results
- LLM hallucination: 'No EGFR data available'

But if we tell the LLM 'EGFR = P00533', it calls the right ID.

**So the flow is:**

1. System prompt teaches knowledge
2. Tools retrieve live data
3. LLM combines both to give accurate answers

**Cost implication:**

- System prompt costs ~0.01 cents (1000 tokens)
- Each tool call costs ~0.01 cents
- Result is reliable and up-to-date"

---

## Slide 8: Client-Side State Management

**Talking points:**
"The frontend uses Zustand (a lightweight state manager) to persist conversations.

**Why not just keep messages in React state?**

- If the user refreshes the page, messages disappear
- If the browser crashes, conversation is lost

**So we use localStorage:**

```
localStorage.kinepik-chat-store = {
  conversations: [
    {
      id: 'conv-123',
      title: 'mTOR signaling analysis',
      messages: [
        { role: 'user', content: '...', parts: [...] },
        { role: 'assistant', content: '...', parts: [...] }
      ],
      lastNetworkData: { nodes: [...], edges: [...] }
    }
  ],
  activeConversationId: 'conv-123',
  showThinking: true
}
```

**Benefits:**

- Conversations survive page refresh
- Multiple conversations (sidebar shows history)
- Network data from last query is preserved (can re-render network)
- No server needed for persistence

**How it works with the stateless backend:**

1. User starts conversation in browser
2. LocalStorage stores it
3. Each API call sends full message history
4. Server doesn't store anything
5. Response comes back, client updates localStorage
6. If user closes browser and comes back later, full history is there

This is a clean separation:

- Server handles LLM logic and tools
- Client handles UI and persistence"

---

## Slide 9: The Network Visualization

**Talking points:**
"One of the cool features is interactive network visualization using Cytoscape.js.

**How it works:**

1. User says 'Show me the EGFR pathway'
2. LLM calls getKinaseNetwork with relevant kinases
3. Server queries KINEPIK API for kinase-kinase interactions
4. Server returns data in Cytoscape format:

```json
{
  nodes: [
    { data: { id: 'P00533', label: 'EGFR', family: 'TK' } },
    { data: { id: 'P31749', label: 'AKT1', family: 'AGC' } },
    ...
  ],
  edges: [
    { data: { source: 'P00533', target: 'P31749', interaction: 'phosphorylates' } },
    ...
  ]
}
```

5. Client-side Cytoscape renders graph with:
   - Force-directed layout (nodes repel each other naturally)
   - Color coding by family (AGC = blue, TK = red, etc.)
   - Drag to reposition, scroll to zoom, click for details

**Why this design?**

- Network rendering is expensive (GPU-intensive)
- Server does data retrieval, client does rendering
- Users can interact with network while reading explanation
- Can save/screenshot the visualization

**Performance:**

- Works smoothly with 50-100 kinases
- Force-directed simulation runs at 60 FPS on modern browsers"

---

## Slide 10: Error Handling & Fallback Behavior

**Talking points:**
"What happens when things break?

**Scenario 1: KINEPIK API timeout**

```
LLM calls: analyzeKinase(uniprotIds=['P42345'])
Server tries: fetch(https://kinepik.org/api/0/...)
Result: Timeout after 10 seconds
Server sends to LLM: 'Tool failed: API unreachable'
LLM responds: 'Based on known biology: mTOR is a central regulator
of protein synthesis, typically active in growing cells...'
```

User sees honest communication about data availability.

**Scenario 2: Invalid UniProt ID**

```
LLM (confident): 'Let me look up EGFR_WRONG'
Server queries: kinepik.org/api?kinase_ids=EGFR_WRONG
Result: [] (empty list)
LLM sees: 'No kinases found'
LLM responds: 'I am not certain of the UniProt ID for EGFR_WRONG'
```

This prevents hallucination from wrong IDs silently returning no results.

**Scenario 3: No API key configured**

- Demo mode engages
- Returns canned response: 'To enable responses, add OPENAI_API_KEY to .env.local'
- Educates user how to fix it

**Scenario 4: BioChatter server unavailable**

- Falls back to direct OpenAI call
- No RAG enhancement, but system still works
- Graceful degradation

**Design principle:**

- Failures are transparent (not hidden)
- System always returns a response
- Users understand what data is real vs. speculative"

---

## Slide 11: System Prompt Layers

**Talking points:**
"The system prompt is layered based on configuration.

**Base layer (always present):**

```
You are KINEPIK Assistant.
Capabilities: analyzeKinase, analyzeMotif, getKinaseFamily, listPerturbations, getKinaseNetwork
Database contents: [list of cell lines, datasets, kinase families]
UniProt ID mappings: EGFR=P00533, mTOR=P42345, ...
Response constraints: [avoid meta-language, interpret KSEA scores correctly]
```

**Optional layer (if BioChatter configured):**

```
You have access to curated biomedical knowledge via BioChatter RAG:
- UniProt: Protein sequences and function
- Reactome: Signaling pathways
- PhosphoSitePlus: Experimentally-verified sites
- STRING: Protein interactions
- KinBase: Kinase classification
- PhosphoELM: Phosphorylation functional data

When answering about specific proteins or pathways,
synthesize from these databases and cite sources.
```

**Impact:**

- Without BioChatter: Pure generation from LLM training data
- With BioChatter: Retrieval-augmented generation (RAG) with citations
- Reduces hallucination, increases trustworthiness

**Trade-off:**

- Without: Cheaper, faster, simpler infrastructure
- With: Requires BioChatter server, slower, but more accurate"

---

## Slide 12: Knowledge Integration Strategy

**Talking points:**
"The system pulls knowledge from four layers, in priority order:

**Layer 1: Live KINEPIK API** (Highest authority)

- Real experimental data
- KSEA scores, z-scores, p-values, n counts
- Perturbation effects
- Kinase-phosphosite interactions
- When available: This is the answer

Example: 'Why does mTOR decrease with Rapamycin?'
→ System calls analyzeKinase(P42345, 'Rapamycin')
→ Gets real z-score: -3.2 (p < 0.001, n=42)
→ Reports: 'KINEPIK database shows strongly inhibited (z = -3.2)'

**Layer 2: Hardcoded ground truth** (Second priority)

- KINASE_FAMILIES (AGC, CMGC, STE, TK, TKL, CAMK, CK1, OTHER)
- PHOSPHO_MOTIFS (basophilic, acidophilic, proline-directed, tyrosine kinase)
- Kinase descriptions and features
- Pre-compiled regex patterns
- When Layer 1 unavailable: Use this

Example: 'What's in the AGC family?'
→ No API call needed
→ Returns: ['PKA', 'PKB/Akt', 'PKC', ...] instantly

**Layer 3: BioChatter RAG** (Third priority, if configured)

- Curated knowledge graphs from UniProt, Reactome, STRING, etc.
- Reduces hallucination vs. pure LLM
- When Layers 1 & 2 don't fully answer the question

Example: 'How do kinases promote cell survival?'
→ BioChatter retrieves pathway data from Reactome
→ Returns: 'From Reactome [pathway]: Kinases phosphorylate pro-apoptotic proteins...'

**Layer 4: LLM Knowledge** (Lowest authority)

- Trained on biomedical literature
- Good for synthesis and explanation
- Can hallucinate
- When no other source available

Example: 'Tell me about the Wnt pathway'
→ Layers 1-3 don't have specific data
→ LLM uses training: 'Wnt signaling involves GSK3 inhibition...'
→ But prefixed with: 'Based on known biology:'

**The cascade:**

```
if (liveDataAvailable) return liveData
else if (hardcodedDataAvailable) return hardcodedData
else if (BioChatterAvailable) return retrieverData
else return llmKnowledge (with caveat)
```

This ensures accuracy at every level."

---

## Slide 13: Cost Analysis

**Talking points:**
"How much does this system cost to run?

**Per-message breakdown:**

1. **LLM call (streamText):**
   - Typical message: ~200 input tokens + 300 output tokens
   - OpenAI pricing (gpt-4-turbo): ~$0.01 input + ~$0.03 output = $0.04/message

2. **Tool calls (5 max per response):**
   - Each analyzeKinase call: ~0.001 (external API, no LLM cost)
   - Each getKinaseNetwork call: ~0.001
   - 5 tools × $0.001 = $0.005/message

3. **Total per message:** ~$0.05

**Monthly estimate (assuming 100 users, 10 messages/user/day):**

```
100 users × 10 messages × 30 days × $0.05 = $1,500/month
```

**Ways to reduce cost:**

- Use cheaper LLM (gpt-4-mini: ~$0.01/message)
- Cache repeated prompts (same system prompt every request)
- Batch tool calls (one API call for multiple kinases)
- Use BioChatter self-hosted instead of OpenAI

**Comparison:**

- $1,500/month for AI-powered tool
- vs. hiring 1 bioinformatician: $5,000-8,000/month
- vs. commercial databases: $200-500/month (but less powerful)

The AI system is cost-effective for organizations doing lots of kinase analysis."

---

## Slide 14: Why This Architecture?

**Talking points:**
"Let me explain the key architectural decisions and trade-offs.

**Decision 1: Stateless Backend**

Why?

- Scales horizontally (any server handles any request)
- No database dependency (faster development)
- Deployment flexibility (Docker, serverless, etc.)

Trade-off?

- Each request sends full message history (bandwidth)
- Conversation history lives on client only (user must not lose localStorage)

Alternative: Session-based backend with Redis

- Would be better for mobile (unreliable networks)
- But adds operational complexity

**Decision 2: Full History Sent per Request**

Why?

- Simple implementation (no server state)
- Works with stateless scaling
- Each request is independent

Trade-off?

- Token usage increases with conversation length (costs more)
- Bandwidth overhead for long chats

Alternative: Maintain server-side session

- Cheaper (only send last message)
- But requires database, session management, etc.

**Decision 3: Function Calling (Agentic Loop)**

Why?

- LLM decides what data to fetch (relevant only)
- Scales to large datasets (1000s of kinases)
- Reduces token bloat (vs. pre-computing all data)

Trade-off?

- Latency (extra round-trips)
- Cost per tool call

Alternative: Pre-compute all data, inject into context

- Single-request latency
- But context bloat, stale data, hallucination

**Decision 4: System Prompt as Law**

Why?

- Centralized source of truth
- Easy to audit AI behavior
- No code changes needed to adjust behavior

Trade-off?

- Prompt is large (~1000 tokens, costs per request)
- LLM can ignore prompt unpredictably

Alternative: Fine-tune model

- Better control, but expensive ($$$)
- Hard to iterate

**Overall philosophy:**
'Simplicity with constraints.' Build the simplest system that works, enforce correctness through prompts and validation, optimize later if needed."

---

## Slide 15: Demo Walk-Through

**Talking points (live or recorded demo):**

**Scenario: Analyzing a phosphoproteomics experiment**

"Let me show you how this works in practice.

[User types into chat:]
'I have phosphoproteomics data from MCF7 cells treated with Rapamycin.
I see downregulated phosphorylation at multiple sites on mTOR and AKT.
Which kinases are involved?'

[System response streams in real-time:]

'I'll query the KINEPIK database for Rapamycin-treated MCF7 data...'

[Tool call 1: analyzeKinase]
'mTOR phosphorylation: KINEPIK shows z-score = -4.1 (p < 0.001, n=47).
This indicates strong mTOR inhibition.

AKT phosphorylation: z-score = -3.8 (p < 0.001, n=52).
Also strongly inhibited.

[Tool call 2: getKinaseNetwork]
'Let me visualize the upstream pathway for you...'

[Cytoscape network appears in side panel showing:]

- EGFR → PI3K → AKT → mTOR pathway
- Rapamycin directly targets mTOR (highlighted)
- Secondary effects on AKT through feedback inhibition

Biological interpretation:
'Rapamycin directly inhibits mTOR kinase activity. This prevents
mTOR from phosphorylating its substrates (S6K1, 4EBP1, etc.).
The secondary AKT inhibition occurs through loss of mTORC2 signaling,
which normally phosphorylates and activates AKT.'

[Tool call 3: analyzeMotif]
'The phosphosites you mentioned match multiple kinase motifs:

- S/T-P sites: CDK or MAPK targeted
- Basic context: PKA, PKB/Akt, PKC targeted

Given the Rapamycin context, most likely: AKT and mTOR as the direct kinases.'

The system has now:
✅ Queried live data
✅ Identified candidate kinases
✅ Showed the pathway
✅ Interpreted motifs
All in < 10 seconds, with uncertainty properly communicated."

---

## Slide 16: Future Work & Extensions

**Talking points:**
"What could we add next?

**Near-term:**

- Inhibitor selectivity profiles (which drugs hit which kinases)
- Pathway enrichment analysis (which signaling modules are active)
- Multi-omics integration (proteomics + phosphoproteomics + RNA-seq)

**Medium-term:**

- Model fine-tuning on kinase literature
- Integration with drug screening databases
- Collaborative analysis (shared workspaces)

**Long-term:**

- Hypothesis generation (AI suggests experiments)
- Prediction of off-target effects
- Integration with CRISPR screening data

**Technical improvements:**

- Caching (same queries shouldn't call API twice)
- Streaming tool calls (don't wait for one tool to finish before starting next)
- Custom model fine-tuning on kinase QA pairs

**Deployment:**

- Mobile app (React Native)
- Integration with lab software (MaxQuant, Skyline)
- Commercial version with premium data sources"

---

## Slide 17: Key Takeaways

**Talking points:**
"Let me summarize the key insights:

1. **System prompt is the control mechanism** — tells the LLM what to do, when to use tools, how to interpret results

2. **Function calling (agentic loop) enables scalability** — LLM fetches only relevant data on-demand, not all data upfront

3. **Layered knowledge sources** — live data > hardcoded truth > RAG > LLM knowledge, with graceful fallback

4. **Stateless architecture** — each request is independent, scales horizontally, no session management

5. **Separation of concerns** — server handles LLM and data logic, client handles UI and persistence

6. **Cost-effective** — ~$0.05/message, competitive with hiring domain experts

7. **Transparent errors** — system honest about what data is available vs. speculative

The result: an AI system that doesn't just generate text, but actively retrieves and reasons over real experimental data."

---

## Slide 18: Q&A

**Potential questions and answers:**

**Q: Could the LLM just hallucinate data?**
A: Yes, if we didn't tell it about ground truth. That's why the system prompt teaches exact UniProt IDs, KSEA score interpretation, available cell lines, etc. Tool errors are transparent — if a query returns zero results, the LLM sees that and adjusts. By layering live API data > hardcoded truth > speculation, we minimize hallucination.

**Q: Why not just use ChatGPT directly?**
A: ChatGPT doesn't have access to KINEPIK data, can't make domain-specific tool calls, and would hallucinate about kinase biology. Our system adds: (1) real-time data access, (2) specialized tools, (3) response validation, (4) domain-specific prompting.

**Q: How do you handle model updates (OpenAI releases new model)?**
A: We change one line: `model: getBiochatterModel()` → `model: getBiochatterProvider('gpt-5')`. No code changes needed. Backward compatible.

**Q: What happens if KINEPIK API goes down?**
A: System degrades gracefully. LLM sees tool error, returns speculation prefixed with 'Based on known biology:' (transparent). System still useful, just less authoritative.

**Q: Can users trust the AI's answers?**
A: Only trust it as far as the data sources. If it cites KINEPIK database (z-score, p-value, n count), that's real experimental data. If it says 'Based on known biology:', it's speculating from training data. We're explicit about this distinction.

**Q: How does this compare to GPT's plugins?**
A: Similar concept (tools), but: (1) our tools are specialized for kinase biology, (2) we control the system prompt completely, (3) we can add our own validation logic, (4) we host everything (privacy).

**Q: What's the most expensive part?**
A: LLM inference (OpenAI API calls). Tools (API calls to KINEPIK) are cheap. At scale, main cost is streaming tokens. Mitigation: use cheaper model (gpt-4-mini), cache repeated prompts, batch requests."

---

## Closing Slide

**Talking points:**
"To wrap up: KINEPIK is an example of how to build production AI systems that combine:

- Specialized domain knowledge (kinase biology)
- Live data access (real databases)
- User-friendly interface (chat)
- Transparent reasoning (show your work)

The architecture principles apply beyond biology:

- Any domain + any database + any LLM

If you're building AI systems, remember:

1. Prompt engineering is architecture
2. Function calling beats context bloat
3. Live data > hallucinated data
4. Transparency builds trust

Thanks for listening. Questions?"

---

## Appendix: Technical References

**Key files in the codebase:**

- `app/api/chat/route.ts` — Main orchestrator, uses `streamText()` from Vercel AI SDK
- `lib/server/prompts.ts` — System prompt (the contract)
- `lib/server/biochatter.ts` — LLM provider (OpenAI or BioChatter)
- `lib/server/tools/` — All five tools and their implementations
- `components/chat/chat-interface.tsx` — Frontend using `useChat()` hook
- `lib/client/chat-store.ts` — Zustand store for persistence

**External resources:**

- KINEPIK API: https://kinepik.org/api/0
- Vercel AI SDK: https://sdk.vercel.ai/
- BioChatter: https://biochatter.org/
- Cytoscape.js: https://js.cytoscape.org/
