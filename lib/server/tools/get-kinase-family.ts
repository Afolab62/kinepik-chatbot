// Tool: getKinaseFamily — retrieves metadata about a specific kinase family.

import { tool } from 'ai'
import { z } from 'zod'
import {
  KINASE_FAMILIES,
  getKinaseFamilyDescription,
  getKinaseFamilyFeatures,
} from '@/lib/server/kinepik-engine'

type KinaseFamily = keyof typeof KINASE_FAMILIES

export const getKinaseFamilyTool = tool({
  description: 'Get information about kinase families and their members',
  inputSchema: z.object({
    family: z
      .enum(['AGC', 'CAMK', 'CK1', 'CMGC', 'STE', 'TK', 'TKL', 'OTHER'])
      .describe('The kinase family to look up'),
  }),
  execute: async ({ family }: { family: KinaseFamily }) => {
    return {
      family,
      members: KINASE_FAMILIES[family],
      description: getKinaseFamilyDescription(family),
      commonFeatures: getKinaseFamilyFeatures(family),
    }
  },
})
