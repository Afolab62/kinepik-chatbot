// Barrel — exports all AI SDK tools used by the chat route.

export { analyzeKinaseTool } from "./analyze-kinase";
export { analyzeMotifTool } from "./analyze-motif";
export { getKinaseFamilyTool } from "./get-kinase-family";
export { listPerturbationsTool } from "./list-perturbations";

import { analyzeKinaseTool } from "./analyze-kinase";
import { analyzeMotifTool } from "./analyze-motif";
import { getKinaseFamilyTool } from "./get-kinase-family";
import { listPerturbationsTool } from "./list-perturbations";

// Named tool map — pass directly to streamText({ tools: chatTools })
export const chatTools = {
  analyzeKinase: analyzeKinaseTool,
  getKinaseFamily: getKinaseFamilyTool,
  analyzeMotif: analyzeMotifTool,
  listPerturbations: listPerturbationsTool,
};
