// Tool: analyzeMotif — matches a peptide sequence against known phosphorylation motifs.

import { tool } from 'ai'
import { z } from 'zod'
import { PHOSPHO_MOTIFS } from '@/lib/server/kinepik-engine'

export const analyzeMotifTool = tool({
  description:
    'Analyze a phosphorylation site motif to predict likely kinase families',
  inputSchema: z.object({
    sequence: z
      .string()
      .describe('The amino acid sequence around the phosphorylation site (ideally -7 to +7)'),
  }),
  execute: async ({ sequence }: { sequence: string }) => {
    const matches: { motifType: string; description: string; typicalKinases: string[] }[] = []
    for (const [type, motif] of Object.entries(PHOSPHO_MOTIFS)) {
      if (motif.pattern.test(sequence)) {
        matches.push({
          motifType: type,
          description: motif.description,
          typicalKinases: [...motif.typicalKinases],
        })
      }
    }
    return {
      sequence,
      matchedMotifs: matches,
      analysis:
        matches.length > 0
          ? `Found ${matches.length} matching motif pattern(s)`
          : 'No standard motifs detected — may be phosphorylated by atypical kinases',
    }
  },
})
