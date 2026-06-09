# KINEPIK Chatbot: Presentation Script

**Master's level technical presentation (12 slides / 12 minutes)**

---

## Slide 1: Title

**KINEPIK: An AI-Powered Phosphoproteomics Analysis Platform**

Presenter notes:
"Today I'm showing a full-stack AI system that reasons over kinase biology, queries live KINEPIK data, and visualizes networks in real time. We'll cover architecture, prompt engineering, agent tools, and why this design is a practical way to bring phosphoproteomics data into chat."

---

## Slide 2: The Problem

- Phosphoproteomics outputs thousands of phosphorylation sites.
- Biologists need to connect sites to kinase activity and inhibitors.
- Manual interpretation is slow and error-prone.
- KINEPIK + AI makes this fast by combining live experiments with domain knowledge.

Key point: "We augment expert reasoning with real-time data and tools, not replace it."

---

## Slide 3: Architecture Overview

- **Frontend:** Next.js chat interface, streaming responses, network panel.
- **Backend:** Stateless API route that calls the LLM and executes tools.
- **Data sources:** Live KINEPIK API + hardcoded kinase/motif knowledge.

Why it matters:
- Stateless backend scales easily.
- Client stores conversation state locally.
- Tool calls keep the LLM grounded in real data.

---

## Slide 4: Request-Response Cycle

1. User asks a question.
2. Frontend sends full conversation history to `/api/chat`.
3. Backend injects the system prompt and calls the model.
4. The model chooses a tool, if needed.
5. Tool runs server-side against KINEPIK.
6. Streamed response arrives in the browser.

Important feature: Real-time streaming makes the chat feel responsive even when tools execute.

---

## Slide 5: Prompt Engineering

The system prompt is the AI's rulebook.

What it teaches:
- KINEPIK content: kinases, KSEA, MCF7/NTERA2/HL60 data.
- Tool availability and usage rules.
- UniProt ID mappings for accurate queries.
- KSEA interpretation: z-score and p-value meaning.
- Response style: scientific, concise, not meta.

Result: the model behaves like a specialist and avoids simple hallucinations.

---

## Slide 6: Tools Available to the AI

**analyzeKinase:** live KINEPIK kinase + KSEA queries.

**comparePerturbations:** compare drug effects on the same kinases.

**listPerturbations:** validate drug names before querying.

**getKinaseNetwork:** build interactive network visualizations.

**getTopKinaseConnectivity:** rank network hubs.

**getTopAffectedKinases:** rank kinases by KSEA effect for a drug/cell line.

Each tool keeps the AI grounded in real experimental data.

---

## Slide 7: Agentic Loop / Function Calling

The model does more than generate text — it decides when to act.

- It reads the prompt and user query.
- It decides if a tool call is needed.
- It executes the tool, reads the result, then continues.

This is the core agentic pattern:
- query ? think ? act ? observe ? answer.

It avoids stuffing all data into the prompt and instead fetches only what is relevant.

---

## Slide 8: Prompt vs. Data Hierarchy

The system uses layered knowledge:

1. **Live KINEPIK API** — highest authority.
2. **Hardcoded kinase/motif knowledge** — quick domain facts.
3. **BioChatter/RAG** — optional semantic retrieval.
4. **LLM training knowledge** — fallback, lower confidence.

If live data exists, use it. If not, use hand-coded facts. If still unclear, make biology-based estimates.

---

## Slide 9: Client-side Persistence

The browser stores conversations in localStorage.

Why:
- Preserves history across refreshes.
- Stores network state for re-rendering.
- Keeps server stateless.

This separation means:
- Server handles only LLM + tools.
- Client handles UI, history, and visualization.

---

## Slide 10: Network Visualization

The chat can also show kinase networks.

Process:
- User asks for a pathway.
- AI calls `getKinaseNetwork` with UniProt IDs.
- Server fetches SIF data and attributes.
- Client renders an interactive Cytoscape graph.

Why it's useful:
- Makes relationships visible.
- Helps interpret kinase cascades.
- Supports both kinases-only and phosphosite views.

---

## Slide 11: Safety and Fallbacks

The system is designed to fail gracefully.

- If the API times out, the AI states the data was unavailable.
- If a UniProt ID is uncertain, the AI should admit uncertainty.
- If no direct combination data exists, the AI compares individual drug effects and labels estimates clearly.
- Error handling is transparent, not hidden.

This reduces misleading answers and builds trust.

---

## Slide 12: Summary

Key takeaways:
- KINEPIK Chatbot combines live phosphoproteomics data with AI reasoning.
- The system prompt, tools, and stateless architecture make the AI reliable and scalable.
- Real-time tool usage avoids hallucinations and keeps answers grounded.
- Visualization and comparison tools make kinase biology actionable.

Closing line:
"This is a practical example of how domain-specific AI can accelerate biological discovery by turning complex datasets into conversational insights."
