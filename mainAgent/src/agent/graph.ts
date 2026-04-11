import { StateGraph } from "@langchain/langgraph";
import { StateAnnotation } from "./state.js";
import { parseJobInput } from "./nodes/parseJobInput.js";
import { extractJobDetails } from "./nodes/extractJobDetails.js";
import { tailorResume } from "./nodes/tailorResume.js";
import { reviseResume } from "./nodes/reviseResume.js";

export const afterReview = (
  state: typeof StateAnnotation.State,
): "reviseResume" | "__end__" => {
  if (!state.userFeedback) return "__end__";
  return state.userFeedback.trim().toLowerCase() === "approve"
    ? "__end__"
    : "reviseResume";
};

const builder = new StateGraph(StateAnnotation)
  .addNode("parseJobInput", parseJobInput)
  .addNode("extractJobDetails", extractJobDetails)
  .addNode("tailorResume", tailorResume)
  .addNode("reviseResume", reviseResume)
  .addEdge("__start__", "parseJobInput")
  .addEdge("parseJobInput", "extractJobDetails")
  .addEdge("extractJobDetails", "tailorResume")
  .addConditionalEdges("tailorResume", afterReview)
  .addConditionalEdges("reviseResume", afterReview);

export const graph = builder.compile();
graph.name = "MainAgent";
