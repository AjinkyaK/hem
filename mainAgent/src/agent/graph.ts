import { StateGraph } from "@langchain/langgraph";
import { StateAnnotation } from "./state.js";
import { parseJobInput } from "./nodes/parseJobInput.js";
import { extractJobDetails } from "./nodes/extractJobDetails.js";
import { tailorResume } from "./nodes/tailorResume.js";
import { reviseResume } from "./nodes/reviseResume.js";
import { reviewDraft } from "./nodes/reviewDraft.js";

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
  .addNode("reviewDraft", reviewDraft)
  .addEdge("__start__", "parseJobInput")
  .addEdge("parseJobInput", "extractJobDetails")
  .addEdge("extractJobDetails", "tailorResume")
  .addEdge("tailorResume", "reviewDraft")
  .addEdge("reviseResume", "reviewDraft")
  .addConditionalEdges("reviewDraft", afterReview);

export const graph = builder.compile();
graph.name = "MainAgent";
