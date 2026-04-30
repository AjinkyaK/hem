import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { TailorOutputSchema } from "../../src/agent/types.js";

describe("TailorOutputSchema", () => {
  it("validates a complete valid TailorOutput object", () => {
    const result = TailorOutputSchema.safeParse({
      thinking: "Phase 1 reasoning here...",
      resume: "# Jane Doe\n\n## Professional summary\n...",
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing thinking field", () => {
    const result = TailorOutputSchema.safeParse({
      resume: "# Resume",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing resume field", () => {
    const result = TailorOutputSchema.safeParse({
      thinking: "Reasoning",
    });
    expect(result.success).toBe(false);
  });

  it("rejects non-string thinking field", () => {
    const result = TailorOutputSchema.safeParse({
      thinking: 123,
      resume: "# Resume",
    });
    expect(result.success).toBe(false);
  });

  it("rejects non-string resume field", () => {
    const result = TailorOutputSchema.safeParse({
      thinking: "Reasoning",
      resume: { content: "# Resume" },
    });
    expect(result.success).toBe(false);
  });

  it("accepts empty strings for both fields", () => {
    const result = TailorOutputSchema.safeParse({
      thinking: "",
      resume: "",
    });
    expect(result.success).toBe(true);
  });
});

// Mock ChatAnthropic so withStructuredOutput returns a model whose invoke
// returns a fixed { thinking, resume } object
const mockInvoke = jest.fn(async () => ({
  thinking: "Phase 1 reasoning",
  resume: "# Tailored Resume\n\n## Professional summary\n...",
}));

jest.unstable_mockModule("@langchain/anthropic", () => ({
  ChatAnthropic: jest.fn().mockImplementation(() => ({
    withStructuredOutput: jest.fn(() => ({
      invoke: mockInvoke,
    })),
  })),
}));

describe("tailorResume node", () => {
  beforeEach(() => {
    mockInvoke.mockClear();
  });

  it("extracts the resume field from structured output and stores it as resumeDraft", async () => {
    const { tailorResume } =
      await import("../../src/agent/nodes/tailorResume.js");

    const state = {
      messages: [],
      rawJobInput: "raw job text",
      rawResumeInput: "Original resume content",
      jobDetails: {
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
      },
      resumeDraft: null,
      draftVersion: 0,
      userFeedback: null,
    };

    const result = await tailorResume(state, {});
    expect(result.resumeDraft).toBe(
      "# Tailored Resume\n\n## Professional summary\n...",
    );
    expect(result.draftVersion).toBe(1);
    expect(result.userFeedback).toBeUndefined();
    expect(mockInvoke).toHaveBeenCalledTimes(1);
  });

  it("throws when rawResumeInput is empty", async () => {
    const { tailorResume } =
      await import("../../src/agent/nodes/tailorResume.js");

    const state = {
      messages: [],
      rawJobInput: "raw job text",
      rawResumeInput: "",
      jobDetails: {
        title: "Senior Engineer",
        company: "Acme",
        requiredSkills: [],
        preferredSkills: [],
        responsibilities: [],
        experienceLevel: "senior" as const,
        keyThemes: [],
        locationRemotePolicy: "Remote",
        industryDomain: "Fintech",
        softSkills: [],
        educationCertifications: [],
        companyValuesCulture: [],
        highPriorityKeywords: [],
        atsKeywords: [],
      },
      resumeDraft: null,
      draftVersion: 0,
      userFeedback: null,
    };

    await expect(tailorResume(state, {})).rejects.toThrow(
      "rawResumeInput is empty",
    );
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it("throws when jobDetails is null", async () => {
    const { tailorResume } =
      await import("../../src/agent/nodes/tailorResume.js");

    const state = {
      messages: [],
      rawJobInput: "raw job text",
      rawResumeInput: "Original resume",
      jobDetails: null,
      resumeDraft: null,
      draftVersion: 0,
      userFeedback: null,
    };

    await expect(tailorResume(state, {})).rejects.toThrow("jobDetails is null");
    expect(mockInvoke).not.toHaveBeenCalled();
  });
});
