import { RunnableConfig } from "@langchain/core/runnables";
import { interrupt } from "@langchain/langgraph";
import { StateAnnotation } from "../state.js";
import { writeResumeDraft } from "../utils/writeResumeDraft.js";

export const reviewDraft = async (
  state: typeof StateAnnotation.State,
  _config: RunnableConfig,
): Promise<typeof StateAnnotation.Update> => {
  if (!state.resumeDraft) {
    throw new Error("reviewDraft: resumeDraft is null");
  }
  if (!state.jobDetails) {
    throw new Error("reviewDraft: jobDetails is null");
  }

  const filePath = writeResumeDraft(
    state.resumeDraft,
    state.jobDetails,
    state.draftVersion,
  );

  const userFeedback = interrupt(
    `Draft written to: ${filePath}\n\nType 'approve' to finalize, or provide feedback to revise.`,
  ) as string;

  return { userFeedback };
};
