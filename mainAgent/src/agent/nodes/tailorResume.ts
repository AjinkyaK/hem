import { RunnableConfig } from "@langchain/core/runnables";
import { ChatAnthropic } from "@langchain/anthropic";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import { StateAnnotation } from "../state.js";
import { TailorOutputSchema } from "../types.js";
import { tailorResumeSystemPrompt } from "../prompts/tailorResume.js";

const structuredModel = new ChatAnthropic({
  model: "claude-haiku-4-5-20251001",
  apiKey: process.env.ANTHROPIC_API_KEY,
  maxRetries: 2,
}).withStructuredOutput(TailorOutputSchema);

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

  const result = await structuredModel.invoke([
    new SystemMessage(tailorResumeSystemPrompt),
    new HumanMessage(
      `Original Resume:\n${state.rawResumeInput}\n\nJob Details:\n${JSON.stringify(state.jobDetails, null, 2)}`,
    ),
  ]);

  return { resumeDraft: result.resume, draftVersion: 1 };
};
