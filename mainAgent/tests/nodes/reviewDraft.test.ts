import { describe, it, expect, jest, beforeEach } from "@jest/globals";

const mockWriteResumeDraft = jest.fn(
  (_draft: string, _job: unknown, version: number) =>
    `/tmp/fake_v${version}.md`,
);
const mockInterrupt = jest.fn((_msg: string) => "approve");

jest.unstable_mockModule("../../src/agent/utils/writeResumeDraft.js", () => ({
  writeResumeDraft: mockWriteResumeDraft,
}));

jest.unstable_mockModule("@langchain/langgraph", () => ({
  interrupt: mockInterrupt,
}));

const baseJobDetails = {
  title: "Senior Engineer",
  company: "Acme",
  requiredSkills: ["TypeScript"],
  preferredSkills: [],
  responsibilities: ["Build APIs"],
  experienceLevel: "senior" as const,
  keyThemes: ["reliability"],
  locationRemotePolicy: "Remote",
  industryDomain: "Fintech",
  softSkills: [],
  educationCertifications: [],
  companyValuesCulture: [],
  highPriorityKeywords: [],
  atsKeywords: [],
};

const baseState = {
  messages: [],
  rawJobInput: "",
  rawResumeInput: "",
  jobDetails: baseJobDetails,
  resumeDraft: "# Tailored Resume",
  draftVersion: 1,
  userFeedback: null,
};

describe("reviewDraft node", () => {
  beforeEach(() => {
    mockWriteResumeDraft.mockClear();
    mockInterrupt.mockClear();
  });

  it("writes the draft and returns userFeedback from interrupt", async () => {
    const { reviewDraft } =
      await import("../../src/agent/nodes/reviewDraft.js");
    const result = await reviewDraft(baseState, {});
    expect(mockWriteResumeDraft).toHaveBeenCalledWith(
      "# Tailored Resume",
      baseJobDetails,
      1,
    );
    expect(mockInterrupt).toHaveBeenCalledTimes(1);
    expect(result.userFeedback).toBe("approve");
  });

  it("includes the file path in the interrupt message", async () => {
    const { reviewDraft } =
      await import("../../src/agent/nodes/reviewDraft.js");
    await reviewDraft(baseState, {});
    const message = mockInterrupt.mock.calls[0][0] as string;
    expect(message).toContain("/tmp/fake_v1.md");
    expect(message).toContain("Type 'approve' to finalize");
  });

  it("throws when resumeDraft is null", async () => {
    const { reviewDraft } =
      await import("../../src/agent/nodes/reviewDraft.js");
    await expect(
      reviewDraft({ ...baseState, resumeDraft: null }, {}),
    ).rejects.toThrow("resumeDraft is null");
    expect(mockWriteResumeDraft).not.toHaveBeenCalled();
    expect(mockInterrupt).not.toHaveBeenCalled();
  });

  it("throws when jobDetails is null", async () => {
    const { reviewDraft } =
      await import("../../src/agent/nodes/reviewDraft.js");
    await expect(
      reviewDraft({ ...baseState, jobDetails: null }, {}),
    ).rejects.toThrow("jobDetails is null");
    expect(mockWriteResumeDraft).not.toHaveBeenCalled();
    expect(mockInterrupt).not.toHaveBeenCalled();
  });

  it("is idempotent: two invocations with the same state call writeResumeDraft with identical args and return identical userFeedback", async () => {
    const { reviewDraft } =
      await import("../../src/agent/nodes/reviewDraft.js");
    const result1 = await reviewDraft(baseState, {});
    const result2 = await reviewDraft(baseState, {});
    expect(mockWriteResumeDraft).toHaveBeenCalledTimes(2);
    expect(mockWriteResumeDraft.mock.calls[0]).toEqual(
      mockWriteResumeDraft.mock.calls[1],
    );
    expect(result1.userFeedback).toBe(result2.userFeedback);
  });
});
