import { describe, it, expect, jest, beforeEach } from "@jest/globals";

const mockFetch = jest.fn<(url: string, init?: RequestInit) => Promise<Response>>();
global.fetch = mockFetch as unknown as typeof fetch;

jest.unstable_mockModule("jsdom", () => ({
  JSDOM: jest.fn().mockImplementation((_html: string, _opts: unknown) => ({
    window: {
      document: {
        body: { textContent: "fallback text" },
      },
    },
  })),
}));

jest.unstable_mockModule("@mozilla/readability", () => ({
  Readability: jest.fn().mockImplementation(() => ({
    parse: () => ({ textContent: "Job posting text here" }),
  })),
}));

const baseState = {
  messages: [],
  rawJobInput: "",
  rawResumeInput: "My resume content",
  jobDetails: null,
  resumeDraft: null,
  draftVersion: 0,
  userFeedback: null,
};

describe("parseJobInput", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("returns plain text unchanged when not a URL", async () => {
    const { parseJobInput } = await import("../../src/agent/nodes/parseJobInput.js");
    const state = { ...baseState, rawJobInput: "Senior Engineer at Acme Corp..." };
    const result = await parseJobInput(state, {});
    expect(result.rawJobInput).toBe("Senior Engineer at Acme Corp...");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("fetches and strips HTML when input is a URL", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () => "<html><body><article><p>Job posting text here</p></article></body></html>",
    } as unknown as Response);

    const { parseJobInput } = await import("../../src/agent/nodes/parseJobInput.js");
    const state = { ...baseState, rawJobInput: "https://jobs.example.com/posting/123" };
    const result = await parseJobInput(state, {});
    expect(mockFetch).toHaveBeenCalledWith("https://jobs.example.com/posting/123");
    expect(typeof result.rawJobInput).toBe("string");
    expect((result.rawJobInput as string).length).toBeGreaterThan(0);
  });

  it("throws when fetch fails", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: "Not Found",
    } as unknown as Response);

    const { parseJobInput } = await import("../../src/agent/nodes/parseJobInput.js");
    const state = { ...baseState, rawJobInput: "https://jobs.example.com/missing" };
    await expect(parseJobInput(state, {})).rejects.toThrow("Failed to fetch job posting");
  });

  it("throws when rawJobInput is empty", async () => {
    const { parseJobInput } = await import("../../src/agent/nodes/parseJobInput.js");
    const state = { ...baseState, rawJobInput: "" };
    await expect(parseJobInput(state, {})).rejects.toThrow("rawJobInput is required");
  });
});
