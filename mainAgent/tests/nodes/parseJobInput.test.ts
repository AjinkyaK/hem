import { describe, it, expect, jest, beforeEach } from "@jest/globals";

const mockFetch =
  jest.fn<(url: string, init?: RequestInit) => Promise<Response>>();
global.fetch = mockFetch as unknown as typeof fetch;

const mockParse = jest.fn();

jest.unstable_mockModule("jsdom", () => ({
  JSDOM: jest.fn().mockImplementation((_html: string, _opts: unknown) => ({
    window: {
      document: {},
    },
  })),
}));

jest.unstable_mockModule("@mozilla/readability", () => ({
  Readability: jest.fn().mockImplementation(() => ({
    parse: mockParse,
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
    mockParse.mockReset();
    mockParse.mockReturnValue({ textContent: "Job posting text here" });
  });

  it("returns plain text unchanged when not a URL", async () => {
    const { parseJobInput } =
      await import("../../src/agent/nodes/parseJobInput.js");
    const state = {
      ...baseState,
      rawJobInput: "Senior Engineer at Acme Corp...",
    };
    const result = await parseJobInput(state, {});
    expect(result.rawJobInput).toBe("Senior Engineer at Acme Corp...");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("returns plain text unchanged for non-HTTP(S) protocols", async () => {
    const { parseJobInput } =
      await import("../../src/agent/nodes/parseJobInput.js");
    const state = {
      ...baseState,
      rawJobInput: "ftp://jobs.example.com/spec.txt",
    };
    const result = await parseJobInput(state, {});
    expect(result.rawJobInput).toBe("ftp://jobs.example.com/spec.txt");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("fetches and strips HTML when input is a URL", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () =>
        "<html><body><article><p>Job posting text here</p></article></body></html>",
    } as unknown as Response);

    const { parseJobInput } =
      await import("../../src/agent/nodes/parseJobInput.js");
    const state = {
      ...baseState,
      rawJobInput: "https://jobs.example.com/posting/123",
    };
    const result = await parseJobInput(state, {});
    expect(mockFetch).toHaveBeenCalledWith(
      "https://jobs.example.com/posting/123",
    );
    expect(result.rawJobInput).toBe("Job posting text here");
  });

  it("handles URLs with leading and trailing whitespace", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () =>
        "<html><body><article><p>Job posting text here</p></article></body></html>",
    } as unknown as Response);

    const { parseJobInput } =
      await import("../../src/agent/nodes/parseJobInput.js");
    const state = {
      ...baseState,
      rawJobInput: "   https://jobs.example.com/posting/123   ",
    };
    const result = await parseJobInput(state, {});
    expect(mockFetch).toHaveBeenCalledWith(
      "https://jobs.example.com/posting/123",
    );
    expect(result.rawJobInput).toBe("Job posting text here");
  });

  it("throws when fetch response is not ok", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: "Not Found",
    } as unknown as Response);

    const { parseJobInput } =
      await import("../../src/agent/nodes/parseJobInput.js");
    const state = {
      ...baseState,
      rawJobInput: "https://jobs.example.com/missing",
    };
    await expect(parseJobInput(state, {})).rejects.toThrow(
      "Failed to fetch job posting: 404 Not Found",
    );
  });

  it("throws when fetch network call rejects", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Network connection refused"));

    const { parseJobInput } =
      await import("../../src/agent/nodes/parseJobInput.js");
    const state = {
      ...baseState,
      rawJobInput: "https://jobs.example.com/network-error",
    };
    await expect(parseJobInput(state, {})).rejects.toThrow(
      "Network connection refused",
    );
  });

  it("throws when rawJobInput is empty", async () => {
    const { parseJobInput } =
      await import("../../src/agent/nodes/parseJobInput.js");
    const state = { ...baseState, rawJobInput: "" };
    await expect(parseJobInput(state, {})).rejects.toThrow(
      "rawJobInput is required",
    );
  });

  it("throws when rawJobInput is whitespace only", async () => {
    const { parseJobInput } =
      await import("../../src/agent/nodes/parseJobInput.js");
    const state = { ...baseState, rawJobInput: "   \n\t  " };
    await expect(parseJobInput(state, {})).rejects.toThrow(
      "rawJobInput is required",
    );
  });

  it("terminates early when Readability fails to parse an article (returns null)", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () =>
        "<html><body><div>Empty / unparseable</div></body></html>",
    } as unknown as Response);
    mockParse.mockReturnValueOnce(null);

    const { parseJobInput } =
      await import("../../src/agent/nodes/parseJobInput.js");
    const state = {
      ...baseState,
      rawJobInput: "https://jobs.example.com/unreadable",
    };
    await expect(parseJobInput(state, {})).rejects.toThrow(
      "Failed to extract readable job posting content from URL",
    );
  });

  it("terminates early when Readability returns empty textContent", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () =>
        "<html><body><div>Empty / unparseable</div></body></html>",
    } as unknown as Response);
    mockParse.mockReturnValueOnce({ textContent: "   " });

    const { parseJobInput } =
      await import("../../src/agent/nodes/parseJobInput.js");
    const state = {
      ...baseState,
      rawJobInput: "https://jobs.example.com/empty-article",
    };
    await expect(parseJobInput(state, {})).rejects.toThrow(
      "Failed to extract readable job posting content from URL",
    );
  });

  it("strictly returns only rawJobInput in update object", async () => {
    const { parseJobInput } =
      await import("../../src/agent/nodes/parseJobInput.js");
    const state = {
      ...baseState,
      rawJobInput: "Software Engineer opening",
    };
    const result = await parseJobInput(state, {});
    expect(result).toEqual({ rawJobInput: "Software Engineer opening" });
  });
});
