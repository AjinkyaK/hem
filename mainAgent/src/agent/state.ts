// src/agent/state.ts
import { BaseMessage, BaseMessageLike } from "@langchain/core/messages";
import { Annotation, messagesStateReducer } from "@langchain/langgraph";
import { JobDetails } from "./types.js";

export const StateAnnotation = Annotation.Root({
  // Conversation thread — append-only
  messages: Annotation<BaseMessage[], BaseMessageLike[]>({
    reducer: messagesStateReducer,
    default: () => [],
  }),
  // Pipeline inputs — provided at graph invocation
  rawJobInput: Annotation<string>({
    default: () => "",
    reducer: (_, b) => b,
  }),
  rawResumeInput: Annotation<string>({
    default: () => "",
    reducer: (_, b) => b,
  }),
  // Pipeline stage outputs — overwrite each time
  jobDetails: Annotation<JobDetails | null>({
    default: () => null,
    reducer: (_, b) => b,
  }),
  resumeDraft: Annotation<string | null>({
    default: () => null,
    reducer: (_, b) => b,
  }),
  // Set by interrupt return value — user's "approve" or feedback text
  userFeedback: Annotation<string | null>({
    default: () => null,
    reducer: (_, b) => b,
  }),
});
