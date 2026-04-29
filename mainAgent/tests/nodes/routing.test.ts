import { describe, it, expect, jest } from "@jest/globals";
import { BaseMessage } from "@langchain/core/messages";

jest.unstable_mockModule("../../src/agent/nodes/parseJobInput.js", () => ({
  parseJobInput: jest.fn(),
}));
jest.unstable_mockModule("../../src/agent/nodes/extractJobDetails.js", () => ({
  extractJobDetails: jest.fn(),
}));
jest.unstable_mockModule("../../src/agent/nodes/tailorResume.js", () => ({
  tailorResume: jest.fn(),
}));
jest.unstable_mockModule("../../src/agent/nodes/reviseResume.js", () => ({
  reviseResume: jest.fn(),
}));
jest.unstable_mockModule("../../src/agent/nodes/reviewDraft.js", () => ({
  reviewDraft: jest.fn(),
}));

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
  it("routes to __end__ when userFeedback is 'approve'", async () => {
    const { afterReview } = await import("../../src/agent/graph.js");
    const result = afterReview({ ...baseState, userFeedback: "approve" });
    expect(result).toBe("__end__");
  });

  it("routes to __end__ when userFeedback is 'Approve' (case insensitive)", async () => {
    const { afterReview } = await import("../../src/agent/graph.js");
    const result = afterReview({ ...baseState, userFeedback: "Approve" });
    expect(result).toBe("__end__");
  });

  it("routes to __end__ when userFeedback is 'APPROVE' with whitespace", async () => {
    const { afterReview } = await import("../../src/agent/graph.js");
    const result = afterReview({ ...baseState, userFeedback: "  APPROVE  " });
    expect(result).toBe("__end__");
  });

  it("routes to reviseResume when userFeedback is feedback text", async () => {
    const { afterReview } = await import("../../src/agent/graph.js");
    const result = afterReview({ ...baseState, userFeedback: "Make the summary shorter" });
    expect(result).toBe("reviseResume");
  });

  it("routes to __end__ when userFeedback is null (no feedback provided)", async () => {
    const { afterReview } = await import("../../src/agent/graph.js");
    const result = afterReview({ ...baseState, userFeedback: null });
    expect(result).toBe("__end__");
  });
});
