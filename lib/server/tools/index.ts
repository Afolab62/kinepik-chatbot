// Barrel — exports all AI SDK tools used by the chat route.

export { analyzeKinaseTool } from "./analyze-kinase";
export { analyzeMotifTool } from "./analyze-motif";
export { getKinaseFamilyTool } from "./get-kinase-family";
export { listPerturbationsTool } from "./list-perturbations";
export { getKinaseNetworkTool } from "./get-kinase-network";
export { getTopKinaseConnectivityTool } from "./top-kinase-connectivity";
export { comparePerturbationsTool } from "./compare-perturbations";
export { topAffectedKinasesTool } from "./top-affected-kinases";

import { analyzeKinaseTool } from "./analyze-kinase";
import { analyzeMotifTool } from "./analyze-motif";
import { getKinaseFamilyTool } from "./get-kinase-family";
import { listPerturbationsTool } from "./list-perturbations";
import { getKinaseNetworkTool } from "./get-kinase-network";
import { getTopKinaseConnectivityTool } from "./top-kinase-connectivity";
import { topAffectedKinasesTool } from "./top-affected-kinases";
import { comparePerturbationsTool } from "./compare-perturbations";

// Named tool map — pass directly to streamText({ tools: chatTools })
export const chatTools = {
  analyzeKinase: analyzeKinaseTool,
  getKinaseFamily: getKinaseFamilyTool,
  analyzeMotif: analyzeMotifTool,
  listPerturbations: listPerturbationsTool,
  getKinaseNetwork: getKinaseNetworkTool,
  getTopKinaseConnectivity: getTopKinaseConnectivityTool,
  getTopAffectedKinases: topAffectedKinasesTool,
  comparePerturbations: comparePerturbationsTool,
};
