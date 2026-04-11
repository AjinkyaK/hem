import { RunnableConfig } from "@langchain/core/runnables";
import { ChatAnthropic } from "@langchain/anthropic";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import { StateAnnotation } from "../state.js";
import { JobDetailsSchema } from "../types.js";
import { extractJobDetailsSystemPrompt } from "../prompts/extractJobDetails.js";

const structuredModel = new ChatAnthropic({
  model: "claude-3-5-haiku-20241022",
  apiKey: process.env.ANTHROPIC_API_KEY,
  maxRetries: 2,
}).withStructuredOutput(JobDetailsSchema);

export const extractJobDetails = async (
  state: typeof StateAnnotation.State,
  _config: RunnableConfig,
): Promise<typeof StateAnnotation.Update> => {
  if (!state.rawJobInput.trim()) {
    throw new Error("extractJobDetails: rawJobInput is empty");
  }

  const jobDetails = await structuredModel.invoke([
    new SystemMessage(extractJobDetailsSystemPrompt),
    new HumanMessage(state.rawJobInput),
  ]);

  return { jobDetails };
};
