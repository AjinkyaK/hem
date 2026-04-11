import { RunnableConfig } from "@langchain/core/runnables";
import { ChatAnthropic } from "@langchain/anthropic";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import { interrupt } from "@langchain/langgraph";
import { StateAnnotation } from "../state.js";
import { tailorResumeSystemPrompt } from "../prompts/tailorResume.js";

const model = new ChatAnthropic({
  model: "claude-3-5-haiku-20241022",
  apiKey: process.env.ANTHROPIC_API_KEY,
  maxRetries: 2,
});

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

  const result = await model.invoke([
    new SystemMessage(tailorResumeSystemPrompt),
    new HumanMessage(
      `Original Resume:\n${state.rawResumeInput}\n\nJob Details:\n${JSON.stringify(state.jobDetails, null, 2)}`,
    ),
  ]);

  const draft = typeof result.content === "string"
    ? result.content
    : JSON.stringify(result.content);

  // Pause execution and surface draft to the user.
  // Returns the user's response when the graph is resumed via Command({ resume: "..." }).
  const userFeedback = interrupt(draft) as string;

  return { resumeDraft: draft, userFeedback };
};
