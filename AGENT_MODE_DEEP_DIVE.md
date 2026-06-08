# Agent Mode Deep Dive: How KINEPIK's AI Actually Works

A comprehensive technical guide to understanding agentic loops, system prompts, and AI decision-making.

---

## Part 1: What is an "Agent"?

### Traditional AI vs. Agentic AI

**Traditional AI (Like ChatGPT):**

```
User: "What's the capital of France?"
↓
ChatGPT processes question
↓
ChatGPT outputs: "Paris"
↓
Done. No further decisions.
```

The AI reads your question, generates an answer, and stops. It's one-shot reasoning.

**Agentic AI (Like KINEPIK):**

```
User: "Which kinases are inhibited by Rapamycin in MCF7 cells?"
↓
AI processes question AND thinks: "I don't have this data in my training"
↓
AI decides: "I should query the KINEPIK database"
↓
AI calls: analyzeKinase(Rapamycin, MCF7)
↓
Tool returns: { kinaseName: "mTOR", zScore: -4.1, ... }
↓
AI reads tool result and continues thinking: "Now I understand the data"
↓
AI writes response incorporating the real data
↓
AI thinks: "Should I visualize this network?"
↓
AI calls: getKinaseNetwork([mTOR, AKT, PI3K])
↓
Tool returns: { nodes: [...], edges: [...] }
↓
AI writes final response with all data
↓
Done (after multiple "steps")
```

**Key difference:** The AI **actively makes decisions** about which tools to use and when, rather than just generating text.

---

## Part 2: The Agentic Loop (Function Calling)

### How It Works

The agentic loop is a **cycle of decision-making and action**:

```
┌─────────────────────────────────────────────────────────┐
│                   1. USER QUERY                         │
│         "Why does mTOR decrease with Rapamycin?"        │
└──────────────────────┬──────────────────────────────────┘
                       │
                       ↓
┌─────────────────────────────────────────────────────────┐
│          2. AI READS PROMPT + THINKS                    │
│   System prompt teaches AI about:                       │
│   - Available tools                                     │
│   - KINEPIK database structure                          │
│   - When to use which tool                              │
│                                                         │
│   AI conclusion: "I need real data for this"            │
└──────────────────────┬──────────────────────────────────┘
                       │
                       ↓
┌─────────────────────────────────────────────────────────┐
│   3. AI DECIDES TO USE A TOOL                           │
│                                                         │
│   AI output: "I'll query the KINEPIK database"          │
│   Tool call: {                                          │
│     name: "analyzeKinase",                              │
│     params: {                                           │
│       uniprotIds: ["P42345"],    // mTOR                │
│       cellType: "MCF7",                                 │
│       condition: "Rapamycin"                            │
│     }                                                   │
│   }                                                     │
└──────────────────────┬──────────────────────────────────┘
                       │
                       ↓
┌─────────────────────────────────────────────────────────┐
│         4. SERVER EXECUTES THE TOOL                     │
│                                                         │
│   Fetches: https://kinepik.org/api/0/kinases/...       │
│   Gets back: {                                          │
│     kinaseName: "mTOR",                                 │
│     zScore: -4.1,                                       │
│     pValue: 0.00001,                                    │
│     n: 47,                                              │
│     phosphosites: ["AKT_S123", "GSK3_T456", ...]       │
│   }                                                     │
└──────────────────────┬──────────────────────────────────┘
                       │
                       ↓
┌─────────────────────────────────────────────────────────┐
│     5. AI RECEIVES TOOL RESULT & CONTINUES              │
│                                                         │
│   AI sees: mTOR strongly inhibited (z=-4.1)            │
│   AI thinks: "Good data. Should I get more?"            │
│                                                         │
│   Decision: "I should visualize the pathway"            │
│   Tool call: {                                          │
│     name: "getKinaseNetwork",                           │
│     params: {                                           │
│       uniprotIds: ["P42345", "P31749", "P42336"],       │
│       title: "Rapamycin-sensitive kinases"              │
│     }                                                   │
│   }                                                     │
└──────────────────────┬──────────────────────────────────┘
                       │
                       ↓
┌─────────────────────────────────────────────────────────┐
│         6. LOOP: EXECUTE SECOND TOOL                    │
│                                                         │
│   Server executes getKinaseNetwork                      │
│   Returns network data                                  │
└──────────────────────┬──────────────────────────────────┘
                       │
                       ↓
┌─────────────────────────────────────────────────────────┐
│  7. AI WRITES FINAL RESPONSE (Now has all data)         │
│                                                         │
│   "KINEPIK database shows mTOR is strongly inhibited    │
│    (z=-4.1, p<0.001, n=47) when treated with Rapamycin │
│    in MCF7 cells. The attached network shows the        │
│    kinase interactions..."                              │
│                                                         │
│   Status: STOP (max 5 tool calls reached or AI decided  │
│   it has enough data)                                   │
└──────────────────────┬──────────────────────────────────┘
                       │
                       ↓
┌─────────────────────────────────────────────────────────┐
│            8. RESPONSE SENT TO USER                     │
│        (Browser displays text + network panel)          │
└─────────────────────────────────────────────────────────┘
```

### Key Points About the Loop

1. **The AI decides what to do** — not following pre-programmed instructions, but making decisions based on the query and its training

2. **Each step feeds into the next** — AI reads tool results and decides what to do next

3. **Bounded execution** — Max 5 tool calls per response (prevents infinite loops and controls cost)

4. **Timeout protection** — Each tool call must complete within 10 seconds

5. **Transparent errors** — If a tool fails, the AI sees the error and adjusts:
   ```
   Tool fails: "KINEPIK API timeout"
   AI sees: error message
   AI adjusts: "Based on known biology: [speculation]"
   ```

---

## Part 3: The System Prompt — The AI's Manual

### What Is It?

The system prompt is a **set of instructions** (~1000 tokens) sent to OpenAI with every message. It's like a manual that tells the AI how to behave.

### Where It Comes From

```typescript
// lib/server/prompts.ts
export const SYSTEM_PROMPT = `
  You are KINEPIK Assistant, an AI system for kinase identification 
  and phosphoproteomics analysis...
  [1000+ tokens of instructions]
`;

// app/api/chat/route.ts
const result = streamText({
  model: getBiochatterModel(),
  system: SYSTEM_PROMPT + serverNote, // ← Injected every request
  messages: modelMessages,
  tools: chatTools,
});
```

**Every request**, the system prompt is sent. It's not stored in the AI's memory — it's a fresh instruction set each time.

### What Does It Teach?

#### Section 1: Identity & Purpose

```
You are KINEPIK Assistant, an AI system for kinase identification
and phosphoproteomics analysis, backed by the KINEPIK database
(kinepik.org) — an integrated data resource for cell signalling
research developed at Queen Mary University of London.
```

**Why?** Tells the AI its role. Without this, the AI might act like a general chatbot instead of a specialist.

#### Section 2: Database Contents

```
KINEPIK contains:
- Kinase-phosphosite interaction networks (which kinase phosphorylates which site)
- Experimental perturbation data across cell lines MCF7, NTERA2, and HL60
- KSEA (Kinase-Substrate Enrichment Analysis) scores
- Fold-change data for phosphosites under perturbations
- Protein and kinase metadata from UniProt, PhosphoSitePlus
```

**Why?** Tells the AI what data exists. Without this:

- AI wouldn't know which cell lines are available
- AI might ask for data that doesn't exist
- AI would hallucinate instead of saying "not in database"

#### Section 3: Available Tools

```
### 1. Live Database Queries
You can call the KINEPIK API directly via tools to retrieve real data:
- analyzeKinase — kinase-phosphosite interactions and KSEA scores
- listPerturbations — lists all available drugs in the database
- getKinaseNetwork — fetches kinase interaction networks

### 2. Pattern Matching
- analyzeMotif — matches phosphorylation motifs against known patterns

### 3. Classification
- getKinaseFamily — retrieves kinase family information
```

**Why?** Teaches the AI which tools exist and what they do. Without this, the AI wouldn't know it could query databases.

#### Section 4: UniProt ID Mappings

```
Known UniProt IDs:
EGFR=P00533, mTOR=P42345, AKT1=P31749, AKT2=P31751, AKT3=Q9Y243,
CDK2=P24941, ERK2/MAPK1=P28482, ERK1/MAPK3=P27361, PDK1=O15530,
PI3K(PIK3CA)=P42336, PTEN=P60484, SRC=P12931, JAK1=P23458, JAK2=O60674,
STAT3=P40763, RAF1=P04049, BRAF=P15056, MEK1/MAP2K1=Q02750,
p38/MAPK14=Q16539, JNK1/MAPK8=P45983, RSK1/RPS6KA1=Q15418,
S6K1/RPS6KB1=P23443, 4EBP1/EIF4EBP1=Q13541, STK11/LKB1=Q15831,
AMPK(PRKAA1)=Q13131, GSK3B=P49841, CHEK1=O14757, CHEK2=O96017
```

**Why? This is CRITICAL:**

Without this mapping:

```
User: "Tell me about EGFR"
AI thinks: "I need EGFR data"
AI guesses: "EGFR might be P12345 or EGFR_HUMAN or GeneID 1956"
AI queries: kinepik.org/api?kinase_ids=P12345
Server returns: [] (no results — wrong ID)
AI hallucinates: "EGFR data not in KINEPIK"
User: "But I know EGFR should be there!"
```

With the mapping:

```
User: "Tell me about EGFR"
AI reads prompt: "EGFR = P00533"
AI queries: kinepik.org/api?kinase_ids=P00533
Server returns: [real EGFR data]
AI: "KINEPIK shows EGFR phosphorylates X, Y, Z"
User: "Thanks!"
```

#### Section 5: How to Use Tools Safely

```
Before running KSEA analysis for a specific drug, call listPerturbations
first to confirm the exact perturbation name exists in the database.
Drug names are case-sensitive and must match exactly
(e.g. "AZD3759", not "azd3759" or "AZD 3759").
```

**Why?** Prevents the AI from guessing drug names:

- User: "Check Staurosporine"
- Without instruction: AI queries for "staurosporine" (lowercase) → 0 results
- With instruction: AI calls listPerturbations first → finds "Staurosporine" → queries correctly

#### Section 6: Response Style Rules

```
Never say "the database returned", "the tool returned", "returned data",
or "API result" — present findings as scientific observations

Do not add a "Next Steps" or "Recommendations" section unless the user
explicitly asks for it

If KSEA data is unavailable (n=0 substrates): state in one sentence it
is not in the database, then speculate briefly prefixed with
"Based on known biology:"
```

**Why?** Enforces professional, scientific communication:

- ❌ Bad: "The KINEPIK API returned z-score = -3.2"
- ✅ Good: "mTOR shows strong inhibition (z = -3.2, p < 0.001)"

#### Section 7: KSEA Score Interpretation

```
z-score > +2: strongly activated (high statistical confidence)
z-score +1 to +2: moderately activated
z-score -1 to +1: no significant change
z-score -1 to -2: moderately inhibited
z-score < -2: strongly inhibited (high statistical confidence)

p < 0.05: statistically significant
p < 0.001: highly significant
n = number of substrate phosphosites (higher = more reliable)
```

**Why?** Prevents misinterpretation:

- Without: AI might say "z-score 0.5 means activated" (wrong)
- With: AI correctly interprets "0.5 means no significant change"

### How Long Is It?

About 1000 tokens, which costs:

- ~$0.01 per message for input (1000 tokens)
- Sent with every request

### Why Not Just Fine-Tune the Model?

**Alternative approach:** Instead of sending the prompt, fine-tune OpenAI's model on your domain.

**Advantages of fine-tuning:**

- Slightly cheaper (no prompt overhead)
- Faster (model already knows the domain)
- Persistent knowledge

**Disadvantages:**

- Expensive (~$25-100 per fine-tuning job)
- Hard to iterate (takes hours to train)
- Harder to update when database changes
- Still need some prompt (fine-tuning isn't perfect)

**KINEPIK's choice:** Use prompting instead because:

- Easy to iterate (change text, redeploy)
- Transparent (you can see the instructions)
- Flexible (add/remove instructions on the fly)
- Cost is low ($0.01/message is acceptable)

---

## Part 4: How the AI Actually Understands

### What Happens Inside OpenAI's Model

When you send a message with system prompt + user query + tools:

```
[SYSTEM PROMPT (1000 tokens)]
"You are KINEPIK Assistant...tools: analyzeKinase, analyzeMotif..."

[PREVIOUS MESSAGES (variable tokens)]
User: "What was that earlier?"
Assistant: "I said mTOR was inhibited..."

[CURRENT USER MESSAGE]
User: "Which kinases are affected by Rapamycin in MCF7?"
```

The model processes this and generates output **token by token**.

The model's "thinking" at each step:

```
Step 1: Model reads system prompt
  → Learns: "I'm a kinase expert", "I have access to tools"

Step 2: Model reads user query
  → Understands: "User wants to know about Rapamycin effect in MCF7"

Step 3: Model decides what to generate
  → Reasons: "I don't know Rapamycin's effect on all kinases.
             I should call a tool to query the database."

Step 4: Model outputs tool call
  → Generates: {
      "type": "function_call",
      "name": "analyzeKinase",
      "params": {
        "uniprotIds": ["P42345"],  // ← Model decided this is mTOR
        "cellType": "MCF7",
        "condition": "Rapamycin"
      }
    }

Step 5: Model receives tool result
  → Processes: "Real data shows mTOR inhibited (z=-4.1)"

Step 6: Model continues generating
  → Outputs: "KINEPIK database shows mTOR is strongly inhibited..."
```

### Why the System Prompt Works

The model follows instructions because:

1. **Training** — OpenAI's models are trained to follow instructions (through RLHF)
2. **Context** — The system prompt is the first thing in context, so it's most important
3. **Consistency** — The prompt repeats key points (e.g., UniProt IDs appear multiple times)
4. **Clarity** — Instructions are specific ("Never say X, always do Y")

---

## Part 5: Different Scenarios & AI Decision-Making

### Scenario 1: Simple Query (No Tools Needed)

**User:** "What is PKA?"

**System Prompt teaches:**

- PKA is in the AGC family
- PKA phosphorylates basophilic substrates
- Available in general kinase knowledge

**AI Decision:**

- "I know this from my training + system prompt"
- "No tool call needed"
- Response: "PKA (Protein Kinase A) is a member of the AGC kinase family..."

**Tool calls: 0**

---

### Scenario 2: Database Query

**User:** "Which kinases are inhibited by Staurosporine in MCF7 cells?"

**AI Decision Process:**

1. Read query: "User wants data about Staurosporine in MCF7"
2. Think: "This is specific experimental data"
3. Conclusion: "System prompt says I can call tools for live data"
4. First decision: "Should I call listPerturbations to check if Staurosporine exists?"
5. Second decision: "Yes, the prompt says 'always call listPerturbations first'"
6. Call: `listPerturbations(cellType="MCF7")`
7. Get back: `["Rapamycin", "PD98059", "Staurosporine", ...]`
8. See: "Staurosporine exists!"
9. Decision: "Now call analyzeKinase"
10. Call: `analyzeKinase(condition="Staurosporine", cellType="MCF7")`
11. Get back: `[{kinase: "AKT1", zScore: -3.5}, {kinase: "mTOR", zScore: -2.1}, ...]`
12. Decision: "Should I visualize?"
13. Decision: "No, user just asked about inhibited kinases, not for visualization"
14. Output: "Based on KINEPIK, the following kinases are inhibited by Staurosporine in MCF7..."

**Tool calls: 2**

---

### Scenario 3: Complex Multi-Step Analysis

**User:** "Analyze the Rapamycin response in MCF7. Show the pathway, tell me the z-scores, and which motifs are affected."

**AI Decision Process:**

1. User wants 3 things: analysis + pathway visualization + motif analysis
2. Call 1: `listPerturbations()` → Check "Rapamycin" exists
3. Call 2: `analyzeKinase(uniprotIds=[...], condition="Rapamycin", cellType="MCF7")` → Get z-scores for top kinases
4. AI reads results: "mTOR, AKT, PI3K are most affected"
5. Call 3: `getKinaseNetwork(uniprotIds=[P42345, P31749, P42336])` → Get network for visualization
6. AI reads network: "Got pathway data"
7. Call 4: `analyzeMotif(motif="[ST]P")` → Check proline-directed sites (typical for mTOR targets)
8. AI finishes with data and outputs:
   - Summary
   - KINEPIK findings (z-scores)
   - Pathway explanation
   - Motif analysis
   - Network panel

**Tool calls: 4** (within max of 5)

---

### Scenario 4: Tool Fails (Error Handling)

**User:** "Show me ERK1 phosphosites in the database"

**AI Decision Process:**

1. Read query: "User wants ERK1 data"
2. Read system prompt: "Known UniProt IDs include ERK1/MAPK3=P27361"
3. Call: `analyzeKinase(uniprotIds=["P27361"], ...)`
4. Tool fails: "KINEPIK API returned 504 (server error)"
5. AI sees: error message
6. AI decision: "Tool failed. System prompt says: if tool fails, fall back to 'Based on known biology:'"
7. Output: "Based on known biology: ERK1 (MAPK3) is a member of the CMGC kinase family..."

**Result:** User sees honest response about what data was available, not a hallucination.

**Tool calls: 1 (failed)**

---

### Scenario 5: Invalid Input

**User:** "Tell me about EGFR_WRONG kinase"

**AI Decision Process:**

1. Read query: "User asking about EGFR_WRONG"
2. Read system prompt: "Known UniProt IDs: EGFR=P00533" (no mention of EGFR_WRONG)
3. AI thinks: "EGFR_WRONG is not in the known IDs"
4. AI decision: "System prompt says 'If uncertain, do NOT guess UniProt IDs. Say so.'"
5. Output: "I am not certain of the UniProt ID for EGFR_WRONG. Could you clarify which kinase you mean?"

**Result:** AI admits uncertainty instead of hallucinating.

**Tool calls: 0** (prevented by system prompt)

---

## Part 6: Why This Design Matters

### Problem: Hallucination

**Without agent + prompting:**

```
User: "Is AKT1 in MCF7 KINEPIK data?"
AI: "Yes, AKT1 is well-characterized in MCF7 cells.
     Studies show it regulates mTOR signaling."

Reality: AKT1 might not be in KINEPIK for MCF7.
         AI made that up from training data.
```

**With agent + prompting:**

```
User: "Is AKT1 in MCF7 KINEPIK data?"
AI: Calls analyzeKinase(AKT1, MCF7)
Result: Returns real data
AI: "KINEPIK shows AKT1 phosphorylates [list]..."
    (with z-scores, p-values, n counts)

OR

Result: Returns empty (not in database)
AI: "AKT1 data is not in KINEPIK for MCF7.
     Based on known biology: AKT1 typically..."
```

The difference: **Real data beats hallucination every time**.

---

## Part 7: The Complete Request Flow (Deep Technical)

### Step-by-Step Code Flow

```typescript
// 1. FRONTEND (React component)
const { handleSubmit, messages } = useChat({
  api: '/api/chat',
  experimental_throttleWaitMs: 50
})

// User types message
const handleSubmit = (message) => {
  // Send full conversation history + new message
  const payload = {
    messages: [
      { role: 'user', content: 'What was that?', id: 'msg-1' },
      { role: 'assistant', content: 'I said...', id: 'msg-2' },
      { role: 'user', content: '[NEW MESSAGE]', id: 'msg-3' }
    ]
  }
  // POST to /api/chat
  // Receive SSE stream
  // Update UI in real-time
}

// 2. BACKEND (Express route handler)
export async function POST(req: Request) {
  const { messages } = await req.json()

  // Validate API key
  const { valid, error } = validateApiKey()
  if (!valid) return Response.json({ error }, { status: 500 })

  // Convert message format (Vercel AI SDK expects specific format)
  const modelMessages = await convertToModelMessages(messages)

  // Call Vercel AI SDK streamText
  const result = streamText({
    model: getBiochatterModel(),  // OpenAI or BioChatter server

    system: SYSTEM_PROMPT + serverNote,  // ← The manual

    messages: modelMessages,  // Full history

    tools: chatTools,  // {
                       //   analyzeKinase: {...},
                       //   getKinaseNetwork: {...},
                       //   ...
                       // }

    stopWhen: stepCountIs(5),  // Max 5 tool calls

    onFinish({ totalUsage }) {
      console.log(`Tokens: ${totalUsage.inputTokens}`)
    }
  })

  // Return SSE stream to client
  return result.toUIMessageStreamResponse()
}

// 3. VERCEL AI SDK (Behind the scenes)
const result = await streamText({
  model,
  system,
  messages,
  tools
  // ... internally does:

  // a) Formats request to OpenAI:
  // POST https://api.openai.com/v1/chat/completions
  // {
  //   model: 'gpt-4-turbo',
  //   messages: [
  //     { role: 'system', content: SYSTEM_PROMPT },
  //     { role: 'user', content: 'Why does mTOR decrease?' },
  //     ...
  //   ],
  //   tools: [
  //     {
  //       type: 'function',
  //       function: {
  //         name: 'analyzeKinase',
  //         description: '...',
  //         parameters: { ... }
  //       }
  //     },
  //     ...
  //   ]
  // }

  // b) Receives streaming response from OpenAI:
  // {
  //   "choices": [{
  //     "delta": {
  //       "content": "I'll query the KINEPIK database..."
  //     }
  //   }]
  // }
  // OR:
  // {
  //   "choices": [{
  //     "delta": {
  //       "tool_calls": [{
  //         "id": "call_abc",
  //         "function": {
  //           "name": "analyzeKinase",
  //           "arguments": "{\"uniprotIds\": [\"P42345\"]}"
  //         }
  //       }]
  //     }
  //   }]
  // }

  // c) When tool_call detected:
  //    - Pauses text generation
  //    - Executes tool locally
  //    - Gets result
  //    - Sends result back to OpenAI
  //    - OpenAI continues generating

  // d) Converts all of this to UIMessageStream format:
  // {
  //   type: 'text-start',
  //   type: 'text-delta' with delta: 'I',
  //   type: 'text-delta' with delta: "'ll',
  //   type: 'tool-call',
  //   type: 'tool-result',
  //   type: 'text-end'
  // }
})

// 4. FRONTEND (Receives SSE stream)
// Browser listens to /api/chat response stream:

event: 0
data: {"type":"text-start","id":"msg-456"}

event: 0
data: {"type":"text-delta","id":"msg-456","delta":"I"}

event: 0
data: {"type":"text-delta","id":"msg-456","delta":"'ll"}

event: 0
data: {"type":"tool-call","id":"tool-call-789","toolName":"analyzeKinase",...}

event: 0
data: {"type":"tool-result","id":"tool-call-789",...,"result":{...}}

event: 0
data: {"type":"text-delta","id":"msg-456","delta":"KINEPIK"}

// Browser updates UI in real-time as data arrives

// 5. STORAGE (Browser localStorage)
localStorage['kinepik-chat-store'] = {
  conversations: [{
    id: 'conv-abc',
    title: 'Rapamycin analysis',
    messages: [
      { role: 'user', content: '...', parts: [...] },
      { role: 'assistant', content: '...', parts: [...] }
    ]
  }]
}
// Persists for next session
```

---

## Part 8: Cost & Performance Implications

### Token Usage

**Per message costs:**

```
System prompt:    1,000 tokens (input)   = $0.005
User message:       100 tokens (input)   = $0.0005
Previous messages:  200 tokens (input)   = $0.001
Tool descriptions:  200 tokens (input)   = $0.001
AI response:        300 tokens (output)  = $0.009
─────────────────────────────────────────────────
Total:            1,800 tokens          ≈ $0.016/message
```

**With max 5 tool calls:**

- Each tool call ~ $0.001 (external API, not LLM tokens)
- 5 tools = $0.005

**Total per message: ~$0.021 per message**

**At scale:**

- 100 users × 10 messages/day × 30 days × $0.021 = **$630/month**

### Speed

**Latency:**

- System + model inference: ~2 seconds
- Each tool call: ~1 second (network + API call)
- Total for 2 tools: ~4 seconds

**Why streaming matters:**

- With streaming: User sees text appear after 0.5 seconds (feels responsive)
- Without streaming: User waits 4 seconds for blank screen

---

## Part 9: Common Misconceptions

### Misconception 1: "The AI reads all the code"

**False.** The AI doesn't have access to:

- Tool implementation code
- System architecture
- Database schema

The AI only knows what the system prompt tells it:

```
"You can call these tools: analyzeKinase, getKinaseNetwork, ..."
```

The AI doesn't know **how** these tools work internally — just that they exist and what they return.

---

### Misconception 2: "The system prompt is like human memory"

**False.** The system prompt is sent **every request**, not stored in the model.

Think of it like:

```
Every conversation = Fresh chat with a new person
That person is handed a manual every time
They read the manual
They have the conversation
After conversation: They forget the manual
```

This is why:

- Same prompt consistency (manual is identical every time)
- Easy to update (change text, redeploy)
- No "forgetting" between requests

---

### Misconception 3: "The AI understands the biology"

**Partially true.** The AI:

- ✅ Knows general biology from training
- ✅ Can read and interpret scientific results
- ✅ Can synthesize information
- ❌ Doesn't "understand" the way humans do
- ❌ Can hallucinate if not constrained

That's why we **force it to use real data via tools**.

---

### Misconception 4: "The AI is smarter than ChatGPT"

**Different, not smarter.** Comparison:

| Aspect                 | ChatGPT                  | KINEPIK                          |
| ---------------------- | ------------------------ | -------------------------------- |
| General knowledge      | Excellent                | OK (but constrained by prompt)   |
| Biochemistry knowledge | Good (trained on papers) | Same, but with live data overlay |
| Specific KINEPIK data  | No access                | Full access                      |
| Hallucination risk     | High (for specific data) | Low (data-backed)                |
| Speed                  | Fast                     | Slower (tool calls)              |
| Cost                   | Per use                  | Per message + tool calls         |

**KINEPIK isn't smarter — it's more truthful about specific data.**

---

## Part 10: Extending the System

### Adding a New Tool

To add a new tool (e.g., `predictKinaseInhibitor`):

**Step 1: Define the tool**

```typescript
// lib/server/tools/predict-inhibitor.ts
export const predictInhibitorTool = tool({
  description: "Predict kinase inhibitors for a given kinase",
  parameters: z.object({
    uniprotId: z.string(),
    selectivity: z.enum(['high', 'medium', 'low'])
  }),
  execute: async ({ uniprotId, selectivity }) => {
    // Implementation
    return { inhibitors: [...] }
  }
})
```

**Step 2: Add to tools export**

```typescript
// lib/server/tools/index.ts
export const chatTools = {
  analyzeKinase: analyzeKinaseTool,
  predictInhibitor: predictInhibitorTool, // ← New
  // ...
};
```

**Step 3: Update system prompt**

```typescript
// lib/server/prompts.ts
export const SYSTEM_PROMPT = `
  ...
  ### 6. Inhibitor Prediction
  You can call predictKinaseInhibitor to get potential inhibitors
  for a specific kinase.
  ...
`;
```

**That's it.** The AI now knows about the new tool and can use it automatically.

---

## Summary: The Complete Picture

```
SYSTEM PROMPT (Instructions manual)
    ↓
    ├─ "You are a kinase expert"
    ├─ "Here are your tools"
    ├─ "UniProt IDs are..."
    ├─ "When you get results, interpret them this way"
    └─ "Response rules..."

USER QUERY
    ↓
    ├─ AI reads prompt
    ├─ AI understands what it can do
    ├─ AI decides which tool to use
    ├─ AI calls tool(s)
    ├─ AI reads result(s)
    ├─ AI may decide to use more tools
    └─ AI generates response with real data

RESPONSE
    ↓
    ├─ Streams to browser
    ├─ Displays in real-time
    ├─ Shows visualizations
    └─ Saved to localStorage
```

**The magic: Real data + AI reasoning = Trustworthy answers**
