import { RunnableConfig } from "@langchain/core/runnables";
import { ChatAnthropic } from "@langchain/anthropic";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import { interrupt } from "@langchain/langgraph";
import { StateAnnotation } from "../state.js";
import { TailorOutputSchema } from "../types.js";
import { tailorResumeSystemPrompt } from "../prompts/tailorResume.js";
import { writeResumeDraft } from "../utils/writeResumeDraft.js";

export const tailorResume = async (
  state: typeof StateAnnotation.State,
  _config: RunnableConfig,
): Promise<typeof StateAnnotation.Update> => {
  if (!state.rawResumeInput.trim()) {
    throw new Error("tailorResume: rawResumeInput is empty");
  }
  if (!state.jobDetails) {
    throw new Error("tailorResume: jobDetails is null");
  }

  const structuredModel = new ChatAnthropic({
    model: "claude-3-5-haiku-20241022",
    apiKey: process.env.ANTHROPIC_API_KEY,
    maxRetries: 2,
  }).withStructuredOutput(TailorOutputSchema);

  const result = await structuredModel.invoke([
    new SystemMessage(tailorResumeSystemPrompt),
    new HumanMessage(
      `Original Resume:\n${state.rawResumeInput}\n\nJob Details:\n${JSON.stringify(state.jobDetails, null, 2)}`,
    ),
  ]);

  const draft = result.resume;
  const filePath = writeResumeDraft(draft, state.jobDetails, 1);

  const userFeedback = interrupt(
    `Draft written to: ${filePath}\n\nType 'approve' to finalize, or provide feedback to revise.`,
  ) as string;

  return { resumeDraft: draft, draftVersion: 1, userFeedback };
};
