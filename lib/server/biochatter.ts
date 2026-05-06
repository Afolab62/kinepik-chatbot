// BioChatter API client — server-only.
// Integrates with a BioChatter server (OpenAI-compatible) or direct OpenAI.
// BioChatter docs: https://biochatter.org/

import { createOpenAI } from '@ai-sdk/openai'

const BIOCHATTER_API_URL = process.env.BIOCHATTER_API_URL ?? 'https://api.openai.com/v1'
const BIOCHATTER_API_KEY = process.env.BIOCHATTER_API_KEY ?? process.env.OPENAI_API_KEY ?? ''
const BIOCHATTER_MODEL = process.env.BIOCHATTER_MODEL ?? 'gpt-4o'

// OpenAI-compatible provider.
// When BIOCHATTER_API_URL points to a biochatter-server instance, requests are
// automatically proxied through BioChatter's RAG and knowledge-graph pipelines.
export const biochatterProvider = createOpenAI({
  baseURL: BIOCHATTER_API_URL,
  apiKey: BIOCHATTER_API_KEY,
})

export function getBiochatterModel() {
  return biochatterProvider(BIOCHATTER_MODEL)
}

export function isBiochatterServerConfigured(): boolean {
  return (
    !!process.env.BIOCHATTER_API_URL &&
    !process.env.BIOCHATTER_API_URL.includes('openai.com')
  )
}

// BioChatter-enhanced system prompt suffix.
// These priming instructions help the RAG pipeline focus on relevant knowledge
// bases (UniProt, STRING, Reactome, etc.) when a BioChatter server is used.
export const BIOCHATTER_CONTEXT = `
## BioChatter Knowledge Sources
You have access to curated biomedical knowledge via BioChatter's RAG pipeline:
- UniProt: Protein sequences, function, disease associations
- Reactome: Signaling pathways and reaction networks
- PhosphoSitePlus: Experimentally-verified phosphorylation sites
- STRING: Protein-protein interaction networks
- KinBase: Comprehensive kinase classification database
- PhosphoELM: Phosphorylation site functional data

## RAG-Enhanced Analysis
When answering questions about specific proteins or pathways, synthesize information from the above databases. Always indicate which knowledge source informed your response.`

export function validateApiKey(): { valid: boolean; error?: string } {
  if (!BIOCHATTER_API_KEY) {
    return {
      valid: false,
      error:
        'No API key configured. Set OPENAI_API_KEY (for OpenAI) or BIOCHATTER_API_KEY (for BioChatter server) in your .env.local file.',
    }
  }
  return { valid: true }
}
