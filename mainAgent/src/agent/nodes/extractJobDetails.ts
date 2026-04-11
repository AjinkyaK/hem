import { RunnableConfig } from "@langchain/core/runnables";
import { ChatAnthropic } from "@langchain/anthropic";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import { StateAnnotation } from "../state.js";
import { JobDetailsSchema } from "../types.js";
import { extractJobDetailsSystemPrompt } from "../prompts/extractJobDetails.js";

export const extractJobDetails = async (
  state: typeof StateAnnotation.State,
  _config: RunnableConfig,
): Promise<typeof StateAnnotation.Update> => {
  const model = new ChatAnthropic({
    model: "claude-3-5-haiku-20241022",
    apiKey: process.env.ANTHROPIC_API_KEY,
  });

  const structuredModel = model.withStructuredOutput(JobDetailsSchema);

  let jobDetails;
  try {
    jobDetails = await structuredModel.invoke([
      new SystemMessage(extractJobDetailsSystemPrompt),
      new HumanMessage(state.rawJobInput),
    ]);
  } catch {
    // Retry once on structured output failure
    jobDetails = await structuredModel.invoke([
      new SystemMessage(extractJobDetailsSystemPrompt),
      new HumanMessage(state.rawJobInput),
    ]);
  }

  return { jobDetails };
};
