import { describe, it, expect, jest } from "@jest/globals";

// Mock all four pipeline nodes so their top-level side effects (ChatAnthropic
// instantiation, jsdom ESM deps) don't break the test environment. The routing
// test only exercises afterReview, which has no dependency on these modules.
jest.mock("../../src/agent/nodes/parseJobInput.js", () => ({
  parseJobInput: jest.fn(),
}));
jest.mock("../../src/agent/nodes/extractJobDetails.js", () => ({
  extractJobDetails: jest.fn(),
}));
jest.mock("../../src/agent/nodes/tailorResume.js", () => ({
  tailorResume: jest.fn(),
}));
jest.mock("../../src/agent/nodes/reviseResume.js", () => ({
  reviseResume: jest.fn(),
}));

import { afterReview } from "../../src/agent/graph.js";
import { BaseMessage } from "@langchain/core/messages";

const baseState = {
  messages: [] as BaseMessage[],
  rawJobInput: "",
  rawResumeInput: "",
  jobDetails: null,
  resumeDraft: "# My Resume\n\n...",
  draftVersion: 0,
  userFeedback: null,
};

describe("afterReview routing", () => {
  it("routes to __end__ when userFeedback is 'approve'", () => {
    const result = afterReview({ ...baseState, userFeedback: "approve" });
    expect(result).toBe("__end__");
  });

  it("routes to __end__ when userFeedback is 'Approve' (case insensitive)", () => {
    const result = afterReview({ ...baseState, userFeedback: "Approve" });
    expect(result).toBe("__end__");
  });

  it("routes to __end__ when userFeedback is 'APPROVE' with whitespace", () => {
    const result = afterReview({ ...baseState, userFeedback: "  APPROVE  " });
    expect(result).toBe("__end__");
  });

  it("routes to reviseResume when userFeedback is feedback text", () => {
    const result = afterReview({ ...baseState, userFeedback: "Make the summary shorter" });
    expect(result).toBe("reviseResume");
  });

  it("routes to __end__ when userFeedback is null (no feedback provided)", () => {
    const result = afterReview({ ...baseState, userFeedback: null });
    expect(result).toBe("__end__");
  });
});
