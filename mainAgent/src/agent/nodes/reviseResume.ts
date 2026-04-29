import { RunnableConfig } from "@langchain/core/runnables";
import { ChatAnthropic } from "@langchain/anthropic";
import { HumanMessage } from "@langchain/core/messages";
import { StateAnnotation } from "../state.js";

const model = new ChatAnthropic({
  model: "claude-haiku-4-5-20251001",
  apiKey: process.env.ANTHROPIC_API_KEY,
  maxRetries: 2,
});

export const reviseResume = async (
  state: typeof StateAnnotation.State,
  _config: RunnableConfig,
): Promise<typeof StateAnnotation.Update> => {
  if (!state.resumeDraft) {
    throw new Error("reviseResume: resumeDraft is null");
  }
  if (!state.userFeedback) {
    throw new Error("reviseResume: userFeedback is null");
  }
  if (!state.jobDetails) {
    throw new Error("reviseResume: jobDetails is null");
  }

  const result = await model.invoke([
    new HumanMessage(
      `Here is the current resume draft:\n\n${state.resumeDraft}\n\nPlease make the following changes only — preserve everything else:\n${state.userFeedback}`,
    ),
  ]);

  const newDraft = typeof result.content === "string"
    ? result.content
    : JSON.stringify(result.content);

  return { resumeDraft: newDraft, draftVersion: state.draftVersion + 1 };
};
