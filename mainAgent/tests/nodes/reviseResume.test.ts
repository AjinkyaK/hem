import { describe, it, expect, jest, beforeEach } from "@jest/globals";

const mockInvoke = jest.fn(async () => ({ content: "# Revised Resume" }));
const mockWriteResumeDraft = jest.fn(() => "/tmp/should_not_be_called.md");
const mockInterrupt = jest.fn(() => "approve");

jest.unstable_mockModule("@langchain/anthropic", () => ({
  ChatAnthropic: jest.fn().mockImplementation(() => ({
    invoke: mockInvoke,
  })),
}));

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
  resumeDraft: "# Old Resume",
  draftVersion: 1,
  userFeedback: "Make summary shorter",
};

describe("reviseResume node", () => {
  beforeEach(() => {
    mockInvoke.mockClear();
    mockWriteResumeDraft.mockClear();
    mockInterrupt.mockClear();
  });

  it("returns the revised draft, increments draftVersion, and does not write a file or interrupt", async () => {
    const { reviseResume } = await import("../../src/agent/nodes/reviseResume.js");
    const result = await reviseResume(baseState, {});
    expect(result.resumeDraft).toBe("# Revised Resume");
    expect(result.draftVersion).toBe(2);
    expect(result.userFeedback).toBeUndefined();
    expect(mockInvoke).toHaveBeenCalledTimes(1);
    expect(mockWriteResumeDraft).not.toHaveBeenCalled();
    expect(mockInterrupt).not.toHaveBeenCalled();
  });

  it("throws when resumeDraft is null", async () => {
    const { reviseResume } = await import("../../src/agent/nodes/reviseResume.js");
    await expect(
      reviseResume({ ...baseState, resumeDraft: null }, {}),
    ).rejects.toThrow("resumeDraft is null");
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it("throws when userFeedback is null", async () => {
    const { reviseResume } = await import("../../src/agent/nodes/reviseResume.js");
    await expect(
      reviseResume({ ...baseState, userFeedback: null }, {}),
    ).rejects.toThrow("userFeedback is null");
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it("throws when jobDetails is null", async () => {
    const { reviseResume } = await import("../../src/agent/nodes/reviseResume.js");
    await expect(
      reviseResume({ ...baseState, jobDetails: null }, {}),
    ).rejects.toThrow("jobDetails is null");
    expect(mockInvoke).not.toHaveBeenCalled();
  });
});
